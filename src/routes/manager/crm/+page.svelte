<script>
	import { onMount, onDestroy } from 'svelte';
	import PocketBase from 'pocketbase';
	import { Chart, registerables } from 'chart.js';

	const pb = new PocketBase('http://178.18.250.118:8091');

	Chart.register(...registerables);

	let loading = true;
	let customers = [];
	let selectedCustomer = null;
	let customerOrders = [];
	let customerOrderItems = [];
	let customerReviews = [];
	let searchTerm = '';
	let showAddCustomerModal = false;
	let newCustomer = { 
		username: '', 
		name: '', 
		email: '', 
		password: '', 
		role: 'customer',
		phone: '',
		addresses: '',
		loyalty_points: 0,
		segment: '',
		notes: ''
	};

	// Chart instances
	let customerOrdersChart = null;
	let customerCategoryChart = null;
	let customerSpendingChart = null;

	// Real-time data refresh interval
	let refreshInterval;
	const REFRESH_RATE = 30000; // 30 seconds

	// Customer analytics
	let customerAnalytics = {
		totalOrders: 0,
		totalSpent: 0,
		averageOrderValue: 0,
		firstOrderDate: null,
		lastOrderDate: null,
		favoriteCategory: '',
		totalReviews: 0,
		averageRating: 0,
		customerSegment: '',
		monthlySpending: [],
		categoryBreakdown: {},
		orderFrequency: 0
	};

	// Filtered customers for search
	$: filteredCustomers = customers.filter(customer => 
		customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
		customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
	);

	onMount(async () => {
		await loadCustomers();
		startRealTimeUpdates();
		loading = false;
	});

	onDestroy(() => {
		if (refreshInterval) clearInterval(refreshInterval);
	});

	function startRealTimeUpdates() {
		// Clear any existing interval
		if (refreshInterval) clearInterval(refreshInterval);
		
		// Set up real-time updates
		refreshInterval = setInterval(async () => {
			if (!selectedCustomer) {
				await loadCustomers();
			} else {
				await selectCustomer(selectedCustomer, false); // false = don't show loading
			}
		}, REFRESH_RATE);
	}

	async function loadCustomers() {
		try {
			customers = await pb.collection('users').getFullList({
				filter: 'role = "customer"',
				sort: '-created'
			});
		} catch (error) {
			console.error('Error loading customers:', error);
		}
	}

	async function selectCustomer(customer, showLoading = true) {
		selectedCustomer = customer;
		if (showLoading) loading = true;
		
		try {
			// Load customer-specific data
			const [ordersRes, orderItemsRes, reviewsRes] = await Promise.all([
				pb.collection('orders').getFullList({
					filter: `user_id = "${customer.id}"`,
					sort: '-created'
				}),
				pb.collection('order_items').getFullList({
					filter: `order_id.user_id = "${customer.id}"`,
					expand: 'product_id,order_id'
				}),
				pb.collection('reviews').getFullList({
					filter: `user_id = "${customer.id}"`,
					expand: 'product_id'
				})
			]);

			customerOrders = ordersRes;
			customerOrderItems = orderItemsRes;
			customerReviews = reviewsRes;

			generateCustomerAnalytics();
			if (showLoading) {
				setTimeout(() => {
					createCustomerCharts();
				}, 100);
			} else {
				createCustomerCharts();
			}
		} catch (error) {
			console.error('Error loading customer data:', error);
		}
		
		if (showLoading) loading = false;
	}

	async function addNewCustomer() {
		if (!newCustomer.username.trim() || !newCustomer.name.trim() || !newCustomer.email.trim() || !newCustomer.password.trim()) {
			alert('Please fill in all required fields');
			return;
		}

		try {
			const customerData = {
				username: newCustomer.username.trim(),
				name: newCustomer.name.trim(),
				email: newCustomer.email.trim(),
				emailVisibility: true,
				password: newCustomer.password,
				passwordConfirm: newCustomer.password,
				role: 'customer',
				phone: newCustomer.phone ? parseInt(newCustomer.phone) : null,
				addresses: newCustomer.addresses.trim() || null,
				loyalty_points: newCustomer.loyalty_points || 0,
				segment: newCustomer.segment.trim() || null,
				notes: newCustomer.notes.trim() || null
			};

			const record = await pb.collection('users').create(customerData);
			
			// (optional) send an email verification request
			if (newCustomer.email.trim()) {
				try {
					await pb.collection('users').requestVerification(newCustomer.email.trim());
				} catch (verificationError) {
					console.warn('Email verification request failed:', verificationError);
				}
			}
			
			// Reset form and close modal
			newCustomer = { 
				username: '', 
				name: '', 
				email: '', 
				password: '', 
				role: 'customer',
				phone: '',
				addresses: '',
				loyalty_points: 0,
				segment: '',
				notes: ''
			};
			showAddCustomerModal = false;
			
			// Refresh customer list
			await loadCustomers();
			
			alert('Customer added successfully!');
		} catch (error) {
			console.error('Error adding customer:', error);
			alert('Error adding customer: ' + (error.message || 'Unknown error'));
		}
	}

	function generateCustomerAnalytics() {
		if (!selectedCustomer || customerOrders.length === 0) return;

		customerAnalytics.totalOrders = customerOrders.length;
		customerAnalytics.totalSpent = customerOrders.reduce((sum, order) => sum + (order.total || 0), 0);
		customerAnalytics.averageOrderValue = customerAnalytics.totalSpent / customerAnalytics.totalOrders;
		customerAnalytics.totalReviews = customerReviews.length;
		customerAnalytics.averageRating = customerReviews.length > 0 
			? customerReviews.reduce((sum, review) => sum + (review.rating || 0), 0) / customerReviews.length 
			: 0;

		// Dates
		const orderDates = customerOrders.map(order => new Date(order.created)).sort((a, b) => a - b);
		customerAnalytics.firstOrderDate = orderDates[0];
		customerAnalytics.lastOrderDate = orderDates[orderDates.length - 1];

		// Customer segment
		if (customerAnalytics.totalOrders === 1) {
			customerAnalytics.customerSegment = 'New Customer';
		} else if (customerAnalytics.totalOrders <= 4) {
			customerAnalytics.customerSegment = 'Returning Customer';
		} else if (customerAnalytics.totalSpent < 1000) {
			customerAnalytics.customerSegment = 'Loyal Customer';
		} else {
			customerAnalytics.customerSegment = 'VIP Customer';
		}

		// Monthly spending
		const monthlyData = {};
		customerOrders.forEach(order => {
			const date = new Date(order.created);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (order.total || 0);
		});
		
		customerAnalytics.monthlySpending = Object.entries(monthlyData)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, spending]) => ({ month, spending }));

		// Category breakdown
		const categoryData = {};
		customerOrderItems.forEach(item => {
			const category = item.expand?.product_id?.category || 'Unknown';
			categoryData[category] = (categoryData[category] || 0) + (item.quantity || 1);
		});
		customerAnalytics.categoryBreakdown = categoryData;
		customerAnalytics.favoriteCategory = Object.keys(categoryData).reduce((a, b) => 
			categoryData[a] > categoryData[b] ? a : b, 'None');

		// Order frequency (days between orders)
		if (orderDates.length > 1) {
			const daysBetween = orderDates.map((date, index) => {
				if (index === 0) return 0;
				return (date - orderDates[index - 1]) / (1000 * 60 * 60 * 24);
			}).filter(days => days > 0);
			
			customerAnalytics.orderFrequency = daysBetween.length > 0 
				? daysBetween.reduce((sum, days) => sum + days, 0) / daysBetween.length 
				: 0;
		}
	}

	function createCustomerCharts() {
		// Clear existing charts
		if (customerOrdersChart) customerOrdersChart.destroy();
		if (customerCategoryChart) customerCategoryChart.destroy();
		if (customerSpendingChart) customerSpendingChart.destroy();

		createCustomerSpendingChart();
		createCustomerCategoryChart();
		createCustomerOrdersTimelineChart();
	}

	function createCustomerSpendingChart() {
		const ctx = document.getElementById('customerSpendingChart')?.getContext('2d');
		if (!ctx || customerAnalytics.monthlySpending.length === 0) return;

		customerSpendingChart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: customerAnalytics.monthlySpending.map(d => d.month),
				datasets: [{
					label: 'Monthly Spending',
					data: customerAnalytics.monthlySpending.map(d => d.spending),
					borderColor: 'rgb(59, 130, 246)',
					backgroundColor: 'rgba(59, 130, 246, 0.1)',
					tension: 0.4,
					fill: true
				}]
			},
			options: {
				responsive: true,
				scales: {
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: 'Spending (KSh)'
						}
					}
				}
			}
		});
	}

	function createCustomerCategoryChart() {
		const ctx = document.getElementById('customerCategoryChart')?.getContext('2d');
		if (!ctx || Object.keys(customerAnalytics.categoryBreakdown).length === 0) return;

		customerCategoryChart = new Chart(ctx, {
			type: 'doughnut',
			data: {
				labels: Object.keys(customerAnalytics.categoryBreakdown),
				datasets: [{
					data: Object.values(customerAnalytics.categoryBreakdown),
					backgroundColor: [
						'rgba(255, 99, 132, 0.8)',
						'rgba(54, 162, 235, 0.8)',
						'rgba(255, 205, 86, 0.8)',
						'rgba(75, 192, 192, 0.8)',
						'rgba(153, 102, 255, 0.8)',
						'rgba(255, 159, 64, 0.8)'
					]
				}]
			},
			options: {
				responsive: true,
				plugins: {
					legend: {
						position: 'bottom'
					}
				}
			}
		});
	}

	function createCustomerOrdersTimelineChart() {
		const ctx = document.getElementById('customerOrdersChart')?.getContext('2d');
		if (!ctx || customerOrders.length === 0) return;

		// Create timeline data
		const timelineData = customerOrders
			.sort((a, b) => new Date(a.created) - new Date(b.created))
			.map((order, index) => ({
				x: new Date(order.created),
				y: order.total || 0
			}));

		customerOrdersChart = new Chart(ctx, {
			type: 'scatter',
			data: {
				datasets: [{
					label: 'Order Values',
					data: timelineData,
					backgroundColor: 'rgba(34, 197, 94, 0.6)',
					borderColor: 'rgba(34, 197, 94, 1)',
					pointRadius: 6,
					pointHoverRadius: 8
				}]
			},
			options: {
				responsive: true,
				scales: {
					x: {
						type: 'time',
						time: {
							unit: 'month'
						},
						title: {
							display: true,
							text: 'Order Date'
						}
					},
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: 'Order Value (KSh)'
						}
					}
				}
			}
		});
	}

	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
	}

	function formatDate(date) {
		if (!date) return 'N/A';
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function getSegmentColor(segment) {
		switch (segment) {
			case 'New Customer': return 'bg-blue-100 text-blue-800';
			case 'Returning Customer': return 'bg-yellow-100 text-yellow-800';
			case 'Loyal Customer': return 'bg-green-100 text-green-800';
			case 'VIP Customer': return 'bg-purple-100 text-purple-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function backToCustomerList() {
		selectedCustomer = null;
		customerOrders = [];
		customerOrderItems = [];
		customerReviews = [];
		customerAnalytics = {
			totalOrders: 0,
			totalSpent: 0,
			averageOrderValue: 0,
			firstOrderDate: null,
			lastOrderDate: null,
			favoriteCategory: '',
			totalReviews: 0,
			averageRating: 0,
			customerSegment: '',
			monthlySpending: [],
			categoryBreakdown: {},
			orderFrequency: 0
		};
		
		// Restart real-time updates for customer list
		startRealTimeUpdates();
	}
</script>

<svelte:head>
	<title>CRM - Customer Management</title>
</svelte:head>

<div class="container mx-auto p-4 sm:p-6">
	{#if !selectedCustomer}
		<!-- Customer List View -->
		<div class="mb-6 sm:mb-8">
			<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
				<div>
					<h1 class="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Customer Management</h1>
					<p class="text-gray-600 text-sm sm:text-base">Click on any customer to view detailed insights and analytics</p>
				</div>
				<button 
					on:click={() => showAddCustomerModal = true}
					class="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
				>
					<svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
					</svg>
					Add New Customer
				</button>
			</div>
		</div>

		<!-- Search Bar -->
		<div class="mb-4 sm:mb-6">
			<div class="relative">
				<input 
					type="text" 
					bind:value={searchTerm}
					placeholder="Search customers by name or email..."
					class="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
				>
				<svg class="absolute left-3 top-2.5 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
				</svg>
			</div>
		</div>

		{#if loading}
			<div class="flex justify-center items-center h-64">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			</div>
		{:else}
		<!-- Customer Stats -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
			<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
				<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-2">Total Customers</h3>
				<p class="text-2xl sm:text-3xl font-bold text-blue-600">{customers.length}</p>
			</div>
			<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
				<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-2">Search Results</h3>
				<p class="text-2xl sm:text-3xl font-bold text-green-600">{filteredCustomers.length}</p>
			</div>
			<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
				<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-2">Active Filter</h3>
				<p class="text-xs sm:text-sm text-gray-600 break-words">{searchTerm || 'No filter applied'}</p>
			</div>
			<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
				<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-2">Real-time Updates</h3>
				<div class="flex items-center gap-2">
					<div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
					<p class="text-xs sm:text-sm text-gray-600">Every 30 seconds</p>
				</div>
			</div>
		</div>			<!-- Customer List -->
			<div class="bg-white rounded-lg shadow-md overflow-hidden">
				<div class="px-4 sm:px-6 py-4 border-b border-gray-200">
					<h2 class="text-lg sm:text-xl font-semibold text-gray-900">Customer List</h2>
				</div>
				
				<!-- Mobile View -->
				<div class="block sm:hidden">
					{#each filteredCustomers as customer}
						<div class="border-b border-gray-200 p-4">
							<div class="flex items-center justify-between mb-3">
								<div class="flex items-center">
									<div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
										<span class="text-blue-600 font-medium text-sm">
											{customer.name ? customer.name.charAt(0).toUpperCase() : customer.email.charAt(0).toUpperCase()}
										</span>
									</div>
									<div class="ml-3">
										<div class="text-sm font-medium text-gray-900">{customer.name || 'Unknown'}</div>
										<div class="text-xs text-gray-500">ID: {customer.id.slice(0, 8)}...</div>
									</div>
								</div>
								<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
									Active
								</span>
							</div>
							<div class="text-sm text-gray-600 mb-2">{customer.email}</div>
							<div class="text-xs text-gray-500 mb-3">{formatDate(customer.created)}</div>
							<button 
								on:click={() => selectCustomer(customer)}
								class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
							>
								View Insights
							</button>
						</div>
					{/each}
					
					{#if filteredCustomers.length === 0}
						<div class="text-center py-12">
							<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m-2 0h.01"></path>
							</svg>
							<h3 class="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
							<p class="mt-1 text-sm text-gray-500">Try adjusting your search criteria</p>
						</div>
					{/if}
				</div>

				<!-- Desktop View -->
				<div class="hidden sm:block overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Join Date</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-200">
							{#each filteredCustomers as customer}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center">
											<div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
												<span class="text-blue-600 font-medium">
													{customer.name ? customer.name.charAt(0).toUpperCase() : customer.email.charAt(0).toUpperCase()}
												</span>
											</div>
											<div class="ml-4">
												<div class="text-sm font-medium text-gray-900">{customer.name || 'Unknown'}</div>
												<div class="text-sm text-gray-500">ID: {customer.id}</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-900">{customer.email}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="text-sm text-gray-900">{formatDate(customer.created)}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
											Active
										</span>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<button 
											on:click={() => selectCustomer(customer)}
											class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
										>
											View Insights
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>

					{#if filteredCustomers.length === 0}
						<div class="text-center py-12">
							<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m-2 0h.01"></path>
							</svg>
							<h3 class="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
							<p class="mt-1 text-sm text-gray-500">Try adjusting your search criteria</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

	{:else}
		<!-- Individual Customer Insights View -->
		<div class="mb-4 sm:mb-6">
			<button 
				on:click={backToCustomerList}
				class="flex items-center text-blue-600 hover:text-blue-700 mb-4 text-sm sm:text-base"
			>
				<svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
				</svg>
				Back to Customer List
			</button>
			
			<div class="flex flex-col sm:flex-row sm:items-center mb-4 sm:mb-6">
				<div class="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-blue-100 flex items-center justify-center mb-3 sm:mb-0 sm:mr-4">
					<span class="text-blue-600 font-bold text-lg sm:text-xl">
						{selectedCustomer.name ? selectedCustomer.name.charAt(0).toUpperCase() : selectedCustomer.email.charAt(0).toUpperCase()}
					</span>
				</div>
				<div class="flex-1">
					<h1 class="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{selectedCustomer.name || 'Unknown Customer'}</h1>
					<p class="text-gray-600 text-sm sm:text-base mb-2 break-words">{selectedCustomer.email}</p>
					<span class="inline-flex px-3 py-1 text-sm font-semibold rounded-full {getSegmentColor(customerAnalytics.customerSegment)}">
						{customerAnalytics.customerSegment}
					</span>
				</div>
			</div>
		</div>

		{#if loading}
			<div class="flex justify-center items-center h-64">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			</div>
		{:else}
			<!-- Customer Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Total Orders</p>
							<p class="text-xl sm:text-2xl font-bold text-gray-900">{customerAnalytics.totalOrders}</p>
						</div>
						<div class="bg-blue-100 p-2 sm:p-3 rounded-full">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
							</svg>
						</div>
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Total Spent</p>
							<p class="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(customerAnalytics.totalSpent)}</p>
						</div>
						<div class="bg-green-100 p-2 sm:p-3 rounded-full">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
							</svg>
						</div>
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Avg Order Value</p>
							<p class="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(customerAnalytics.averageOrderValue)}</p>
						</div>
						<div class="bg-yellow-100 p-2 sm:p-3 rounded-full">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
							</svg>
						</div>
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Reviews Given</p>
							<p class="text-xl sm:text-2xl font-bold text-gray-900">{customerAnalytics.totalReviews}</p>
							{#if customerAnalytics.totalReviews > 0}
								<p class="text-xs sm:text-sm text-gray-500">Avg: {customerAnalytics.averageRating.toFixed(1)}/5</p>
							{/if}
						</div>
						<div class="bg-purple-100 p-2 sm:p-3 rounded-full">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- Customer Details -->
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-4">Customer Timeline</h3>
					<div class="space-y-3">
						<div>
							<p class="text-sm text-gray-600">First Order</p>
							<p class="font-medium text-sm sm:text-base">{formatDate(customerAnalytics.firstOrderDate)}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Last Order</p>
							<p class="font-medium text-sm sm:text-base">{formatDate(customerAnalytics.lastOrderDate)}</p>
						</div>
						{#if customerAnalytics.orderFrequency > 0}
							<div>
								<p class="text-sm text-gray-600">Order Frequency</p>
								<p class="font-medium text-sm sm:text-base">Every {Math.round(customerAnalytics.orderFrequency)} days</p>
							</div>
						{/if}
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-4">Preferences</h3>
					<div class="space-y-3">
						<div>
							<p class="text-sm text-gray-600">Favorite Category</p>
							<p class="font-medium text-sm sm:text-base">{customerAnalytics.favoriteCategory}</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Customer Since</p>
							<p class="font-medium text-sm sm:text-base">{formatDate(selectedCustomer.created)}</p>
						</div>
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6 md:col-span-2 lg:col-span-1">
					<h3 class="text-base sm:text-lg font-semibold text-gray-900 mb-4">Engagement</h3>
					<div class="space-y-3">
						<div>
							<p class="text-sm text-gray-600">Review Participation</p>
							<p class="font-medium text-sm sm:text-base">{((customerAnalytics.totalReviews / customerAnalytics.totalOrders) * 100).toFixed(1)}%</p>
						</div>
						<div>
							<p class="text-sm text-gray-600">Customer Type</p>
							<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getSegmentColor(customerAnalytics.customerSegment)}">
								{customerAnalytics.customerSegment}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Charts -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
				<!-- Customer Spending Timeline -->
				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<h2 class="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Monthly Spending Trend</h2>
					<div class="h-64 sm:h-80">
						<canvas id="customerSpendingChart"></canvas>
					</div>
				</div>

				<!-- Category Preferences -->
				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
					<h2 class="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Category Preferences</h2>
					<div class="h-64 sm:h-80">
						<canvas id="customerCategoryChart"></canvas>
					</div>
				</div>

				<!-- Order Timeline -->
				<div class="bg-white rounded-lg shadow-md p-4 sm:p-6 lg:col-span-2">
					<h2 class="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Order Timeline & Values</h2>
					<div class="h-64 sm:h-80">
						<canvas id="customerOrdersChart"></canvas>
					</div>
				</div>
			</div>

			<!-- Recent Orders -->
			<div class="bg-white rounded-lg shadow-md p-4 sm:p-6">
				<h2 class="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Recent Orders</h2>
				{#if customerOrders.length > 0}
					<!-- Mobile View -->
					<div class="block sm:hidden">
						{#each customerOrders.slice(0, 10) as order}
							<div class="border-b border-gray-200 py-3 last:border-b-0">
								<div class="flex justify-between items-start mb-2">
									<div>
										<p class="text-sm font-medium text-gray-900">Order #{order.id.slice(0, 8)}...</p>
										<p class="text-xs text-gray-500">{formatDate(order.created)}</p>
									</div>
									<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
										{order.status || 'Completed'}
									</span>
								</div>
								<p class="text-sm font-medium text-gray-900">{formatCurrency(order.total || 0)}</p>
							</div>
						{/each}
					</div>

					<!-- Desktop View -->
					<div class="hidden sm:block overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-200">
								{#each customerOrders.slice(0, 10) as order}
									<tr>
										<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
											{order.id}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{formatDate(order.created)}
										</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{formatCurrency(order.total || 0)}
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
												{order.status || 'Completed'}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="text-gray-500 text-center py-8">No orders found for this customer</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<!-- Add Customer Modal -->
{#if showAddCustomerModal}
	<div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 p-4">
		<div class="relative top-4 sm:top-10 mx-auto p-4 sm:p-5 border w-full max-w-md shadow-lg rounded-md bg-white mb-8">
			<div class="mt-3">
				<div class="flex justify-between items-center mb-4">
					<h3 class="text-lg font-medium text-gray-900">Add New Customer</h3>
					<button 
						on:click={() => showAddCustomerModal = false}
						class="text-gray-400 hover:text-gray-600"
						aria-label="Close modal"
					>
						<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
						</svg>
					</button>
				</div>
				
				<form on:submit|preventDefault={addNewCustomer} class="space-y-4">
					<div>
						<label for="customerUsername" class="block text-sm font-medium text-gray-700 mb-1">
							Username *
						</label>
						<input 
							id="customerUsername"
							type="text" 
							bind:value={newCustomer.username}
							placeholder="Enter username"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							required
						>
					</div>

					<div>
						<label for="customerName" class="block text-sm font-medium text-gray-700 mb-1">
							Full Name *
						</label>
						<input 
							id="customerName"
							type="text" 
							bind:value={newCustomer.name}
							placeholder="Enter customer's full name"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							required
						>
					</div>
					
					<div>
						<label for="customerEmail" class="block text-sm font-medium text-gray-700 mb-1">
							Email Address *
						</label>
						<input 
							id="customerEmail"
							type="email" 
							bind:value={newCustomer.email}
							placeholder="Enter email address"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							required
						>
					</div>
					
					<div>
						<label for="customerPassword" class="block text-sm font-medium text-gray-700 mb-1">
							Password *
						</label>
						<input 
							id="customerPassword"
							type="password" 
							bind:value={newCustomer.password}
							placeholder="Enter password"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							required
							minlength="6"
						>
						<p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
					</div>

					<div>
						<label for="customerRole" class="block text-sm font-medium text-gray-700 mb-1">
							Role
						</label>
						<input 
							id="customerRole"
							type="text" 
							bind:value={newCustomer.role}
							class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 text-sm sm:text-base"
							readonly
						>
					</div>

					<div>
						<label for="customerPhone" class="block text-sm font-medium text-gray-700 mb-1">
							Phone
						</label>
						<input 
							id="customerPhone"
							type="tel" 
							bind:value={newCustomer.phone}
							placeholder="Enter phone number"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
						>
					</div>

					<div>
						<label for="customerAddresses" class="block text-sm font-medium text-gray-700 mb-1">
							Addresses
						</label>
						<textarea 
							id="customerAddresses"
							bind:value={newCustomer.addresses}
							placeholder="Enter customer addresses (JSON format)"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							rows="3"
						></textarea>
					</div>

					<div>
						<label for="customerLoyaltyPoints" class="block text-sm font-medium text-gray-700 mb-1">
							Loyalty Points
						</label>
						<input 
							id="customerLoyaltyPoints"
							type="number" 
							bind:value={newCustomer.loyalty_points}
							placeholder="Enter loyalty points"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							min="0"
						>
					</div>

					<div>
						<label for="customerSegment" class="block text-sm font-medium text-gray-700 mb-1">
							Segment
						</label>
						<select 
							id="customerSegment"
							bind:value={newCustomer.segment}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
						>
							<option value="">Select segment</option>
							<option value="New Customer">New Customer</option>
							<option value="Returning Customer">Returning Customer</option>
							<option value="Loyal Customer">Loyal Customer</option>
							<option value="VIP Customer">VIP Customer</option>
						</select>
					</div>

					<div>
						<label for="customerNotes" class="block text-sm font-medium text-gray-700 mb-1">
							Notes
						</label>
						<textarea 
							id="customerNotes"
							bind:value={newCustomer.notes}
							placeholder="Enter any notes about the customer"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base"
							rows="3"
						></textarea>
					</div>
					
					<div class="flex flex-col sm:flex-row justify-end gap-3 pt-4">
						<button 
							type="button"
							on:click={() => showAddCustomerModal = false}
							class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
						>
							Cancel
						</button>
						<button 
							type="submit"
							class="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							Add Customer
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<style>
	.container {
		max-width: 1200px;
	}
	
	/* Ensure charts are responsive */
	@media (max-width: 640px) {
		.container {
			padding-left: 1rem;
			padding-right: 1rem;
		}
	}
	
	/* Better text wrapping for mobile */
	@media (max-width: 768px) {
		.break-words {
			word-break: break-word;
			overflow-wrap: break-word;
		}
	}
</style>
