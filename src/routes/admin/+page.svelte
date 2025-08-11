<script>
	import { onMount } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	import { Chart, registerables } from 'chart.js';

	// Register Chart.js components
	Chart.register(...registerables);

	// Dashboard data
	let dashboardData = {
		totalSales: 0,
		totalOrders: 0,
		totalCustomers: 0,
		totalProducts: 0,
		todayOrders: 0,
		todayRevenue: 0,
		lowStockCount: 0,
		pendingOrders: 0,
		recentOrders: [],
		topProducts: [],
		salesTrend: [],
		orderTrend: [],
		orderStats: {
			pending: 0,
			processing: 0,
			completed: 0,
			cancelled: 0
		}
	};

	let loading = true;
	let salesChart = null;
	let orderChart = null;

	onMount(async () => {
		await loadDashboardData();
		// Add a small delay to ensure DOM is ready
		setTimeout(() => {
			createCharts();
		}, 100);
		loading = false;
	});

	async function loadDashboardData() {
		try {
			// Load orders
			const orders = await pb.collection('orders').getFullList({
				sort: '-created',
				expand: 'customer,items'
			});

			// Load products
			const products = await pb.collection('products').getFullList();

			// Load customers
			const customers = await pb.collection('users').getFullList({
				filter: 'role != "admin" && role != "manager"'
			});

			// Calculate metrics
			calculateMetrics(orders, products, customers);
		} catch (error) {
			console.error('Error loading dashboard data:', error);
		}
	}

	function calculateMetrics(orders, products, customers) {
		const today = new Date().toISOString().split('T')[0];
		
		// Basic counts
		dashboardData.totalOrders = orders.length;
		dashboardData.totalProducts = products.length;
		dashboardData.totalCustomers = customers.length;

		// Today's metrics
		const todayOrders = orders.filter(order => 
			order.created.startsWith(today)
		);
		dashboardData.todayOrders = todayOrders.length;
		dashboardData.todayRevenue = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);

		// Total sales
		dashboardData.totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);

		// Order status counts
		dashboardData.orderStats = orders.reduce((stats, order) => {
			const status = order.status || 'pending';
			stats[status] = (stats[status] || 0) + 1;
			return stats;
		}, { pending: 0, processing: 0, completed: 0, cancelled: 0 });

		dashboardData.pendingOrders = dashboardData.orderStats.pending;

		// Low stock products (assuming stock field exists)
		dashboardData.lowStockCount = products.filter(product => 
			(product.stock || 0) < 10
		).length;

		// Recent orders (last 5)
		dashboardData.recentOrders = orders.slice(0, 5);

		// Sales trend (last 7 days)
		const last7Days = Array.from({ length: 7 }, (_, i) => {
			const date = new Date();
			date.setDate(date.getDate() - i);
			return date.toISOString().split('T')[0];
		}).reverse();

		dashboardData.salesTrend = last7Days.map(date => {
			const dayOrders = orders.filter(order => order.created.startsWith(date));
			return {
				date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
				sales: dayOrders.reduce((sum, order) => sum + (order.total || 0), 0)
			};
		});

		// Order count trend (last 7 days) for the bar chart
		dashboardData.orderTrend = last7Days.map(date => {
			const dayOrders = orders.filter(order => order.created.startsWith(date));
			return {
				date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
				count: dayOrders.length
			};
		});
	}

	function createCharts() {
		console.log('Creating charts with data:', {
			salesTrend: dashboardData.salesTrend,
			orderTrend: dashboardData.orderTrend
		});

		// Sales Trend Chart
		const salesCtx = document.getElementById('salesChart');
		if (salesCtx) {
			console.log('Sales chart canvas found');
			salesChart = new Chart(salesCtx, {
				type: 'line',
				data: {
					labels: dashboardData.salesTrend.map(d => d.date),
					datasets: [{
						label: 'Sales Amount (KSh)',
						data: dashboardData.salesTrend.map(d => d.sales),
						borderColor: 'rgb(59, 130, 246)',
						backgroundColor: 'rgba(59, 130, 246, 0.1)',
						borderWidth: 3,
						pointBackgroundColor: 'rgb(59, 130, 246)',
						pointBorderColor: '#ffffff',
						pointBorderWidth: 2,
						pointRadius: 6,
						pointHoverRadius: 8,
						tension: 0.4,
						fill: true
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					interaction: {
						intersect: false,
						mode: 'index'
					},
					scales: {
						x: {
							title: {
								display: true,
								text: 'Days',
								font: {
									size: 14,
									weight: 'bold'
								}
							},
							grid: {
								display: false
							}
						},
						y: {
							beginAtZero: true,
							title: {
								display: true,
								text: 'Sales Amount (KSh)',
								font: {
									size: 14,
									weight: 'bold'
								}
							},
							ticks: {
								callback: function(value) {
									return 'KSh ' + value.toLocaleString();
								}
							},
							grid: {
								color: 'rgba(0, 0, 0, 0.1)'
							}
						}
					},
					plugins: {
						legend: {
							display: true,
							position: 'top',
							labels: {
								usePointStyle: true,
								font: {
									size: 12
								}
							}
						},
						tooltip: {
							backgroundColor: 'rgba(0, 0, 0, 0.8)',
							titleColor: '#ffffff',
							bodyColor: '#ffffff',
							borderColor: 'rgb(59, 130, 246)',
							borderWidth: 1,
							callbacks: {
								label: function(context) {
									return 'Sales: KSh ' + context.parsed.y.toLocaleString();
								}
							}
						}
					}
				}
			});
		}

		// Order Count Chart (Last 7 Days)
		const orderCtx = document.getElementById('orderChart');
		if (orderCtx) {
			console.log('Order chart canvas found');
			orderChart = new Chart(orderCtx, {
				type: 'bar',
				data: {
					labels: dashboardData.orderTrend.map(d => d.date),
					datasets: [{
						label: 'Number of Orders',
						data: dashboardData.orderTrend.map(d => d.count),
						backgroundColor: 'rgba(16, 185, 129, 0.8)',
						borderColor: 'rgb(16, 185, 129)',
						borderWidth: 2,
						borderRadius: 4,
						borderSkipped: false,
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					interaction: {
						intersect: false,
						mode: 'index'
					},
					scales: {
						x: {
							title: {
								display: true,
								text: 'Days',
								font: {
									size: 14,
									weight: 'bold'
								}
							},
							grid: {
								display: false
							}
						},
						y: {
							beginAtZero: true,
							title: {
								display: true,
								text: 'Number of Orders',
								font: {
									size: 14,
									weight: 'bold'
								}
							},
							ticks: {
								stepSize: 1,
								callback: function(value) {
									return Math.floor(value);
								}
							},
							grid: {
								color: 'rgba(0, 0, 0, 0.1)'
							}
						}
					},
					plugins: {
						legend: {
							display: true,
							position: 'top',
							labels: {
								usePointStyle: true,
								font: {
									size: 12
								}
							}
						},
						tooltip: {
							backgroundColor: 'rgba(0, 0, 0, 0.8)',
							titleColor: '#ffffff',
							bodyColor: '#ffffff',
							borderColor: 'rgb(16, 185, 129)',
							borderWidth: 1,
							callbacks: {
								label: function(context) {
									return 'Orders: ' + context.parsed.y;
								}
							}
						}
					}
				}
			});
		}
	}

	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES'
		}).format(amount);
	}

	function formatDate(dateString) {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Admin Dashboard</title>
</svelte:head>

<div class="p-4 md:p-6 bg-gray-50 min-h-screen">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
		<p class="text-gray-600">Welcome back! Here's what's happening in your store today.</p>
	</div>

	{#if loading}
		<!-- Loading State -->
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else}
		<!-- Key Metrics Grid -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
			<!-- Total Sales -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Total Sales</p>
						<p class="text-2xl md:text-3xl font-bold text-gray-900">{formatCurrency(dashboardData.totalSales)}</p>
					</div>
					<div class="p-3 bg-green-100 rounded-full">
						<svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
						</svg>
					</div>
				</div>
			</div>

			<!-- Total Orders -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Total Orders</p>
						<p class="text-2xl md:text-3xl font-bold text-gray-900">{dashboardData.totalOrders}</p>
					</div>
					<div class="p-3 bg-blue-100 rounded-full">
						<svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
						</svg>
					</div>
				</div>
			</div>

			<!-- Total Customers -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Customers</p>
						<p class="text-2xl md:text-3xl font-bold text-gray-900">{dashboardData.totalCustomers}</p>
					</div>
					<div class="p-3 bg-purple-100 rounded-full">
						<svg class="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
						</svg>
					</div>
				</div>
			</div>

			<!-- Total Products -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Products</p>
						<p class="text-2xl md:text-3xl font-bold text-gray-900">{dashboardData.totalProducts}</p>
					</div>
					<div class="p-3 bg-orange-100 rounded-full">
						<svg class="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
						</svg>
					</div>
				</div>
			</div>
		</div>

		<!-- Today's Stats -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
			<!-- Today's Revenue -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center">
					<div class="p-2 bg-green-50 rounded-lg mr-4">
						<svg class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
						</svg>
					</div>
					<div>
						<p class="text-sm text-gray-600">Today's Revenue</p>
						<p class="text-lg font-semibold text-gray-900">{formatCurrency(dashboardData.todayRevenue)}</p>
					</div>
				</div>
			</div>

			<!-- Today's Orders -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center">
					<div class="p-2 bg-blue-50 rounded-lg mr-4">
						<svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
						</svg>
					</div>
					<div>
						<p class="text-sm text-gray-600">Today's Orders</p>
						<p class="text-lg font-semibold text-gray-900">{dashboardData.todayOrders}</p>
					</div>
				</div>
			</div>

			<!-- Pending Orders -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center">
					<div class="p-2 bg-yellow-50 rounded-lg mr-4">
						<svg class="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<div>
						<p class="text-sm text-gray-600">Pending Orders</p>
						<p class="text-lg font-semibold text-gray-900">{dashboardData.pendingOrders}</p>
					</div>
				</div>
			</div>

			<!-- Low Stock Alert -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center">
					<div class="p-2 bg-red-50 rounded-lg mr-4">
						<svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<div>
						<p class="text-sm text-gray-600">Low Stock Items</p>
						<p class="text-lg font-semibold text-gray-900">{dashboardData.lowStockCount}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Charts Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
			<!-- Sales Trend Chart -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Sales Trend (Last 7 Days)</h3>
				<div class="h-64">
					<canvas id="salesChart"></canvas>
				</div>
			</div>

			<!-- Order Count Chart -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Order Count (Last 7 Days)</h3>
				<div class="h-64">
					<canvas id="orderChart"></canvas>
				</div>
			</div>
		</div>

		<!-- Recent Activity & Quick Actions -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Recent Orders -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900">Recent Orders</h3>
					<a href="/admin/orders" class="text-blue-600 hover:text-blue-800 text-sm font-medium">View All</a>
				</div>
				{#if dashboardData.recentOrders.length > 0}
					<div class="space-y-3">
						{#each dashboardData.recentOrders as order}
							<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-900 truncate">Order #{order.id.slice(-8)}</p>
									<p class="text-xs text-gray-500">{formatDate(order.created)}</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-medium text-gray-900">{formatCurrency(order.total || 0)}</p>
									<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {
										order.status === 'completed' ? 'bg-green-100 text-green-800' :
										order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
										order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
										'bg-yellow-100 text-yellow-800'
									}">
										{order.status || 'pending'}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-gray-500 text-center py-4">No recent orders</p>
				{/if}
			</div>

			<!-- Quick Actions -->
			<div class="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<a href="/admin/products" class="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
						<div class="p-2 bg-blue-600 rounded-lg mr-3">
							<svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
							</svg>
						</div>
						<div>
							<p class="font-medium text-gray-900">Add Product</p>
							<p class="text-sm text-gray-600">Create new product</p>
						</div>
					</a>

					<a href="/admin/orders" class="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
						<div class="p-2 bg-green-600 rounded-lg mr-3">
							<svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>
						</div>
						<div>
							<p class="font-medium text-gray-900">Manage Orders</p>
							<p class="text-sm text-gray-600">Process pending orders</p>
						</div>
					</a>

					<a href="/admin/category" class="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
						<div class="p-2 bg-purple-600 rounded-lg mr-3">
							<svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
							</svg>
						</div>
						<div>
							<p class="font-medium text-gray-900">Categories</p>
							<p class="text-sm text-gray-600">Manage categories</p>
						</div>
					</a>

					<a href="/admin/crm" class="flex items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
						<div class="p-2 bg-orange-600 rounded-lg mr-3">
							<svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
							</svg>
						</div>
						<div>
							<p class="font-medium text-gray-900">CRM</p>
							<p class="text-sm text-gray-600">Customer management</p>
						</div>
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
