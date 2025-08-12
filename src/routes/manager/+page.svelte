<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth, pb } from '$lib/pocketbase.js';
	import { authStore } from '$lib/authStore.js';
	import Chart from 'chart.js/auto';

	let loading = true;
	let chartsLoading = false;
	/** @type {any[]} */
	let products = [];
	/** @type {any[]} */
	let orderItems = [];
	/** @type {any[]} */
	let categories = [];
	/** @type {any} */
	let stockChart;
	/** @type {any} */
	let topProductsChart;
	/** @type {any} */
	let categoryChart;

	// Chart data
	/** @type {any[]} */
	let stockChartData = [];
	/** @type {any[]} */
	let topProductsData = [];
	/** @type {any[]} */
	let categoryData = [];

	// P/L Analysis data
	/** @type {any[]} */
	let orders = [];
	/** @type {any[]} */
	let returns = [];
	let profitLossData = {
		totalRevenue: 0,
		totalCosts: 0,
		grossProfit: 0,
		grossProfitMargin: 0,
		returnsCost: 0,
		returnsRate: 0,
		netProfit: 0,
		netProfitMargin: 0,
		totalOrdersCount: 0,
		totalReturnsCount: 0,
		averageOrderValue: 0,
		revenueGrowth: 0,
		profitGrowth: 0
	};

	async function fetchData() {
		if (!pb) {
			console.error('PocketBase not initialized');
			return;
		}
		
		chartsLoading = true;
		try {
			// Fetch categories data
			const categoriesResponse = await pb.collection('categories').getFullList({
				sort: '-created'
			});
			categories = categoriesResponse;

			// Fetch products data
			const productsResponse = await pb.collection('products').getFullList({
				expand: 'category_id',
				sort: '-created'
			});
			products = productsResponse;

			// Fetch orders data for P/L analysis
			try {
				const ordersResponse = await pb.collection('orders').getFullList({
					expand: 'customer,items',
					sort: '-created'
				});
				orders = ordersResponse;
			} catch (error) {
				console.warn('Could not fetch orders:', error);
				orders = [];
			}

			// Fetch returns data for P/L analysis
			try {
				const returnsResponse = await pb.collection('returns').getFullList({
					expand: 'order_id,product_id',
					sort: '-created'
				});
				returns = returnsResponse;
			} catch (error) {
				console.warn('Could not fetch returns:', error);
				returns = [];
			}

			// Fetch order items for top selling products analysis
			try {
				const orderItemsResponse = await pb.collection('order_items').getFullList({
					expand: 'product_id,order_id',
					sort: '-created'
				});
				orderItems = orderItemsResponse;
			} catch (error) {
				console.warn('Could not fetch order items:', error);
				orderItems = [];
			}

			calculateProfitLoss();
			prepareChartData();
			createCharts();
		} catch (error) {
			console.error('Error fetching data:', error);
		} finally {
			chartsLoading = false;
		}
	}

	function calculateProfitLoss() {
		// Calculate current period (last 30 days) and previous period for growth comparison
		const currentDate = new Date();
		const currentPeriodStart = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000));
		const previousPeriodStart = new Date(currentDate.getTime() - (60 * 24 * 60 * 60 * 1000));
		const previousPeriodEnd = currentPeriodStart;

		// Filter orders for current and previous periods
		const currentOrders = orders.filter(order => {
			const orderDate = new Date(order.created);
			return orderDate >= currentPeriodStart && order.status !== 'cancelled';
		});

		const previousOrders = orders.filter(order => {
			const orderDate = new Date(order.created);
			return orderDate >= previousPeriodStart && orderDate < previousPeriodEnd && order.status !== 'cancelled';
		});

		// Calculate revenue
		const currentRevenue = currentOrders.reduce((sum, order) => sum + (order.total || 0), 0);
		const previousRevenue = previousOrders.reduce((sum, order) => sum + (order.total || 0), 0);

		// Calculate costs (estimated based on product cost or 60% of selling price if cost not available)
		let totalCosts = 0;
		const currentOrderItems = orderItems.filter(item => {
			const order = orders.find(o => o.id === item.order_id);
			if (!order) return false;
			const orderDate = new Date(order.created);
			return orderDate >= currentPeriodStart && order.status !== 'cancelled';
		});

		currentOrderItems.forEach(item => {
			const product = products.find(p => p.id === item.product_id);
			if (product) {
				// Use product cost if available, otherwise estimate as 60% of selling price
				const productCost = product.cost || (product.price * 0.6);
				totalCosts += productCost * (item.quantity || 1);
			}
		});

		// Calculate returns impact
		const currentReturns = returns.filter(returnItem => {
			const returnDate = new Date(returnItem.created);
			return returnDate >= currentPeriodStart;
		});

		const returnsCost = currentReturns.reduce((sum, returnItem) => {
			// Find the product to get its cost
			const product = products.find(p => p.id === returnItem.product_id);
			if (product) {
				const productCost = product.cost || (product.price * 0.6);
				return sum + (productCost * (returnItem.quantity || 1));
			}
			return sum;
		}, 0);

		const returnsRefund = currentReturns.reduce((sum, returnItem) => {
			const product = products.find(p => p.id === returnItem.product_id);
			if (product) {
				return sum + (product.price * (returnItem.quantity || 1));
			}
			return sum;
		}, 0);

		// Calculate metrics
		const grossProfit = currentRevenue - totalCosts;
		const netRevenue = currentRevenue - returnsRefund; // Revenue after refunds
		const netProfit = grossProfit - returnsCost; // Profit after returns impact
		const grossProfitMargin = currentRevenue > 0 ? (grossProfit / currentRevenue) * 100 : 0;
		const netProfitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
		const returnsRate = currentOrders.length > 0 ? (currentReturns.length / currentOrders.length) * 100 : 0;
		const averageOrderValue = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0;

		// Calculate growth rates
		const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
		
		// Calculate previous period profit for growth comparison
		const previousOrderItems = orderItems.filter(item => {
			const order = orders.find(o => o.id === item.order_id);
			if (!order) return false;
			const orderDate = new Date(order.created);
			return orderDate >= previousPeriodStart && orderDate < previousPeriodEnd && order.status !== 'cancelled';
		});

		let previousCosts = 0;
		previousOrderItems.forEach(item => {
			const product = products.find(p => p.id === item.product_id);
			if (product) {
				const productCost = product.cost || (product.price * 0.6);
				previousCosts += productCost * (item.quantity || 1);
			}
		});

		const previousProfit = previousRevenue - previousCosts;
		const profitGrowth = previousProfit > 0 ? ((netProfit - previousProfit) / previousProfit) * 100 : 0;

		// Update P/L data
		profitLossData = {
			totalRevenue: currentRevenue,
			totalCosts: totalCosts,
			grossProfit: grossProfit,
			grossProfitMargin: grossProfitMargin,
			returnsCost: returnsCost + returnsRefund, // Total impact of returns
			returnsRate: returnsRate,
			netProfit: netProfit,
			netProfitMargin: netProfitMargin,
			totalOrdersCount: currentOrders.length,
			totalReturnsCount: currentReturns.length,
			averageOrderValue: averageOrderValue,
			revenueGrowth: revenueGrowth,
			profitGrowth: profitGrowth
		};

		console.log('P/L Analysis:', profitLossData);
	}

	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
	}

	function prepareChartData() {
		// Prepare stock level chart data
		stockChartData = products.map(product => ({
			name: product.name,
			stock: product.stock || 0,
			lowStockAlert: product.low_stock_alert || 10, // Default to 10 if not set
			isLowStock: (product.stock || 0) <= (product.low_stock_alert || 10)
		}));

		// Prepare top selling products data
		/** @type {Record<string, {name: string, quantity: number}>} */
		const productSales = {};
		orderItems.forEach(item => {
			const productId = item.product_id;
			const quantity = item.quantity || 1;
			if (productSales[productId]) {
				productSales[productId].quantity += quantity;
			} else {
				const product = products.find(p => p.id === productId);
				productSales[productId] = {
					name: product?.name || 'Unknown Product',
					quantity: quantity
				};
			}
		});

		topProductsData = Object.values(productSales)
			.sort((a, b) => b.quantity - a.quantity)
			.slice(0, 10); // Top 10 products

		// Prepare category distribution data using dedicated categories collection
		/** @type {Record<string, number>} */
		const categoryCount = {};
		
		// Initialize all categories with 0 count
		categories.forEach(category => {
			if (category.is_active) {
				categoryCount[category.name] = 0;
			}
		});
		
		// Count products in each category
		products.forEach(product => {
			const categoryName = product.expand?.category_id?.name || 'Uncategorized';
			if (categoryCount.hasOwnProperty(categoryName)) {
				categoryCount[categoryName]++;
			} else {
				categoryCount['Uncategorized'] = (categoryCount['Uncategorized'] || 0) + 1;
			}
		});

		categoryData = Object.entries(categoryCount).map(([name, count]) => ({
			name,
			count
		}));
	}

	function createCharts() {
		// Use setTimeout to ensure canvas elements are rendered
		setTimeout(() => {
			// Stock Level Chart
			const stockCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('stockChart'));
			if (!stockCanvas) return;
			
			const stockCtx = stockCanvas.getContext('2d');
			if (!stockCtx) return;
			
			if (stockChart) stockChart.destroy();
			
			stockChart = new Chart(stockCtx, {
				type: 'bar',
				data: {
					labels: stockChartData.map(item => item.name),
					datasets: [
						{
							label: 'Current Stock',
							data: stockChartData.map(item => item.stock),
							backgroundColor: stockChartData.map(item => 
								item.isLowStock ? '#ef4444' : '#10b981'
							),
							borderColor: stockChartData.map(item => 
								item.isLowStock ? '#dc2626' : '#059669'
							),
							borderWidth: 1
						},
						{
							label: 'Low Stock Alert Level',
							data: stockChartData.map(item => item.lowStockAlert),
							backgroundColor: '#fbbf24',
							borderColor: '#f59e0b',
							borderWidth: 1
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						y: {
							beginAtZero: true,
							title: {
								display: true,
								text: 'Quantity'
							}
						},
						x: {
							title: {
								display: true,
								text: 'Products'
							}
						}
					},
					plugins: {
						title: {
							display: true,
							text: 'Stock Levels vs Low Stock Alerts'
						},
						legend: {
							display: true
						}
					}
				}
			});

			// Top Selling Products Chart
			const topProductsCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('topProductsChart'));
			if (!topProductsCanvas) return;
			
			const topProductsCtx = topProductsCanvas.getContext('2d');
			if (!topProductsCtx) return;
			
			if (topProductsChart) topProductsChart.destroy();
			
			topProductsChart = new Chart(topProductsCtx, {
				type: 'bar',
				data: {
					labels: topProductsData.map(item => item.name),
					datasets: [{
						label: 'Units Sold',
						data: topProductsData.map(item => item.quantity),
						backgroundColor: [
							'#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
							'#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
						],
						borderColor: [
							'#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
							'#db2777', '#0d9488', '#ea580c', '#65a30d', '#0891b2'
						],
						borderWidth: 1
					}]
				},
				options: {
					indexAxis: 'y',
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						x: {
							beginAtZero: true,
							title: {
								display: true,
								text: 'Units Sold'
							}
						}
					},
					plugins: {
						title: {
							display: true,
							text: 'Top Selling Products'
						},
						legend: {
							display: false
						}
					}
				}
			});

			// Category Distribution Chart
			const categoryCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('categoryChart'));
			if (!categoryCanvas) return;
			
			const categoryCtx = categoryCanvas.getContext('2d');
			if (!categoryCtx) return;
			
			if (categoryChart) categoryChart.destroy();
			
			categoryChart = new Chart(categoryCtx, {
				type: 'doughnut',
				data: {
					labels: categoryData.map(item => item.name),
					datasets: [{
						data: categoryData.map(item => item.count),
						backgroundColor: [
							'#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
							'#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
						],
						borderColor: [
							'#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
							'#db2777', '#0d9488', '#ea580c', '#65a30d', '#0891b2'
						],
						borderWidth: 2
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						title: {
							display: true,
							text: 'Product Distribution by Category'
						},
						legend: {
							position: 'bottom'
						},
						tooltip: {
							callbacks: {
								label: function(context) {
									const label = context.label || '';
									const count = context.parsed || 0;
									const total = context.dataset.data.reduce((a, b) => a + b, 0);
									const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
									return `${label}: ${count} products (${percentage}%)`;
								}
							}
						}
					},
					interaction: {
						intersect: false,
						mode: 'index'
					},
					onHover: (event, activeElements) => {
						event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
					}
				}
			});
		}, 100);
	}

	onMount(() => {
		// Check if user is authenticated and has proper role
		const unsubscribe = authStore.subscribe((state) => {
			if (!state.isLoading) {
				if (!state.isAuthenticated) {
					// Not authenticated, redirect to login
					goto('/login');
					return;
				}

				const userRole = auth.getCurrentUserRole();
				if (userRole !== 'manager') {
					// Wrong role, redirect to appropriate page
					auth.redirectByRole(state.user);
					return;
				}

				loading = false;
				// Fetch data and create charts after authentication is confirmed
				fetchData();
			}
		});

		return () => {
			unsubscribe();
			// Clean up charts
			if (stockChart) stockChart.destroy();
			if (topProductsChart) topProductsChart.destroy();
			if (categoryChart) categoryChart.destroy();
		};
	});
</script>

{#if loading}
	<div class="flex items-center justify-center min-h-screen bg-white">
		<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
	</div>
{:else}
	<!-- Main content -->
	<div class="flex flex-col flex-1 overflow-y-auto bg-white">
		<div class="p-4 md:p-6 lg:p-8">
			<div class="mb-6">
				<h1 class="text-2xl md:text-3xl font-bold text-gray-800">Manager Dashboard</h1>
				<p class="mt-2 text-gray-600 text-sm md:text-base">Monitor inventory levels, sales performance, and product categories.</p>
			</div>

			<!-- Profit & Loss Analysis Section -->
			<div class="mb-8">
				<div class="mb-4">
					<h2 class="text-xl font-bold text-gray-800 flex items-center">
						<svg class="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
						</svg>
						Profit & Loss Analysis (Last 30 Days)
					</h2>
					<p class="text-gray-600 text-sm">Comprehensive financial overview including returns impact</p>
				</div>

				<!-- P/L Metrics Grid -->
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					<!-- Total Revenue -->
					<div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-sm font-medium text-blue-100">Total Revenue</h3>
								<p class="text-2xl font-bold">KSh {profitLossData.totalRevenue.toLocaleString()}</p>
								<div class="flex items-center mt-2">
									{#if profitLossData.revenueGrowth >= 0}
										<svg class="w-4 h-4 text-green-300 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
										</svg>
										<span class="text-green-300 text-sm">+{profitLossData.revenueGrowth.toFixed(1)}%</span>
									{:else}
										<svg class="w-4 h-4 text-red-300 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"></path>
										</svg>
										<span class="text-red-300 text-sm">{profitLossData.revenueGrowth.toFixed(1)}%</span>
									{/if}
								</div>
							</div>
							<svg class="w-8 h-8 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
							</svg>
						</div>
					</div>

					<!-- Gross Profit -->
					<div class="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-sm font-medium text-green-100">Gross Profit</h3>
								<p class="text-2xl font-bold">KSh {profitLossData.grossProfit.toLocaleString()}</p>
								<div class="flex items-center mt-2">
									<span class="text-green-100 text-sm">{profitLossData.grossProfitMargin.toFixed(1)}% margin</span>
								</div>
							</div>
							<svg class="w-8 h-8 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path>
							</svg>
						</div>
					</div>

					<!-- Net Profit -->
					<div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-sm font-medium text-purple-100">Net Profit</h3>
								<p class="text-2xl font-bold">KSh {profitLossData.netProfit.toLocaleString()}</p>
								<div class="flex items-center mt-2">
									{#if profitLossData.profitGrowth >= 0}
										<svg class="w-4 h-4 text-green-300 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
										</svg>
										<span class="text-green-300 text-sm">+{profitLossData.profitGrowth.toFixed(1)}%</span>
									{:else}
										<svg class="w-4 h-4 text-red-300 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"></path>
										</svg>
										<span class="text-red-300 text-sm">{profitLossData.profitGrowth.toFixed(1)}%</span>
									{/if}
								</div>
							</div>
							<svg class="w-8 h-8 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
							</svg>
						</div>
					</div>

					<!-- Returns Impact -->
					<div class="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-sm font-medium text-red-100">Returns Impact</h3>
								<p class="text-2xl font-bold">KSh {profitLossData.returnsCost.toLocaleString()}</p>
								<div class="flex items-center mt-2">
									<span class="text-red-100 text-sm">{profitLossData.returnsRate.toFixed(1)}% return rate</span>
								</div>
							</div>
							<svg class="w-8 h-8 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z"></path>
							</svg>
						</div>
					</div>
				</div>

				<!-- Additional P/L Metrics -->
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					<!-- Total Orders -->
					<div class="bg-white border border-gray-200 rounded-lg p-4">
						<div class="flex items-center">
							<div class="p-2 bg-blue-100 rounded-lg">
								<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
								</svg>
							</div>
							<div class="ml-4">
								<p class="text-sm font-medium text-gray-600">Total Orders</p>
								<p class="text-2xl font-semibold text-gray-900">{profitLossData.totalOrdersCount}</p>
							</div>
						</div>
					</div>

					<!-- Average Order Value -->
					<div class="bg-white border border-gray-200 rounded-lg p-4">
						<div class="flex items-center">
							<div class="p-2 bg-green-100 rounded-lg">
								<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
								</svg>
							</div>
							<div class="ml-4">
								<p class="text-sm font-medium text-gray-600">Avg Order Value</p>
								<p class="text-2xl font-semibold text-gray-900">KSh {profitLossData.averageOrderValue.toLocaleString()}</p>
							</div>
						</div>
					</div>

					<!-- Total Returns -->
					<div class="bg-white border border-gray-200 rounded-lg p-4">
						<div class="flex items-center">
							<div class="p-2 bg-red-100 rounded-lg">
								<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3"></path>
								</svg>
							</div>
							<div class="ml-4">
								<p class="text-sm font-medium text-gray-600">Total Returns</p>
								<p class="text-2xl font-semibold text-gray-900">{profitLossData.totalReturnsCount}</p>
							</div>
						</div>
					</div>

					<!-- Net Profit Margin -->
					<div class="bg-white border border-gray-200 rounded-lg p-4">
						<div class="flex items-center">
							<div class="p-2 bg-purple-100 rounded-lg">
								<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
								</svg>
							</div>
							<div class="ml-4">
								<p class="text-sm font-medium text-gray-600">Net Margin</p>
								<p class="text-2xl font-semibold text-gray-900">{profitLossData.netProfitMargin.toFixed(1)}%</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Detailed P/L Breakdown -->
				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-6 mb-6">
					<h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
						<svg class="w-5 h-5 mr-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
						</svg>
						Profit & Loss Statement (Last 30 Days)
					</h3>
					
					<div class="overflow-x-auto">
						<table class="w-full">
							<tbody class="divide-y divide-gray-200">
								<tr class="hover:bg-gray-50">
									<td class="py-3 px-4 text-sm font-medium text-gray-900">Total Revenue</td>
									<td class="py-3 px-4 text-sm text-right font-semibold text-green-600">
										KSh {profitLossData.totalRevenue.toLocaleString()}
									</td>
								</tr>
								<tr class="hover:bg-gray-50">
									<td class="py-3 px-4 text-sm text-gray-700 pl-8">- Cost of Goods Sold</td>
									<td class="py-3 px-4 text-sm text-right text-red-600">
										(KSh {profitLossData.totalCosts.toLocaleString()})
									</td>
								</tr>
								<tr class="hover:bg-gray-50 border-t-2 border-gray-300">
									<td class="py-3 px-4 text-sm font-semibold text-gray-900">Gross Profit</td>
									<td class="py-3 px-4 text-sm text-right font-semibold text-blue-600">
										KSh {profitLossData.grossProfit.toLocaleString()}
									</td>
								</tr>
								<tr class="hover:bg-gray-50">
									<td class="py-3 px-4 text-sm text-gray-700 pl-8">Gross Margin</td>
									<td class="py-3 px-4 text-sm text-right text-gray-600">
										{profitLossData.grossProfitMargin.toFixed(1)}%
									</td>
								</tr>
								<tr class="hover:bg-gray-50">
									<td class="py-3 px-4 text-sm text-gray-700 pl-8">- Returns & Refunds</td>
									<td class="py-3 px-4 text-sm text-right text-red-600">
										(KSh {profitLossData.returnsCost.toLocaleString()})
									</td>
								</tr>
								<tr class="hover:bg-gray-50 border-t-2 border-gray-900 bg-gray-50">
									<td class="py-4 px-4 text-base font-bold text-gray-900">Net Profit</td>
									<td class="py-4 px-4 text-base text-right font-bold {profitLossData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
										KSh {profitLossData.netProfit.toLocaleString()}
									</td>
								</tr>
								<tr class="hover:bg-gray-50">
									<td class="py-3 px-4 text-sm text-gray-700 pl-8">Net Margin</td>
									<td class="py-3 px-4 text-sm text-right font-semibold {profitLossData.netProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'}">
										{profitLossData.netProfitMargin.toFixed(1)}%
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<!-- Key Insights -->
					<div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
							<h4 class="text-sm font-semibold text-blue-800 mb-2">Revenue Analysis</h4>
							<div class="space-y-1">
								<p class="text-xs text-blue-700">
									• {profitLossData.totalOrdersCount} orders in the last 30 days
								</p>
								<p class="text-xs text-blue-700">
									• Average order value: KSh {profitLossData.averageOrderValue.toLocaleString()}
								</p>
								<p class="text-xs text-blue-700">
									• Revenue growth: {profitLossData.revenueGrowth >= 0 ? '+' : ''}{profitLossData.revenueGrowth.toFixed(1)}% vs previous period
								</p>
							</div>
						</div>

						<div class="bg-red-50 border border-red-200 rounded-lg p-4">
							<h4 class="text-sm font-semibold text-red-800 mb-2">Returns Analysis</h4>
							<div class="space-y-1">
								<p class="text-xs text-red-700">
									• {profitLossData.totalReturnsCount} returns processed
								</p>
								<p class="text-xs text-red-700">
									• Return rate: {profitLossData.returnsRate.toFixed(1)}% of total orders
								</p>
								<p class="text-xs text-red-700">
									• Total returns impact: KSh {profitLossData.returnsCost.toLocaleString()}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
			
			<!-- Charts Grid -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Stock Level Chart -->
				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-6">
					<div class="h-80 relative">
						{#if chartsLoading}
							<div class="absolute inset-0 flex items-center justify-center bg-gray-50 rounded">
								<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
							</div>
						{/if}
						<canvas id="stockChart"></canvas>
					</div>
					<div class="mt-4">
						<h3 class="text-lg font-semibold text-gray-800 mb-2">Stock Level Analysis</h3>
						<p class="text-gray-600 text-sm">Red bars indicate products below low stock alert levels.</p>
					</div>
				</div>

				<!-- Top Selling Products Chart -->
				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-6">
					<div class="h-80 relative">
						{#if chartsLoading}
							<div class="absolute inset-0 flex items-center justify-center bg-gray-50 rounded">
								<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
							</div>
						{/if}
						<canvas id="topProductsChart"></canvas>
					</div>
					<div class="mt-4">
						<h3 class="text-lg font-semibold text-gray-800 mb-2">Best Selling Products</h3>
						<p class="text-gray-600 text-sm">Top 10 products by number of units sold.</p>
					</div>
				</div>
			</div>

			<!-- Category Distribution Chart -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-6 lg:col-span-1">
					<div class="h-80 relative">
						{#if chartsLoading}
							<div class="absolute inset-0 flex items-center justify-center bg-gray-50 rounded">
								<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
							</div>
						{/if}
						<canvas id="categoryChart"></canvas>
					</div>
					<div class="mt-4">
						<h3 class="text-lg font-semibold text-gray-800 mb-2">Category Distribution</h3>
						<p class="text-gray-600 text-sm">Product distribution across categories.</p>
					</div>
				</div>

				<!-- Summary Cards -->
				<div class="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
						<h3 class="text-lg font-semibold mb-2">Total Products</h3>
						<p class="text-3xl font-bold">{products ? products.length : 0}</p>
						<p class="text-blue-100 text-sm mt-2">Active products in inventory</p>
					</div>

					<div class="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
						<h3 class="text-lg font-semibold mb-2">Low Stock Items</h3>
						<p class="text-3xl font-bold">{stockChartData ? stockChartData.filter(item => item.isLowStock).length : 0}</p>
						<p class="text-red-100 text-sm mt-2">Products below alert level</p>
					</div>

					<div class="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
						<h3 class="text-lg font-semibold mb-2">Total Categories</h3>
						<p class="text-3xl font-bold">{categories ? categories.filter(cat => cat.is_active).length : 0}</p>
						<p class="text-green-100 text-sm mt-2">Active product categories</p>
					</div>

					<div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
						<h3 class="text-lg font-semibold mb-2">Order Items</h3>
						<p class="text-3xl font-bold">{orderItems ? orderItems.length : 0}</p>
						<p class="text-purple-100 text-sm mt-2">Total items ordered</p>
					</div>
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
				<button 
					on:click={fetchData}
					class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg transition duration-200 font-medium">
					<div class="flex items-center justify-center">
						<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 1.79 4 4 4h8c0 2.21 1.79 4 4 4h8c0-2.21-1.79-4-4-4V7c0-2.21-1.79-4-4-4H8c-2.21 0-4 1.79-4 4z"></path>
						</svg>
						Refresh Data
					</div>
				</button>

				<button 
					on:click={() => goto('/manager/products')}
					class="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg transition duration-200 font-medium">
					<div class="flex items-center justify-center">
						<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
						</svg>
						Add Product
					</div>
				</button>
			</div>
		</div>
	</div>
{/if}
