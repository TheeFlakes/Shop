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

			prepareChartData();
			createCharts();
		} catch (error) {
			console.error('Error fetching data:', error);
		} finally {
			chartsLoading = false;
		}
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
