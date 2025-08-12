<script>
	import { onMount, onDestroy } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	import { Chart, registerables } from 'chart.js';
	
	Chart.register(...registerables);
	
	/** @type {any[]} */
	let reviews = [];
	/** @type {any[]} */
	let products = [];
	/** @type {any[]} */
	let users = [];
	let loading = true;
	let searchTerm = '';
	let sortBy = 'created';
	let sortOrder = 'desc';
	let filterRating = 'all'; // 'all', '1', '2', '3', '4', '5'
	let showPendingOnly = false;
	
	// Chart references
	/** @type {any} */
	let ratingChart;
	/** @type {any} */
	let timeChart;
	/** @type {HTMLCanvasElement} */
	let ratingChartCanvas;
	/** @type {HTMLCanvasElement} */
	let timeChartCanvas;
	
	// Insights data
	let reviewInsights = {
		totalReviews: 0,
		averageRating: 0,
		totalReviewers: 0,
		ratingDistribution: [0, 0, 0, 0, 0], // 1-5 stars
		/** @type {any[]} */
		topRatedProducts: [],
		/** @type {any[]} */
		recentReviews: [],
		/** @type {any[]} */
		reviewsByDate: [],
		pendingReviews: 0,
		responseRate: 0
	};
	
	// Load data on component mount
	onMount(async () => {
		await loadReviews();
		await loadProducts();
		await loadUsers();
		generateInsights();
		setupRealtimeSubscription();
	});
	
	// Cleanup subscriptions on component destroy
	onDestroy(() => {
		if (pb) {
			pb.collection('reviews').unsubscribe();
		}
		
		// Destroy charts
		if (ratingChart) {
			ratingChart.destroy();
		}
		if (timeChart) {
			timeChart.destroy();
		}
	});
	
	async function loadReviews() {
		try {
			loading = true;
			if (!pb) return;
			
			// Fetch reviews with expanded relations
			const records = await pb.collection('reviews').getFullList({
				expand: 'user_id,product_id,product_id.category_id',
				sort: `${sortOrder === 'desc' ? '-' : ''}${sortBy}`
			});
			
			// Ensure product images are properly loaded
			for (let review of records) {
				if (review.expand?.product_id && review.expand.product_id.id) {
					try {
						// Fetch the complete product record with all fields including images
						const productRecord = await pb.collection('products').getOne(review.expand.product_id.id, {
							expand: 'category_id'
						});
						
						// Update the expanded product data with complete record
						review.expand.product_id = productRecord;
					} catch (productError) {
						console.warn('Failed to load product details for review:', review.id, productError);
					}
				}
			}
			
			console.log('Loaded reviews with product images:', records);
			reviews = records;
		} catch (error) {
			console.error('Error loading reviews:', error);
			alert('Failed to load reviews');
		} finally {
			loading = false;
		}
	}
	
	async function loadProducts() {
		try {
			if (!pb) return;
			const records = await pb.collection('products').getFullList({
				expand: 'category_id',
				sort: 'name'
			});
			products = records;
		} catch (error) {
			console.error('Error loading products:', error);
		}
	}
	
	async function loadUsers() {
		try {
			if (!pb) return;
			const records = await pb.collection('users').getFullList({
				sort: 'email'
			});
			users = records;
		} catch (error) {
			console.error('Error loading users:', error);
		}
	}
	
	function generateInsights() {
		if (!reviews.length) return;
		
		// Calculate basic metrics
		reviewInsights.totalReviews = reviews.length;
		reviewInsights.totalReviewers = new Set(reviews.map(r => r.user_id)).size;
		
		// Calculate average rating
		const totalRating = reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
		reviewInsights.averageRating = totalRating / reviews.length;
		
		// Rating distribution
		reviewInsights.ratingDistribution = [0, 0, 0, 0, 0];
		reviews.forEach(review => {
			const rating = review.rating;
			if (rating >= 1 && rating <= 5) {
				reviewInsights.ratingDistribution[rating - 1]++;
			}
		});
		
		// Top rated products (by average rating)
		/** @type {Record<string, any>} */
		const productRatings = {};
		reviews.forEach(review => {
			const productId = review.product_id;
			const productName = review.expand?.product_id?.name || 'Unknown Product';
			const rating = review.rating || 0;
			
			if (productRatings[productId]) {
				productRatings[productId].totalRating += rating;
				productRatings[productId].count++;
			} else {
				productRatings[productId] = {
					id: productId,
					name: productName,
					totalRating: rating,
					count: 1,
					product: review.expand?.product_id
				};
			}
		});
		
		reviewInsights.topRatedProducts = Object.values(productRatings)
			.map(p => ({
				...p,
				averageRating: p.totalRating / p.count
			}))
			.sort((a, b) => b.averageRating - a.averageRating)
			.slice(0, 10);
		
		// Reviews by date (last 30 days)
		const last30Days = Array.from({ length: 30 }, (_, i) => {
			const date = new Date();
			date.setDate(date.getDate() - i);
			return date.toISOString().split('T')[0];
		}).reverse();
		
		reviewInsights.reviewsByDate = last30Days.map(date => {
			const dayReviews = reviews.filter(r => r.created.startsWith(date));
			const count = dayReviews.length;
			const averageRating = count > 0 ? dayReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0;
			return { date, count, averageRating };
		});
		
		// Pending reviews (assuming there's a status field)
		reviewInsights.pendingReviews = reviews.filter(r => r.status === 'pending').length;
		
		// Response rate (assuming there's a response field)
		const reviewsWithResponse = reviews.filter(r => r.response && r.response.trim() !== '').length;
		reviewInsights.responseRate = reviews.length > 0 ? (reviewsWithResponse / reviews.length) * 100 : 0;
		
		// Recent reviews
		reviewInsights.recentReviews = reviews
			.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
			.slice(0, 6);
		
		// Update charts
		updateCharts();
	}
	
	function updateCharts() {
		if (typeof window === 'undefined') return;
		
		// Destroy existing charts
		if (ratingChart) {
			ratingChart.destroy();
		}
		if (timeChart) {
			timeChart.destroy();
		}
		
		// Create Rating Distribution Chart
		if (ratingChartCanvas) {
			const ctx = ratingChartCanvas.getContext('2d');
			if (ctx) {
				ratingChart = new Chart(ctx, {
					type: 'bar',
					data: {
						labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
						datasets: [{
							label: 'Number of Reviews',
							data: reviewInsights.ratingDistribution,
							backgroundColor: [
								'rgba(239, 68, 68, 0.8)',   // Red for 1 star
								'rgba(245, 158, 11, 0.8)',  // Orange for 2 stars
								'rgba(251, 191, 36, 0.8)',  // Yellow for 3 stars
								'rgba(34, 197, 94, 0.8)',   // Green for 4 stars
								'rgba(16, 185, 129, 0.8)'   // Emerald for 5 stars
							],
							borderColor: [
								'rgba(239, 68, 68, 1)',
								'rgba(245, 158, 11, 1)',
								'rgba(251, 191, 36, 1)',
								'rgba(34, 197, 94, 1)',
								'rgba(16, 185, 129, 1)'
							],
							borderWidth: 1,
							borderRadius: 8,
							borderSkipped: false,
						}]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: {
								display: false
							},
							tooltip: {
								callbacks: {
									label: function(context) {
										const total = reviewInsights.ratingDistribution.reduce((a, b) => a + b, 0);
										const percentage = total > 0 ? ((context.parsed.y / total) * 100).toFixed(1) : 0;
										return `${context.parsed.y} reviews (${percentage}%)`;
									}
								}
							}
						},
						scales: {
							y: {
								beginAtZero: true,
								ticks: {
									stepSize: 1
								}
							}
						}
					}
				});
			}
		}
		
		// Create Time-based Chart
		if (timeChartCanvas && reviewInsights.reviewsByDate.length > 0) {
			const ctx = timeChartCanvas.getContext('2d');
			if (ctx) {
				timeChart = new Chart(ctx, {
					type: 'line',
					data: {
						labels: reviewInsights.reviewsByDate.map(d => {
							const date = new Date(d.date);
							return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
						}),
						datasets: [
							{
								label: 'Reviews Count',
								data: reviewInsights.reviewsByDate.map(d => d.count),
								borderColor: 'rgba(59, 130, 246, 1)',
								backgroundColor: 'rgba(59, 130, 246, 0.1)',
								tension: 0.4,
								yAxisID: 'y'
							},
							{
								label: 'Average Rating',
								data: reviewInsights.reviewsByDate.map(d => d.averageRating),
								borderColor: 'rgba(16, 185, 129, 1)',
								backgroundColor: 'rgba(16, 185, 129, 0.1)',
								tension: 0.4,
								yAxisID: 'y1'
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						interaction: {
							mode: 'index',
							intersect: false,
						},
						plugins: {
							legend: {
								position: 'top',
							}
						},
						scales: {
							x: {
								display: true,
								title: {
									display: true,
									text: 'Date'
								}
							},
							y: {
								type: 'linear',
								display: true,
								position: 'left',
								title: {
									display: true,
									text: 'Number of Reviews'
								},
								beginAtZero: true
							},
							y1: {
								type: 'linear',
								display: true,
								position: 'right',
								title: {
									display: true,
									text: 'Average Rating'
								},
								min: 0,
								max: 5,
								grid: {
									drawOnChartArea: false,
								},
							}
						}
					}
				});
			}
		}
	}
	
	function setupRealtimeSubscription() {
		if (!pb) return;
		
		pb.collection('reviews').subscribe('*', function (e) {
			console.log('Review real-time update:', e);
			loadReviews().then(() => generateInsights());
		});
	}
	
	// Reactive statements for chart updates
	$: if (reviewInsights.totalReviews > 0 && typeof window !== 'undefined') {
		setTimeout(updateCharts, 100); // Small delay to ensure DOM is ready
	}
	
	// Filtered reviews based on search and filters
	$: filteredReviews = reviews.filter(review => {
		const searchLower = searchTerm.toLowerCase();
		const productName = review.expand?.product_id?.name?.toLowerCase() || '';
		const userName = review.expand?.user_id?.email?.toLowerCase() || '';
		const reviewText = review.comment?.toLowerCase() || '';
		
		const matchesSearch = productName.includes(searchLower) || 
							  userName.includes(searchLower) || 
							  reviewText.includes(searchLower);
		
		const matchesRating = filterRating === 'all' || review.rating?.toString() === filterRating;
		const matchesPending = !showPendingOnly || review.status === 'pending';
		
		return matchesSearch && matchesRating && matchesPending;
	});
	
	// Format date for display
	/**
	 * @param {string} dateString
	 */
	function formatDate(dateString) {
		return new Date(dateString).toLocaleDateString();
	}
	
	// Format price
	/**
	 * @param {number} price
	 */
	function formatPrice(price) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES'
		}).format(price);
	}
	
	// Render star rating
	/**
	 * @param {number} rating
	 */
	function renderStars(rating) {
		const stars = [];
		for (let i = 1; i <= 5; i++) {
			stars.push(i <= rating);
		}
		return stars;
	}
	
	// Update review status
	/**
	 * @param {string} reviewId
	 * @param {string} status
	 */
	async function updateReviewStatus(reviewId, status) {
		try {
			if (!pb) return;
			await pb.collection('reviews').update(reviewId, { status });
			await loadReviews();
			generateInsights();
		} catch (error) {
			console.error('Error updating review status:', error);
			alert('Failed to update review status');
		}
	}
</script>

<svelte:head>
	<title>Reviews Management - Manager Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4 md:p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-6 md:mb-8">
			<h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Reviews Management</h1>
			<p class="text-gray-600">Monitor customer reviews, ratings, and feedback insights</p>
		</div>
		
		<!-- Insights Dashboard -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
			<!-- Total Reviews -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-blue-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4">
						<p class="text-xs md:text-sm font-medium text-gray-500">Total Reviews</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">{reviewInsights.totalReviews}</p>
					</div>
				</div>
			</div>
			
			<!-- Average Rating -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-yellow-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4">
						<p class="text-xs md:text-sm font-medium text-gray-500">Average Rating</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">{reviewInsights.averageRating.toFixed(1)}</p>
						<div class="flex mt-1">
							{#each renderStars(Math.round(reviewInsights.averageRating)) as filled}
								<svg class="h-3 w-3 md:h-4 md:w-4 {filled ? 'text-yellow-400' : 'text-gray-300'}" fill="currentColor" viewBox="0 0 20 20">
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							{/each}
						</div>
					</div>
				</div>
			</div>
			
			<!-- Total Reviewers -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6 col-span-2 md:col-span-1">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-green-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4 min-w-0">
						<p class="text-xs md:text-sm font-medium text-gray-500">Active Reviewers</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">{reviewInsights.totalReviewers}</p>
					</div>
				</div>
			</div>
			
			<!-- Response Rate -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6 col-span-2 md:col-span-1">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-purple-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4">
						<p class="text-xs md:text-sm font-medium text-gray-500">Response Rate</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">{reviewInsights.responseRate.toFixed(1)}%</p>
					</div>
				</div>
			</div>
		</div>
		
		<!-- Charts Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
			<!-- Rating Distribution Chart -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Rating Distribution</h3>
				<div class="h-80 relative">
					{#if reviewInsights.totalReviews > 0}
						<canvas 
							bind:this={ratingChartCanvas}
							class="w-full h-full"
						></canvas>
					{:else}
						<div class="flex items-center justify-center h-full text-gray-500">
							<div class="text-center">
								<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
								</svg>
								<p class="mt-2">No review data available</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Reviews Over Time Chart -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Reviews Over Time</h3>
				<div class="h-80 relative">
					{#if reviewInsights.reviewsByDate.length > 0}
						<canvas 
							bind:this={timeChartCanvas}
							class="w-full h-full"
						></canvas>
					{:else}
						<div class="flex items-center justify-center h-full text-gray-500">
							<div class="text-center">
								<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2V7a2 2 0 012-2h2a2 2 0 002 2v2a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 00-2 2h-2a2 2 0 00-2 2v6a2 2 0 01-2 2H9z" />
								</svg>
								<p class="mt-2">No time series data available</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
		
		<!-- Additional Insights Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
			<!-- Top Rated Products -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Top Rated Products</h3>
				<div class="space-y-4">
					{#each reviewInsights.topRatedProducts.slice(0, 8) as product, index}
						<div class="flex items-center justify-between">
							<div class="flex items-center flex-1 min-w-0">
								<div class="w-8 h-8 bg-gradient-to-r from-yellow-500 to-orange-500 rounded flex items-center justify-center text-white text-sm font-semibold mr-3">
									{index + 1}
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-900 truncate">{product.name}</p>
									<div class="flex items-center mt-1">
										{#each renderStars(Math.round(product.averageRating)) as filled}
											<svg class="h-3 w-3 {filled ? 'text-yellow-400' : 'text-gray-300'}" fill="currentColor" viewBox="0 0 20 20">
												<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
											</svg>
										{/each}
										<span class="text-xs text-gray-500 ml-1">({product.count} reviews)</span>
									</div>
								</div>
							</div>
							<div class="text-right ml-4">
								<span class="text-sm font-semibold text-gray-900">{product.averageRating.toFixed(1)}</span>
							</div>
						</div>
					{/each}
					
					{#if reviewInsights.topRatedProducts.length === 0}
						<div class="text-center py-8 text-gray-500">
							<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
							</svg>
							<p class="mt-2">No review data available</p>
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Recent Reviews -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Recent Reviews</h3>
				<div class="space-y-4">
					{#each reviewInsights.recentReviews as review}
						<div class="border-b border-gray-200 pb-4 last:border-b-0">
							<div class="flex items-start space-x-3">
								<div class="flex-shrink-0">
									{#if review.expand?.product_id?.images}
										<img
											class="h-12 w-12 rounded-lg object-cover shadow-sm border border-gray-200"
											src={`http://178.18.250.118:8091/api/files/${review.expand.product_id.collectionId}/${review.expand.product_id.id}/${review.expand.product_id.images}`}
											alt={review.expand?.product_id?.name || 'Product'}
											loading="lazy"
										/>
									{:else}
										<div class="h-12 w-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border border-gray-200">
											<svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
											</svg>
										</div>
									{/if}
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-center space-x-2">
										<p class="text-sm font-medium text-gray-900 truncate">
											{review.expand?.product_id?.name || 'Unknown Product'}
										</p>
										<div class="flex">
											{#each renderStars(review.rating || 0) as filled}
												<svg class="h-3 w-3 {filled ? 'text-yellow-400' : 'text-gray-300'}" fill="currentColor" viewBox="0 0 20 20">
													<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
												</svg>
											{/each}
										</div>
									</div>
									<p class="text-xs text-gray-500 mt-1">
										By {review.expand?.user_id?.email || 'Anonymous'} • {formatDate(review.created)}
									</p>
									{#if review.comment}
										<p class="text-sm text-gray-700 mt-2 line-clamp-2">
											{review.comment}
										</p>
									{/if}
								</div>
							</div>
						</div>
					{/each}
					
					{#if reviewInsights.recentReviews.length === 0}
						<div class="text-center py-8 text-gray-500">
							<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<p class="mt-2">No recent reviews</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
		
		<!-- Reviews Table -->
		<div class="bg-white rounded-lg shadow-sm">
			<div class="p-4 md:p-6 border-b border-gray-200">
				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<h2 class="text-lg font-semibold text-gray-900">All Reviews</h2>
					
					<!-- Filters -->
					<div class="flex flex-col sm:flex-row gap-4">
						<div class="relative">
							<input
								type="text"
								placeholder="Search reviews, products, or users..."
								bind:value={searchTerm}
								class="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
							<svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
						</div>
						
						<select
							bind:value={filterRating}
							class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						>
							<option value="all">All Ratings</option>
							<option value="5">5 Stars</option>
							<option value="4">4 Stars</option>
							<option value="3">3 Stars</option>
							<option value="2">2 Stars</option>
							<option value="1">1 Star</option>
						</select>
						
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								bind:checked={showPendingOnly}
								class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="text-sm text-gray-700">Pending only</span>
						</label>
					</div>
				</div>
			</div>
			
			<div class="overflow-x-auto">
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
						<span class="ml-2 text-gray-600">Loading reviews...</span>
					</div>
				{:else if filteredReviews.length === 0}
					<div class="text-center py-12">
						<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
						</svg>
						<h3 class="mt-2 text-sm font-medium text-gray-900">No reviews found</h3>
						<p class="mt-1 text-sm text-gray-500">
							{searchTerm || filterRating !== 'all' || showPendingOnly ? 'Try adjusting your filters.' : 'No reviews have been submitted yet.'}
						</p>
					</div>
				{:else}
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Product
								</th>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Customer
								</th>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Rating
								</th>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Review
								</th>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Date
								</th>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Status
								</th>
								<th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Actions
								</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-200">
							{#each filteredReviews as review}
								<tr class="hover:bg-gray-50">
									<td class="px-4 md:px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											<div class="flex-shrink-0 h-16 w-16 md:h-20 md:w-20">
												{#if review.expand?.product_id?.images}
													<img
														class="h-16 w-16 md:h-20 md:w-20 rounded-lg object-cover shadow-sm border border-gray-200"
														src={`http://178.18.250.118:8091/api/files/${review.expand.product_id.collectionId}/${review.expand.product_id.id}/${review.expand.product_id.images}`}
														alt={review.expand?.product_id?.name || 'Product'}
														loading="lazy"
													/>
												{:else}
													<div class="h-16 w-16 md:h-20 md:w-20 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border border-gray-200">
														<svg class="h-8 w-8 md:h-10 md:w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
														</svg>
													</div>
												{/if}
											</div>
											<div class="ml-4 flex-1 min-w-0">
												<div class="text-sm font-medium text-gray-900 truncate">
													{review.expand?.product_id?.name || 'Unknown Product'}
												</div>
												<div class="text-sm text-gray-500">
													{formatPrice(review.expand?.product_id?.price || 0)}
												</div>
											</div>
										</div>
									</td>
									<td class="px-4 md:px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-900">
											{review.expand?.user_id?.email || 'Anonymous'}
										</div>
									</td>
									<td class="px-4 md:px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											{#each renderStars(review.rating || 0) as filled}
												<svg class="h-4 w-4 {filled ? 'text-yellow-400' : 'text-gray-300'}" fill="currentColor" viewBox="0 0 20 20">
													<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
												</svg>
											{/each}
											<span class="ml-1 text-sm text-gray-500">({review.rating || 0})</span>
										</div>
									</td>
									<td class="px-4 md:px-6 py-4">
										<div class="text-sm text-gray-900 max-w-xs truncate">
											{review.comment || 'No comment'}
										</div>
									</td>
									<td class="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{formatDate(review.created)}
									</td>
									<td class="px-4 md:px-6 py-4 whitespace-nowrap">
										<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {
											review.status === 'approved' ? 'bg-green-100 text-green-800' :
											review.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
											review.status === 'rejected' ? 'bg-red-100 text-red-800' :
											'bg-gray-100 text-gray-800'
										}">
											{review.status || 'pending'}
										</span>
									</td>
									<td class="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										<div class="flex space-x-2">
											{#if review.status !== 'approved'}
												<button
													on:click={() => updateReviewStatus(review.id, 'approved')}
													class="text-green-600 hover:text-green-900"
													title="Approve"
												>
													<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
													</svg>
												</button>
											{/if}
											{#if review.status !== 'rejected'}
												<button
													on:click={() => updateReviewStatus(review.id, 'rejected')}
													class="text-red-600 hover:text-red-900"
													title="Reject"
												>
													<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
													</svg>
												</button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
