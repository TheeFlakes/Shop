<script>
	import { onMount, onDestroy } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	
	let categories = [];
	let loading = true;
	let showAddModal = false;
	let showEditModal = false;
	let showDeleteModal = false;
	let selectedCategory = null;
	let searchTerm = '';
	let sortBy = 'name';
	let sortOrder = 'asc';
	let imagePreview = null;
	
	// Form data for new/edit category
	let categoryForm = {
		name: '',
		slug: '',
		description: '',
		image: null,
		is_active: true
	};
	
	// Load categories on component mount and setup real-time subscriptions
	onMount(async () => {
		await loadCategories();
		setupRealtimeSubscription();
	});
	
	// Cleanup subscriptions on component destroy
	onDestroy(() => {
		if (pb) {
			pb.collection('categories').unsubscribe();
		}
	});
	
	async function loadCategories() {
		try {
			loading = true;
			const records = await pb.collection('categories').getFullList({
				sort: `${sortOrder === 'desc' ? '-' : ''}${sortBy}`
			});
			console.log('Loaded categories:', records);
			categories = records;
		} catch (error) {
			console.error('Error loading categories:', error);
			alert('Failed to load categories');
		} finally {
			loading = false;
		}
	}
	
	// Setup real-time subscription for categories
	function setupRealtimeSubscription() {
		pb.collection('categories').subscribe('*', function (e) {
			console.log('Real-time event (categories):', e.action, e.record);
			
			if (e.action === 'create') {
				// Add new category to the list
				categories = [...categories, e.record];
			} else if (e.action === 'update') {
				// Update existing category
				categories = categories.map(category => 
					category.id === e.record.id ? e.record : category
				);
			} else if (e.action === 'delete') {
				// Remove deleted category
				categories = categories.filter(category => category.id !== e.record.id);
			}
			
			// Re-sort categories after any change
			sortCategories();
		});
	}
	
	// Sort categories array
	function sortCategories() {
		categories = categories.sort((a, b) => {
			let aVal = a[sortBy];
			let bVal = b[sortBy];
			
			// Handle different data types
			if (typeof aVal === 'string') {
				aVal = aVal.toLowerCase();
				bVal = bVal.toLowerCase();
			}
			
			if (sortOrder === 'asc') {
				return aVal > bVal ? 1 : -1;
			} else {
				return aVal < bVal ? 1 : -1;
			}
		});
	}
	
	// Filter categories based on search term
	$: filteredCategories = (() => {
		if (!searchTerm || searchTerm.length === 0) {
			return categories;
		}
		
		return categories.filter(category => 
			category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			(category.description && category.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
			(category.slug && category.slug.toLowerCase().includes(searchTerm.toLowerCase()))
		);
	})();
	
	function openAddModal() {
		resetForm();
		imagePreview = null;
		showAddModal = true;
	}
	
	function openEditModal(category) {
		selectedCategory = category;
		categoryForm = {
			name: category.name,
			slug: category.slug,
			description: category.description || '',
			image: null,
			is_active: category.is_active
		};
		
		// Set image preview if category has image
		if (category.image) {
			imagePreview = pb.files.getUrl(category, category.image, { thumb: '200x200' });
		} else {
			imagePreview = null;
		}
		
		showEditModal = true;
	}
	
	function openDeleteModal(category) {
		selectedCategory = category;
		showDeleteModal = true;
	}
	
	function closeModals() {
		showAddModal = false;
		showEditModal = false;
		showDeleteModal = false;
		selectedCategory = null;
		imagePreview = null;
		resetForm();
	}
	
	function resetForm() {
		categoryForm = {
			name: '',
			slug: '',
			description: '',
			image: null,
			is_active: true
		};
	}
	
	// Generate slug from name
	function generateSlug() {
		if (categoryForm.name) {
			categoryForm.slug = categoryForm.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '');
		}
	}
	
	// Handle image upload
	function handleImageUpload(event) {
		const file = event.target.files[0];
		if (file) {
			categoryForm.image = file;
			
			// Create preview
			const reader = new FileReader();
			reader.onload = (e) => {
				imagePreview = e.target.result;
			};
			reader.readAsDataURL(file);
		}
	}
	
	// Remove image
	function removeImage() {
		categoryForm.image = null;
		imagePreview = null;
		// Reset file input
		const fileInput = document.querySelector('input[type="file"]');
		if (fileInput) {
			fileInput.value = '';
		}
	}
	
	async function saveCategory() {
		try {
			// Basic validation
			if (!categoryForm.name.trim()) {
				alert('Category name is required');
				return;
			}
			
			if (!categoryForm.slug.trim()) {
				alert('Category slug is required');
				return;
			}
			
			const data = {
				name: categoryForm.name.trim(),
				slug: categoryForm.slug.trim(),
				description: categoryForm.description.trim(),
				is_active: categoryForm.is_active
			};
			
			// Add image if selected
			if (categoryForm.image) {
				data.image = categoryForm.image;
			}
			
			if (selectedCategory) {
				// Update existing category
				await pb.collection('categories').update(selectedCategory.id, data);
				console.log('Category updated successfully');
			} else {
				// Create new category
				await pb.collection('categories').create(data);
				console.log('Category created successfully');
			}
			
			closeModals();
		} catch (error) {
			console.error('Error saving category:', error);
			let errorMessage = 'Failed to save category';
			
			if (error.data && error.data.data) {
				// Extract specific field errors
				const fieldErrors = [];
				for (const [field, errors] of Object.entries(error.data.data)) {
					fieldErrors.push(`${field}: ${errors.message || errors.code}`);
				}
				if (fieldErrors.length > 0) {
					errorMessage += ':\n' + fieldErrors.join('\n');
				}
			}
			
			alert(errorMessage);
		}
	}
	
	async function deleteCategory() {
		try {
			if (!selectedCategory) return;
			
			await pb.collection('categories').delete(selectedCategory.id);
			console.log('Category deleted successfully');
			closeModals();
		} catch (error) {
			console.error('Error deleting category:', error);
			alert('Failed to delete category. Make sure no products are using this category.');
		}
	}
	
	function handleSort(field) {
		if (sortBy === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortOrder = 'asc';
		}
		sortCategories();
	}
</script>

<svelte:head>
	<title>Category Management</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-7xl">
	<!-- Header -->
	<div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
		<div>
			<h1 class="text-3xl font-bold text-gray-900 mb-2">Category Management</h1>
			<p class="text-gray-600">Manage product categories and their details</p>
		</div>
		<button 
			on:click={openAddModal}
			class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 self-start md:self-auto"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
			</svg>
			Add Category
		</button>
	</div>

	<!-- Search and Filters -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-6">
		<div class="flex flex-col lg:flex-row gap-4">
			<!-- Search -->
			<div class="flex-1">
				<div class="relative">
					<svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
					</svg>
					<input
						type="text"
						placeholder="Search categories..."
						bind:value={searchTerm}
						class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					/>
				</div>
			</div>
			
			<!-- Sort -->
			<div class="flex gap-2">
				<select 
					bind:value={sortBy} 
					on:change={() => sortCategories()}
					class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					<option value="name">Sort by Name</option>
					<option value="slug">Sort by Slug</option>
					<option value="created">Sort by Created</option>
					<option value="updated">Sort by Updated</option>
				</select>
				<button 
					on:click={() => handleSort(sortBy)}
					class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
				>
					{sortOrder === 'asc' ? '↑' : '↓'}
				</button>
			</div>
		</div>
	</div>

	<!-- Categories List -->
	<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<span class="ml-3 text-gray-600">Loading categories...</span>
			</div>
		{:else if filteredCategories.length === 0}
			<div class="text-center py-12">
				<svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
				</svg>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
				<p class="text-gray-500 mb-4">
					{searchTerm ? 'No categories match your search criteria.' : 'Get started by creating your first category.'}
				</p>
				{#if !searchTerm}
					<button 
						on:click={openAddModal}
						class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
					>
						Add Category
					</button>
				{/if}
			</div>
		{:else}
			<!-- Desktop Table View -->
			<div class="hidden md:block overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Image
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" on:click={() => handleSort('name')}>
								Name {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" on:click={() => handleSort('slug')}>
								Slug {sortBy === 'slug' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Description
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Status
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredCategories as category (category.id)}
							<tr class="hover:bg-gray-50 transition-colors duration-150">
								<td class="px-6 py-4 whitespace-nowrap">
									{#if category.image}
										<img 
											src="{pb.files.getUrl(category, category.image, { thumb: '64x64' })}" 
											alt="{category.name}"
											class="w-12 h-12 rounded-lg object-cover"
										/>
									{:else}
										<div class="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
											<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
											</svg>
										</div>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">{category.name}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">{category.slug}</div>
								</td>
								<td class="px-6 py-4">
									<div class="text-sm text-gray-600 max-w-xs truncate">{category.description || 'No description'}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {category.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
										{category.is_active ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<div class="flex items-center justify-end gap-2">
										<button 
											on:click={() => openEditModal(category)}
											class="text-blue-600 hover:text-blue-900 transition-colors duration-200"
											title="Edit category"
										>
											<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
											</svg>
										</button>
										<button 
											on:click={() => openDeleteModal(category)}
											class="text-red-600 hover:text-red-900 transition-colors duration-200"
											title="Delete category"
										>
											<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Mobile Card View -->
			<div class="md:hidden">
				{#each filteredCategories as category (category.id)}
					<div class="border-b border-gray-200 p-4 last:border-b-0">
						<div class="flex gap-3 mb-3">
							{#if category.image}
								<img 
									src="{pb.files.getUrl(category, category.image, { thumb: '80x80' })}" 
									alt="{category.name}"
									class="w-16 h-16 rounded-lg object-cover flex-shrink-0"
								/>
							{:else}
								<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
									<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
									</svg>
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<div class="flex justify-between items-start mb-2">
									<h3 class="text-lg font-medium text-gray-900 truncate">{category.name}</h3>
									<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ml-2 {category.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
										{category.is_active ? 'Active' : 'Inactive'}
									</span>
								</div>
								<div class="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded mb-2 inline-block">
									{category.slug}
								</div>
							</div>
						</div>
						{#if category.description}
							<p class="text-sm text-gray-600 mb-3">{category.description}</p>
						{/if}
						<div class="flex gap-2">
							<button 
								on:click={() => openEditModal(category)}
								class="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors duration-200 flex items-center justify-center gap-2"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
								</svg>
								Edit
							</button>
							<button 
								on:click={() => openDeleteModal(category)}
								class="flex-1 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors duration-200 flex items-center justify-center gap-2"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
								</svg>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Add Category Modal -->
{#if showAddModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
		<div class="bg-white rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
			<div class="flex justify-between items-center p-6 border-b border-gray-200">
				<h2 class="text-xl font-semibold text-gray-900">Add New Category</h2>
				<button on:click={closeModals} class="text-gray-400 hover:text-gray-600 transition-colors duration-200">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>
			<form on:submit|preventDefault={saveCategory} class="p-6 space-y-4">
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
					<input
						type="text"
						id="name"
						bind:value={categoryForm.name}
						on:input={generateSlug}
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						placeholder="Enter category name"
					/>
				</div>
				<div>
					<label for="slug" class="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
					<input
						type="text"
						id="slug"
						bind:value={categoryForm.slug}
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
						placeholder="category-slug"
					/>
					<p class="text-xs text-gray-500 mt-1">URL-friendly version of the name</p>
				</div>
				<div>
					<label for="description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
					<textarea
						id="description"
						bind:value={categoryForm.description}
						rows="3"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
						placeholder="Enter category description"
					></textarea>
				</div>
				<div>
					<label for="image" class="block text-sm font-medium text-gray-700 mb-1">Category Image</label>
					<div class="space-y-3">
						{#if imagePreview}
							<div class="relative inline-block">
								<img src={imagePreview} alt="Preview" class="w-24 h-24 object-cover rounded-lg border" />
								<button
									type="button"
									on:click={removeImage}
									class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
									aria-label="Remove image"
								>
									×
								</button>
							</div>
						{/if}
						<input
							type="file"
							id="image"
							accept="image/*"
							on:change={handleImageUpload}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
						<p class="text-xs text-gray-500">Upload an image for this category (optional)</p>
					</div>
				</div>
				<div class="flex items-center">
					<input
						type="checkbox"
						id="is_active"
						bind:checked={categoryForm.is_active}
						class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
					/>
					<label for="is_active" class="ml-2 block text-sm text-gray-700">Active category</label>
				</div>
				<div class="flex gap-3 pt-4">
					<button
						type="button"
						on:click={closeModals}
						class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
					>
						Add Category
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Edit Category Modal -->
{#if showEditModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
		<div class="bg-white rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
			<div class="flex justify-between items-center p-6 border-b border-gray-200">
				<h2 class="text-xl font-semibold text-gray-900">Edit Category</h2>
				<button on:click={closeModals} class="text-gray-400 hover:text-gray-600 transition-colors duration-200">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>
			<form on:submit|preventDefault={saveCategory} class="p-6 space-y-4">
				<div>
					<label for="edit-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
					<input
						type="text"
						id="edit-name"
						bind:value={categoryForm.name}
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						placeholder="Enter category name"
					/>
				</div>
				<div>
					<label for="edit-slug" class="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
					<input
						type="text"
						id="edit-slug"
						bind:value={categoryForm.slug}
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
						placeholder="category-slug"
					/>
					<p class="text-xs text-gray-500 mt-1">URL-friendly version of the name</p>
				</div>
				<div>
					<label for="edit-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
					<textarea
						id="edit-description"
						bind:value={categoryForm.description}
						rows="3"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
						placeholder="Enter category description"
					></textarea>
				</div>
				<div>
					<label for="edit-image" class="block text-sm font-medium text-gray-700 mb-1">Category Image</label>
					<div class="space-y-3">
						{#if imagePreview}
							<div class="relative inline-block">
								<img src={imagePreview} alt="Preview" class="w-24 h-24 object-cover rounded-lg border" />
								<button
									type="button"
									on:click={removeImage}
									class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
									aria-label="Remove image"
								>
									×
								</button>
							</div>
						{/if}
						<input
							type="file"
							id="edit-image"
							accept="image/*"
							on:change={handleImageUpload}
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
						<p class="text-xs text-gray-500">Upload an image for this category (optional)</p>
					</div>
				</div>
				<div class="flex items-center">
					<input
						type="checkbox"
						id="edit-is_active"
						bind:checked={categoryForm.is_active}
						class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
					/>
					<label for="edit-is_active" class="ml-2 block text-sm text-gray-700">Active category</label>
				</div>
				<div class="flex gap-3 pt-4">
					<button
						type="button"
						on:click={closeModals}
						class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
					>
						Update Category
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Category Modal -->
{#if showDeleteModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
		<div class="bg-white rounded-lg max-w-md w-full">
			<div class="flex justify-between items-center p-6 border-b border-gray-200">
				<h2 class="text-xl font-semibold text-gray-900">Delete Category</h2>
				<button on:click={closeModals} class="text-gray-400 hover:text-gray-600 transition-colors duration-200">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</button>
			</div>
			<div class="p-6">
				<div class="flex items-center mb-4">
					<div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
						<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
						</svg>
					</div>
					<div class="ml-4">
						<h3 class="text-lg font-medium text-gray-900">Confirm deletion</h3>
						<p class="text-sm text-gray-600">This action cannot be undone.</p>
					</div>
				</div>
				<p class="text-gray-700 mb-6">
					Are you sure you want to delete the category <strong>"{selectedCategory?.name}"</strong>? 
					This will permanently remove the category from your system.
				</p>
				<div class="flex gap-3">
					<button
						type="button"
						on:click={closeModals}
						class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
					>
						Cancel
					</button>
					<button
						on:click={deleteCategory}
						class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
					>
						Delete Category
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar for webkit browsers */
	:global(.overflow-y-auto::-webkit-scrollbar) {
		width: 8px;
	}
	
	:global(.overflow-y-auto::-webkit-scrollbar-track) {
		background: #f1f5f9;
		border-radius: 4px;
	}
	
	:global(.overflow-y-auto::-webkit-scrollbar-thumb) {
		background: #cbd5e1;
		border-radius: 4px;
	}
	
	:global(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
		background: #94a3b8;
	}
</style>
