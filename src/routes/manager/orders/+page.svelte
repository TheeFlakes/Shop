<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pocketbase.js';

	// State management
	let orders = [];
	let orderItems = [];
	let filteredOrders = [];
	let selectedOrder = null;
	let loading = false;
	let error = '';
	let searchTerm = '';
	let statusFilter = 'all';
	let paymentStatusFilter = 'all';
	let searchTimeout = null;
	let showOrderForm = false;
	let showOrderItemForm = false;
	let editingOrder = null;
	let editingOrderItem = null;

	// Order form data
	let orderForm = {
		user_id: '',
		subtotal: 0,
		shipping_cost: 0,
		discount: 0,
		total: 0,
		payment_status: 'pending',
		payment_method: 'mpesa',
		status: 'processing',
		shipping_address: '',
		cashier_id: '',
		customer_type: 'guest'
	};

	// Order item form data
	let orderItemForm = {
		order_id: '',
		product_id: '',
		variant_id: '',
		quantity: 1,
		price: 0
	};

	// Payment status and order status options
	const paymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
	const orderStatuses = ['processing', 'confirmed', 'shipped', 'delivered', 'cancelled'];
	const paymentMethods = ['mpesa', 'card', 'cash', 'bank_transfer'];
	const customerTypes = ['guest', 'registered'];

	onMount(() => {
		loadOrders();
	});

	async function loadOrders() {
		loading = true;
		error = '';
		try {
			// Build filter string based on search and status filters
			let filters = [];
			
			// Add search filter if searchTerm exists
			if (searchTerm.trim()) {
				filters.push(`(id ~ "${searchTerm}" || user_id.email ~ "${searchTerm}" || user_id.name ~ "${searchTerm}")`);
			}
			
			// Add status filter
			if (statusFilter !== 'all') {
				filters.push(`status = "${statusFilter}"`);
			}
			
			// Add payment status filter
			if (paymentStatusFilter !== 'all') {
				filters.push(`payment_status = "${paymentStatusFilter}"`);
			}
			
			// Combine filters
			const filterString = filters.length > 0 ? filters.join(' && ') : '';
			
			// Use getList for better performance with pagination
			const resultList = await pb.collection('orders').getList(1, 50, {
				sort: '-created',
				expand: 'user_id,cashier_id',
				filter: filterString
			});
			
			orders = resultList.items;
			filteredOrders = orders; // Since we're filtering at the API level
		} catch (err) {
			error = 'Failed to load orders: ' + (err?.message || 'Unknown error');
			orders = [];
			filteredOrders = [];
		} finally {
			loading = false;
		}
	}

	// Debounced search function for realtime search
	function handleSearchInput() {
		// Clear existing timeout
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		
		// Set new timeout for realtime search
		searchTimeout = setTimeout(() => {
			loadOrders();
		}, 300); // 300ms delay to avoid too many API calls
	}

	// Watch for filter changes
	function handleFilterChange() {
		loadOrders();
	}

	async function loadOrderItems(orderId) {
		if (!orderId) return;
		loading = true;
		try {
			orderItems = await pb.collection('order_items').getFullList({
				filter: `order_id="${orderId}"`,
				expand: 'product_id,variant_id'
			});
		} catch (err) {
			error = 'Failed to load order items: ' + (err?.message || 'Unknown error');
		} finally {
			loading = false;
		}
	}

	async function selectOrder(order) {
		selectedOrder = order;
		await loadOrderItems(order.id);
	}

	function openOrderForm(order = null) {
		editingOrder = order;
		if (order) {
			orderForm = {
				user_id: order.user_id,
				subtotal: order.subtotal,
				shipping_cost: order.shipping_cost,
				discount: order.discount,
				total: order.total,
				payment_status: order.payment_status,
				payment_method: order.payment_method,
				status: order.status,
				shipping_address: order.shipping_address,
				cashier_id: order.cashier_id,
				customer_type: order.customer_type
			};
		} else {
			orderForm = {
				user_id: '',
				subtotal: 0,
				shipping_cost: 0,
				discount: 0,
				total: 0,
				payment_status: 'pending',
				payment_method: 'mpesa',
				status: 'processing',
				shipping_address: '',
				cashier_id: '',
				customer_type: 'guest'
			};
		}
		showOrderForm = true;
	}

	function openOrderItemForm(orderItem = null) {
		editingOrderItem = orderItem;
		if (orderItem) {
			orderItemForm = {
				order_id: orderItem.order_id,
				product_id: orderItem.product_id,
				variant_id: orderItem.variant_id,
				quantity: orderItem.quantity,
				price: orderItem.price
			};
		} else {
			orderItemForm = {
				order_id: selectedOrder?.id || '',
				product_id: '',
				variant_id: '',
				quantity: 1,
				price: 0
			};
		}
		showOrderItemForm = true;
	}

	// Update saveOrder to reload the list after saving
	async function saveOrder() {
		loading = true;
		error = '';
		try {
			// Calculate total if needed
			orderForm.total = orderForm.subtotal + orderForm.shipping_cost - orderForm.discount;

			if (editingOrder) {
				await pb.collection('orders').update(editingOrder.id, orderForm);
			} else {
				await pb.collection('orders').create(orderForm);
			}
			showOrderForm = false;
			editingOrder = null;
			// Reload orders to refresh the list with new/updated data
			await loadOrders();
		} catch (err) {
			error = 'Failed to save order: ' + (err?.message || 'Unknown error');
		} finally {
			loading = false;
		}
	}

	async function saveOrderItem() {
		loading = true;
		error = '';
		try {
			if (editingOrderItem) {
				await pb.collection('order_items').update(editingOrderItem.id, orderItemForm);
			} else {
				await pb.collection('order_items').create(orderItemForm);
			}
			showOrderItemForm = false;
			editingOrderItem = null;
			if (selectedOrder) {
				await loadOrderItems(selectedOrder.id);
			}
		} catch (err) {
			error = 'Failed to save order item: ' + err.message;
		} finally {
			loading = false;
		}
	}

	async function deleteOrderItem(orderItem) {
		if (!confirm('Are you sure you want to delete this order item?')) return;
		
		loading = true;
		error = '';
		try {
			await pb.collection('order_items').delete(orderItem.id);
			if (selectedOrder) {
				await loadOrderItems(selectedOrder.id);
			}
		} catch (err) {
			error = 'Failed to delete order item: ' + err.message;
		} finally {
			loading = false;
		}
	}

	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES'
		}).format(amount);
	}

	function formatDate(dateString) {
		return new Date(dateString).toLocaleString();
	}

	function getStatusColor(status) {
		const colors = {
			processing: 'bg-yellow-100 text-yellow-800',
			confirmed: 'bg-blue-100 text-blue-800',
			shipped: 'bg-purple-100 text-purple-800',
			delivered: 'bg-green-100 text-green-800',
			cancelled: 'bg-red-100 text-red-800'
		};
		return colors[status] || 'bg-gray-100 text-gray-800';
	}

	function getPaymentStatusColor(status) {
		const colors = {
			pending: 'bg-yellow-100 text-yellow-800',
			paid: 'bg-green-100 text-green-800',
			failed: 'bg-red-100 text-red-800',
			refunded: 'bg-orange-100 text-orange-800'
		};
		return colors[status] || 'bg-gray-100 text-gray-800';
	}

	function goToCreateOrder() {
		goto('/manager/create_order');
	}
</script>

<div class="p-4 md:p-6 bg-gray-50 min-h-screen">
	<!-- Header Section -->
	<div class="mb-6">
		<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
			<div>
				<h1 class="text-2xl md:text-3xl font-bold text-gray-900">Orders Management</h1>
				<p class="text-gray-600 mt-1">Manage orders and order items efficiently</p>
			</div>
			<div class="flex flex-col sm:flex-row gap-2">
				<button
					on:click={goToCreateOrder}
					class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
					</svg>
					Create New Order
				</button>
			</div>
		</div>
	</div>

	{#if error}
		<div class="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
			<div class="flex items-center gap-2">
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				{error}
			</div>
		</div>
	{/if}

	<!-- Stats Cards -->
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-blue-50 p-2 rounded-lg">
					<svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Total Orders</p>
				<p class="text-2xl font-bold text-gray-900">{orders.length}</p>
			</div>
		</div>
		
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-green-50 p-2 rounded-lg">
					<svg class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Delivered</p>
				<p class="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'delivered').length}</p>
			</div>
		</div>
		
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-yellow-50 p-2 rounded-lg">
					<svg class="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Processing</p>
				<p class="text-2xl font-bold text-gray-900">{orders.filter(o => o.status === 'processing').length}</p>
			</div>
		</div>
		
		<div class="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
			<div class="flex items-center justify-between mb-3">
				<div class="bg-purple-50 p-2 rounded-lg">
					<svg class="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
					</svg>
				</div>
			</div>
			<div>
				<p class="text-xs font-medium text-gray-500 mb-1">Total Revenue</p>
				<p class="text-lg font-bold text-gray-900">{formatCurrency(orders.reduce((sum, order) => sum + (order.total || 0), 0))}</p>
			</div>
		</div>
	</div>

	<!-- Filters Section -->
	<div class="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-6">
		<div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
			<!-- Search -->
			<div class="relative flex-1 min-w-0">
				<input
					type="text"
					placeholder="Search orders by ID, customer email, or name..."
					bind:value={searchTerm}
					on:input={handleSearchInput}
					class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
				/>
				<svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
			</div>
			
			<!-- Filter Buttons -->
			<div class="flex flex-wrap gap-2">
				<select
					bind:value={statusFilter}
					on:change={handleFilterChange}
					class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					<option value="all">All Statuses</option>
					{#each orderStatuses as status}
						<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
					{/each}
				</select>

				<select
					bind:value={paymentStatusFilter}
					on:change={handleFilterChange}
					class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					<option value="all">All Payment Status</option>
					{#each paymentStatuses as status}
						<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
		<!-- Orders List -->
		<div class="bg-white rounded-lg shadow-sm border">
			<div class="p-4 md:p-6 border-b">
				<h2 class="text-xl font-semibold text-gray-900 mb-1">Orders List</h2>
				<p class="text-sm text-gray-600">Click on an order to view details</p>
			</div>

			<div class="max-h-[600px] overflow-y-auto">
				{#if loading}
					<div class="p-6 text-center">
						<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
						<p class="mt-2 text-gray-600">Loading orders...</p>
					</div>
				{:else if filteredOrders.length === 0}
					<div class="p-6 text-center text-gray-500">
						<svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
						</svg>
						<p class="text-lg font-medium">No orders found</p>
						<p class="text-sm">Try adjusting your search or filters</p>
					</div>
				{:else}
					<div class="divide-y divide-gray-200">
						{#each filteredOrders as order}
							<div
								class="p-4 hover:bg-gray-50 cursor-pointer transition-colors duration-200 {selectedOrder?.id === order.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}"
								role="button"
								tabindex="0"
								on:click={() => selectOrder(order)}
								on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectOrder(order)}
								aria-label="Select order #{order.id.slice(-8)}"
							>
								<div class="flex justify-between items-start">
									<div class="flex-1">
										<div class="flex items-center gap-2 mb-1">
											<p class="font-medium text-gray-900">#{order.id.slice(-8)}</p>
											<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getStatusColor(order.status)}">
												{order.status}
											</span>
										</div>
										<p class="text-sm text-gray-600">
											{order.expand?.user_id?.name || order.expand?.user_id?.email || 'Guest Customer'}
										</p>
										<p class="text-xs text-gray-500">{formatDate(order.created)}</p>
									</div>
									<div class="text-right">
										<p class="font-semibold text-gray-900">{formatCurrency(order.total)}</p>
										<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getPaymentStatusColor(order.payment_status)} mt-1">
											{order.payment_status}
										</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Order Details -->
		<div class="bg-white rounded-lg shadow-sm border">
			{#if selectedOrder}
				<div class="p-4 md:p-6 border-b">
					<div class="flex justify-between items-center">
						<h2 class="text-xl font-semibold text-gray-900">Order Details</h2>
						<button
							on:click={() => openOrderForm(selectedOrder)}
							class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200"
						>
							Edit Order
						</button>
					</div>
				</div>

				<div class="p-4 md:p-6 space-y-6">
					<!-- Order Information -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
						<div>
							<span class="font-medium text-gray-700">Order ID:</span>
							<p class="text-gray-900">#{selectedOrder.id.slice(-8)}</p>
						</div>
						<div>
							<span class="font-medium text-gray-700">Customer:</span>
							<p class="text-gray-900">{selectedOrder.expand?.user_id?.name || selectedOrder.expand?.user_id?.email || 'Guest'}</p>
						</div>
						<div>
							<span class="font-medium text-gray-700">Payment Method:</span>
							<p class="text-gray-900">{selectedOrder.payment_method}</p>
						</div>
						<div>
							<span class="font-medium text-gray-700">Customer Type:</span>
							<p class="text-gray-900">{selectedOrder.customer_type}</p>
						</div>
						<div>
							<span class="font-medium text-gray-700">Order Status:</span>
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getStatusColor(selectedOrder.status)}">
								{selectedOrder.status}
							</span>
						</div>
						<div>
							<span class="font-medium text-gray-700">Payment Status:</span>
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getPaymentStatusColor(selectedOrder.payment_status)}">
								{selectedOrder.payment_status}
							</span>
						</div>
					</div>

					<!-- Order Financial Details -->
					<div class="bg-gray-50 p-4 rounded-lg">
						<h3 class="font-medium text-gray-900 mb-3">Financial Details</h3>
						<div class="space-y-2 text-sm">
							<div class="flex justify-between">
								<span>Subtotal:</span>
								<span>{formatCurrency(selectedOrder.subtotal)}</span>
							</div>
							<div class="flex justify-between">
								<span>Shipping:</span>
								<span>{formatCurrency(selectedOrder.shipping_cost)}</span>
							</div>
							<div class="flex justify-between">
								<span>Discount:</span>
								<span>-{formatCurrency(selectedOrder.discount)}</span>
							</div>
							<div class="flex justify-between font-semibold border-t pt-2">
								<span>Total:</span>
								<span>{formatCurrency(selectedOrder.total)}</span>
							</div>
						</div>
					</div>

					<!-- Order Items -->
					<div>
						<div class="flex justify-between items-center mb-4">
							<h3 class="font-medium text-gray-900">Order Items</h3>
							<button
								on:click={() => openOrderItemForm()}
								class="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors duration-200"
							>
								Add Item
							</button>
						</div>

						{#if orderItems.length === 0}
							<div class="text-center py-8 text-gray-500">
								<svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
								</svg>
								<p class="text-lg font-medium">No items in this order</p>
								<p class="text-sm">Add items to complete the order</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each orderItems as item}
									<div class="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
										<div class="flex-1">
											<p class="font-medium text-gray-900">
												{item.expand?.product_id?.name || 'Product'}
											</p>
											<p class="text-sm text-gray-600">
												Qty: {item.quantity} × {formatCurrency(item.price)}
											</p>
											{#if item.expand?.variant_id}
												<p class="text-xs text-gray-500">
													Variant: {item.expand.variant_id.name}
												</p>
											{/if}
										</div>
										<div class="flex items-center gap-3">
											<span class="font-semibold text-gray-900">{formatCurrency(item.quantity * item.price)}</span>
											<div class="flex gap-2">
												<button
													on:click={() => openOrderItemForm(item)}
													class="text-blue-600 hover:text-blue-800 text-sm px-2 py-1 rounded hover:bg-blue-50 transition-colors"
												>
													Edit
												</button>
												<button
													on:click={() => deleteOrderItem(item)}
													class="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors"
												>
													Delete
												</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="p-6 text-center text-gray-500">
					<svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					<p class="text-lg font-medium">Select an order to view details</p>
					<p class="text-sm">Click on any order from the list to see its information</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Order Form Modal -->
{#if showOrderForm}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
		<div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
			<div class="p-6 border-b">
				<h3 class="text-lg font-semibold text-gray-900">
					{editingOrder ? 'Edit Order' : 'Create Order'}
				</h3>
			</div>
			
			<form on:submit|preventDefault={saveOrder} class="p-6 space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="user_id" class="block text-sm font-medium text-gray-700 mb-1">User ID</label>
						<input
							type="text"
							id="user_id"
							bind:value={orderForm.user_id}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="Enter user ID"
						/>
					</div>

					<div>
						<label for="cashier_id" class="block text-sm font-medium text-gray-700 mb-1">Cashier ID</label>
						<input
							type="text"
							id="cashier_id"
							bind:value={orderForm.cashier_id}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="Enter cashier ID"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label for="subtotal" class="block text-sm font-medium text-gray-700 mb-1">Subtotal (KES)</label>
						<input
							type="number"
							id="subtotal"
							bind:value={orderForm.subtotal}
							step="0.01"
							min="0"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="shipping_cost" class="block text-sm font-medium text-gray-700 mb-1">Shipping (KES)</label>
						<input
							type="number"
							id="shipping_cost"
							bind:value={orderForm.shipping_cost}
							step="0.01"
							min="0"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="discount" class="block text-sm font-medium text-gray-700 mb-1">Discount (KES)</label>
						<input
							type="number"
							id="discount"
							bind:value={orderForm.discount}
							step="0.01"
							min="0"
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="payment_status" class="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
						<select
							id="payment_status"
							bind:value={orderForm.payment_status}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each paymentStatuses as status}
								<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="payment_method" class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
						<select
							id="payment_method"
							bind:value={orderForm.payment_method}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each paymentMethods as method}
								<option value={method}>{method.charAt(0).toUpperCase() + method.slice(1)}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="status" class="block text-sm font-medium text-gray-700 mb-1">Order Status</label>
						<select
							id="status"
							bind:value={orderForm.status}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each orderStatuses as status}
								<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="customer_type" class="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
						<select
							id="customer_type"
							bind:value={orderForm.customer_type}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{#each customerTypes as type}
								<option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
							{/each}
						</select>
					</div>
				</div>

				<div>
					<label for="shipping_address" class="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
					<textarea
						id="shipping_address"
						bind:value={orderForm.shipping_address}
						rows="3"
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Enter shipping address (JSON format)"
					></textarea>
				</div>

				<div class="bg-gray-50 p-4 rounded-lg">
					<div class="text-sm text-gray-700">
						<strong>Calculated Total:</strong> 
						{formatCurrency(orderForm.subtotal + orderForm.shipping_cost - orderForm.discount)}
					</div>
				</div>

				<div class="flex justify-end gap-3 pt-4">
					<button
						type="button"
						on:click={() => (showOrderForm = false)}
						class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={loading}
						class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
					>
						{loading ? 'Saving...' : 'Save Order'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Order Item Form Modal -->
{#if showOrderItemForm}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
		<div class="bg-white rounded-lg max-w-md w-full">
			<div class="p-6 border-b">
				<h3 class="text-lg font-semibold text-gray-900">
					{editingOrderItem ? 'Edit Order Item' : 'Add Order Item'}
				</h3>
			</div>
			
			<form on:submit|preventDefault={saveOrderItem} class="p-6 space-y-4">
				<div>
					<label for="order_id" class="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
					<input
						type="text"
						id="order_id"
						bind:value={orderItemForm.order_id}
						readonly={!!selectedOrder}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 {!!selectedOrder ? 'bg-gray-100' : ''}"
					/>
				</div>

				<div>
					<label for="product_id" class="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
					<input
						type="text"
						id="product_id"
						bind:value={orderItemForm.product_id}
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Enter product ID"
					/>
				</div>

				<div>
					<label for="variant_id" class="block text-sm font-medium text-gray-700 mb-1">Variant ID (Optional)</label>
					<input
						type="text"
						id="variant_id"
						bind:value={orderItemForm.variant_id}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Enter variant ID"
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="quantity" class="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
						<input
							type="number"
							id="quantity"
							bind:value={orderItemForm.quantity}
							min="1"
							required
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div>
						<label for="price" class="block text-sm font-medium text-gray-700 mb-1">Price (KES)</label>
						<input
							type="number"
							id="price"
							bind:value={orderItemForm.price}
							step="0.01"
							min="0"
							required
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="bg-gray-50 p-3 rounded-lg">
					<div class="text-sm text-gray-700">
						<strong>Item Total:</strong> 
						{formatCurrency(orderItemForm.quantity * orderItemForm.price)}
					</div>
				</div>

				<div class="flex justify-end gap-3 pt-4">
					<button
						type="button"
						on:click={() => (showOrderItemForm = false)}
						class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={loading}
						class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
					>
						{loading ? 'Saving...' : 'Save Item'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar for better UX */
	.max-h-\[600px\]::-webkit-scrollbar {
		width: 6px;
	}
	
	.max-h-\[600px\]::-webkit-scrollbar-track {
		background: #f1f1f1;
	}
	
	.max-h-\[600px\]::-webkit-scrollbar-thumb {
		background: #c1c1c1;
		border-radius: 3px;
	}
	
	.max-h-\[600px\]::-webkit-scrollbar-thumb:hover {
		background: #a8a8a8;
	}
</style>
