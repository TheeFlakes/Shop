<script>
	import { onMount, onDestroy } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	
	/** @type {any[]} */
	let wishlists = [];
	/** @type {any[]} */
	let products = [];
	/** @type {any[]} */
	let users = [];
	let loading = true;
	
	function formatPrice(price) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES'
		}).format(price);
	}
	
	// Pagination for cards
	let topProductsPage = 1;
	let recentActivityPage = 1;
	const itemsPerPage = 6;
	
	// Search and sorting
	let searchTerm = '';
	let sortBy = 'created';
	let sortOrder = 'desc';
	
	// Insights data
	let wishlistInsights = {
		totalWishlists: 0,
		totalUsers: 0,
		/** @type {any[]} */
		mostWishedProducts: [],
		/** @type {any[]} */
		wishlistsByDate: [],
		/** @type {any[]} */
		topCategories: []
	};
	
	// Load data on component mount
	onMount(async () => {
		await loadWishlists();
		await loadProducts();
		await loadUsers();
		generateInsights();
		setupRealtimeSubscription();
	});
	
	// Cleanup subscriptions on component destroy
	onDestroy(() => {
		if (pb) {
			pb.collection('wishlists').unsubscribe();
		}
	});
	
	async function loadWishlists() {
		try {
			loading = true;
			if (!pb) return;
			
			// Fetch wishlists with expanded relations
			const records = await pb.collection('wishlists').getFullList({
				expand: 'user_id,product_id,product_id.category_id',
				sort: `${sortOrder === 'desc' ? '-' : ''}${sortBy}`
			});
			
			// Ensure product data is properly loaded
			for (let wishlist of records) {
				if (wishlist.expand?.product_id && wishlist.expand.product_id.id) {
					try {
						// Fetch the complete product record with all fields
						const productRecord = await pb.collection('products').getOne(wishlist.expand.product_id.id, {
							expand: 'category_id'
						});
						
						// Update the expanded product data with complete record
						wishlist.expand.product_id = productRecord;
					} catch (productError) {
						console.warn('Failed to load product details for wishlist:', wishlist.id, productError);
					}
				}
			}
			
			console.log('Loaded wishlists with product data:', records);
			wishlists = records;
		} catch (error) {
			console.error('Error loading wishlists:', error);
			alert('Failed to load wishlists');
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
		console.log('generateInsights called with wishlists:', wishlists.length);
		
		if (!wishlists.length) {
			console.log('No wishlists data available');
			return;
		}
		
		// Calculate basic metrics
		wishlistInsights.totalWishlists = wishlists.length;
		wishlistInsights.totalUsers = new Set(wishlists.map(w => w.user_id)).size;
		
		// Most wished products
		/** @type {Record<string, any>} */
		const productCounts = {};
		wishlists.forEach(wishlist => {
			const productId = wishlist.product_id;
			const productName = wishlist.expand?.product_id?.name || 'Unknown Product';
			
			if (productCounts[productId]) {
				productCounts[productId].count++;
			} else {
				productCounts[productId] = {
					id: productId,
					name: productName,
					count: 1,
					product: wishlist.expand?.product_id
				};
			}
		});
		
		wishlistInsights.mostWishedProducts = Object.values(productCounts)
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);
			
		console.log('Most wished products:', wishlistInsights.mostWishedProducts);
		
		// Wishlists by date (last 30 days)
		const last30Days = Array.from({ length: 30 }, (_, i) => {
			const date = new Date();
			date.setDate(date.getDate() - i);
			return date.toISOString().split('T')[0];
		}).reverse();
		
		wishlistInsights.wishlistsByDate = last30Days.map(date => {
			const count = wishlists.filter(w => w.created.startsWith(date)).length;
			return { date, count };
		});
		
		// Top categories
		/** @type {Record<string, number>} */
		const categoryCounts = {};
		wishlists.forEach(wishlist => {
			const categoryName = wishlist.expand?.product_id?.expand?.category_id?.name || 'Uncategorized';
			categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
		});
		
		wishlistInsights.topCategories = Object.entries(categoryCounts)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);
			
		console.log('Top categories:', wishlistInsights.topCategories);
	}
	
	function setupRealtimeSubscription() {
		if (!pb) return;
		
		pb.collection('wishlists').subscribe('*', function (e) {
			console.log('Wishlist real-time update:', e);
			loadWishlists().then(() => generateInsights());
		});
	}
	
	// Filtered wishlists based on search
	$: filteredWishlists = wishlists.filter(wishlist => {
		const searchLower = searchTerm.toLowerCase();
		const productName = wishlist.expand?.product_id?.name?.toLowerCase() || '';
		const userName = wishlist.expand?.user_id?.email?.toLowerCase() || '';
		
		return productName.includes(searchLower) || userName.includes(searchLower);
	});
	
	// Pagination calculations
	$: topProductsTotalPages = Math.ceil(wishlistInsights.mostWishedProducts.length / itemsPerPage);
	$: recentActivityTotalPages = Math.ceil(filteredWishlists.length / itemsPerPage);
	
	$: paginatedTopProducts = wishlistInsights.mostWishedProducts.slice(
		(topProductsPage - 1) * itemsPerPage,
		topProductsPage * itemsPerPage
	);
	
	$: paginatedRecentActivity = filteredWishlists.slice(
		(recentActivityPage - 1) * itemsPerPage,
		recentActivityPage * itemsPerPage
	);
	
	// Functions for pagination
	function nextTopProductsPage() {
		if (topProductsPage < topProductsTotalPages) {
			topProductsPage++;
		}
	}
	
	function prevTopProductsPage() {
		if (topProductsPage > 1) {
			topProductsPage--;
		}
	}
	
	function nextRecentActivityPage() {
		if (recentActivityPage < recentActivityTotalPages) {
			recentActivityPage++;
		}
	}
	
	function prevRecentActivityPage() {
		if (recentActivityPage > 1) {
			recentActivityPage--;
		}
	}
	
	// Format date for display
	/**
	 * @param {string} dateString
	 */
	function formatDate(dateString) {
		return new Date(dateString).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Wishlist Management - Manager Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4 md:p-6">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<div class="mb-6 md:mb-8">
			<h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Wishlist Management</h1>
			<p class="text-gray-600">Monitor customer wishlist preferences and insights</p>
		</div>
		
		<!-- Insights Dashboard -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
			<!-- Total Wishlists -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-purple-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4">
						<p class="text-xs md:text-sm font-medium text-gray-500">Total Wishlists</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">{wishlistInsights.totalWishlists}</p>
					</div>
				</div>
			</div>
			
			<!-- Total Users with Wishlists -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-blue-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4">
						<p class="text-xs md:text-sm font-medium text-gray-500">Active Users</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">{wishlistInsights.totalUsers}</p>
					</div>
				</div>
			</div>
			
			<!-- Most Wished Product -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6 col-span-2 md:col-span-1">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-green-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4 min-w-0">
						<p class="text-xs md:text-sm font-medium text-gray-500">Top Product</p>
						<p class="text-sm font-semibold text-gray-900 truncate">
							{wishlistInsights.mostWishedProducts[0]?.name || 'No data'}
						</p>
						<p class="text-xs text-gray-500">
							{wishlistInsights.mostWishedProducts[0]?.count || 0} wishes
						</p>
					</div>
				</div>
			</div>
			
			<!-- Average per User -->
			<div class="bg-white rounded-lg shadow-sm p-3 md:p-6 col-span-2 md:col-span-1">
				<div class="flex items-center">
					<div class="p-1 md:p-2 bg-yellow-100 rounded-lg">
						<svg class="h-4 w-4 md:h-6 md:w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2V7a2 2 0 012-2h2a2 2 0 002 2v2a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 00-2 2h-2a2 2 0 00-2 2v6a2 2 0 01-2 2H9z" />
						</svg>
					</div>
					<div class="ml-2 md:ml-4">
						<p class="text-xs md:text-sm font-medium text-gray-500">Avg per User</p>
						<p class="text-lg md:text-2xl font-semibold text-gray-900">
							{wishlistInsights.totalUsers > 0 ? (wishlistInsights.totalWishlists / wishlistInsights.totalUsers).toFixed(1) : '0'}
						</p>
					</div>
				</div>
			</div>
		</div>
		
		<!-- Additional Insights Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
			<!-- Top Products List -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900">Top Wished Products (Detailed)</h3>
					{#if topProductsTotalPages > 1}
						<div class="flex items-center space-x-2">
							<button
								on:click={prevTopProductsPage}
								disabled={topProductsPage === 1}
								class="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
								aria-label="Previous page of top products"
							>
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
								</svg>
							</button>
							<span class="text-sm text-gray-500">{topProductsPage} / {topProductsTotalPages}</span>
							<button
								on:click={nextTopProductsPage}
								disabled={topProductsPage === topProductsTotalPages}
								class="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
								aria-label="Next page of top products"
							>
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							</button>
						</div>
					{/if}
				</div>
				<div class="space-y-4">
					{#each paginatedTopProducts as product, index}
						<div class="flex items-center justify-between">
							<div class="flex items-center flex-1 min-w-0">
								<!-- Rank Number -->
								<div class="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded flex items-center justify-center text-white text-sm font-semibold mr-3">
									{(topProductsPage - 1) * itemsPerPage + index + 1}
								</div>
								<!-- Product Info -->
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-900 truncate">{product.name}</p>
									<p class="text-xs text-gray-500">
										{formatPrice(product.product?.price || 0)}
									</p>
								</div>
							</div>
							<div class="flex items-center ml-4">
								<div class="w-20 h-2 bg-gray-200 rounded-full mr-2">
									<div 
										class="h-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
										style="width: {wishlistInsights.mostWishedProducts.length > 0 ? (product.count / wishlistInsights.mostWishedProducts[0].count) * 100 : 0}%"
									></div>
								</div>
								<span class="text-sm font-semibold text-gray-900 w-8 text-right">{product.count}</span>
							</div>
						</div>
					{/each}
					
					{#if wishlistInsights.mostWishedProducts.length === 0}
						<div class="text-center py-8 text-gray-500">
							<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2V7a2 2 0 012-2h2a2 2 0 002 2v2a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 00-2 2h-2a2 2 0 00-2 2v6a2 2 0 01-2 2H9z" />
							</svg>
							<p class="mt-2">No wishlist data available</p>
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Recent Activity -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900">Recent Wishlist Activity</h3>
					{#if recentActivityTotalPages > 1}
						<div class="flex items-center space-x-2">
							<button
								on:click={prevRecentActivityPage}
								disabled={recentActivityPage === 1}
								class="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
								aria-label="Previous page of recent activity"
							>
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
								</svg>
							</button>
							<span class="text-sm text-gray-500">{recentActivityPage} / {recentActivityTotalPages}</span>
							<button
								on:click={nextRecentActivityPage}
								disabled={recentActivityPage === recentActivityTotalPages}
								class="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
								aria-label="Next page of recent activity"
							>
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							</button>
						</div>
					{/if}
				</div>
				<div class="space-y-4">
					{#each paginatedRecentActivity as wishlist}
						<div class="flex items-center space-x-3">
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-gray-900 truncate">
									{wishlist.expand?.product_id?.name || 'Unknown Product'}
								</p>
								<p class="text-xs text-gray-500">
									Added by {wishlist.expand?.user_id?.email || 'Unknown'} • {formatDate(wishlist.created)}
								</p>
							</div>
							<div class="text-sm text-gray-500">
								{formatPrice(wishlist.expand?.product_id?.price || 0)}
							</div>
						</div>
					{/each}
					
					{#if filteredWishlists.length === 0}
						<div class="text-center py-8 text-gray-500">
							<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<p class="mt-2">No recent activity</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
