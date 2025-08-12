<script>
	import { onMount, onDestroy } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	
	let products = [];
	let productVariants = [];
	let categories = [];
	let loading = true;
	let showAddModal = false;
	let showEditModal = false;
	let showDeleteModal = false;
	let showVariantsModal = false;
	let showAddVariantModal = false;
	let showEditVariantModal = false;
	let showDeleteVariantModal = false;
	let selectedProduct = null;
	let selectedVariant = null;
	let selectedProductForVariants = null;
	let searchTerm = '';
	let sortBy = 'name';
	let sortOrder = 'asc';
	let imagePreview = null;
	let variantImagePreview = null;
	
	// Filter options
	let showLowStockOnly = false;
	let showOutOfStockOnly = false;
	let activeFilter = 'all'; // 'all', 'low-stock', 'out-of-stock'
	
	// Form data for new/edit product
	let productForm = {
		name: '',
		description: '',
		price: '',
		category: '',
		stock: '',
		images: null,
		discount: 0,
		is_featured: false
	};
	
	// Form data for new/edit variant
	let variantForm = {
		name: '',
		options: '',
		price: '',
		stock: '',
		image: null
	};
	
	// Reactive statement to ensure UI updates when variants change
	$: variantCounts = productVariants.reduce((acc, variant) => {
		acc[variant.product_id] = (acc[variant.product_id] || 0) + 1;
		return acc;
	}, {});
	
	// Load products on component mount and setup real-time subscriptions
	onMount(async () => {
		await loadProducts();
		await loadProductVariants();
		await loadCategories();
		setupRealtimeSubscription();
	});
	
	// Cleanup subscriptions on component destroy
	onDestroy(() => {
		if (pb) {
			pb.collection('products').unsubscribe();
			pb.collection('product_variants').unsubscribe();
			pb.collection('categories').unsubscribe();
		}
	});
	
	async function loadProducts() {
		try {
			loading = true;
			const records = await pb.collection('products').getFullList({
				expand: 'category_id',  // Using correct relation field name
				sort: `${sortOrder === 'desc' ? '-' : ''}${sortBy}`
			});
			console.log('Loaded products:', records);
			products = records;
		} catch (error) {
			console.error('Error loading products:', error);
			alert('Failed to load products');
		} finally {
			loading = false;
		}
	}
	
	async function loadProductVariants() {
		try {
			const records = await pb.collection('product_variants').getFullList({
				expand: 'product_id',
				sort: 'name'
			});
			productVariants = records;
			console.log('Loaded product variants:', productVariants);
		} catch (error) {
			console.error('Error loading product variants:', error);
		}
	}
	
	async function loadCategories() {
		try {
			const records = await pb.collection('categories').getFullList({
				sort: 'name'
			});
			categories = records;
		} catch (error) {
			console.error('Error loading categories:', error);
			// Fallback to default categories if DB fetch fails
			categories = [
				{ id: 'electronics', name: 'Electronics' },
				{ id: 'clothing', name: 'Clothing' },
				{ id: 'books', name: 'Books' },
				{ id: 'home-garden', name: 'Home & Garden' },
				{ id: 'sports', name: 'Sports' },
				{ id: 'toys', name: 'Toys' },
				{ id: 'beauty', name: 'Beauty' },
				{ id: 'automotive', name: 'Automotive' },
				{ id: 'food-beverage', name: 'Food & Beverage' },
				{ id: 'other', name: 'Other' }
			];
		}
	}
	
	// Setup real-time subscription for products
	function setupRealtimeSubscription() {
		// Subscribe to products
		pb.collection('products').subscribe('*', function (e) {
			console.log('Real-time event (products):', e.action, e.record);
			
			if (e.action === 'create') {
				// Add new product to the list
				products = [...products, e.record];
			} else if (e.action === 'update') {
				// Update existing product
				products = products.map(product => 
					product.id === e.record.id ? e.record : product
				);
			} else if (e.action === 'delete') {
				// Remove deleted product
				products = products.filter(product => product.id !== e.record.id);
			}
			
			// Re-sort products after any change
			sortProducts();
		});
		
		// Subscribe to product variants
		pb.collection('product_variants').subscribe('*', function (e) {
			console.log('Real-time event (variants):', e.action, e.record);
			
			if (e.action === 'create') {
				// Add new variant to the list
				productVariants = [...productVariants, e.record];
				console.log('Added variant, new count:', productVariants.length);
			} else if (e.action === 'update') {
				// Update existing variant
				productVariants = productVariants.map(variant => 
					variant.id === e.record.id ? e.record : variant
				);
				console.log('Updated variant, total count:', productVariants.length);
			} else if (e.action === 'delete') {
				// Remove deleted variant
				productVariants = productVariants.filter(variant => variant.id !== e.record.id);
				console.log('Deleted variant, new count:', productVariants.length);
			}
			
			// Force UI update by triggering reactivity
			productVariants = productVariants;
		});
		
		// Subscribe to categories
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
		});
	}
	
	// Sort products array
	function sortProducts() {
		products = products.sort((a, b) => {
			let aVal = a[sortBy];
			let bVal = b[sortBy];
			
			// Handle different data types
			if (sortBy === 'price' || sortBy === 'stock') {
				aVal = Number(aVal);
				bVal = Number(bVal);
			} else if (typeof aVal === 'string') {
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
	
	// Real-time search with PocketBase filtering
	let searchResults = [];
	let isSearching = false;
	
	// Debounce search function
	let searchTimeout;
	function debounceSearch(term) {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			performSearch(term);
		}, 200); // 200ms debounce
	}
	
	async function performSearch(term) {
		if (!term || term.length < 2) {
			searchResults = [];
			isSearching = false;
			return;
		}
		
		isSearching = true;
		try {
			// Using correct field names from the schema: name, description, tags
			const filter = `name ~ "${term}" || description ~ "${term}" || tags ~ "${term}"`;
			const results = await pb.collection('products').getList(1, 20, {
				filter: filter,
				sort: '-created',
				expand: 'category_id'  // Using correct relation field name
			});
			searchResults = results.items;
		} catch (error) {
			console.error('Search error:', error);
			searchResults = [];
		}
		isSearching = false;
	}
	
	// Watch for search term changes
	$: if (searchTerm) {
		debounceSearch(searchTerm);
	} else {
		searchResults = [];
		isSearching = false;
	}
	
	// Filter products based on search term and stock filters
	$: filteredProducts = (() => {
		let baseProducts = searchTerm && searchTerm.length >= 2 ? searchResults : products;
		
		// Apply text search filter for local products
		if (searchTerm && searchTerm.length > 0 && searchTerm.length < 2) {
			baseProducts = products.filter(product => 
				product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				(product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
				(product.tags && product.tags.toLowerCase().includes(searchTerm.toLowerCase()))
			);
		}
		
		// Apply stock filters
		if (activeFilter === 'low-stock') {
			return baseProducts.filter(product => (product.stock || 0) <= 10 && (product.stock || 0) > 0);
		} else if (activeFilter === 'out-of-stock') {
			return baseProducts.filter(product => (product.stock || 0) === 0);
		}
		
		return baseProducts;
	})();
	
	// Function to set active filter
	function setFilter(filter) {
		activeFilter = filter;
	}
	
	function openAddModal() {
		resetForm();
		imagePreview = null;
		showAddModal = true;
	}
	
	function openEditModal(product) {
		selectedProduct = product;
		productForm = {
			name: product.name,
			description: product.description,
			price: product.price.toString(),
			category: product.category_id, // Using correct field name
			stock: product.stock.toString(),
			images: null,
			discount: product.discount || 0,
			is_featured: product.is_featured || false
		};
		
		// Set image preview if product has images
		if (product.images) {
			imagePreview = pb.files.getUrl(product, product.images, { thumb: '200x200' });
		} else {
			imagePreview = null;
		}
		
		showEditModal = true;
	}
	
	function openDeleteModal(product) {
		selectedProduct = product;
		showDeleteModal = true;
	}
	
	function openVariantsModal(product) {
		selectedProductForVariants = product;
		showVariantsModal = true;
	}
	
	function openAddVariantModal() {
		resetVariantForm();
		variantImagePreview = null;
		showAddVariantModal = true;
	}
	
	function openEditVariantModal(variant) {
		selectedVariant = variant;
		variantForm = {
			name: variant.name,
			options: typeof variant.options === 'string' ? variant.options : JSON.stringify(variant.options),
			price: variant.price.toString(),
			stock: variant.stock.toString(),
			image: null
		};
		
		// Set image preview if variant has image
		if (variant.image) {
			variantImagePreview = pb.files.getUrl(variant, variant.image, { thumb: '200x200' });
		} else {
			variantImagePreview = null;
		}
		
		showEditVariantModal = true;
	}
	
	function openDeleteVariantModal(variant) {
		selectedVariant = variant;
		showDeleteVariantModal = true;
	}
	
	function closeModals() {
		showAddModal = false;
		showEditModal = false;
		showDeleteModal = false;
		showVariantsModal = false;
		showAddVariantModal = false;
		showEditVariantModal = false;
		showDeleteVariantModal = false;
		selectedProduct = null;
		selectedVariant = null;
		selectedProductForVariants = null;
		imagePreview = null;
		variantImagePreview = null;
		resetForm();
		resetVariantForm();
	}
	
	function resetForm() {
		productForm = {
			name: '',
			description: '',
			price: '',
			category: '',
			stock: '',
			images: null,
			discount: 0,
			is_featured: false
		};
	}
	
	function resetVariantForm() {
		variantForm = {
			name: '',
			options: '',
			price: '',
			stock: '',
			image: null
		};
	}
	
	async function saveProduct() {
		try {
			// Basic validation
			if (!productForm.name.trim()) {
				alert('Product name is required');
				return;
			}
			if (!productForm.price || parseFloat(productForm.price) <= 0) {
				alert('Valid price is required');
				return;
			}
			if (!productForm.stock || parseInt(productForm.stock) < 0) {
				alert('Valid stock quantity is required');
				return;
			}
			
			console.log('Product form data:', productForm);
			console.log('Selected product:', selectedProduct);
			console.log('Is edit modal:', showEditModal);
			
			// Create the data object (not FormData for PocketBase)
			const data = {
				name: productForm.name.trim(),
				description: productForm.description.trim(),
				price: parseFloat(productForm.price),
				stock: parseInt(productForm.stock),
				discount: parseInt(productForm.discount) || 0,
				is_featured: productForm.is_featured || false
			};
			
			// Only add category_id if it has a value
			if (productForm.category && productForm.category.trim()) {
				data.category_id = productForm.category.trim();
			}
			
			console.log('Data object to send:', data);
			
			// Handle image upload separately if provided
			if (productForm.images) {
				const formData = new FormData();
				// Add all data fields
				Object.keys(data).forEach(key => {
					formData.append(key, data[key]);
				});
				// Add the image
				formData.append('images', productForm.images);
				
				console.log('Using FormData with image');
				if (showEditModal && selectedProduct) {
					console.log('Updating product with ID:', selectedProduct.id);
					await pb.collection('products').update(selectedProduct.id, formData);
				} else {
					console.log('Creating new product');
					await pb.collection('products').create(formData);
				}
			} else {
				// No image, use regular data object
				console.log('Using data object without image');
				if (showEditModal && selectedProduct) {
					console.log('Updating product with ID:', selectedProduct.id);
					await pb.collection('products').update(selectedProduct.id, data);
				} else {
					console.log('Creating new product');
					await pb.collection('products').create(data);
				}
			}
			
			closeModals();
			// Don't reload products manually - real-time subscription will handle it
		} catch (error) {
			console.error('Error saving product:', error);
			console.error('Error details:', error.response?.data || error);
			console.error('Full error object:', error);
			alert('Failed to save product: ' + (error.response?.data?.message || error.message || 'Unknown error'));
		}
	}
	
	async function saveVariant() {
		try {
			const formData = new FormData();
			formData.append('product_id', selectedProductForVariants.id);
			formData.append('name', variantForm.name);
			formData.append('options', variantForm.options);
			formData.append('price', parseFloat(variantForm.price));
			formData.append('stock', parseInt(variantForm.stock));
			
			if (variantForm.image) {
				formData.append('image', variantForm.image);
			}
			
			if (showEditVariantModal && selectedVariant) {
				await pb.collection('product_variants').update(selectedVariant.id, formData);
			} else {
				await pb.collection('product_variants').create(formData);
			}
			
			closeModals();
			// Don't reload variants manually - real-time subscription will handle it
		} catch (error) {
			console.error('Error saving variant:', error);
			alert('Failed to save variant: ' + (error.message || 'Unknown error'));
		}
	}
	
	async function deleteProduct() {
		try {
			await pb.collection('products').delete(selectedProduct.id);
			closeModals();
			// Don't reload products manually - real-time subscription will handle it
		} catch (error) {
			console.error('Error deleting product:', error);
			alert('Failed to delete product: ' + (error.message || 'Unknown error'));
		}
	}
	
	async function deleteVariant() {
		try {
			await pb.collection('product_variants').delete(selectedVariant.id);
			closeModals();
			// Don't reload variants manually - real-time subscription will handle it
		} catch (error) {
			console.error('Error deleting variant:', error);
			alert('Failed to delete variant: ' + (error.message || 'Unknown error'));
		}
	}
	
	function handleImageChange(event) {
		const file = event.target.files[0];
		if (file) {
			productForm.images = file;
			
			// Create preview URL
			const reader = new FileReader();
			reader.onload = (e) => {
				imagePreview = e.target.result;
			};
			reader.readAsDataURL(file);
		}
	}
	
	function handleVariantImageChange(event) {
		const file = event.target.files[0];
		if (file) {
			variantForm.image = file;
			
			// Create preview URL
			const reader = new FileReader();
			reader.onload = (e) => {
				variantImagePreview = e.target.result;
			};
			reader.readAsDataURL(file);
		}
	}
	
	function formatPrice(price) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES'
		}).format(price);
	}

	function calculateDiscountedPrice(originalPrice, discount) {
		if (!discount || discount <= 0) return originalPrice;
		return originalPrice - (originalPrice * (discount / 100));
	}

	function hasDiscount(product) {
		return product.discount && product.discount > 0;
	}
	
	function getProductVariants(productId) {
		const variants = productVariants.filter(variant => variant.product_id === productId);
		return variants;
	}
	
	function getProductVariantCount(productId) {
		return variantCounts[productId] || 0;
	}
	
	function getTotalVariantStock(productId) {
		const variants = getProductVariants(productId);
		return variants.reduce((total, variant) => total + (variant.stock || 0), 0);
	}
	
	function getLowestVariantPrice(productId) {
		const variants = getProductVariants(productId);
		if (variants.length === 0) return null;
		return Math.min(...variants.map(v => v.price || 0));
	}
	
	function parseVariantOptions(options) {
		try {
			if (typeof options === 'string') {
				return JSON.parse(options);
			}
			return options;
		} catch {
			return options;
		}
	}
	
	async function changeSortOrder() {
		sortProducts();
	}

	// Dashboard metrics calculations
	$: totalProducts = products.length;
	$: totalStock = products.reduce((sum, product) => sum + (product.stock || 0), 0);
	$: totalVariants = productVariants.length;
	$: lowStockProducts = products.filter(product => (product.stock || 0) <= 10).length;
	$: totalValue = products.reduce((sum, product) => {
		const stock = product.stock || 0;
		const price = product.price || 0;
		return sum + (stock * price);
	}, 0);
	$: outOfStockProducts = products.filter(product => (product.stock || 0) === 0).length;
</script>

<div class="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Products Management</h1>
		<p class="text-gray-600">Manage your product inventory</p>
	</div>

	<!-- Dashboard Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
		<!-- Total Products -->
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-gray-100 p-2 rounded-lg">
					<svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Products</p>
				<p class="text-2xl font-bold text-gray-900">{totalProducts}</p>
			</div>
		</div>

		<!-- Total Stock -->
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-blue-50 p-2 rounded-lg">
					<svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Stock</p>
				<p class="text-2xl font-bold text-gray-900">{totalStock.toLocaleString()}</p>
			</div>
		</div>

		<!-- Total Variants -->
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-gray-100 p-2 rounded-lg">
					<svg class="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Variants</p>
				<p class="text-2xl font-bold text-gray-900">{totalVariants}</p>
			</div>
		</div>

		<!-- Low Stock Alert -->
		<button
			on:click={() => setFilter('low-stock')}
			class="w-full bg-white rounded-xl shadow-sm p-4 border border-red-200 hover:shadow-md hover:border-red-300 transition-all duration-200 text-left group"
		>
			<div class="flex items-center justify-between mb-3">
				<div class="bg-red-50 p-2 rounded-lg group-hover:bg-red-100 transition-colors duration-200">
					<svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Low Stock</p>
				<p class="text-2xl font-bold text-gray-900">{lowStockProducts}</p>
				<p class="text-xs text-red-600 mt-1">Click to filter</p>
			</div>
		</button>

		<!-- Out of Stock -->
		<button
			on:click={() => setFilter('out-of-stock')}
			class="w-full bg-white rounded-xl shadow-sm p-4 border border-red-200 hover:shadow-md hover:border-red-300 transition-all duration-200 text-left group"
		>
			<div class="flex items-center justify-between mb-3">
				<div class="bg-red-50 p-2 rounded-lg group-hover:bg-red-100 transition-colors duration-200">
					<svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Out of Stock</p>
				<p class="text-2xl font-bold text-gray-900">{outOfStockProducts}</p>
				<p class="text-xs text-red-600 mt-1">Click to filter</p>
			</div>
		</button>

		<!-- Total Inventory Value -->
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-blue-50 p-2 rounded-lg">
					<svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Total Value</p>
				<p class="text-lg font-bold text-gray-900">{formatPrice(totalValue)}</p>
			</div>
		</div>
	</div>
	
	<!-- Controls Section -->
	<div class="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-6">
		<div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
			<!-- Search and Sort -->
			<div class="flex flex-col sm:flex-row gap-3 flex-1 w-full md:w-auto">
				<!-- Search -->
				<div class="relative flex-1 min-w-0">
					<input
						type="text"
						placeholder="Search products... (type 2+ letters for real-time search)"
						bind:value={searchTerm}
						class="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 {isSearching ? 'border-blue-400' : ''}"
					/>
					<svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					{#if isSearching}
						<div class="absolute right-3 top-2.5">
							<svg class="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
						</div>
					{:else if searchTerm && searchTerm.length >= 2}
						<div class="absolute right-3 top-2.5">
							<svg class="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						</div>
					{/if}
				</div>
				
				<!-- Sort Options -->
				<div class="flex gap-2">
					<select 
						bind:value={sortBy} 
						on:change={changeSortOrder}
						class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					>
						<option value="name">Sort by Name</option>
						<option value="price">Sort by Price</option>
						<option value="category_id">Sort by Category</option>
						<option value="stock">Sort by Stock</option>
						<option value="created">Sort by Date</option>
					</select>
					
					<button
						on:click={() => { sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; changeSortOrder(); }}
						class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						title="Toggle sort order"
						aria-label="Toggle sort order"
					>
						<svg class="h-5 w-5 transform {sortOrder === 'desc' ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
						</svg>
					</button>
				</div>
			</div>
			
			<!-- Stock Filter Buttons -->
			<div class="flex flex-wrap gap-2 mt-4 md:mt-0">
				<button
					on:click={() => setFilter('all')}
					class="px-3 py-2 text-sm rounded-lg border transition-colors duration-200 {activeFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
				>
					All Products ({products.length})
				</button>
				<button
					on:click={() => setFilter('low-stock')}
					class="px-3 py-2 text-sm rounded-lg border transition-colors duration-200 {activeFilter === 'low-stock' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
				>
					Low Stock ({lowStockProducts})
				</button>
				<button
					on:click={() => setFilter('out-of-stock')}
					class="px-3 py-2 text-sm rounded-lg border transition-colors duration-200 {activeFilter === 'out-of-stock' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
				>
					Out of Stock ({outOfStockProducts})
				</button>
			</div>
			
			<!-- Add Product Button -->
			<button
				on:click={openAddModal}
				class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center gap-2"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Product
			</button>
		</div>
		
		<!-- Results Count and Search Info -->
		<div class="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
			<div class="text-sm text-gray-600">
				{#if searchTerm && searchTerm.length >= 2}
					{#if isSearching}
						<span class="flex items-center gap-2">
							<svg class="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Searching for "{searchTerm}"...
						</span>
					{:else}
						<span class="flex items-center gap-2">
							<svg class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							Found {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''} for "{searchTerm}"
						</span>
					{/if}
				{:else if searchTerm && searchTerm.length < 2}
					<span class="text-amber-600">Type at least 2 characters to search</span>
				{:else}
					Showing {filteredProducts.length} of {products.length} products
				{/if}
			</div>
			{#if searchTerm}
				<button
					on:click={() => searchTerm = ''}
					class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
					Clear search
				</button>
			{/if}
		</div>
	</div>
	
	<!-- Products Grid/List -->
	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if filteredProducts.length === 0}
		<div class="bg-white rounded-lg shadow-sm p-8 text-center">
			<svg class="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m-6 0v2a2 2 0 002 2h2m12-2v2a2 2 0 01-2 2h-2" />
			</svg>
			<h3 class="text-lg font-medium text-gray-900 mb-2">No products found</h3>
			<p class="text-gray-600 mb-4">
				{searchTerm ? 'Try adjusting your search terms' : 'Get started by adding your first product'}
			</p>
			{#if !searchTerm}
				<button
					on:click={openAddModal}
					class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					Add Your First Product
				</button>
			{/if}
		</div>
	{:else}
		<!-- Mobile: List View -->
		<div class="block md:hidden space-y-4">
			{#each filteredProducts as product}
				<div class="bg-white rounded-lg shadow-sm p-4">
					<div class="flex items-start gap-4">
						{#if product.images}
							<img 
								src={pb.files.getUrl(product, product.images, { thumb: '64x64' })} 
								alt={product.name}
								class="w-16 h-16 object-cover rounded-lg flex-shrink-0"
							/>
						{:else}
							<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
								<svg class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
							</div>
						{/if}
						
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<h3 class="font-medium text-gray-900 truncate">{product.name}</h3>
								{#if product.is_featured}
									<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
										<svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
											<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
										</svg>
										Featured
									</span>
								{/if}
							</div>
							<p class="text-sm text-gray-600 mt-1 line-clamp-2">{product.description}</p>
							<div class="flex items-center gap-4 mt-2">
								{#if hasDiscount(product)}
									<div class="flex items-center gap-2">
										<span class="text-lg font-semibold text-green-600">{formatPrice(calculateDiscountedPrice(product.price, product.discount))}</span>
										<span class="text-sm text-gray-500 line-through">{formatPrice(product.price)}</span>
										<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
											{product.discount}% OFF
										</span>
									</div>
								{:else}
									<span class="text-lg font-semibold text-green-600">{formatPrice(product.price)}</span>
								{/if}
								<div class="flex items-center gap-2">
									<span class="text-sm text-gray-500">Stock: {product.stock}</span>
									{#if (product.stock || 0) === 0}
										<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
											Out of Stock
										</span>
									{:else if (product.stock || 0) <= 10}
										<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
											Low Stock
										</span>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-2 mt-2">
								<!-- Category badge removed -->
							</div>
						</div>
					</div>
					
					<!-- Actions -->
					<div class="flex gap-2 mt-4">
						<button
							on:click={() => openEditModal(product)}
							class="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors duration-200 text-sm font-medium"
						>
							Edit
						</button>
						<button
							on:click={() => openVariantsModal(product)}
							class="flex-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg hover:bg-green-100 transition-colors duration-200 text-sm font-medium"
						>
							Variants ({getProductVariantCount(product.id)})
						</button>
						<button
							on:click={() => openDeleteModal(product)}
							class="flex-1 bg-red-50 text-red-700 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors duration-200 text-sm font-medium"
						>
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
		
		<!-- Desktop: Table View -->
		<div class="hidden md:block bg-white rounded-lg shadow-sm overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variants</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredProducts as product}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center">
										{#if product.images}
											<img 
												src={pb.files.getUrl(product, product.images, { thumb: '64x64' })} 
												alt={product.name}
												class="h-12 w-12 object-cover rounded-lg mr-4"
											/>
										{:else}
											<div class="h-12 w-12 bg-gray-200 rounded-lg flex items-center justify-center mr-4">
												<svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
												</svg>
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												<div class="text-sm font-medium text-gray-900 truncate">{product.name}</div>
												{#if product.is_featured}
													<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
														<svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
															<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
														</svg>
														Featured
													</span>
												{/if}
											</div>
											<div class="text-sm text-gray-500 truncate max-w-xs">{product.description}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
									{#if hasDiscount(product)}
										<div class="flex flex-col">
											<span class="text-green-600 font-semibold">{formatPrice(calculateDiscountedPrice(product.price, product.discount))}</span>
											<div class="flex items-center gap-2">
												<span class="text-gray-500 line-through text-xs">{formatPrice(product.price)}</span>
												<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
													{product.discount}% OFF
												</span>
											</div>
										</div>
									{:else}
										<span class="text-green-600">{formatPrice(product.price)}</span>
									{/if}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {product.stock > 10 ? 'bg-green-100 text-green-800' : product.stock > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
										{product.stock} in stock
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									<button
										on:click={() => openVariantsModal(product)}
										class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200"
									>
										{getProductVariantCount(product.id)} variants
									</button>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<div class="flex items-center justify-end gap-2">
										<button
											on:click={() => openEditModal(product)}
											class="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors duration-200"
										>
											Edit
										</button>
										<button
											on:click={() => openVariantsModal(product)}
											class="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-lg transition-colors duration-200"
										>
											Variants
										</button>
										<button
											on:click={() => openDeleteModal(product)}
											class="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors duration-200"
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
		</div>
	{/if}
</div>

<!-- Add Product Modal -->
{#if showAddModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
				<form on:submit|preventDefault={saveProduct}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Add New Product</h3>
						
						<div class="space-y-4">
							<div>
								<label for="name" class="block text-sm font-medium text-gray-700">Product Name</label>
								<input
									type="text"
									id="name"
									bind:value={productForm.name}
									required
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							
							<div>
								<label for="description" class="block text-sm font-medium text-gray-700">Description</label>
								<textarea
									id="description"
									bind:value={productForm.description}
									rows="3"
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								></textarea>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label for="price" class="block text-sm font-medium text-gray-700">Price (KSh)</label>
									<input
										type="number"
										id="price"
										bind:value={productForm.price}
										step="0.01"
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								
								<div>
									<label for="discount" class="block text-sm font-medium text-gray-700">Discount (%)</label>
									<input
										type="number"
										id="discount"
										bind:value={productForm.discount}
										min="0"
										max="100"
										step="1"
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
									<p class="text-xs text-gray-500 mt-1">Enter percentage discount (0-100)</p>
								</div>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label for="stock" class="block text-sm font-medium text-gray-700">Stock Quantity</label>
									<input
										type="number"
										id="stock"
										bind:value={productForm.stock}
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Featured Product</label>
									<div class="flex items-center">
										<label class="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												bind:checked={productForm.is_featured}
												class="sr-only peer"
											/>
											<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
											<span class="ml-3 text-sm text-gray-700">Mark as featured</span>
										</label>
									</div>
									<p class="text-xs text-gray-500 mt-1">Featured products are highlighted to customers</p>
								</div>
							</div>
							
							<div>
								<label for="category" class="block text-sm font-medium text-gray-700">Category</label>
								<select
									id="category"
									bind:value={productForm.category}
									required
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								>
									<option value="">Select a category</option>
									{#each categories as category}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>
							
							<div>
								<label for="image" class="block text-sm font-medium text-gray-700">Product Image</label>
								<input
									type="file"
									id="image"
									accept="image/*"
									on:change={handleImageChange}
									class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
								/>
								{#if imagePreview}
									<div class="mt-2">
										<img src={imagePreview} alt="Preview" class="h-20 w-20 object-cover rounded-lg" />
									</div>
								{/if}
							</div>
						</div>
					</div>
					
					<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
						<button
							type="submit"
							class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
						>
							Add Product
						</button>
						<button
							type="button"
							on:click={closeModals}
							class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Product Modal -->
{#if showEditModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
				<form on:submit|preventDefault={saveProduct}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Product</h3>
						
						<div class="space-y-4">
							<div>
								<label for="edit-name" class="block text-sm font-medium text-gray-700">Product Name</label>
								<input
									type="text"
									id="edit-name"
									bind:value={productForm.name}
									required
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							
							<div>
								<label for="edit-description" class="block text-sm font-medium text-gray-700">Description</label>
								<textarea
									id="edit-description"
									bind:value={productForm.description}
									rows="3"
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								></textarea>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label for="edit-price" class="block text-sm font-medium text-gray-700">Price (KSh)</label>
									<input
										type="number"
										id="edit-price"
										bind:value={productForm.price}
										step="0.01"
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								
								<div>
									<label for="edit-discount" class="block text-sm font-medium text-gray-700">Discount (%)</label>
									<input
										type="number"
										id="edit-discount"
										bind:value={productForm.discount}
										min="0"
										max="100"
										step="1"
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
									<p class="text-xs text-gray-500 mt-1">Enter percentage discount (0-100)</p>
								</div>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label for="edit-stock" class="block text-sm font-medium text-gray-700">Stock Quantity</label>
									<input
										type="number"
										id="edit-stock"
										bind:value={productForm.stock}
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Featured Product</label>
									<div class="flex items-center">
										<label class="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												bind:checked={productForm.is_featured}
												class="sr-only peer"
											/>
											<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
											<span class="ml-3 text-sm text-gray-700">Mark as featured</span>
										</label>
									</div>
									<p class="text-xs text-gray-500 mt-1">Featured products are highlighted to customers</p>
								</div>
							</div>
							
							<div>
								<label for="edit-category" class="block text-sm font-medium text-gray-700">Category</label>
								<select
									id="edit-category"
									bind:value={productForm.category}
									required
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								>
									<option value="">Select a category</option>
									{#each categories as category}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>
							
							<div>
								<label for="edit-image" class="block text-sm font-medium text-gray-700">Update Product Image</label>
								<input
									type="file"
									id="edit-image"
									accept="image/*"
									on:change={handleImageChange}
									class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
								/>
								<p class="text-xs text-gray-500 mt-1">Leave empty to keep current image</p>
								{#if imagePreview}
									<div class="mt-2">
										<p class="text-xs text-gray-500 mb-1">Preview:</p>
										<img src={imagePreview} alt="Preview" class="h-20 w-20 object-cover rounded-lg" />
									</div>
								{/if}
							</div>
						</div>
					</div>
					
					<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
						<button
							type="submit"
							class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
						>
							Update Product
						</button>
						<button
							type="button"
							on:click={closeModals}
							class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
				<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
					<div class="sm:flex sm:items-start">
						<div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
							<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.084 16.5C2.314 18.167 3.276 19 4.816 19z" />
							</svg>
						</div>
						<div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
							<h3 class="text-lg leading-6 font-medium text-gray-900">Delete Product</h3>
							<div class="mt-2">
								<p class="text-sm text-gray-500">
									Are you sure you want to delete "{selectedProduct?.name}"? This action cannot be undone.
								</p>
							</div>
						</div>
					</div>
				</div>
				<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
					<button
						type="button"
						on:click={deleteProduct}
						class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
					>
						Delete
					</button>
					<button
						type="button"
						on:click={closeModals}
						class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Product Variants Modal -->
{#if showVariantsModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
				<div class="bg-white px-4 pt-5 pb-4 sm:p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg leading-6 font-medium text-gray-900">
							Product Variants - {selectedProductForVariants?.name}
						</h3>
						<button
							on:click={openAddVariantModal}
							class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 flex items-center gap-2"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
							Add Variant
						</button>
					</div>
					
					<!-- Variants List -->
					{#if selectedProductForVariants}
						{@const variants = getProductVariants(selectedProductForVariants.id)}
						{#if variants.length === 0}
							<div class="text-center py-8">
								<svg class="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m-6 0v2a2 2 0 002 2h2m12-2v2a2 2 0 01-2 2h-2" />
								</svg>
								<h4 class="text-lg font-medium text-gray-900 mb-2">No variants found</h4>
								<p class="text-gray-600 mb-4">Create variants for different sizes, colors, or options</p>
								<button
									on:click={openAddVariantModal}
									class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
								>
									Add First Variant
								</button>
							</div>
						{:else}
							<div class="space-y-4 max-h-96 overflow-y-auto">
								{#each variants as variant}
									<div class="border border-gray-200 rounded-lg p-4">
										<div class="flex items-start justify-between">
											<div class="flex items-start gap-4 flex-1">
												{#if variant.image}
													<img 
														src={pb.files.getUrl(variant, variant.image, { thumb: '64x64' })} 
														alt={variant.name}
														class="w-16 h-16 object-cover rounded-lg flex-shrink-0"
													/>
												{:else}
													<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
														<svg class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
														</svg>
													</div>
												{/if}
												
												<div class="flex-1">
													<h4 class="font-medium text-gray-900">{variant.name}</h4>
													<p class="text-sm text-gray-600 mt-1">{variant.options}</p>
													<div class="flex items-center gap-4 mt-2">
														<span class="text-lg font-semibold text-green-600">{formatPrice(variant.price)}</span>
														<span class="text-sm text-gray-500">Stock: {variant.stock}</span>
													</div>
												</div>
											</div>
											
											<div class="flex gap-2">
												<button
													on:click={() => openEditVariantModal(variant)}
													class="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors duration-200 text-sm"
												>
													Edit
												</button>
												<button
													on:click={() => openDeleteVariantModal(variant)}
													class="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors duration-200 text-sm"
												>
													Delete
												</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
				
				<div class="bg-gray-50 px-4 py-3 sm:px-6 text-right">
					<button
						type="button"
						on:click={closeModals}
						class="inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Add Variant Modal -->
{#if showAddVariantModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
				<form on:submit|preventDefault={saveVariant}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Add Product Variant</h3>
						
						<div class="space-y-4">
							<div>
								<label for="variant-name" class="block text-sm font-medium text-gray-700">Variant Name</label>
								<input
									type="text"
									id="variant-name"
									bind:value={variantForm.name}
									required
									placeholder="e.g., Red - Large, Blue - Medium"
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							
							<div>
								<label for="variant-options" class="block text-sm font-medium text-gray-700">Options (JSON or text)</label>
								<textarea
									id="variant-options"
									bind:value={variantForm.options}
									rows="3"
									placeholder={'{"color": "red", "size": "large"} or "Red, Large"'}
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								></textarea>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label for="variant-price" class="block text-sm font-medium text-gray-700">Price (KSh)</label>
									<input
										type="number"
										id="variant-price"
										bind:value={variantForm.price}
										step="0.01"
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								
								<div>
									<label for="variant-stock" class="block text-sm font-medium text-gray-700">Stock Quantity</label>
									<input
										type="number"
										id="variant-stock"
										bind:value={variantForm.stock}
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
							</div>
							
							<div>
								<label for="variant-image" class="block text-sm font-medium text-gray-700">Variant Image</label>
								<input
									type="file"
									id="variant-image"
									accept="image/*"
									on:change={handleVariantImageChange}
									class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
								/>
								{#if variantImagePreview}
									<div class="mt-2">
										<img src={variantImagePreview} alt="Preview" class="h-20 w-20 object-cover rounded-lg" />
									</div>
								{/if}
							</div>
						</div>
					</div>
					
					<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
						<button
							type="submit"
							class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
						>
							Add Variant
						</button>
						<button
							type="button"
							on:click={closeModals}
							class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Variant Modal -->
{#if showEditVariantModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
				<form on:submit|preventDefault={saveVariant}>
					<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
						<h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Product Variant</h3>
						
						<div class="space-y-4">
							<div>
								<label for="edit-variant-name" class="block text-sm font-medium text-gray-700">Variant Name</label>
								<input
									type="text"
									id="edit-variant-name"
									bind:value={variantForm.name}
									required
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							
							<div>
								<label for="edit-variant-options" class="block text-sm font-medium text-gray-700">Options (JSON or text)</label>
								<textarea
									id="edit-variant-options"
									bind:value={variantForm.options}
									rows="3"
									class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
								></textarea>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label for="edit-variant-price" class="block text-sm font-medium text-gray-700">Price (KSh)</label>
									<input
										type="number"
										id="edit-variant-price"
										bind:value={variantForm.price}
										step="0.01"
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								
								<div>
									<label for="edit-variant-stock" class="block text-sm font-medium text-gray-700">Stock Quantity</label>
									<input
										type="number"
										id="edit-variant-stock"
										bind:value={variantForm.stock}
										min="0"
										required
										class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
							</div>
							
							<div>
								<label for="edit-variant-image" class="block text-sm font-medium text-gray-700">Update Variant Image</label>
								<input
									type="file"
									id="edit-variant-image"
									accept="image/*"
									on:change={handleVariantImageChange}
									class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
								/>
								<p class="text-xs text-gray-500 mt-1">Leave empty to keep current image</p>
								{#if variantImagePreview}
									<div class="mt-2">
										<p class="text-xs text-gray-500 mb-1">Preview:</p>
										<img src={variantImagePreview} alt="Preview" class="h-20 w-20 object-cover rounded-lg" />
									</div>
								{/if}
							</div>
						</div>
					</div>
					
					<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
						<button
							type="submit"
							class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
						>
							Update Variant
						</button>
						<button
							type="button"
							on:click={closeModals}
							class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Variant Confirmation Modal -->
{#if showDeleteVariantModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
			<div 
				class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
				on:click={closeModals}
				on:keydown={(e) => e.key === 'Escape' && closeModals()}
				role="button"
				tabindex="0"
				aria-label="Close modal"
			></div>
			
			<span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
			
			<div class="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
				<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
					<div class="sm:flex sm:items-start">
						<div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
							<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.084 16.5C2.314 18.167 3.276 19 4.816 19z" />
							</svg>
						</div>
						<div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
							<h3 class="text-lg leading-6 font-medium text-gray-900">Delete Variant</h3>
							<div class="mt-2">
								<p class="text-sm text-gray-500">
									Are you sure you want to delete the variant "{selectedVariant?.name}"? This action cannot be undone.
								</p>
							</div>
						</div>
					</div>
				</div>
				<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
					<button
						type="button"
						on:click={deleteVariant}
						class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
					>
						Delete
					</button>
					<button
						type="button"
						on:click={closeModals}
						class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>