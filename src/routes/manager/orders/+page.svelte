<script>
	import { onMount } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	import { authStore } from '$lib/authStore.js';

	// Order workflow states
	const ORDER_STEPS = {
		NEW_ORDER: 'new_order',
		ADD_ITEMS: 'add_items',
		PAYMENT: 'payment',
		RECEIPT: 'receipt'
	};

	// Component state
	let currentStep = ORDER_STEPS.NEW_ORDER;
	let loading = false;
	let error = '';
	let success = '';

	// Order data
	let currentOrder = null;
	let orderItems = [];
	let subtotal = 0;
	let shippingCost = 0;
	let discount = 0;
	let total = 0;

	// Customer data
	let customer = null;
	let isNewCustomer = false;
	let customerForm = {
		name: '',
		email: '',
		phone: '',
		password: 'temp123',
		passwordConfirm: 'temp123'
	};

	// Autocomplete functionality
	let customerSuggestions = [];
	let showSuggestions = false;
	let searchTimeout = null;
	let isSearching = false;

	// Product data
	let products = [];
	let searchTerm = '';
	let selectedCategory = '';
	let categories = [];

	// Payment data
	let paymentMethod = 'cash';
	let paymentStatus = 'pending';
	let shippingAddress = {
		street: '',
		city: '',
		county: '',
		postal_code: '',
		country: 'Kenya'
	};

	// Cash payment handling
	let amountReceived = 0;
	let changeAmount = 0;

	// Receipt data
	let receiptData = null;

	// Get current cashier
	let cashier = null;
	$: cashier = $authStore.user;

	// Calculate change for cash payments
	$: changeAmount = amountReceived - total;

	onMount(async () => {
		await loadInitialData();
	});

	async function loadInitialData() {
		loading = true;
		try {
			// Load products
			const productsResponse = await pb.collection('products').getFullList({
				expand: 'category_id',
				sort: 'name'
			});
			products = productsResponse;

			// Load categories
			const categoriesResponse = await pb.collection('categories').getFullList({
				sort: 'name'
			});
			categories = categoriesResponse;
		} catch (err) {
			console.error('Error loading data:', err);
			error = 'Failed to load initial data';
		} finally {
			loading = false;
		}
	}

	// Real-time customer search with autocomplete
	async function handleCustomerInput(field, value) {
		customerForm[field] = value;
		
		// Clear customer selection when typing in search
		customer = null;
		isNewCustomer = false;
		
		// Clear previous timeout
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		// Don't search for very short inputs
		if (!value || value.length < 2) {
			customerSuggestions = [];
			showSuggestions = false;
			return;
		}

		// Debounce the search
		searchTimeout = setTimeout(async () => {
			await searchCustomersRealtime(value);
		}, 300);
	}

	async function searchCustomersRealtime(value) {
		if (!pb || !value || value.length < 2) return;

		isSearching = true;
		try {
			// Search across multiple fields using case-insensitive contains
			const searchValue = value.toLowerCase();
			const filter = `(name ?~ "${searchValue}" || email ?~ "${searchValue}" || phone ?~ "${value}") && role = "customer"`;

			const customers = await pb.collection('users').getList(1, 15, {
				filter: filter,
				sort: 'name'
			});

			customerSuggestions = customers.items;
			showSuggestions = customerSuggestions.length > 0;
			
			// If exact match found, auto-select
			const exactEmailMatch = customers.items.find(c => 
				c.email && c.email.toLowerCase() === value.toLowerCase()
			);
			const exactPhoneMatch = customers.items.find(c => 
				c.phone && c.phone.toString().includes(value.replace(/\D/g, ''))
			);
			
			if (exactEmailMatch) {
				selectCustomer(exactEmailMatch);
				return;
			}
			
			if (exactPhoneMatch) {
				selectCustomer(exactPhoneMatch);
				return;
			}

		} catch (err) {
			console.error('Error searching customers:', err);
			console.error('Search value:', value);
			console.error('Filter used:', `(name ?~ "${value.toLowerCase()}" || email ?~ "${value.toLowerCase()}" || phone ?~ "${value}") && role = "customer"`);
			customerSuggestions = [];
			showSuggestions = false;
		} finally {
			isSearching = false;
		}
	}

	function selectCustomer(selectedCustomer) {
		customer = selectedCustomer;
		customerForm.name = customer.name;
		customerForm.email = customer.email;
		customerForm.phone = customer.phone?.toString() || '';
		isNewCustomer = false;
		showSuggestions = false;
		customerSuggestions = [];
		success = 'Customer selected!';
		error = '';
	}

	function clearCustomerSearch() {
		customerForm = {
			name: '',
			email: '',
			phone: '',
			password: 'temp123',
			passwordConfirm: 'temp123'
		};
		customer = null;
		isNewCustomer = false;
		customerSuggestions = [];
		showSuggestions = false;
		success = '';
		error = '';
	}

	// Close suggestions when clicking outside
	function handleClickOutside() {
		showSuggestions = false;
	}

	// Customer management
	async function searchCustomer() {
		if (!customerForm.email && !customerForm.phone) {
			error = 'Please enter email or phone number';
			return;
		}

		loading = true;
		error = '';
		
		try {
			let filter = '';
			if (customerForm.email) {
				filter = `email = "${customerForm.email}" && role = "customer"`;
			} else if (customerForm.phone) {
				const cleanPhone = customerForm.phone.replace(/\D/g, '');
				filter = `phone ?~ "${cleanPhone}" && role = "customer"`;
			}

			const customers = await pb.collection('users').getList(1, 1, {
				filter: filter
			});

			if (customers.items.length > 0) {
				customer = customers.items[0];
				customerForm.name = customer.name;
				customerForm.email = customer.email;
				customerForm.phone = customer.phone?.toString() || '';
				isNewCustomer = false;
				success = 'Customer found!';
			} else {
				isNewCustomer = true;
				customer = null;
				success = 'Customer not found. Please fill in details to create new customer.';
			}
		} catch (err) {
			console.error('Error searching customer:', err);
			error = 'Failed to search customer';
		} finally {
			loading = false;
		}
	}

	async function createCustomer() {
		if (!customerForm.name || !customerForm.email) {
			error = 'Name and email are required';
			return;
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(customerForm.email)) {
			error = 'Please enter a valid email address';
			return;
		}

		loading = true;
		error = '';
		
		try {
			// Check if customer already exists
			const existingCustomers = await pb.collection('users').getList(1, 1, {
				filter: `email="${customerForm.email}"`
			});

			if (existingCustomers.items.length > 0) {
				customer = existingCustomers.items[0];
				customerForm.name = customer.name;
				customerForm.phone = customer.phone?.toString() || '';
				isNewCustomer = false;
				success = 'Customer found and selected!';
				loading = false;
				return;
			}

			// Generate unique username from email with better uniqueness
			const baseUsername = customerForm.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
			const timestamp = Date.now().toString();
			const randomSuffix = Math.random().toString(36).substring(2, 8);
			let username = baseUsername + timestamp.slice(-6) + randomSuffix;

			// Double-check username uniqueness
			try {
				const existingUsername = await pb.collection('users').getList(1, 1, {
					filter: `username="${username}"`
				});
				
				if (existingUsername.items.length > 0) {
					// If username exists, add another random suffix
					const extraSuffix = Math.random().toString(36).substring(2, 6);
					username = username + extraSuffix;
				}
			} catch (usernameCheckError) {
				console.warn('Could not check username uniqueness:', usernameCheckError);
				// Continue anyway, the create call will handle any conflicts
			}

			// Prepare user data with minimal required fields first
			const data = {
				username: username,
				email: customerForm.email,
				emailVisibility: true,
				password: customerForm.password,
				passwordConfirm: customerForm.passwordConfirm,
				name: customerForm.name.trim()
			};

			// Add phone as string if provided and not empty
			if (customerForm.phone && customerForm.phone.trim()) {
				// Clean the phone number but keep it as string
				const cleanPhone = customerForm.phone.replace(/\D/g, '');
				if (cleanPhone.length > 0) {
					data.phone = cleanPhone;
				}
			}

			console.log('Creating customer with data:', data);
			console.log('Email validation passed:', emailRegex.test(customerForm.email));
			console.log('Phone data:', customerForm.phone, 'cleaned:', data.phone);
			
			// Try to create the record using PocketBase
			try {
				// First attempt with role field
				data.role = "customer";
				const record = await pb.collection('users').create(data);
				console.log('Customer created successfully with role:', record);
				customer = record;
				isNewCustomer = false;
				success = 'Customer created successfully!';
				
			} catch (roleError) {
				console.log('Failed with role field, trying without:', roleError);
				
				// Try without role field
				delete data.role;
				try {
					const record = await pb.collection('users').create(data);
					console.log('Customer created successfully without role:', record);
					customer = record;
					isNewCustomer = false;
					success = 'Customer created successfully!';
					
				} catch (noRoleError) {
					console.log('Failed without role, trying alternative role values:', noRoleError);
					
					// Try alternative role values
					const roleAlternatives = ['user', 'client', 'member'];
					let customerCreated = false;
					
					for (const role of roleAlternatives) {
						try {
							data.role = role;
							const record = await pb.collection('users').create(data);
							console.log(`Customer created with role ${role}:`, record);
							customer = record;
							isNewCustomer = false;
							success = 'Customer created successfully!';
							customerCreated = true;
							break;
						} catch (altRoleError) {
							console.log(`Failed with role ${role}:`, altRoleError.message);
						}
					}
					
					if (!customerCreated) {
						throw noRoleError; // Re-throw the original error
					}
				}
			}
			
			// Optionally send email verification (commented out for now)
			// await pb.collection('users').requestVerification(customerForm.email);
			
			// Optionally send email verification (commented out for now)
			// await pb.collection('users').requestVerification(customerForm.email);
			
			// Clear the new customer form
			customerForm = {
				name: customer.name,
				email: customer.email,
				phone: customer.phone?.toString() || '',
				password: 'temp123',
				passwordConfirm: 'temp123'
			};
			
		} catch (err) {
			console.error('Error creating customer:', err);
			console.error('Error details:', err.response?.data);
			console.error('Full error object:', err);
			console.error('Customer data being sent:', {
				username: data?.username,
				email: data?.email,
				name: data?.name,
				role: data?.role || 'not set',
				phone: data?.phone || 'not provided'
			});
			
			// More specific error handling
			if (err.response?.data) {
				const errorData = err.response.data;
				if (errorData.email) {
					error = 'Email error: ' + (errorData.email.message || 'Invalid email or email already exists');
				} else if (errorData.username) {
					error = 'Username error: ' + (errorData.username.message || 'Username already exists') + ' (Generated username: ' + (data?.username || 'unknown') + ')';
				} else if (errorData.phone) {
					error = 'Phone error: ' + (errorData.phone.message || 'Invalid phone number');
				} else if (errorData.role) {
					error = 'Role error: ' + (errorData.role.message || 'Invalid role value');
				} else {
					error = 'Failed to create customer: ' + (err.message || JSON.stringify(errorData));
				}
			} else if (err.name === 'TypeError' || err.message.includes('fetch')) {
				error = 'Connection error: Unable to reach the server. Please check your internet connection.';
			} else {
				error = 'Failed to create customer: ' + (err.message || 'Unknown error occurred');
			}
		} finally {
			loading = false;
		}
	}

	async function proceedToAddItems() {
		// Check if we have a selected customer
		if (customer) {
			currentStep = ORDER_STEPS.ADD_ITEMS;
			error = '';
			success = '';
			return;
		}

		// Check if we have new customer data filled but not created yet
		if (isNewCustomer && customerForm.name && customerForm.email) {
			await createCustomer();
			if (customer) {
				currentStep = ORDER_STEPS.ADD_ITEMS;
				error = '';
				success = '';
			}
			return;
		}

		// Show error if neither condition is met
		error = 'Please select an existing customer or create a new customer first';
	}

	// Product and order item management
	$: filteredProducts = products.filter(product => {
		const matchesSearch = searchTerm === '' || 
			product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			product.description?.toLowerCase().includes(searchTerm.toLowerCase());
		
		const matchesCategory = selectedCategory === '' || 
			product.expand?.category_id?.id === selectedCategory;
		
		return matchesSearch && matchesCategory && product.stock > 0;
	});

	function addItemToOrder(product) {
		const existingItem = orderItems.find(item => item.product_id === product.id);
		
		if (existingItem) {
			if (existingItem.quantity < product.stock) {
				existingItem.quantity += 1;
				existingItem.total = existingItem.quantity * existingItem.price;
			} else {
				error = 'Not enough stock available';
				setTimeout(() => error = '', 3000);
				return;
			}
		} else {
			orderItems.push({
				product_id: product.id,
				product_name: product.name,
				price: product.price,
				quantity: 1,
				total: product.price,
				max_stock: product.stock
			});
		}
		orderItems = [...orderItems];
		calculateTotals();
		error = '';
	}

	function updateItemQuantity(index, newQuantity) {
		if (newQuantity <= 0) {
			removeItem(index);
			return;
		}
		
		const item = orderItems[index];
		if (newQuantity > item.max_stock) {
			error = 'Not enough stock available';
			setTimeout(() => error = '', 3000);
			return;
		}
		
		item.quantity = newQuantity;
		item.total = item.quantity * item.price;
		orderItems = [...orderItems];
		calculateTotals();
	}

	function removeItem(index) {
		orderItems.splice(index, 1);
		orderItems = [...orderItems];
		calculateTotals();
	}

	function calculateTotals() {
		subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
		total = subtotal + shippingCost - discount;
	}

	function proceedToPayment() {
		if (orderItems.length === 0) {
			error = 'Please add at least one item to the order';
			return;
		}
		calculateTotals();
		currentStep = ORDER_STEPS.PAYMENT;
		error = '';
	}

	// Payment processing
	async function processPayment() {
		if (paymentMethod === 'cash') {
			if (amountReceived < total) {
				error = 'Amount received is less than total';
				return;
			}
		}

		// Validate required data
		if (!customer || !customer.id) {
			error = 'No customer selected';
			return;
		}

		if (!cashier || !cashier.id) {
			error = 'No cashier information available';
			return;
		}

		if (orderItems.length === 0) {
			error = 'No items in order';
			return;
		}

		loading = true;
		error = '';
		
		try {
			// Prepare shipping address as proper JSON string
			const shippingAddressJson = JSON.stringify({
				street: shippingAddress.street || '',
				city: shippingAddress.city || '',
				county: shippingAddress.county || '',
				postal_code: shippingAddress.postal_code || '',
				country: shippingAddress.country || 'Kenya'
			});

			// Create the order with minimal required fields first
			const orderData = {
				user_id: customer.id,
				subtotal: Number(subtotal) || 0,
				shipping_cost: Number(shippingCost) || 0,
				discount: Number(discount) || 0,
				total: Number(total) || 0,
				payment_method: paymentMethod,
				status: 'processing',
				shipping_address: shippingAddressJson,
				cashier_id: cashier.id
			};

			// Try to add payment_status and customer_type with fallbacks
			try {
				// First attempt with current logic
				orderData.payment_status = paymentMethod === 'cash' ? 'paid' : 'pending';
				orderData.customer_type = isNewCustomer ? 'new' : 'existing';
				
				console.log('Creating order with data:', orderData);
				console.log('Customer object:', customer);
				console.log('Cashier object:', cashier);
				console.log('Payment method:', paymentMethod);
				console.log('Is new customer:', isNewCustomer);
				
				currentOrder = await pb.collection('orders').create(orderData);
				console.log('Order created successfully:', currentOrder);
				
			} catch (fieldError) {
				console.log('First attempt failed, trying alternative values:', fieldError);
				
				// Try alternative payment status values
				const paymentStatusAlternatives = ['pending', 'paid', 'unpaid', 'completed'];
				const customerTypeAlternatives = ['new', 'existing', 'guest', 'regular'];
				
				let orderCreated = false;
				
				for (const payStatus of paymentStatusAlternatives) {
					if (orderCreated) break;
					for (const custType of customerTypeAlternatives) {
						try {
							orderData.payment_status = payStatus;
							orderData.customer_type = custType;
							
							console.log(`Trying payment_status: ${payStatus}, customer_type: ${custType}`);
							currentOrder = await pb.collection('orders').create(orderData);
							console.log('Order created successfully with alternative values:', currentOrder);
							orderCreated = true;
							break;
						} catch (altError) {
							console.log(`Failed with ${payStatus}/${custType}:`, altError.message);
						}
					}
				}
				
				if (!orderCreated) {
					// Try without these fields entirely
					delete orderData.payment_status;
					delete orderData.customer_type;
					console.log('Trying without problematic fields:', orderData);
					currentOrder = await pb.collection('orders').create(orderData);
					console.log('Order created without problematic fields:', currentOrder);
				}
			}

			// Create order items and update product stock
			for (const item of orderItems) {
				// Validate order item data
				if (!item.product_id || !item.quantity || !item.price) {
					throw new Error(`Invalid order item: ${JSON.stringify(item)}`);
				}

				// Create order item with proper data types
				console.log('Creating order item:', {
					order_id: currentOrder.id,
					product_id: item.product_id,
					quantity: Number(item.quantity),
					price: Number(item.price),
					total: Number(item.total)
				});

				await pb.collection('order_items').create({
					order_id: currentOrder.id,
					product_id: item.product_id,
					quantity: Number(item.quantity),
					price: Number(item.price),
					total: Number(item.total)
				});

				// Update product stock
				const product = products.find(p => p.id === item.product_id);
				if (product) {
					const newStock = product.stock - item.quantity;
					if (newStock < 0) {
						console.warn(`Warning: Stock will be negative for product ${product.name}`);
					}
					await pb.collection('products').update(item.product_id, {
						stock: newStock
					});
				} else {
					console.error(`Product not found for ID: ${item.product_id}`);
				}
			}

			// Prepare receipt data
			receiptData = {
				order: currentOrder,
				customer: customer,
				items: orderItems,
				cashier: cashier,
				totals: {
					subtotal,
					shippingCost,
					discount,
					total
				},
				payment: {
					method: paymentMethod,
					amountReceived: paymentMethod === 'cash' ? amountReceived : total,
					change: paymentMethod === 'cash' ? changeAmount : 0
				}
			};

			success = 'Order processed successfully!';
			currentStep = ORDER_STEPS.RECEIPT;
		} catch (err) {
			console.error('Error processing payment:', err);
			console.error('Error details:', err.response?.data);
			console.error('Order data that failed:', {
				user_id: customer?.id,
				cashier_id: cashier?.id,
				orderItems: orderItems.length
			});
			
			// More specific error handling
			if (err.response?.data) {
				const errorData = err.response.data;
				if (errorData.user_id) {
					error = 'Customer ID error: ' + (errorData.user_id.message || 'Invalid customer');
				} else if (errorData.cashier_id) {
					error = 'Cashier ID error: ' + (errorData.cashier_id.message || 'Invalid cashier');
				} else if (errorData.payment_method) {
					error = 'Payment method error: ' + (errorData.payment_method.message || 'Invalid payment method');
				} else if (errorData.total) {
					error = 'Total amount error: ' + (errorData.total.message || 'Invalid total');
				} else {
					error = 'Failed to create order: ' + JSON.stringify(errorData);
				}
			} else if (err.name === 'TypeError' || err.message.includes('fetch')) {
				error = 'Connection error: Unable to reach the server. Please check your internet connection.';
			} else {
				error = 'Failed to process payment: ' + (err.message || 'Unknown error');
			}
		} finally {
			loading = false;
		}
	}

	// Receipt functions
	function printReceipt() {
		window.print();
	}

	function startNewOrder() {
		// Reset all data
		currentStep = ORDER_STEPS.NEW_ORDER;
		currentOrder = null;
		orderItems = [];
		customer = null;
		isNewCustomer = false;
		customerForm = {
			name: '',
			email: '',
			phone: '',
			password: 'temp123',
			passwordConfirm: 'temp123'
		};
		paymentMethod = 'cash';
		paymentStatus = 'pending';
		shippingAddress = {
			street: '',
			city: '',
			county: '',
			postal_code: '',
			country: 'Kenya'
		};
		receiptData = null;
		subtotal = 0;
		shippingCost = 0;
		discount = 0;
		total = 0;
		amountReceived = 0;
		changeAmount = 0;
		searchTerm = '';
		selectedCategory = '';
		error = '';
		success = '';
	}

	function goBack() {
		error = '';
		success = '';
		if (currentStep === ORDER_STEPS.ADD_ITEMS) {
			currentStep = ORDER_STEPS.NEW_ORDER;
		} else if (currentStep === ORDER_STEPS.PAYMENT) {
			currentStep = ORDER_STEPS.ADD_ITEMS;
		}
	}

	// Utility functions
	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES'
		}).format(amount);
	}

	function formatDate(date) {
		return new Date(date).toLocaleDateString('en-KE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Order Management - Manager Dashboard</title>
</svelte:head>

<!-- Global click handler to close suggestions -->
<svelte:window on:click={handleClickOutside} />

<div class="min-h-screen bg-slate-50">
	<!-- Minimal Header -->
	<div class="bg-white border-b border-slate-200">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 py-4">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-xl font-semibold text-slate-900">New Order</h1>
					<p class="text-sm text-slate-500 hidden sm:block">Process customer orders</p>
				</div>
				{#if cashier}
					<div class="text-right">
						<p class="text-sm font-medium text-slate-900">{cashier.name}</p>
						<p class="text-xs text-slate-500 hidden sm:block">Cashier</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Progress Steps - Minimal Design -->
	<div class="bg-white border-b border-slate-200">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 py-4">
			<div class="flex items-center justify-between sm:justify-start sm:space-x-8 overflow-x-auto">
				<!-- Step 1 -->
				<div class="flex items-center flex-shrink-0">
					<div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
						{currentStep === ORDER_STEPS.NEW_ORDER ? 'bg-blue-600 text-white' : 
						 currentStep === ORDER_STEPS.ADD_ITEMS || currentStep === ORDER_STEPS.PAYMENT || currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
						1
					</div>
					<span class="ml-2 text-sm font-medium {currentStep === ORDER_STEPS.NEW_ORDER ? 'text-blue-600' : 
						currentStep === ORDER_STEPS.ADD_ITEMS || currentStep === ORDER_STEPS.PAYMENT || currentStep === ORDER_STEPS.RECEIPT ? 'text-emerald-600' : 'text-slate-400'} hidden sm:inline">
						Customer
					</span>
				</div>
				
				<div class="w-6 sm:w-12 h-px {currentStep === ORDER_STEPS.ADD_ITEMS || currentStep === ORDER_STEPS.PAYMENT || currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500' : 'bg-slate-200'}"></div>
				
				<!-- Step 2 -->
				<div class="flex items-center flex-shrink-0">
					<div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
						{currentStep === ORDER_STEPS.ADD_ITEMS ? 'bg-blue-600 text-white' : 
						 currentStep === ORDER_STEPS.PAYMENT || currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
						2
					</div>
					<span class="ml-2 text-sm font-medium {currentStep === ORDER_STEPS.ADD_ITEMS ? 'text-blue-600' : 
						currentStep === ORDER_STEPS.PAYMENT || currentStep === ORDER_STEPS.RECEIPT ? 'text-emerald-600' : 'text-slate-400'} hidden sm:inline">
						Items
					</span>
				</div>
				
				<div class="w-6 sm:w-12 h-px {currentStep === ORDER_STEPS.PAYMENT || currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500' : 'bg-slate-200'}"></div>
				
				<!-- Step 3 -->
				<div class="flex items-center flex-shrink-0">
					<div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
						{currentStep === ORDER_STEPS.PAYMENT ? 'bg-blue-600 text-white' : 
						 currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
						3
					</div>
					<span class="ml-2 text-sm font-medium {currentStep === ORDER_STEPS.PAYMENT ? 'text-blue-600' : 
						currentStep === ORDER_STEPS.RECEIPT ? 'text-emerald-600' : 'text-slate-400'} hidden sm:inline">
						Payment
					</span>
				</div>
				
				<div class="w-6 sm:w-12 h-px {currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500' : 'bg-slate-200'}"></div>
				
				<!-- Step 4 -->
				<div class="flex items-center flex-shrink-0">
					<div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
						{currentStep === ORDER_STEPS.RECEIPT ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
						4
					</div>
					<span class="ml-2 text-sm font-medium {currentStep === ORDER_STEPS.RECEIPT ? 'text-emerald-600' : 'text-slate-400'} hidden sm:inline">
						Receipt
					</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Alerts -->
	{#if error}
		<div class="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
				{error}
			</div>
		</div>
	{/if}

	{#if success}
		<div class="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
			<div class="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
				{success}
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	<div class="max-w-6xl mx-auto px-4 sm:px-6 py-6">
		{#if currentStep === ORDER_STEPS.NEW_ORDER}
			<!-- Step 1: Customer Selection - Two Column Layout -->
			<div class="max-w-6xl mx-auto">
				<div class="text-center mb-8">
					<h2 class="text-2xl font-semibold text-slate-900 mb-2">Select Customer</h2>
					<p class="text-slate-500">Find existing customer or create a new one</p>
				</div>

				<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<!-- Left Side: Search Existing Customer -->
					<div class="bg-white rounded-xl border border-slate-200 p-6">
						<div class="flex items-center mb-6">
							<svg class="h-6 w-6 text-blue-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							<h3 class="text-lg font-semibold text-slate-900">Find Existing Customer</h3>
						</div>
						
						<div class="relative mb-4">
							<input
								type="text"
								bind:value={customerForm.name}
								on:input={(e) => handleCustomerInput('name', e.target.value)}
								on:focus={() => customerForm.name.length >= 2 && (showSuggestions = true)}
								on:click|stopPropagation
								placeholder="Search by name, email, or phone..."
								class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								disabled={customer && !isNewCustomer}
							/>
							{#if isSearching}
								<div class="absolute right-4 top-3 text-slate-400">
									<svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
								</div>
							{/if}

							<!-- Search Results -->
							{#if showSuggestions && customerSuggestions.length > 0}
								<div 
									class="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 overflow-hidden max-h-80 overflow-y-auto"
									on:click|stopPropagation
								>
									<div class="p-3 bg-slate-50 border-b border-slate-200">
										<p class="text-xs font-medium text-slate-600 uppercase tracking-wide">
											{customerSuggestions.length} customers found
										</p>
									</div>
									{#each customerSuggestions as suggestion}
										<button
											type="button"
											on:click={() => selectCustomer(suggestion)}
											class="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors group"
										>
											<div class="flex items-center justify-between">
												<div class="min-w-0 flex-1">
													<p class="font-medium text-slate-900 group-hover:text-blue-900">{suggestion.name}</p>
													<p class="text-sm text-slate-600">{suggestion.email}</p>
													{#if suggestion.phone}
														<p class="text-xs text-slate-500">{suggestion.phone}</p>
													{/if}
												</div>
												<svg class="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
												</svg>
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Selected Customer Display -->
						{#if customer && !isNewCustomer}
							<div class="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
								<div class="flex items-start">
									<div class="flex-shrink-0">
										<svg class="h-5 w-5 text-emerald-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<div class="ml-3 flex-1">
										<h4 class="font-medium text-emerald-900">{customer.name}</h4>
										<p class="text-emerald-700 text-sm">{customer.email}</p>
										{#if customer.phone}
											<p class="text-emerald-600 text-xs">{customer.phone}</p>
										{/if}
										<p class="text-emerald-600 text-xs mt-1">✓ Customer selected</p>
									</div>
									<button
										on:click={clearCustomerSearch}
										class="text-emerald-600 hover:text-emerald-800"
									>
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
							</div>
						{:else if customerForm.name.length >= 2 && customerSuggestions.length === 0 && !isSearching}
							<div class="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
								<svg class="h-8 w-8 text-slate-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
								</svg>
								<p class="text-sm text-slate-600 font-medium">No customers found</p>
								<p class="text-xs text-slate-500">Create a new customer instead →</p>
							</div>
						{/if}
					</div>

					<!-- Right Side: Create New Customer -->
					<div class="bg-white rounded-xl border border-slate-200 p-6">
						<div class="flex items-center mb-6">
							<svg class="h-6 w-6 text-green-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
							</svg>
							<h3 class="text-lg font-semibold text-slate-900">Create New Customer</h3>
						</div>

						<div class="space-y-4">
							<div>
								<label for="new-name" class="block text-sm font-medium text-slate-700 mb-2">
									Full Name *
								</label>
								<input
									id="new-name"
									type="text"
									bind:value={customerForm.name}
									on:input={() => { customer = null; isNewCustomer = true; }}
									placeholder="John Doe"
									class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
								/>
							</div>

							<div>
								<label for="new-email" class="block text-sm font-medium text-slate-700 mb-2">
									Email Address *
								</label>
								<input
									id="new-email"
									type="email"
									bind:value={customerForm.email}
									on:input={() => { customer = null; isNewCustomer = true; }}
									placeholder="john@example.com"
									class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
								/>
							</div>

							<div>
								<label for="new-phone" class="block text-sm font-medium text-slate-700 mb-2">
									Phone Number
								</label>
								<input
									id="new-phone"
									type="tel"
									bind:value={customerForm.phone}
									on:input={() => { customer = null; isNewCustomer = true; }}
									placeholder="+254700000000"
									class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
								/>
							</div>

							<!-- New Customer Preview -->
							{#if isNewCustomer && customerForm.name && customerForm.email}
								<div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
									<div class="flex items-start">
										<div class="flex-shrink-0">
											<svg class="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
											</svg>
										</div>
										<div class="ml-3">
											<h4 class="font-medium text-blue-900">New Customer</h4>
											<p class="text-blue-700 text-sm">{customerForm.name}</p>
											<p class="text-blue-700 text-sm">{customerForm.email}</p>
											{#if customerForm.phone}
												<p class="text-blue-600 text-xs">{customerForm.phone}</p>
											{/if}
											<p class="text-blue-600 text-xs mt-1">Ready to create account</p>
										</div>
									</div>
								</div>
							{/if}

							<button
								on:click={createCustomer}
								disabled={loading || !customerForm.name || !customerForm.email}
								class="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
							>
								{loading ? 'Creating...' : 'Create Customer'}
							</button>
						</div>
					</div>
				</div>

				<!-- Continue Button -->
				<div class="mt-8 text-center">
					<button
						on:click={proceedToAddItems}
						disabled={loading || (!customer && !isNewCustomer)}
						class="px-12 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-lg"
					>
						{loading ? 'Processing...' : 'Continue to Add Items →'}
					</button>
				</div>
			</div>

		{:else if currentStep === ORDER_STEPS.ADD_ITEMS}
			<!-- Step 2: Add Items - Modern POS Style -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Product Selection -->
				<div class="lg:col-span-2 order-2 lg:order-1">
					<div class="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
						<!-- Search and Filter Bar -->
						<div class="mb-6">
							<div class="flex flex-col sm:flex-row gap-4">
								<div class="flex-1">
									<input
										type="text"
										bind:value={searchTerm}
										placeholder="Search products..."
										class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								<div class="w-full sm:w-48">
									<select
										bind:value={selectedCategory}
										class="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									>
										<option value="">All Categories</option>
										{#each categories as category}
											<option value={category.id}>{category.name}</option>
										{/each}
									</select>
								</div>
							</div>
						</div>

						<!-- Products Grid -->
						{#if filteredProducts.length === 0}
							<div class="text-center py-12">
								<svg class="h-12 w-12 text-slate-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
								</svg>
								<p class="text-slate-500">No products found</p>
							</div>
						{:else}
							<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
								{#each filteredProducts as product}
									<button
										on:click={() => addItemToOrder(product)}
										class="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group text-left"
									>
										<div class="flex justify-between items-start mb-2">
											<h3 class="font-medium text-slate-900 group-hover:text-blue-900 text-sm leading-tight flex-1 pr-2">{product.name}</h3>
											<span class="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded flex-shrink-0">
												{product.stock}
											</span>
										</div>
										{#if product.description}
											<p class="text-xs text-slate-600 mb-3 line-clamp-2">{product.description}</p>
										{/if}
										<div class="flex justify-between items-center mb-2">
											<span class="font-semibold text-emerald-600">{formatCurrency(product.price)}</span>
											<div class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium group-hover:bg-blue-700 transition-colors">
												Add
											</div>
										</div>
										{#if product.expand?.category_id}
											<span class="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
												{product.expand.category_id.name}
											</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Order Summary - Mobile Optimized -->
				<div class="order-1 lg:order-2">
					<div class="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 lg:sticky lg:top-6">
						<!-- Customer Info -->
						{#if customer}
							<div class="mb-6 p-3 sm:p-4 bg-slate-50 rounded-lg">
								<h4 class="font-medium text-slate-900 mb-1 text-sm sm:text-base">{customer.name}</h4>
								<p class="text-sm text-slate-600">{customer.email}</p>
							</div>
						{/if}

						<h3 class="text-lg font-semibold text-slate-900 mb-4">Order Summary</h3>
						
						{#if orderItems.length === 0}
							<div class="text-center py-6 sm:py-8">
								<svg class="h-10 w-10 sm:h-12 sm:w-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
								</svg>
								<p class="text-slate-500 text-sm">No items added</p>
							</div>
						{:else}
							<!-- Order Items -->
							<div class="space-y-3 mb-6 max-h-48 sm:max-h-64 overflow-y-auto">
								{#each orderItems as item, index}
									<div class="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
										<div class="flex-1 min-w-0">
											<p class="font-medium text-slate-900 text-sm truncate">{item.product_name}</p>
											<p class="text-xs text-slate-600">{formatCurrency(item.price)} each</p>
										</div>
										<div class="flex items-center space-x-1 sm:space-x-2 ml-3">
											<button
												on:click={() => updateItemQuantity(index, item.quantity - 1)}
												class="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 text-xs flex items-center justify-center"
											>
												−
											</button>
											<span class="text-sm font-medium w-6 text-center">{item.quantity}</span>
											<button
												on:click={() => updateItemQuantity(index, item.quantity + 1)}
												class="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 text-xs flex items-center justify-center"
											>
												+
											</button>
											<button
												on:click={() => removeItem(index)}
												class="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-red-100 text-red-600 hover:bg-red-200 text-xs flex items-center justify-center ml-1"
											>
												×
											</button>
										</div>
									</div>
								{/each}
							</div>

							<!-- Totals -->
							<div class="border-t border-slate-200 pt-4 space-y-3">
								<div class="flex flex-col sm:flex-row sm:justify-between text-sm gap-2">
									<span class="text-slate-600">Subtotal:</span>
									<span class="font-medium">{formatCurrency(subtotal)}</span>
								</div>
								
								<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm gap-2">
									<span class="text-slate-600">Shipping:</span>
									<input
										type="number"
										bind:value={shippingCost}
										on:input={calculateTotals}
										min="0"
										step="0.01"
										class="w-full sm:w-20 text-right px-2 py-1 border border-slate-300 rounded text-sm"
									/>
								</div>
								
								<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm gap-2">
									<span class="text-slate-600">Discount:</span>
									<input
										type="number"
										bind:value={discount}
										on:input={calculateTotals}
										min="0"
										step="0.01"
										class="w-full sm:w-20 text-right px-2 py-1 border border-slate-300 rounded text-sm"
									/>
								</div>
								
								<div class="flex justify-between font-semibold text-lg border-t border-slate-200 pt-3">
									<span>Total:</span>
									<span class="text-emerald-600">{formatCurrency(total)}</span>
								</div>
							</div>
						{/if}

						<!-- Action Buttons -->
						<div class="mt-6 space-y-3">
							<button
								on:click={goBack}
								class="w-full py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
							>
								← Back to Items
							</button>
							<button
								on:click={proceedToPayment}
								disabled={orderItems.length === 0}
								class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
							>
								Continue to Payment →
							</button>
						</div>
					</div>
				</div>
			</div>

		{:else if currentStep === ORDER_STEPS.PAYMENT}
			<!-- Step 3: Payment - Cash-Optimized -->
			<div class="max-w-4xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<!-- Payment Method & Cash Handling -->
					<div class="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
						<h2 class="text-xl font-semibold text-slate-900 mb-6">Payment Method</h2>
						
						<!-- Payment Method Selection -->
						<div class="mb-6">
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<button
									on:click={() => paymentMethod = 'cash'}
									class="p-4 border-2 rounded-lg text-left transition-all {paymentMethod === 'cash' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}"
								>
									<div class="flex items-center">
										<div class="w-4 h-4 rounded-full border-2 mr-3 {paymentMethod === 'cash' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}">
											{#if paymentMethod === 'cash'}
												<div class="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
											{/if}
										</div>
										<div>
											<p class="font-medium text-slate-900">Cash</p>
											<p class="text-xs text-slate-600">Instant payment</p>
										</div>
									</div>
								</button>
								
								<button
									on:click={() => paymentMethod = 'mpesa'}
									class="p-4 border-2 rounded-lg text-left transition-all {paymentMethod === 'mpesa' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}"
								>
									<div class="flex items-center">
										<div class="w-4 h-4 rounded-full border-2 mr-3 {paymentMethod === 'mpesa' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}">
											{#if paymentMethod === 'mpesa'}
												<div class="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
											{/if}
										</div>
										<div>
											<p class="font-medium text-slate-900">M-Pesa</p>
											<p class="text-xs text-slate-600">Mobile payment</p>
										</div>
									</div>
								</button>
							</div>
							
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
								<button
									on:click={() => paymentMethod = 'card'}
									class="p-4 border-2 rounded-lg text-left transition-all {paymentMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}"
								>
									<div class="flex items-center">
										<div class="w-4 h-4 rounded-full border-2 mr-3 {paymentMethod === 'card' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}">
											{#if paymentMethod === 'card'}
												<div class="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
											{/if}
										</div>
										<div>
											<p class="font-medium text-slate-900">Card</p>
											<p class="text-xs text-slate-600">Debit/Credit</p>
										</div>
									</div>
								</button>
								
								<button
									on:click={() => paymentMethod = 'bank_transfer'}
									class="p-4 border-2 rounded-lg text-left transition-all {paymentMethod === 'bank_transfer' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}"
								>
									<div class="flex items-center">
										<div class="w-4 h-4 rounded-full border-2 mr-3 {paymentMethod === 'bank_transfer' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}">
											{#if paymentMethod === 'bank_transfer'}
												<div class="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
											{/if}
										</div>
										<div>
											<p class="font-medium text-slate-900">Transfer</p>
											<p class="text-xs text-slate-600">Bank transfer</p>
										</div>
									</div>
								</button>
							</div>
						</div>

						<!-- Cash Payment Calculator -->
						{#if paymentMethod === 'cash'}
							<div class="p-4 bg-emerald-50 border border-emerald-200 rounded-lg mb-6">
								<h3 class="font-medium text-emerald-900 mb-4">Cash Payment</h3>
								
								<div class="space-y-4">
									<div>
										<label for="amount-received" class="block text-sm font-medium text-emerald-800 mb-2">
											Amount Received
										</label>
										<div class="relative">
											<span class="absolute left-3 top-3 text-emerald-600 font-medium">KES</span>
											<input
												id="amount-received"
												type="number"
												bind:value={amountReceived}
												min="0"
												step="0.01"
												placeholder="0.00"
												class="w-full pl-12 pr-4 py-3 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg font-medium"
											/>
										</div>
									</div>
									
									<!-- Quick Amount Buttons -->
									<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
										{#each [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500] as quickAmount}
											<button
												on:click={() => amountReceived = quickAmount}
												class="px-3 py-2 text-sm bg-white border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50 transition-colors"
											>
												{formatCurrency(quickAmount)}
											</button>
										{/each}
									</div>
									
									{#if amountReceived > 0}
										<div class="pt-3 border-t border-emerald-200">
											<div class="flex justify-between items-center mb-2">
												<span class="text-emerald-800 font-medium">Total:</span>
												<span class="text-lg font-semibold text-emerald-900">{formatCurrency(total)}</span>
											</div>
											<div class="flex justify-between items-center mb-2">
												<span class="text-emerald-800 font-medium">Received:</span>
												<span class="text-lg font-semibold text-emerald-900">{formatCurrency(amountReceived)}</span>
											</div>
											<div class="flex justify-between items-center pt-2 border-t border-emerald-200">
												<span class="text-emerald-800 font-medium">Change:</span>
												<span class="text-xl font-bold {changeAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}">
													{formatCurrency(Math.max(0, changeAmount))}
												</span>
											</div>
											{#if changeAmount < 0}
												<p class="text-red-600 text-sm mt-2">
													⚠️ Insufficient payment: {formatCurrency(Math.abs(changeAmount))} short
												</p>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Shipping Address (simplified) -->
						<div class="space-y-4">
							<h3 class="font-medium text-slate-900">Delivery Address</h3>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<input
									type="text"
									bind:value={shippingAddress.city}
									placeholder="City"
									class="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								/>
								<input
									type="text"
									bind:value={shippingAddress.county}
									placeholder="County"
									class="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							<input
								type="text"
								bind:value={shippingAddress.street}
								placeholder="Street address (optional)"
								class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							/>
						</div>
					</div>

					<!-- Order Summary -->
					<div class="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
						<h3 class="text-xl font-semibold text-slate-900 mb-6">Order Summary</h3>
						
						<!-- Customer Info -->
						{#if customer}
							<div class="mb-6 p-4 bg-slate-50 rounded-lg">
								<h4 class="font-medium text-slate-900 mb-1">{customer.name}</h4>
								<p class="text-sm text-slate-600">{customer.email}</p>
								{#if customer.phone}
									<p class="text-sm text-slate-600">{customer.phone}</p>
								{/if}
							</div>
						{/if}

						<!-- Order Items -->
						<div class="mb-6">
							<h4 class="font-medium text-slate-900 mb-3">Items ({orderItems.length})</h4>
							<div class="space-y-2 max-h-40 overflow-y-auto">
								{#each orderItems as item}
									<div class="flex justify-between text-sm py-2 border-b border-slate-100">
										<div>
											<span class="font-medium">{item.product_name}</span>
											<span class="text-slate-600">× {item.quantity}</span>
										</div>
										<span class="font-medium">{formatCurrency(item.total)}</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Totals -->
						<div class="border-t border-slate-200 pt-4 space-y-2">
							<div class="flex justify-between text-sm">
								<span class="text-slate-600">Subtotal:</span>
								<span class="font-medium">{formatCurrency(subtotal)}</span>
							</div>
							{#if shippingCost > 0}
								<div class="flex justify-between text-sm">
									<span class="text-slate-600">Shipping:</span>
									<span class="font-medium">{formatCurrency(shippingCost)}</span>
								</div>
							{/if}
							{#if discount > 0}
								<div class="flex justify-between text-sm">
									<span class="text-slate-600">Discount:</span>
									<span class="font-medium text-emerald-600">-{formatCurrency(discount)}</span>
								</div>
							{/if}
							<div class="flex justify-between font-semibold text-xl border-t border-slate-200 pt-3">
								<span>Total:</span>
								<span class="text-emerald-600">{formatCurrency(total)}</span>
							</div>
						</div>

						<!-- Payment Actions -->
						<div class="mt-8 space-y-3">
							<button
								on:click={goBack}
								class="w-full py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
							>
								← Back to Items
							</button>
							<button
								on:click={processPayment}
								disabled={loading || (paymentMethod === 'cash' && amountReceived < total)}
								class="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-lg"
							>
								{#if loading}
									Processing...
								{:else if paymentMethod === 'cash'}
									Complete Cash Sale
								{:else}
									Process Payment
								{/if}
							</button>
						</div>
					</div>
				</div>
			</div>

		{:else if currentStep === ORDER_STEPS.RECEIPT}
			<!-- Step 4: Receipt - Clean & Modern -->
			<div class="max-w-2xl mx-auto">
				<div class="bg-white rounded-xl border border-slate-200 p-8 text-center print:shadow-none print:p-4">
					<!-- Success Icon -->
					<div class="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 print:hidden">
						<svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
						</svg>
					</div>
					
					<h2 class="text-2xl font-semibold text-slate-900 mb-2 print:text-xl">Order Complete!</h2>
					<p class="text-slate-600 mb-8 print:text-sm print:mb-4">Payment processed successfully</p>

					<!-- Order Details -->
					<div class="bg-slate-50 rounded-xl p-6 mb-8 text-left print:bg-white print:border print:border-slate-200">
						<div class="flex justify-between items-center mb-4">
							<h3 class="text-lg font-semibold text-slate-900 print:text-base">Order #{receiptData?.order?.id || 'N/A'}</h3>
							<span class="text-sm text-slate-600 print:text-xs">{receiptData?.order ? formatDate(receiptData.order.created) : new Date().toLocaleDateString()}</span>
						</div>
						
						<!-- Customer Info -->
						{#if receiptData?.customer}
							<div class="mb-4 pb-4 border-b border-slate-200">
								<h4 class="font-medium text-slate-900 mb-1 print:text-sm">Customer</h4>
								<p class="text-sm text-slate-600 print:text-xs">{receiptData.customer.name}</p>
								<p class="text-sm text-slate-600 print:text-xs">{receiptData.customer.email}</p>
								{#if receiptData.customer.phone}
									<p class="text-sm text-slate-600 print:text-xs">{receiptData.customer.phone}</p>
								{/if}
							</div>
						{/if}

						<!-- Cashier Info -->
						{#if receiptData?.cashier}
							<div class="mb-4 pb-4 border-b border-slate-200">
								<h4 class="font-medium text-slate-900 mb-1 print:text-sm">Processed By</h4>
								<p class="text-sm text-slate-600 print:text-xs">{receiptData.cashier.name}</p>
								<p class="text-sm text-slate-600 print:text-xs">Cashier</p>
							</div>
						{/if}

						<!-- Payment Method -->
						<div class="mb-4 pb-4 border-b border-slate-200">
							<h4 class="font-medium text-slate-900 mb-1 print:text-sm">Payment Method</h4>
							<p class="text-sm text-slate-600 capitalize print:text-xs">{receiptData?.order?.payment_method?.replace('_', ' ') || paymentMethod.replace('_', ' ')}</p>
							{#if paymentMethod === 'cash' && amountReceived > 0}
								<div class="mt-2 text-sm print:text-xs">
									<div class="flex justify-between">
										<span class="text-slate-600">Amount Received:</span>
										<span class="font-medium text-slate-900">{formatCurrency(amountReceived)}</span>
									</div>
									{#if changeAmount > 0}
										<div class="flex justify-between">
											<span class="text-slate-600">Change Given:</span>
											<span class="font-medium text-emerald-600">{formatCurrency(changeAmount)}</span>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Order Items -->
						<div class="mb-4">
							<h4 class="font-medium text-slate-900 mb-3 print:text-sm print:mb-2">Items</h4>
							<div class="space-y-2">
								{#each (receiptData?.items || orderItems) as item}
									<div class="flex justify-between items-center py-2 border-b border-slate-200 print:py-1">
										<div class="flex-1">
											<span class="font-medium text-slate-900 print:text-sm">{item.product_name}</span>
											<div class="text-sm text-slate-600 print:text-xs">
												{formatCurrency(item.price)} × {item.quantity}
											</div>
										</div>
										<span class="font-medium text-slate-900 print:text-sm">{formatCurrency(item.total)}</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Totals -->
						<div class="border-t border-slate-200 pt-4 space-y-2 print:pt-2">
							<div class="flex justify-between text-sm print:text-xs">
								<span class="text-slate-600">Subtotal:</span>
								<span class="font-medium text-slate-900">{formatCurrency(receiptData?.totals?.subtotal || subtotal)}</span>
							</div>
							{#if (receiptData?.totals?.shippingCost || shippingCost) > 0}
								<div class="flex justify-between text-sm print:text-xs">
									<span class="text-slate-600">Shipping:</span>
									<span class="font-medium text-slate-900">{formatCurrency(receiptData?.totals?.shippingCost || shippingCost)}</span>
								</div>
							{/if}
							{#if (receiptData?.totals?.discount || discount) > 0}
								<div class="flex justify-between text-sm print:text-xs">
									<span class="text-slate-600">Discount:</span>
									<span class="font-medium text-emerald-600">-{formatCurrency(receiptData?.totals?.discount || discount)}</span>
								</div>
							{/if}
							<div class="flex justify-between font-bold text-lg border-t border-slate-200 pt-3 print:text-base print:pt-1">
								<span class="text-slate-900">Total Paid:</span>
								<span class="text-emerald-600">{formatCurrency(receiptData?.totals?.total || total)}</span>
							</div>
						</div>

						<!-- Order Status -->
						<div class="mt-6 pt-4 border-t border-slate-200 print:mt-4 print:pt-2">
							<div class="text-sm text-slate-600 print:text-xs">
								<p><strong>Payment Status:</strong> {receiptData?.order?.payment_status?.toUpperCase() || 'COMPLETED'}</p>
								<p><strong>Order Status:</strong> {receiptData?.order?.status?.toUpperCase() || 'PENDING'}</p>
							</div>
						</div>

						<!-- Thank You Message -->
						<div class="mt-6 text-center print:mt-4">
							<p class="text-slate-600 print:text-xs">Thank you for your purchase!</p>
						</div>
					</div>

					<!-- Action Buttons -->
					<div class="space-y-3 print:hidden">
						<button
							on:click={startNewOrder}
							class="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors text-lg"
						>
							New Order
						</button>
						<button
							on:click={() => window.print()}
							class="w-full border border-slate-300 text-slate-700 py-3 rounded-lg hover:bg-slate-50 font-medium transition-colors"
						>
							Print Receipt
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	@media print {
		body { margin: 0; }
		.print\:hidden { display: none !important; }
		.print\:shadow-none { box-shadow: none !important; }
		.print\:p-4 { padding: 1rem !important; }
		.print\:mb-4 { margin-bottom: 1rem !important; }
		.print\:mb-2 { margin-bottom: 0.5rem !important; }
		.print\:mt-4 { margin-top: 1rem !important; }
		.print\:pt-2 { padding-top: 0.5rem !important; }
		.print\:pt-1 { padding-top: 0.25rem !important; }
		.print\:py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
		.print\:gap-4 { gap: 1rem !important; }
		.print\:text-xl { font-size: 1.25rem !important; }
		.print\:text-base { font-size: 1rem !important; }
		.print\:text-sm { font-size: 0.875rem !important; }
		.print\:text-xs { font-size: 0.75rem !important; }
	}

	/* Line clamp utility for text truncation */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>