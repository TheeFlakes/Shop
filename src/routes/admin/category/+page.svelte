<script>
	import { onMount } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	import { Chart, registerables } from 'chart.js';

	// Register Chart.js components
	Chart.register(...registerables);

	// Data stores
	let categories = [];
	let products = [];
	let loading = true;
	let showAddForm = false;
	let editingCategory = null;
	let searchTerm = '';
	let statusFilter = 'all';
	let selectedCategories = [];

	// Analytics data
	let analytics = {
		totalCategories: 0,
		activeCategories: 0,
		emptyCategories: 0,
		avgProductsPerCategory: 0,
		topCategories: [],
		categoryPerformance: []
	};

	// Form data
	let formData = {
		name: '',
		description: '',
		slug: '',
		status: 'active',
		image: null,
		parent_category: '',
		sort_order: 0,
		meta_description: ''
	};

	// Charts
	let categoryChart = null;
	let performanceChart = null;

	onMount(async () => {
		await loadData();
		await calculateAnalytics();
		createCharts();
		loading = false;
	});

	async function loadData() {
		try {
			// Load categories and products
			[categories, products] = await Promise.all([
				pb.collection('categories').getFullList({
					sort: 'sort_order,name'
				}),
				pb.collection('products').getFullList({
					expand: 'category'
				})
			]);
		} catch (error) {
			console.error('Error loading data:', error);
		}
	}

	async function calculateAnalytics() {
		analytics.totalCategories = categories.length;
		analytics.activeCategories = categories.filter(cat => cat.status === 'active').length;
		
		// Calculate products per category
		const categoryProductCount = {};
		products.forEach(product => {
			const categoryId = product.category;
			categoryProductCount[categoryId] = (categoryProductCount[categoryId] || 0) + 1;
		});

		// Find empty categories
		analytics.emptyCategories = categories.filter(cat => 
			!categoryProductCount[cat.id]
		).length;

		// Average products per category
		analytics.avgProductsPerCategory = analytics.totalCategories > 0 
			? Math.round(products.length / analytics.totalCategories * 10) / 10 
			: 0;

		// Top categories by product count
		analytics.topCategories = categories
			.map(cat => ({
				...cat,
				productCount: categoryProductCount[cat.id] || 0
			}))
			.sort((a, b) => b.productCount - a.productCount)
			.slice(0, 5);

		// Category performance data
		analytics.categoryPerformance = categories.map(cat => ({
			name: cat.name,
			productCount: categoryProductCount[cat.id] || 0,
			status: cat.status
		}));
	}

	function createCharts() {
		// Category Distribution Chart
		const categoryCtx = document.getElementById('categoryChart');
		if (categoryCtx && analytics.topCategories.length > 0) {
			categoryChart = new Chart(categoryCtx, {
				type: 'doughnut',
				data: {
					labels: analytics.topCategories.map(cat => cat.name),
					datasets: [{
						data: analytics.topCategories.map(cat => cat.productCount),
						backgroundColor: [
							'#3B82F6', '#10B981', '#F59E0B', 
							'#EF4444', '#8B5CF6'
						],
						borderWidth: 2,
						borderColor: '#ffffff'
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'bottom'
						},
						title: {
							display: true,
							text: 'Products by Category'
						}
					}
				}
			});
		}

		// Performance Bar Chart
		const performanceCtx = document.getElementById('performanceChart');
		if (performanceCtx && analytics.categoryPerformance.length > 0) {
			performanceChart = new Chart(performanceCtx, {
				type: 'bar',
				data: {
					labels: analytics.categoryPerformance.slice(0, 8).map(cat => cat.name),
					datasets: [{
						label: 'Products',
						data: analytics.categoryPerformance.slice(0, 8).map(cat => cat.productCount),
						backgroundColor: '#3B82F6',
						borderColor: '#2563EB',
						borderWidth: 1
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								stepSize: 1
							}
						}
					},
					plugins: {
						legend: {
							display: false
						},
						title: {
							display: true,
							text: 'Category Performance'
						}
					}
				}
			});
		}
	}

	// Form handling
	function generateSlug(name) {
		return name.toLowerCase()
			.replace(/[^a-z0-9 -]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim('-');
	}

	function handleNameInput() {
		if (!formData.slug || formData.slug === generateSlug(formData.name)) {
			formData.slug = generateSlug(formData.name);
		}
	}

	async function handleSubmit() {
		try {
			const data = { ...formData };
			
			if (editingCategory) {
				await pb.collection('categories').update(editingCategory.id, data);
			} else {
				await pb.collection('categories').create(data);
			}
			
			await loadData();
			await calculateAnalytics();
			resetForm();
		} catch (error) {
			console.error('Error saving category:', error);
			alert('Error saving category. Please try again.');
		}
	}

	function editCategory(category) {
		editingCategory = category;
		formData = { ...category };
		showAddForm = true;
	}

	async function deleteCategory(categoryId) {
		if (!confirm('Are you sure you want to delete this category?')) return;
		
		try {
			await pb.collection('categories').delete(categoryId);
			await loadData();
			await calculateAnalytics();
		} catch (error) {
			console.error('Error deleting category:', error);
			alert('Error deleting category. Please try again.');
		}
	}

	function resetForm() {
		formData = {
			name: '',
			description: '',
			slug: '',
			status: 'active',
			image: null,
			parent_category: '',
			sort_order: 0,
			meta_description: ''
		};
		editingCategory = null;
		showAddForm = false;
	}

	// Filtered categories
	$: filteredCategories = categories.filter(category => {
		const matchesSearch = category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			category.description?.toLowerCase().includes(searchTerm.toLowerCase());
		const matchesStatus = statusFilter === 'all' || category.status === statusFilter;
		return matchesSearch && matchesStatus;
	});

	// Get product count for a category
	function getProductCount(categoryId) {
		return products.filter(product => product.category === categoryId).length;
	}
</script>

<svelte:head>
	<title>Category Management - Admin</title>
</svelte:head>

<div class="p-6 bg-gray-50 min-h-screen">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 mb-2">Category Management</h1>
		<p class="text-gray-600">Manage your product categories and analyze performance</p>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else}
		<!-- Analytics Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
			<div class="bg-white rounded-lg shadow-sm p-6 border">
				<div class="flex items-center">
					<div class="p-3 rounded-full bg-blue-100">
						<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
						</svg>
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Total Categories</p>
						<p class="text-2xl font-semibold text-gray-900">{analytics.totalCategories}</p>
					</div>
				</div>
			</div>

			<div class="bg-white rounded-lg shadow-sm p-6 border">
				<div class="flex items-center">
					<div class="p-3 rounded-full bg-green-100">
						<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Active Categories</p>
						<p class="text-2xl font-semibold text-gray-900">{analytics.activeCategories}</p>
					</div>
				</div>
			</div>

			<div class="bg-white rounded-lg shadow-sm p-6 border">
				<div class="flex items-center">
					<div class="p-3 rounded-full bg-yellow-100">
						<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
						</svg>
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Empty Categories</p>
						<p class="text-2xl font-semibold text-gray-900">{analytics.emptyCategories}</p>
					</div>
				</div>
			</div>

			<div class="bg-white rounded-lg shadow-sm p-6 border">
				<div class="flex items-center">
					<div class="p-3 rounded-full bg-purple-100">
						<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
						</svg>
					</div>
					<div class="ml-4">
						<p class="text-sm font-medium text-gray-500">Avg Products/Category</p>
						<p class="text-2xl font-semibold text-gray-900">{analytics.avgProductsPerCategory}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Charts Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
			<div class="bg-white rounded-lg shadow-sm p-6 border">
				<div class="h-64">
					<canvas id="categoryChart"></canvas>
				</div>
			</div>
			<div class="bg-white rounded-lg shadow-sm p-6 border">
				<div class="h-64">
					<canvas id="performanceChart"></canvas>
				</div>
			</div>
		</div>

		<!-- Top Categories Insights -->
		<div class="bg-white rounded-lg shadow-sm p-6 border mb-8">
			<h3 class="text-lg font-semibold text-gray-900 mb-4">Top Performing Categories</h3>
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each analytics.topCategories as category, index}
					<div class="flex items-center p-4 bg-gray-50 rounded-lg">
						<div class="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
							{index + 1}
						</div>
						<div class="ml-3">
							<p class="text-sm font-medium text-gray-900">{category.name}</p>
							<p class="text-sm text-gray-500">{category.productCount} products</p>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Controls Section -->
		<div class="bg-white rounded-lg shadow-sm p-6 border mb-6">
			<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div class="flex flex-col sm:flex-row gap-4 flex-1">
					<!-- Search -->
					<div class="relative">
						<input
							type="text"
							placeholder="Search categories..."
							bind:value={searchTerm}
							class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						/>
						<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
							</svg>
						</div>
					</div>

					<!-- Status Filter -->
					<select
						bind:value={statusFilter}
						class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					>
						<option value="all">All Status</option>
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
				</div>

				<!-- Add Category Button -->
				<button
					on:click={() => showAddForm = true}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 flex items-center"
				>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
					</svg>
					Add Category
				</button>
			</div>
		</div>

		<!-- Add/Edit Form Modal -->
		{#if showAddForm}
			<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
				<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
					<div class="p-6">
						<div class="flex justify-between items-center mb-6">
							<h3 class="text-lg font-semibold text-gray-900">
								{editingCategory ? 'Edit Category' : 'Add New Category'}
							</h3>
							<button
								on:click={resetForm}
								class="text-gray-400 hover:text-gray-600"
							>
								<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
								</svg>
							</button>
						</div>

						<form on:submit|preventDefault={handleSubmit} class="space-y-4">
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Category Name</label>
									<input
										type="text"
										bind:value={formData.name}
										on:input={handleNameInput}
										required
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Slug</label>
									<input
										type="text"
										bind:value={formData.slug}
										required
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
								<textarea
									bind:value={formData.description}
									rows="3"
									class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								></textarea>
							</div>

							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
									<select
										bind:value={formData.status}
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										<option value="active">Active</option>
										<option value="inactive">Inactive</option>
									</select>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
									<input
										type="number"
										bind:value={formData.sort_order}
										min="0"
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Meta Description (SEO)</label>
								<textarea
									bind:value={formData.meta_description}
									rows="2"
									placeholder="SEO description for search engines..."
									class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								></textarea>
							</div>

							<div class="flex justify-end space-x-3 pt-4">
								<button
									type="button"
									on:click={resetForm}
									class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition duration-200"
								>
									Cancel
								</button>
								<button
									type="submit"
									class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
								>
									{editingCategory ? 'Update' : 'Create'} Category
								</button>
							</div>
						</form>
					</div>
				</div>
			</div>
		{/if}

		<!-- Categories Table -->
		<div class="bg-white rounded-lg shadow-sm border overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Products</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredCategories as category}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div>
										<div class="text-sm font-medium text-gray-900">{category.name}</div>
										<div class="text-sm text-gray-500">{category.description || 'No description'}</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
											{getProductCount(category.id)} products
										</span>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {category.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
										{category.status}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{new Date(category.created).toLocaleDateString()}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<div class="flex justify-end space-x-2">
										<button
											on:click={() => editCategory(category)}
											class="text-blue-600 hover:text-blue-900 transition duration-200"
										>
											Edit
										</button>
										<button
											on:click={() => deleteCategory(category.id)}
											class="text-red-600 hover:text-red-900 transition duration-200"
										>
											Delete
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if filteredCategories.length === 0}
				<div class="text-center py-12">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
					</svg>
					<h3 class="mt-2 text-sm font-medium text-gray-900">No categories found</h3>
					<p class="mt-1 text-sm text-gray-500">Get started by creating your first category.</p>
					<div class="mt-6">
						<button
							on:click={() => showAddForm = true}
							class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
						>
							<svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
							</svg>
							Add Category
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
