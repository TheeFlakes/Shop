<script>
	import { onMount, onDestroy } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	import { goto } from '$app/navigation';
	import Chart from 'chart.js/auto';

	// State management
	let customers = [];
	let loyaltyTransactions = [];
	let supportTickets = [];
	let interactions = [];
	let selectedCustomer = null;
	let loading = false;
	let error = '';
	let successMessage = '';
	
	// Chart instances
	let revenueChart = null;
	let segmentChart = null;
	let engagementChart = null;
	let loyaltyChart = null;
	let chartElements = {};
	
	// Filters and search
	let searchTerm = '';
	let segmentFilter = 'all';
	let sortBy = 'created';
	let sortOrder = 'desc';
	let activeTab = 'overview';
	
	// Modal states
	let showCustomerModal = false;
	let showLoyaltyModal = false;
	let showMessageModal = false;
	let showInteractionModal = false;
	let showSupportModal = false;
	let editingCustomer = null;
	
	// Form data
	let customerForm = {
		username: '',
		email: '',
		name: '',
		phone: '',
		role: 'customer',
		addresses: '',
		notes: '',
		segment: '',
		preferred_communication: 'email',
		payment_preference: 'mobile_money',
		social_media: '',
		decision_drivers: [],
		pain_points: '',
		trust_level: 'new'
	};
	
	let loyaltyForm = {
		user_id: '',
		points: 0,
		type: 'earned',
		order_id: '',
		description: ''
	};
	
	let interactionForm = {
		user_id: '',
		type: 'email',
		subject: '',
		content: '',
		outcome: 'positive',
		follow_up_required: false
	};
	
	let supportForm = {
		user_id: '',
		issue_type: 'product',
		priority: 'medium',
		description: '',
		status: 'open'
	};
	
	let messageForm = {
		subject: '',
		content: '',
		recipients: []
	};
	
	// Analytics data
	let analytics = {
		totalCustomers: 0,
		activeCustomers: 0,
		totalLoyaltyPoints: 0,
		avgOrderValue: 0,
		repeatPurchaseRate: 0,
		clv: 0,
		totalRevenue: 0,
		monthlyGrowth: 0,
		supportTickets: 0,
		customerSatisfaction: 0,
		conversionRate: 0,
		churnRate: 0
	};

	// Chart data
	let chartData = {
		revenue: { labels: [], data: [] },
		segments: { labels: [], data: [] },
		engagement: { labels: [], data: [] },
		loyalty: { labels: [], data: [] }
	};

	onMount(async () => {
		if (!pb?.authStore?.isValid) {
			goto('/login');
			return;
		}
		await loadData();
		initializeCharts();
	});

	onDestroy(() => {
		// Cleanup charts
		if (revenueChart) revenueChart.destroy();
		if (segmentChart) segmentChart.destroy();
		if (engagementChart) engagementChart.destroy();
		if (loyaltyChart) loyaltyChart.destroy();
	});

	async function loadData() {
		loading = true;
		try {
			// Load customers with expanded order data
			const customerData = await pb.collection('users').getList(1, 100, {
				filter: 'role = "customer"',
				expand: 'orders_via_user_id',
				sort: `-${sortBy}`
			});
			
			customers = customerData.items.map(customer => {
				const orders = customer.expand?.orders_via_user_id || [];
				const totalSpent = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
				const orderCount = orders.length;
				const lastOrderDate = orders.length > 0 ? 
					new Date(Math.max(...orders.map(o => new Date(o.created)))) : null;
				const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
				const daysSinceLastOrder = lastOrderDate ? 
					(new Date() - lastOrderDate) / (1000 * 60 * 60 * 24) : null;
				
				return {
					...customer,
					totalSpent,
					orderCount,
					lastOrderDate,
					avgOrderValue,
					daysSinceLastOrder,
					tier: getTier(totalSpent),
					segment: getSegment(customer, orders),
					riskLevel: getRiskLevel(daysSinceLastOrder, orderCount),
					engagementScore: getEngagementScore(customer, orders),
					lifetimeValue: calculateCLV(totalSpent, orderCount, daysSinceLastOrder)
				};
			});
			
			// Load loyalty transactions
			try {
				const loyaltyData = await pb.collection('loyalty_transactions').getList(1, 100, {
					expand: 'user_id',
					sort: '-created'
				});
				loyaltyTransactions = loyaltyData.items;
			} catch (err) {
				console.warn('Loyalty transactions not found:', err);
				loyaltyTransactions = [];
			}
			
			// Load support tickets (mock data if collection doesn't exist)
			try {
				const supportData = await pb.collection('support_tickets').getList(1, 50, {
					expand: 'user_id',
					sort: '-created'
				});
				supportTickets = supportData.items;
			} catch (err) {
				console.warn('Support tickets collection not found, using mock data');
				supportTickets = generateMockSupportData();
			}
			
			// Load customer interactions (mock data if collection doesn't exist)
			try {
				const interactionData = await pb.collection('customer_interactions').getList(1, 100, {
					expand: 'user_id',
					sort: '-created'
				});
				interactions = interactionData.items;
			} catch (err) {
				console.warn('Customer interactions collection not found, using mock data');
				interactions = generateMockInteractionData();
			}
			
			// Calculate analytics and prepare chart data
			calculateAnalytics();
			prepareChartData();
			updateCharts();
			
		} catch (err) {
			error = 'Failed to load data: ' + err.message;
			console.error('Load error:', err);
		} finally {
			loading = false;
		}
	}

	function generateMockSupportData() {
		return customers.slice(0, 10).map((customer, index) => ({
			id: `support_${index}`,
			user_id: customer.id,
			issue_type: ['product', 'billing', 'technical', 'general'][index % 4],
			priority: ['low', 'medium', 'high'][index % 3],
			description: `Sample support ticket for ${customer.name || customer.username}`,
			status: ['open', 'in_progress', 'resolved'][index % 3],
			created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
			expand: { user_id: customer }
		}));
	}

	function generateMockInteractionData() {
		return customers.slice(0, 20).map((customer, index) => ({
			id: `interaction_${index}`,
			user_id: customer.id,
			type: ['email', 'phone', 'whatsapp', 'in_person'][index % 4],
			subject: `Customer interaction ${index + 1}`,
			content: `Sample interaction with ${customer.name || customer.username}`,
			outcome: ['positive', 'neutral', 'negative'][index % 3],
			created: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
			expand: { user_id: customer }
		}));
	}

	function getTier(totalSpent) {
		if (totalSpent >= 100000) return 'Gold';    // KSh 100,000+
		if (totalSpent >= 50000) return 'Silver';   // KSh 50,000+
		return 'Bronze';
	}

	function getSegment(customer, orders) {
		if (orders.length === 0) return 'new';
		if (orders.length >= 5) return 'frequent_buyer';
		
		const lastOrder = orders[0];
		const daysSinceLastOrder = (new Date() - new Date(lastOrder.created)) / (1000 * 60 * 60 * 24);
		
		if (daysSinceLastOrder > 90) return 'inactive';
		if (customer.totalSpent / orders.length < 5000) return 'discount_hunter'; // Less than KSh 5,000 per order
		
		return 'regular';
	}

	function getRiskLevel(daysSinceLastOrder, orderCount) {
		if (orderCount === 0) return 'new';
		if (daysSinceLastOrder > 180) return 'high';
		if (daysSinceLastOrder > 90) return 'medium';
		return 'low';
	}

	function getEngagementScore(customer, orders) {
		let score = 0;
		
		// Order frequency (0-40 points)
		if (orders.length >= 10) score += 40;
		else if (orders.length >= 5) score += 30;
		else if (orders.length >= 2) score += 20;
		else if (orders.length >= 1) score += 10;
		
		// Recency (0-30 points)
		if (customer.daysSinceLastOrder <= 30) score += 30;
		else if (customer.daysSinceLastOrder <= 60) score += 20;
		else if (customer.daysSinceLastOrder <= 90) score += 10;
		
		// Value (0-30 points)
		if (customer.totalSpent >= 100000) score += 30;
		else if (customer.totalSpent >= 50000) score += 20;
		else if (customer.totalSpent >= 20000) score += 10;
		
		return Math.min(score, 100);
	}

	function calculateCLV(totalSpent, orderCount, daysSinceLastOrder) {
		if (orderCount === 0) return 0;
		
		const avgOrderValue = totalSpent / orderCount;
		const purchaseFrequency = orderCount / Math.max(daysSinceLastOrder / 365, 0.1);
		const customerLifespan = Math.max(daysSinceLastOrder / 365, 1);
		
		return avgOrderValue * purchaseFrequency * customerLifespan;
	}

	function calculateAnalytics() {
		analytics.totalCustomers = customers.length;
		analytics.activeCustomers = customers.filter(c => {
			if (!c.lastOrderDate) return false;
			const daysSinceLastOrder = (new Date() - c.lastOrderDate) / (1000 * 60 * 60 * 24);
			return daysSinceLastOrder <= 30;
		}).length;
		
		analytics.totalLoyaltyPoints = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);
		analytics.totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
		
		const totalOrders = customers.reduce((sum, c) => sum + c.orderCount, 0);
		analytics.avgOrderValue = totalOrders > 0 ? analytics.totalRevenue / totalOrders : 0;
		
		const customersWithMultipleOrders = customers.filter(c => c.orderCount > 1).length;
		analytics.repeatPurchaseRate = (customersWithMultipleOrders / Math.max(analytics.totalCustomers, 1)) * 100;
		
		analytics.clv = customers.reduce((sum, c) => sum + c.lifetimeValue, 0) / Math.max(analytics.totalCustomers, 1);
		analytics.supportTickets = supportTickets.filter(t => t.status === 'open').length;
		
		// Calculate satisfaction from interactions
		const positiveInteractions = interactions.filter(i => i.outcome === 'positive').length;
		analytics.customerSatisfaction = interactions.length > 0 ? 
			(positiveInteractions / interactions.length) * 100 : 0;
		
		// Calculate monthly growth
		const thisMonth = customers.filter(c => {
			const created = new Date(c.created);
			const now = new Date();
			return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
		}).length;
		
		const lastMonth = customers.filter(c => {
			const created = new Date(c.created);
			const lastMonthDate = new Date();
			lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
			return created.getMonth() === lastMonthDate.getMonth() && 
				   created.getFullYear() === lastMonthDate.getFullYear();
		}).length;
		
		analytics.monthlyGrowth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
		
		// Calculate churn rate
		const inactiveCustomers = customers.filter(c => c.riskLevel === 'high').length;
		analytics.churnRate = (inactiveCustomers / Math.max(analytics.totalCustomers, 1)) * 100;
	}

	function prepareChartData() {
		// Revenue chart data (last 12 months)
		const months = [];
		const revenueData = [];
		for (let i = 11; i >= 0; i--) {
			const date = new Date();
			date.setMonth(date.getMonth() - i);
			months.push(date.toLocaleDateString('en-US', { month: 'short' }));
			
			const monthRevenue = customers.reduce((sum, customer) => {
				const orders = customer.expand?.orders_via_user_id || [];
				const monthOrders = orders.filter(order => {
					const orderDate = new Date(order.created);
					return orderDate.getMonth() === date.getMonth() && 
						   orderDate.getFullYear() === date.getFullYear();
				});
				return sum + monthOrders.reduce((orderSum, order) => orderSum + (order.total_amount || 0), 0);
			}, 0);
			revenueData.push(monthRevenue);
		}
		
		chartData.revenue = { labels: months, data: revenueData };
		
		// Segment distribution
		const segments = ['new', 'regular', 'frequent_buyer', 'discount_hunter', 'inactive'];
		const segmentCounts = segments.map(segment => 
			customers.filter(c => c.segment === segment).length
		);
		
		chartData.segments = { labels: segments, data: segmentCounts };
		
		// Engagement score distribution
		const engagementRanges = ['0-25', '26-50', '51-75', '76-100'];
		const engagementCounts = [
			customers.filter(c => c.engagementScore <= 25).length,
			customers.filter(c => c.engagementScore > 25 && c.engagementScore <= 50).length,
			customers.filter(c => c.engagementScore > 50 && c.engagementScore <= 75).length,
			customers.filter(c => c.engagementScore > 75).length
		];
		
		chartData.engagement = { labels: engagementRanges, data: engagementCounts };
		
		// Loyalty tiers
		const tiers = ['Bronze', 'Silver', 'Gold'];
		const tierCounts = tiers.map(tier => 
			customers.filter(c => c.tier === tier).length
		);
		
		chartData.loyalty = { labels: tiers, data: tierCounts };
	}

	function initializeCharts() {
		// Revenue Chart
		if (chartElements.revenue) {
			revenueChart = new Chart(chartElements.revenue, {
				type: 'line',
				data: {
					labels: chartData.revenue.labels,
					datasets: [{
						label: 'Monthly Revenue (KSh)',
						data: chartData.revenue.data,
						borderColor: '#2563eb',
						backgroundColor: 'rgba(37, 99, 235, 0.1)',
						tension: 0.4,
						fill: true
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false }
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								callback: function(value) {
									return 'KSh ' + value.toLocaleString();
								}
							}
						}
					}
				}
			});
		}
		
		// Segment Chart
		if (chartElements.segments) {
			segmentChart = new Chart(chartElements.segments, {
				type: 'doughnut',
				data: {
					labels: chartData.segments.labels,
					datasets: [{
						data: chartData.segments.data,
						backgroundColor: [
							'#2563eb',
							'#3b82f6',
							'#60a5fa',
							'#93c5fd',
							'#dbeafe'
						],
						borderWidth: 0
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'bottom',
							labels: { usePointStyle: true }
						}
					}
				}
			});
		}
		
		// Engagement Chart
		if (chartElements.engagement) {
			engagementChart = new Chart(chartElements.engagement, {
				type: 'bar',
				data: {
					labels: chartData.engagement.labels,
					datasets: [{
						label: 'Customers',
						data: chartData.engagement.data,
						backgroundColor: '#2563eb',
						borderRadius: 4
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false }
					},
					scales: {
						y: { beginAtZero: true }
					}
				}
			});
		}
		
		// Loyalty Chart
		if (chartElements.loyalty) {
			loyaltyChart = new Chart(chartElements.loyalty, {
				type: 'pie',
				data: {
					labels: chartData.loyalty.labels,
					datasets: [{
						data: chartData.loyalty.data,
						backgroundColor: ['#cd7f32', '#c0c0c0', '#ffd700'],
						borderWidth: 0
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'bottom',
							labels: { usePointStyle: true }
						}
					}
				}
			});
		}
	}

	function updateCharts() {
		if (revenueChart) {
			revenueChart.data = {
				labels: chartData.revenue.labels,
				datasets: [{
					...revenueChart.data.datasets[0],
					data: chartData.revenue.data
				}]
			};
			revenueChart.update();
		}
		
		if (segmentChart) {
			segmentChart.data.datasets[0].data = chartData.segments.data;
			segmentChart.update();
		}
		
		if (engagementChart) {
			engagementChart.data.datasets[0].data = chartData.engagement.data;
			engagementChart.update();
		}
		
		if (loyaltyChart) {
			loyaltyChart.data.datasets[0].data = chartData.loyalty.data;
			loyaltyChart.update();
		}
	}

	async function createCustomer() {
		try {
			loading = true;
			
			const data = {
				...customerForm,
				emailVisibility: true,
				password: '12345678', // Default password
				passwordConfirm: '12345678',
				loyalty_points: 0,
				addresses: customerForm.addresses || '{}',
				phone: parseInt(customerForm.phone) || 0,
				decision_drivers: customerForm.decision_drivers.join(','),
				preferred_communication: customerForm.preferred_communication,
				payment_preference: customerForm.payment_preference,
				social_media: customerForm.social_media,
				pain_points: customerForm.pain_points,
				trust_level: customerForm.trust_level
			};

			const record = await pb.collection('users').create(data);
			
			// Send verification email
			try {
				await pb.collection('users').requestVerification(customerForm.email);
			} catch (verifyErr) {
				console.warn('Email verification failed:', verifyErr);
			}
			
			successMessage = 'Customer created successfully!';
			showCustomerModal = false;
			resetCustomerForm();
			await loadData();
			
		} catch (err) {
			error = 'Failed to create customer: ' + err.message;
			console.error('Create customer error:', err);
		} finally {
			loading = false;
		}
	}

	async function updateCustomer() {
		try {
			loading = true;
			
			const data = {
				username: customerForm.username,
				email: customerForm.email,
				name: customerForm.name,
				phone: parseInt(customerForm.phone) || 0,
				addresses: customerForm.addresses || '{}',
				notes: customerForm.notes,
				segment: customerForm.segment,
				preferred_communication: customerForm.preferred_communication,
				payment_preference: customerForm.payment_preference,
				social_media: customerForm.social_media,
				pain_points: customerForm.pain_points,
				trust_level: customerForm.trust_level,
				decision_drivers: Array.isArray(customerForm.decision_drivers) ? 
					customerForm.decision_drivers.join(',') : customerForm.decision_drivers
			};

			await pb.collection('users').update(editingCustomer.id, data);
			
			successMessage = 'Customer updated successfully!';
			showCustomerModal = false;
			resetCustomerForm();
			await loadData();
			
		} catch (err) {
			error = 'Failed to update customer: ' + err.message;
			console.error('Update customer error:', err);
		} finally {
			loading = false;
		}
	}

	async function createLoyaltyTransaction() {
		try {
			loading = true;
			
			const data = {
				user_id: loyaltyForm.user_id,
				points: parseInt(loyaltyForm.points),
				type: loyaltyForm.type,
				order_id: loyaltyForm.order_id || '',
				description: loyaltyForm.description || ''
			};

			await pb.collection('loyalty_transactions').create(data);
			
			// Update user's loyalty points
			const user = await pb.collection('users').getOne(loyaltyForm.user_id);
			const currentPoints = user.loyalty_points || 0;
			const newPoints = loyaltyForm.type === 'earned' ? 
				currentPoints + parseInt(loyaltyForm.points) : 
				currentPoints - parseInt(loyaltyForm.points);
			
			await pb.collection('users').update(loyaltyForm.user_id, {
				loyalty_points: Math.max(0, newPoints)
			});
			
			successMessage = 'Loyalty transaction created successfully!';
			showLoyaltyModal = false;
			resetLoyaltyForm();
			await loadData();
			
		} catch (err) {
			error = 'Failed to create loyalty transaction: ' + err.message;
			console.error('Loyalty transaction error:', err);
		} finally {
			loading = false;
		}
	}

	async function createInteraction() {
		try {
			loading = true;
			
			const data = {
				user_id: interactionForm.user_id,
				type: interactionForm.type,
				subject: interactionForm.subject,
				content: interactionForm.content,
				outcome: interactionForm.outcome,
				follow_up_required: interactionForm.follow_up_required
			};

			// Try to create in database, fallback to local storage
			try {
				await pb.collection('customer_interactions').create(data);
			} catch (err) {
				console.warn('Customer interactions collection not found, storing locally');
				data.id = `interaction_${Date.now()}`;
				data.created = new Date().toISOString();
				interactions = [data, ...interactions];
			}
			
			successMessage = 'Customer interaction recorded successfully!';
			showInteractionModal = false;
			resetInteractionForm();
			await loadData();
			
		} catch (err) {
			error = 'Failed to create interaction: ' + err.message;
			console.error('Create interaction error:', err);
		} finally {
			loading = false;
		}
	}

	async function createSupportTicket() {
		try {
			loading = true;
			
			const data = {
				user_id: supportForm.user_id,
				issue_type: supportForm.issue_type,
				priority: supportForm.priority,
				description: supportForm.description,
				status: supportForm.status
			};

			// Try to create in database, fallback to local storage
			try {
				await pb.collection('support_tickets').create(data);
			} catch (err) {
				console.warn('Support tickets collection not found, storing locally');
				data.id = `support_${Date.now()}`;
				data.created = new Date().toISOString();
				supportTickets = [data, ...supportTickets];
			}
			
			successMessage = 'Support ticket created successfully!';
			showSupportModal = false;
			resetSupportForm();
			await loadData();
			
		} catch (err) {
			error = 'Failed to create support ticket: ' + err.message;
			console.error('Create support ticket error:', err);
		} finally {
			loading = false;
		}
	}

	function resetCustomerForm() {
		customerForm = {
			username: '',
			email: '',
			name: '',
			phone: '',
			role: 'customer',
			addresses: '',
			notes: '',
			segment: '',
			preferred_communication: 'email',
			payment_preference: 'mobile_money',
			social_media: '',
			decision_drivers: [],
			pain_points: '',
			trust_level: 'new'
		};
		editingCustomer = null;
	}

	function resetLoyaltyForm() {
		loyaltyForm = {
			user_id: '',
			points: 0,
			type: 'earned',
			order_id: '',
			description: ''
		};
	}

	function resetInteractionForm() {
		interactionForm = {
			user_id: '',
			type: 'email',
			subject: '',
			content: '',
			outcome: 'positive',
			follow_up_required: false
		};
	}

	function resetSupportForm() {
		supportForm = {
			user_id: '',
			issue_type: 'product',
			priority: 'medium',
			description: '',
			status: 'open'
		};
	}

	function editCustomer(customer) {
		editingCustomer = customer;
		customerForm = {
			username: customer.username,
			email: customer.email,
			name: customer.name || '',
			phone: customer.phone?.toString() || '',
			role: customer.role,
			addresses: customer.addresses || '',
			notes: customer.notes || '',
			segment: customer.segment || '',
			preferred_communication: customer.preferred_communication || 'email',
			payment_preference: customer.payment_preference || 'mobile_money',
			social_media: customer.social_media || '',
			decision_drivers: customer.decision_drivers ? 
				customer.decision_drivers.split(',') : [],
			pain_points: customer.pain_points || '',
			trust_level: customer.trust_level || 'new'
		};
		showCustomerModal = true;
	}

	function selectCustomer(customer) {
		selectedCustomer = customer;
	}

	function formatCurrency(amount) {
		return new Intl.NumberFormat('en-KE', {
			style: 'currency',
			currency: 'KES',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
	}

	function formatDate(dateString) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getRiskColor(riskLevel) {
		switch (riskLevel) {
			case 'high': return '#ef4444';
			case 'medium': return '#f59e0b';
			case 'low': return '#10b981';
			default: return '#6b7280';
		}
	}

	function getEngagementColor(score) {
		if (score >= 75) return '#10b981';
		if (score >= 50) return '#f59e0b';
		if (score >= 25) return '#ef4444';
		return '#6b7280';
	}

	// Computed properties for filtering
	$: filteredCustomers = customers.filter(customer => {
		const matchesSearch = searchTerm === '' || 
			customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
			customer.username.toLowerCase().includes(searchTerm.toLowerCase());
		
		const matchesSegment = segmentFilter === 'all' || customer.segment === segmentFilter;
		
		return matchesSearch && matchesSegment;
	});

	function clearMessages() {
		error = '';
		successMessage = '';
	}
</script>

<div class="crm-container">
	<!-- Header -->
	<div class="header">
		<div class="header-content">
			<h1>Customer Relationship Management</h1>
			<p class="header-subtitle">Comprehensive customer insights and analytics</p>
		</div>
		<div class="header-actions">
			<button class="btn btn-primary" on:click={() => { resetCustomerForm(); showCustomerModal = true; }}>
				<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Customer
			</button>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="tab-navigation">
		<button 
			class="tab-button" 
			class:active={activeTab === 'overview'}
			on:click={() => activeTab = 'overview'}
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
			</svg>
			Overview
		</button>
		<button 
			class="tab-button" 
			class:active={activeTab === 'customers'}
			on:click={() => activeTab = 'customers'}
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
			</svg>
			Customers
		</button>
		<button 
			class="tab-button" 
			class:active={activeTab === 'analytics'}
			on:click={() => activeTab = 'analytics'}
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
			</svg>
			Analytics
		</button>
		<button 
			class="tab-button" 
			class:active={activeTab === 'activities'}
			on:click={() => activeTab = 'activities'}
		>
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
			</svg>
			Activities
		</button>
	</div>

	<!-- Messages -->
	{#if error}
		<div class="message error">
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
			</svg>
			<span>{error}</span>
			<button on:click={clearMessages}>×</button>
		</div>
	{/if}

	{#if successMessage}
		<div class="message success">
			<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
			</svg>
			<span>{successMessage}</span>
			<button on:click={clearMessages}>×</button>
		</div>
	{/if}

	<!-- Tab Content -->
	{#if activeTab === 'overview'}
		<!-- Analytics Dashboard -->
		<div class="analytics-grid">
			<div class="analytics-card primary">
				<div class="card-icon">
					<svg viewBox="0 0 20 20" fill="currentColor">
						<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
					</svg>
				</div>
				<div class="card-content">
					<h3>Total Customers</h3>
					<div class="metric">{analytics.totalCustomers.toLocaleString()}</div>
					<div class="metric-change positive">+{analytics.monthlyGrowth.toFixed(1)}% this month</div>
				</div>
			</div>

			<div class="analytics-card">
				<div class="card-icon">
					<svg viewBox="0 0 20 20" fill="currentColor">
						<path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
					</svg>
				</div>
				<div class="card-content">
					<h3>Total Revenue</h3>
					<div class="metric">{formatCurrency(analytics.totalRevenue)}</div>
					<div class="metric-sub">Lifetime value</div>
				</div>
			</div>

			<div class="analytics-card">
				<div class="card-icon">
					<svg viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
					</svg>
				</div>
				<div class="card-content">
					<h3>Customer Satisfaction</h3>
					<div class="metric">{analytics.customerSatisfaction.toFixed(1)}%</div>
					<div class="metric-sub">Based on interactions</div>
				</div>
			</div>

			<div class="analytics-card">
				<div class="card-icon">
					<svg viewBox="0 0 20 20" fill="currentColor">
						<path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" />
					</svg>
				</div>
				<div class="card-content">
					<h3>Avg Order Value</h3>
					<div class="metric">{formatCurrency(analytics.avgOrderValue)}</div>
					<div class="metric-sub">Per transaction</div>
				</div>
			</div>

			<div class="analytics-card">
				<div class="card-icon">
					<svg viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
					</svg>
				</div>
				<div class="card-content">
					<h3>Repeat Rate</h3>
					<div class="metric">{analytics.repeatPurchaseRate.toFixed(1)}%</div>
					<div class="metric-sub">Customer retention</div>
				</div>
			</div>

			<div class="analytics-card warning">
				<div class="card-icon">
					<svg viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
				</div>
				<div class="card-content">
					<h3>Churn Risk</h3>
					<div class="metric">{analytics.churnRate.toFixed(1)}%</div>
					<div class="metric-sub">Customers at risk</div>
				</div>
			</div>
		</div>

		<!-- Charts Section -->
		<div class="charts-grid">
			<div class="chart-card">
				<h3>Revenue Trend</h3>
				<div class="chart-container">
					<canvas bind:this={chartElements.revenue}></canvas>
				</div>
			</div>
			
			<div class="chart-card">
				<h3>Customer Segments</h3>
				<div class="chart-container">
					<canvas bind:this={chartElements.segments}></canvas>
				</div>
			</div>
		</div>

	{:else if activeTab === 'customers'}
		<!-- Filters and Search -->
		<div class="filters-section">
			<div class="search-container">
				<svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
				</svg>
				<input 
					type="text" 
					placeholder="Search customers by name, email, or username..." 
					bind:value={searchTerm}
					class="search-input"
				/>
			</div>
			
			<div class="filter-group">
				<select bind:value={segmentFilter} class="filter-select">
					<option value="all">All Segments</option>
					<option value="new">New Customers</option>
					<option value="regular">Regular</option>
					<option value="frequent_buyer">Frequent Buyers</option>
					<option value="discount_hunter">Discount Hunters</option>
					<option value="inactive">Inactive</option>
				</select>
				
				<select bind:value={sortBy} class="filter-select">
					<option value="created">Date Created</option>
					<option value="name">Name</option>
					<option value="totalSpent">Total Spent</option>
					<option value="loyalty_points">Loyalty Points</option>
					<option value="engagementScore">Engagement Score</option>
				</select>

				<div class="action-buttons">
					<button class="btn btn-secondary" on:click={() => showLoyaltyModal = true}>
						<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
						</svg>
						Loyalty
					</button>
					<button class="btn btn-secondary" on:click={() => showInteractionModal = true}>
						<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
						</svg>
						Interaction
					</button>
					<button class="btn btn-secondary" on:click={() => showSupportModal = true}>
						<svg class="icon" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clip-rule="evenodd" />
						</svg>
						Support
					</button>
				</div>
			</div>
		</div>

		<!-- Customer Grid -->
		<div class="main-content">
			<div class="customer-grid">
				<div class="customer-list-section">
					<div class="section-header">
						<h2>Customers ({filteredCustomers.length})</h2>
						{#if loading}
							<div class="loading-spinner"></div>
						{/if}
					</div>
					
					{#if loading}
						<div class="loading">Loading customers...</div>
					{:else if filteredCustomers.length === 0}
						<div class="empty-state">
							<svg class="empty-icon" viewBox="0 0 20 20" fill="currentColor">
								<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
							</svg>
							<h3>No customers found</h3>
							<p>Try adjusting your search filters</p>
						</div>
					{:else}
						<div class="customer-table">
							{#each filteredCustomers as customer}
								<div 
									class="customer-card" 
									class:selected={selectedCustomer?.id === customer.id}
									on:click={() => selectCustomer(customer)}
								>
									<div class="customer-avatar">
										{(customer.name || customer.username).charAt(0).toUpperCase()}
									</div>
									
									<div class="customer-info">
										<div class="customer-name">{customer.name || customer.username}</div>
										<div class="customer-email">{customer.email}</div>
										
										<div class="customer-metrics">
											<div class="metric-badge tier-{customer.tier.toLowerCase()}">
												{customer.tier}
											</div>
											<div class="metric-badge segment">
												{customer.segment.replace('_', ' ')}
											</div>
											<div class="metric-badge" style="color: {getRiskColor(customer.riskLevel)}">
												{customer.riskLevel} risk
											</div>
										</div>
										
										<div class="customer-stats">
											<div class="stat">
												<span class="stat-value">{customer.orderCount}</span>
												<span class="stat-label">Orders</span>
											</div>
											<div class="stat">
												<span class="stat-value">{formatCurrency(customer.totalSpent)}</span>
												<span class="stat-label">Spent</span>
											</div>
											<div class="stat">
												<span class="stat-value" style="color: {getEngagementColor(customer.engagementScore)}">{customer.engagementScore}</span>
												<span class="stat-label">Engagement</span>
											</div>
										</div>
									</div>
									
									<div class="customer-actions">
										<button class="btn-icon" on:click|stopPropagation={() => editCustomer(customer)} title="Edit Customer">
											<svg viewBox="0 0 20 20" fill="currentColor">
												<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
											</svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Customer Details Panel -->
				<div class="customer-details-section">
					{#if selectedCustomer}
						<div class="details-header">
							<div class="customer-avatar large">
								{(selectedCustomer.name || selectedCustomer.username).charAt(0).toUpperCase()}
							</div>
							<div class="customer-title">
								<h2>{selectedCustomer.name || selectedCustomer.username}</h2>
								<p>{selectedCustomer.email}</p>
								<div class="title-badges">
									<span class="badge tier-{selectedCustomer.tier.toLowerCase()}">{selectedCustomer.tier}</span>
									<span class="badge segment">{selectedCustomer.segment.replace('_', ' ')}</span>
								</div>
							</div>
						</div>

						<div class="details-content">
							<div class="detail-section">
								<h3>Contact Information</h3>
								<div class="detail-grid">
									<div class="detail-item">
										<label>Phone:</label>
										<span>{selectedCustomer.phone || 'Not provided'}</span>
									</div>
									<div class="detail-item">
										<label>Preferred Communication:</label>
										<span>{selectedCustomer.preferred_communication || 'Email'}</span>
									</div>
									<div class="detail-item">
										<label>Payment Preference:</label>
										<span>{selectedCustomer.payment_preference || 'Mobile Money'}</span>
									</div>
									<div class="detail-item">
										<label>Social Media:</label>
										<span>{selectedCustomer.social_media || 'Not provided'}</span>
									</div>
								</div>
							</div>

							<div class="detail-section">
								<h3>Purchase Analytics</h3>
								<div class="analytics-row">
									<div class="analytics-item">
										<div class="analytics-value">{selectedCustomer.orderCount}</div>
										<div class="analytics-label">Total Orders</div>
									</div>
									<div class="analytics-item">
										<div class="analytics-value">{formatCurrency(selectedCustomer.totalSpent)}</div>
										<div class="analytics-label">Total Spent</div>
									</div>
									<div class="analytics-item">
										<div class="analytics-value">{formatCurrency(selectedCustomer.avgOrderValue)}</div>
										<div class="analytics-label">Avg Order</div>
									</div>
									<div class="analytics-item">
										<div class="analytics-value">{selectedCustomer.loyalty_points || 0}</div>
										<div class="analytics-label">Loyalty Points</div>
									</div>
								</div>
							</div>

							<div class="detail-section">
								<h3>Engagement & Risk Assessment</h3>
								<div class="engagement-grid">
									<div class="engagement-item">
										<div class="engagement-header">
											<span>Engagement Score</span>
											<span class="engagement-score" style="color: {getEngagementColor(selectedCustomer.engagementScore)}">
												{selectedCustomer.engagementScore}/100
											</span>
										</div>
										<div class="progress-bar">
											<div class="progress-fill" style="width: {selectedCustomer.engagementScore}%; background-color: {getEngagementColor(selectedCustomer.engagementScore)}"></div>
										</div>
									</div>
									
									<div class="risk-assessment">
										<span>Risk Level: </span>
										<span class="risk-badge" style="color: {getRiskColor(selectedCustomer.riskLevel)}">
											{selectedCustomer.riskLevel.toUpperCase()}
										</span>
									</div>
									
									<div class="last-activity">
										<span>Last Order: </span>
										<span>{selectedCustomer.lastOrderDate ? formatDate(selectedCustomer.lastOrderDate) : 'Never'}</span>
									</div>
									
									<div class="clv-info">
										<span>Customer Lifetime Value: </span>
										<span class="clv-value">{formatCurrency(selectedCustomer.lifetimeValue)}</span>
									</div>
								</div>
							</div>

							{#if selectedCustomer.pain_points}
								<div class="detail-section">
									<h3>Pain Points</h3>
									<p class="pain-points">{selectedCustomer.pain_points}</p>
								</div>
							{/if}

							{#if selectedCustomer.notes}
								<div class="detail-section">
									<h3>Notes</h3>
									<p class="notes">{selectedCustomer.notes}</p>
								</div>
							{/if}
						</div>
					{:else}
						<div class="empty-selection">
							<svg class="empty-icon" viewBox="0 0 20 20" fill="currentColor">
								<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
							</svg>
							<h3>Select a customer</h3>
							<p>Click on a customer to view detailed information</p>
						</div>
					{/if}
				</div>
			</div>
		</div>

	{:else if activeTab === 'analytics'}
		<!-- Advanced Analytics -->
		<div class="analytics-section">
			<div class="charts-grid-large">
				<div class="chart-card">
					<h3>Engagement Distribution</h3>
					<div class="chart-container">
						<canvas bind:this={chartElements.engagement}></canvas>
					</div>
				</div>
				
				<div class="chart-card">
					<h3>Customer Tiers</h3>
					<div class="chart-container">
						<canvas bind:this={chartElements.loyalty}></canvas>
					</div>
				</div>
			</div>
			
			<div class="analytics-summary">
				<h3>Key Insights</h3>
				<div class="insights-grid">
					<div class="insight-card">
						<h4>Revenue Growth</h4>
						<p>Monthly revenue growth is at {analytics.monthlyGrowth.toFixed(1)}% indicating {analytics.monthlyGrowth > 0 ? 'positive' : 'negative'} business momentum.</p>
					</div>
					<div class="insight-card">
						<h4>Customer Retention</h4>
						<p>With a {analytics.repeatPurchaseRate.toFixed(1)}% repeat purchase rate, focus on converting one-time buyers into loyal customers.</p>
					</div>
					<div class="insight-card">
						<h4>Risk Management</h4>
						<p>{analytics.churnRate.toFixed(1)}% of customers are at high churn risk. Consider re-engagement campaigns.</p>
					</div>
				</div>
			</div>
		</div>

	{:else if activeTab === 'activities'}
		<!-- Activities Tab -->
		<div class="activities-section">
			<div class="activities-grid">
				<!-- Recent Interactions -->
				<div class="activity-card">
					<h3>Recent Customer Interactions</h3>
					{#if interactions.length === 0}
						<div class="empty-state small">
							<p>No interactions recorded yet</p>
						</div>
					{:else}
						<div class="activity-list">
							{#each interactions.slice(0, 10) as interaction}
								<div class="activity-item">
									<div class="activity-icon {interaction.type}">
										{#if interaction.type === 'email'}
											<svg viewBox="0 0 20 20" fill="currentColor">
												<path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
												<path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
											</svg>
										{:else if interaction.type === 'phone'}
											<svg viewBox="0 0 20 20" fill="currentColor">
												<path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
											</svg>
										{:else}
											<svg viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
											</svg>
										{/if}
									</div>
									<div class="activity-content">
										<div class="activity-header">
											<span class="activity-customer">{interaction.expand?.user_id?.name || 'Unknown Customer'}</span>
											<span class="activity-date">{formatDate(interaction.created)}</span>
										</div>
										<div class="activity-subject">{interaction.subject}</div>
										<div class="activity-outcome {interaction.outcome}">{interaction.outcome}</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Support Tickets -->
				<div class="activity-card">
					<h3>Recent Support Tickets</h3>
					{#if supportTickets.length === 0}
						<div class="empty-state small">
							<p>No support tickets found</p>
						</div>
					{:else}
						<div class="activity-list">
							{#each supportTickets.slice(0, 10) as ticket}
								<div class="activity-item">
									<div class="activity-icon support {ticket.priority}">
										<svg viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clip-rule="evenodd" />
										</svg>
									</div>
									<div class="activity-content">
										<div class="activity-header">
											<span class="activity-customer">{ticket.expand?.user_id?.name || 'Unknown Customer'}</span>
											<span class="activity-date">{formatDate(ticket.created)}</span>
										</div>
										<div class="activity-subject">{ticket.issue_type.replace('_', ' ')} - {ticket.priority} priority</div>
										<div class="activity-status {ticket.status}">{ticket.status.replace('_', ' ')}</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Loyalty Transactions -->
				<div class="activity-card">
					<h3>Recent Loyalty Activity</h3>
					{#if loyaltyTransactions.length === 0}
						<div class="empty-state small">
							<p>No loyalty transactions found</p>
						</div>
					{:else}
						<div class="activity-list">
							{#each loyaltyTransactions.slice(0, 10) as transaction}
								<div class="activity-item">
									<div class="activity-icon loyalty {transaction.type}">
										<svg viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" />
										</svg>
									</div>
									<div class="activity-content">
										<div class="activity-header">
											<span class="activity-customer">{transaction.expand?.user_id?.name || 'Unknown Customer'}</span>
											<span class="activity-date">{formatDate(transaction.created)}</span>
										</div>
										<div class="activity-subject">{transaction.type} {transaction.points} points</div>
										{#if transaction.description}
											<div class="activity-description">{transaction.description}</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Customer Modal -->
{#if showCustomerModal}
	<div class="modal-overlay" on:click={() => { showCustomerModal = false; resetCustomerForm(); }}>
		<div class="modal" on:click|stopPropagation>
			<div class="modal-header">
				<h2>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
				<button class="modal-close" on:click={() => { showCustomerModal = false; resetCustomerForm(); }}>×</button>
			</div>
			
			<form on:submit|preventDefault={editingCustomer ? updateCustomer : createCustomer}>
				<div class="form-grid">
					<div class="form-group">
						<label for="username">Username *</label>
						<input 
							id="username"
							type="text" 
							bind:value={customerForm.username} 
							required 
							disabled={!!editingCustomer}
						/>
					</div>
					
					<div class="form-group">
						<label for="email">Email *</label>
						<input 
							id="email"
							type="email" 
							bind:value={customerForm.email} 
							required 
						/>
					</div>
					
					<div class="form-group">
						<label for="name">Full Name</label>
						<input 
							id="name"
							type="text" 
							bind:value={customerForm.name} 
						/>
					</div>
					
					<div class="form-group">
						<label for="phone">Phone</label>
						<input 
							id="phone"
							type="tel" 
							bind:value={customerForm.phone} 
						/>
					</div>
					
					<div class="form-group">
						<label for="preferred_communication">Preferred Communication</label>
						<select id="preferred_communication" bind:value={customerForm.preferred_communication}>
							<option value="email">Email</option>
							<option value="phone">Phone</option>
							<option value="whatsapp">WhatsApp</option>
							<option value="sms">SMS</option>
							<option value="in_person">In Person</option>
						</select>
					</div>
					
					<div class="form-group">
						<label for="payment_preference">Payment Preference</label>
						<select id="payment_preference" bind:value={customerForm.payment_preference}>
							<option value="mobile_money">Mobile Money</option>
							<option value="cash">Cash</option>
							<option value="bank_transfer">Bank Transfer</option>
							<option value="credit_card">Credit Card</option>
							<option value="check">Check</option>
						</select>
					</div>
					
					<div class="form-group">
						<label for="trust_level">Trust Level</label>
						<select id="trust_level" bind:value={customerForm.trust_level}>
							<option value="new">New Customer</option>
							<option value="cautious">Cautious</option>
							<option value="trusting">Trusting</option>
							<option value="loyal">Loyal Advocate</option>
						</select>
					</div>
					
					<div class="form-group">
						<label for="segment">Segment</label>
						<select id="segment" bind:value={customerForm.segment}>
							<option value="">Auto-assign</option>
							<option value="new">New</option>
							<option value="regular">Regular</option>
							<option value="frequent_buyer">Frequent Buyer</option>
							<option value="discount_hunter">Discount Hunter</option>
							<option value="inactive">Inactive</option>
						</select>
					</div>
					
					<div class="form-group full-width">
						<label for="social_media">Social Media Handles</label>
						<input 
							id="social_media"
							type="text" 
							bind:value={customerForm.social_media} 
							placeholder="@username, facebook.com/profile, etc."
						/>
					</div>
					
					<div class="form-group full-width">
						<label for="addresses">Addresses (JSON)</label>
						<textarea 
							id="addresses"
							bind:value={customerForm.addresses} 
							placeholder="Enter addresses as JSON format"
						></textarea>
					</div>
					
					<div class="form-group full-width">
						<label for="pain_points">Pain Points</label>
						<textarea 
							id="pain_points"
							bind:value={customerForm.pain_points} 
							placeholder="What problems is this customer trying to solve?"
						></textarea>
					</div>
					
					<div class="form-group full-width">
						<label for="notes">Notes</label>
						<textarea 
							id="notes"
							bind:value={customerForm.notes} 
							placeholder="Customer preferences, special requirements, etc."
						></textarea>
					</div>
				</div>
				
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" on:click={() => { showCustomerModal = false; resetCustomerForm(); }}>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : (editingCustomer ? 'Update Customer' : 'Create Customer')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Loyalty Modal -->
{#if showLoyaltyModal}
	<div class="modal-overlay" on:click={() => { showLoyaltyModal = false; resetLoyaltyForm(); }}>
		<div class="modal" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Manage Loyalty Points</h2>
				<button class="modal-close" on:click={() => { showLoyaltyModal = false; resetLoyaltyForm(); }}>×</button>
			</div>
			
			<form on:submit|preventDefault={createLoyaltyTransaction}>
				<div class="form-group">
					<label for="user_id">Customer *</label>
					<select id="user_id" bind:value={loyaltyForm.user_id} required>
						<option value="">Select Customer</option>
						{#each customers as customer}
							<option value={customer.id}>
								{customer.name || customer.username} ({customer.email})
							</option>
						{/each}
					</select>
				</div>
				
				<div class="form-group">
					<label for="points">Points *</label>
					<input 
						id="points"
						type="number" 
						bind:value={loyaltyForm.points} 
						min="1"
						required 
					/>
				</div>
				
				<div class="form-group">
					<label for="type">Transaction Type *</label>
					<select id="type" bind:value={loyaltyForm.type} required>
						<option value="earned">Earned</option>
						<option value="redeemed">Redeemed</option>
						<option value="expired">Expired</option>
						<option value="adjusted">Adjusted</option>
					</select>
				</div>
				
				<div class="form-group">
					<label for="order_id">Related Order ID</label>
					<input 
						id="order_id"
						type="text" 
						bind:value={loyaltyForm.order_id} 
						placeholder="Optional - link to specific order"
					/>
				</div>
				
				<div class="form-group">
					<label for="description">Description</label>
					<textarea 
						id="description"
						bind:value={loyaltyForm.description} 
						placeholder="Reason for this transaction"
					></textarea>
				</div>
				
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" on:click={() => { showLoyaltyModal = false; resetLoyaltyForm(); }}>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Processing...' : 'Create Transaction'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Interaction Modal -->
{#if showInteractionModal}
	<div class="modal-overlay" on:click={() => { showInteractionModal = false; resetInteractionForm(); }}>
		<div class="modal" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Record Customer Interaction</h2>
				<button class="modal-close" on:click={() => { showInteractionModal = false; resetInteractionForm(); }}>×</button>
			</div>
			
			<form on:submit|preventDefault={createInteraction}>
				<div class="form-group">
					<label for="interaction_user_id">Customer *</label>
					<select id="interaction_user_id" bind:value={interactionForm.user_id} required>
						<option value="">Select Customer</option>
						{#each customers as customer}
							<option value={customer.id}>
								{customer.name || customer.username} ({customer.email})
							</option>
						{/each}
					</select>
				</div>
				
				<div class="form-group">
					<label for="interaction_type">Interaction Type *</label>
					<select id="interaction_type" bind:value={interactionForm.type} required>
						<option value="email">Email</option>
						<option value="phone">Phone Call</option>
						<option value="whatsapp">WhatsApp</option>
						<option value="in_person">In Person</option>
						<option value="sms">SMS</option>
					</select>
				</div>
				
				<div class="form-group">
					<label for="interaction_subject">Subject *</label>
					<input 
						id="interaction_subject"
						type="text" 
						bind:value={interactionForm.subject} 
						required
						placeholder="Brief description of the interaction"
					/>
				</div>
				
				<div class="form-group">
					<label for="interaction_outcome">Outcome</label>
					<select id="interaction_outcome" bind:value={interactionForm.outcome}>
						<option value="positive">Positive</option>
						<option value="neutral">Neutral</option>
						<option value="negative">Negative</option>
					</select>
				</div>
				
				<div class="form-group full-width">
					<label for="interaction_content">Content</label>
					<textarea 
						id="interaction_content"
						bind:value={interactionForm.content} 
						placeholder="Detailed notes about the interaction"
						rows="4"
					></textarea>
				</div>
				
				<div class="form-group full-width">
					<label class="checkbox-label">
						<input 
							type="checkbox" 
							bind:checked={interactionForm.follow_up_required}
						/>
						Follow-up required
					</label>
				</div>
				
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" on:click={() => { showInteractionModal = false; resetInteractionForm(); }}>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Recording...' : 'Record Interaction'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Support Modal -->
{#if showSupportModal}
	<div class="modal-overlay" on:click={() => { showSupportModal = false; resetSupportForm(); }}>
		<div class="modal" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Create Support Ticket</h2>
				<button class="modal-close" on:click={() => { showSupportModal = false; resetSupportForm(); }}>×</button>
			</div>
			
			<form on:submit|preventDefault={createSupportTicket}>
				<div class="form-group">
					<label for="support_user_id">Customer *</label>
					<select id="support_user_id" bind:value={supportForm.user_id} required>
						<option value="">Select Customer</option>
						{#each customers as customer}
							<option value={customer.id}>
								{customer.name || customer.username} ({customer.email})
							</option>
						{/each}
					</select>
				</div>
				
				<div class="form-group">
					<label for="issue_type">Issue Type *</label>
					<select id="issue_type" bind:value={supportForm.issue_type} required>
						<option value="product">Product Issue</option>
						<option value="billing">Billing</option>
						<option value="technical">Technical Support</option>
						<option value="delivery">Delivery</option>
						<option value="return">Return/Refund</option>
						<option value="general">General Inquiry</option>
					</select>
				</div>
				
				<div class="form-group">
					<label for="priority">Priority</label>
					<select id="priority" bind:value={supportForm.priority}>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="urgent">Urgent</option>
					</select>
				</div>
				
				<div class="form-group">
					<label for="status">Status</label>
					<select id="status" bind:value={supportForm.status}>
						<option value="open">Open</option>
						<option value="in_progress">In Progress</option>
						<option value="waiting_customer">Waiting for Customer</option>
						<option value="resolved">Resolved</option>
						<option value="closed">Closed</option>
					</select>
				</div>
				
				<div class="form-group full-width">
					<label for="support_description">Description *</label>
					<textarea 
						id="support_description"
						bind:value={supportForm.description} 
						required
						placeholder="Detailed description of the issue"
						rows="5"
					></textarea>
				</div>
				
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" on:click={() => { showSupportModal = false; resetSupportForm(); }}>
						Cancel
					</button>
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Creating...' : 'Create Ticket'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* CSS Variables for consistent theming */
	:root {
		--primary-blue: #2563eb;
		--primary-blue-light: #3b82f6;
		--primary-blue-dark: #1d4ed8;
		--secondary-blue: #60a5fa;
		--accent-blue: #93c5fd;
		--light-blue: #dbeafe;
		--extra-light-blue: #eff6ff;
		--white: #ffffff;
		--gray-50: #f9fafb;
		--gray-100: #f3f4f6;
		--gray-200: #e5e7eb;
		--gray-300: #d1d5db;
		--gray-400: #9ca3af;
		--gray-500: #6b7280;
		--gray-600: #4b5563;
		--gray-700: #374151;
		--gray-800: #1f2937;
		--gray-900: #111827;
		--green: #10b981;
		--yellow: #f59e0b;
		--red: #ef4444;
		--orange: #f97316;
	}

	/* Global Styles */
	* {
		box-sizing: border-box;
	}

	.crm-container {
		min-height: 100vh;
		background: linear-gradient(135deg, var(--extra-light-blue) 0%, var(--white) 100%);
		padding: 1.5rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		color: var(--gray-700);
	}

	/* Header Styles */
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		background: var(--white);
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
	}

	.header-content h1 {
		margin: 0 0 0.5rem 0;
		color: var(--primary-blue);
		font-size: 2rem;
		font-weight: 700;
	}

	.header-subtitle {
		margin: 0;
		color: var(--gray-500);
		font-size: 1rem;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
	}

	/* Button Styles */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		position: relative;
		overflow: hidden;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-light) 100%);
		color: var(--white);
		box-shadow: 0 4px 6px rgba(37, 99, 235, 0.25);
	}

	.btn-primary:hover {
		background: linear-gradient(135deg, var(--primary-blue-dark) 0%, var(--primary-blue) 100%);
		box-shadow: 0 6px 12px rgba(37, 99, 235, 0.35);
		transform: translateY(-1px);
	}

	.btn-secondary {
		background: var(--white);
		color: var(--primary-blue);
		border: 2px solid var(--primary-blue);
	}

	.btn-secondary:hover {
		background: var(--primary-blue);
		color: var(--white);
		transform: translateY(-1px);
	}

	.btn-icon {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gray-100);
		color: var(--gray-600);
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-icon:hover {
		background: var(--primary-blue);
		color: var(--white);
		transform: scale(1.05);
	}

	.icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	/* Tab Navigation */
	.tab-navigation {
		display: flex;
		background: var(--white);
		border-radius: 12px;
		padding: 0.5rem;
		margin-bottom: 2rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
		overflow-x: auto;
	}

	.tab-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border: none;
		background: transparent;
		color: var(--gray-600);
		font-weight: 500;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		min-width: fit-content;
	}

	.tab-button:hover {
		background: var(--light-blue);
		color: var(--primary-blue);
	}

	.tab-button.active {
		background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-light) 100%);
		color: var(--white);
		box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
	}

	/* Analytics Grid */
	.analytics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.analytics-card {
		background: var(--white);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
		transition: all 0.2s ease;
		position: relative;
		overflow: hidden;
	}

	.analytics-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		transform: translateY(-2px);
	}

	.analytics-card.primary {
		background: linear-gradient(135deg, var(--primary-blue) 0%, var(--primary-blue-light) 100%);
		color: var(--white);
	}

	.analytics-card.warning {
		background: linear-gradient(135deg, var(--orange) 0%, var(--yellow) 100%);
		color: var(--white);
	}

	.analytics-card .card-icon {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 2.5rem;
		height: 2.5rem;
		opacity: 0.2;
	}

	.analytics-card .card-icon svg {
		width: 100%;
		height: 100%;
	}

	.card-content h3 {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.8;
	}

	.metric {
		font-size: 2.25rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		line-height: 1;
	}

	.metric-sub, .metric-change {
		font-size: 0.85rem;
		opacity: 0.7;
	}

	.metric-change.positive {
		color: var(--green);
		font-weight: 600;
	}

	/* Charts */
	.charts-grid, .charts-grid-large {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.chart-card {
		background: var(--white);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
	}

	.chart-card h3 {
		margin: 0 0 1rem 0;
		color: var(--gray-700);
		font-weight: 600;
	}

	.chart-container {
		position: relative;
		height: 300px;
		width: 100%;
	}

	/* Filters */
	.filters-section {
		background: var(--white);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
	}

	.search-container {
		position: relative;
		margin-bottom: 1rem;
	}

	.search-icon {
		position: absolute;
		left: 1rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1rem;
		height: 1rem;
		color: var(--gray-400);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem 0.75rem 2.5rem;
		border: 2px solid var(--gray-200);
		border-radius: 8px;
		font-size: 1rem;
		transition: all 0.2s ease;
		background: var(--white);
	}

	.search-input:focus {
		outline: none;
		border-color: var(--primary-blue);
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.filter-group {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.filter-select {
		padding: 0.5rem 1rem;
		border: 2px solid var(--gray-200);
		border-radius: 8px;
		background: var(--white);
		color: var(--gray-700);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.filter-select:focus {
		outline: none;
		border-color: var(--primary-blue);
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	/* Main Content */
	.main-content {
		background: var(--white);
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
		overflow: hidden;
	}

	.customer-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 600px;
	}

	.customer-list-section {
		border-right: 1px solid var(--gray-200);
		display: flex;
		flex-direction: column;
	}

	.section-header {
		display: flex;
		justify-content: between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid var(--gray-200);
		background: var(--gray-50);
	}

	.section-header h2 {
		margin: 0;
		color: var(--gray-700);
		font-size: 1.25rem;
		font-weight: 600;
	}

	.loading-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid var(--gray-200);
		border-top: 2px solid var(--primary-blue);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.customer-table {
		flex: 1;
		overflow-y: auto;
		max-height: 600px;
	}

	.customer-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--gray-100);
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
	}

	.customer-card:hover {
		background: var(--gray-50);
	}

	.customer-card.selected {
		background: var(--extra-light-blue);
		border-left: 4px solid var(--primary-blue);
	}

	.customer-avatar {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--primary-blue) 0%, var(--secondary-blue) 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--white);
		font-weight: 600;
		font-size: 1.2rem;
		flex-shrink: 0;
	}

	.customer-avatar.large {
		width: 4rem;
		height: 4rem;
		font-size: 1.5rem;
	}

	.customer-info {
		flex: 1;
		min-width: 0;
	}

	.customer-name {
		font-weight: 600;
		color: var(--gray-800);
		margin-bottom: 0.25rem;
		font-size: 1rem;
	}

	.customer-email {
		color: var(--gray-500);
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.customer-metrics {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.metric-badge {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border-radius: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.metric-badge.tier-gold {
		background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
		color: #92400e;
	}

	.metric-badge.tier-silver {
		background: linear-gradient(135deg, #e5e7eb 0%, #f3f4f6 100%);
		color: #374151;
	}

	.metric-badge.tier-bronze {
		background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
		color: #ffffff;
	}

	.metric-badge.segment {
		background: var(--light-blue);
		color: var(--primary-blue);
	}

	.customer-stats {
		display: flex;
		gap: 1rem;
	}

	.stat {
		text-align: center;
		min-width: 0;
	}

	.stat-value {
		display: block;
		font-weight: 600;
		color: var(--gray-800);
		font-size: 0.9rem;
	}

	.stat-label {
		display: block;
		font-size: 0.7rem;
		color: var(--gray-500);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.customer-actions {
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.customer-card:hover .customer-actions {
		opacity: 1;
	}

	/* Customer Details */
	.customer-details-section {
		padding: 1.5rem;
		overflow-y: auto;
		max-height: 600px;
	}

	.details-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid var(--gray-100);
	}

	.customer-title h2 {
		margin: 0 0 0.25rem 0;
		color: var(--gray-800);
		font-size: 1.5rem;
	}

	.customer-title p {
		margin: 0 0 0.5rem 0;
		color: var(--gray-500);
	}

	.title-badges {
		display: flex;
		gap: 0.5rem;
	}

	.badge {
		font-size: 0.75rem;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.detail-section {
		margin-bottom: 2rem;
	}

	.detail-section h3 {
		margin: 0 0 1rem 0;
		color: var(--gray-700);
		font-size: 1.1rem;
		font-weight: 600;
		border-bottom: 2px solid var(--light-blue);
		padding-bottom: 0.5rem;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-item label {
		font-weight: 600;
		color: var(--gray-600);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.detail-item span {
		color: var(--gray-800);
		font-size: 0.95rem;
	}

	.analytics-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
	}

	.analytics-item {
		text-align: center;
		padding: 1rem;
		background: var(--gray-50);
		border-radius: 8px;
		border: 1px solid var(--gray-200);
	}

	.analytics-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--primary-blue);
		margin-bottom: 0.25rem;
	}

	.analytics-label {
		font-size: 0.8rem;
		color: var(--gray-600);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.engagement-grid {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.engagement-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.engagement-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.engagement-score {
		font-weight: 700;
		font-size: 1.1rem;
	}

	.progress-bar {
		height: 0.5rem;
		background: var(--gray-200);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.risk-assessment, .last-activity, .clv-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: var(--gray-50);
		border-radius: 6px;
		font-size: 0.9rem;
	}

	.risk-badge {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.clv-value {
		font-weight: 700;
		color: var(--primary-blue);
	}

	.pain-points, .notes {
		background: var(--gray-50);
		padding: 1rem;
		border-radius: 8px;
		border-left: 4px solid var(--primary-blue);
		font-style: italic;
		color: var(--gray-700);
		line-height: 1.5;
	}

	/* Empty States */
	.empty-state, .empty-selection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 2rem;
		text-align: center;
		color: var(--gray-500);
	}

	.empty-icon {
		width: 4rem;
		height: 4rem;
		color: var(--gray-300);
		margin-bottom: 1rem;
	}

	.empty-state h3, .empty-selection h3 {
		margin: 0 0 0.5rem 0;
		color: var(--gray-600);
		font-size: 1.2rem;
	}

	.empty-state p, .empty-selection p {
		margin: 0;
		font-size: 0.9rem;
	}

	.empty-state.small {
		padding: 2rem 1rem;
	}

	/* Activities */
	.activities-section {
		background: var(--white);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
	}

	.activities-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.activity-card {
		background: var(--gray-50);
		border-radius: 8px;
		padding: 1.5rem;
		border: 1px solid var(--gray-200);
	}

	.activity-card h3 {
		margin: 0 0 1rem 0;
		color: var(--gray-700);
		font-size: 1.1rem;
		font-weight: 600;
	}

	.activity-list {
		max-height: 400px;
		overflow-y: auto;
	}

	.activity-item {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--white);
		border-radius: 6px;
		margin-bottom: 0.75rem;
		border: 1px solid var(--gray-200);
	}

	.activity-icon {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--white);
	}

	.activity-icon.email {
		background: var(--primary-blue);
	}

	.activity-icon.phone {
		background: var(--green);
	}

	.activity-icon.whatsapp {
		background: #25d366;
	}

	.activity-icon.support {
		background: var(--orange);
	}

	.activity-icon.support.high {
		background: var(--red);
	}

	.activity-icon.loyalty {
		background: var(--yellow);
	}

	.activity-icon.loyalty.earned {
		background: var(--green);
	}

	.activity-icon.loyalty.redeemed {
		background: var(--red);
	}

	.activity-icon svg {
		width: 1rem;
		height: 1rem;
	}

	.activity-content {
		flex: 1;
		min-width: 0;
	}

	.activity-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.activity-customer {
		font-weight: 600;
		color: var(--gray-800);
		font-size: 0.9rem;
	}

	.activity-date {
		font-size: 0.8rem;
		color: var(--gray-500);
	}

	.activity-subject {
		color: var(--gray-700);
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}

	.activity-outcome, .activity-status {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		border-radius: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		display: inline-block;
	}

	.activity-outcome.positive {
		background: #d1fae5;
		color: #065f46;
	}

	.activity-outcome.neutral {
		background: #f3f4f6;
		color: #374151;
	}

	.activity-outcome.negative {
		background: #fee2e2;
		color: #991b1b;
	}

	.activity-status.open {
		background: #fef3c7;
		color: #92400e;
	}

	.activity-status.in_progress {
		background: #dbeafe;
		color: #1e40af;
	}

	.activity-status.resolved {
		background: #d1fae5;
		color: #065f46;
	}

	.activity-description {
		font-size: 0.8rem;
		color: var(--gray-600);
		font-style: italic;
		margin-top: 0.25rem;
	}

	/* Analytics Section */
	.analytics-summary {
		background: var(--white);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid var(--gray-200);
		margin-top: 1.5rem;
	}

	.analytics-summary h3 {
		margin: 0 0 1rem 0;
		color: var(--gray-700);
		font-size: 1.2rem;
		font-weight: 600;
	}

	.insights-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.insight-card {
		background: var(--gray-50);
		padding: 1rem;
		border-radius: 8px;
		border-left: 4px solid var(--primary-blue);
	}

	.insight-card h4 {
		margin: 0 0 0.5rem 0;
		color: var(--gray-800);
		font-size: 1rem;
		font-weight: 600;
	}

	.insight-card p {
		margin: 0;
		color: var(--gray-600);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	/* Messages */
	.message {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-weight: 500;
	}

	.message.error {
		background: #fee2e2;
		color: #991b1b;
		border: 1px solid #fecaca;
	}

	.message.success {
		background: #d1fae5;
		color: #065f46;
		border: 1px solid #a7f3d0;
	}

	.message button {
		background: none;
		border: none;
		font-size: 1.2rem;
		cursor: pointer;
		color: inherit;
		margin-left: auto;
		padding: 0;
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Loading */
	.loading {
		text-align: center;
		color: var(--gray-500);
		padding: 3rem;
		font-style: italic;
		background: var(--gray-50);
		border-radius: 8px;
		margin: 1rem;
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal {
		background: var(--white);
		border-radius: 12px;
		width: 90%;
		max-width: 700px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid var(--gray-200);
		background: var(--gray-50);
		border-radius: 12px 12px 0 0;
	}

	.modal-header h2 {
		margin: 0;
		color: var(--gray-800);
		font-size: 1.25rem;
		font-weight: 600;
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--gray-500);
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.modal-close:hover {
		background: var(--gray-200);
		color: var(--gray-700);
	}

	.modal form {
		padding: 2rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
	}

	.form-group label {
		font-weight: 600;
		color: var(--gray-700);
		font-size: 0.9rem;
	}

	.form-group input,
	.form-group select,
	.form-group textarea {
		padding: 0.75rem;
		border: 2px solid var(--gray-200);
		border-radius: 8px;
		font-size: 1rem;
		transition: all 0.2s ease;
		background: var(--white);
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--primary-blue);
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.form-group input:disabled {
		background: var(--gray-100);
		color: var(--gray-500);
		cursor: not-allowed;
	}

	.form-group textarea {
		resize: vertical;
		min-height: 80px;
	}

	.checkbox-label {
		display: flex !important;
		flex-direction: row !important;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.checkbox-label input[type="checkbox"] {
		width: auto;
		margin: 0;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--gray-200);
		margin-top: 1.5rem;
	}

	/* Responsive Design */
	@media (max-width: 1024px) {
		.customer-grid {
			grid-template-columns: 1fr;
		}

		.customer-details-section {
			border-right: none;
			border-top: 1px solid var(--gray-200);
			max-height: none;
		}

		.charts-grid, .charts-grid-large {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 768px) {
		.crm-container {
			padding: 1rem;
		}

		.header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.header-actions {
			justify-content: center;
		}

		.analytics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.filter-group {
			flex-direction: column;
			align-items: stretch;
		}

		.action-buttons {
			margin-left: 0;
			justify-content: center;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.detail-grid {
			grid-template-columns: 1fr;
		}

		.analytics-row {
			grid-template-columns: repeat(2, 1fr);
		}

		.activities-grid {
			grid-template-columns: 1fr;
		}

		.insights-grid {
			grid-template-columns: 1fr;
		}

		.tab-navigation {
			justify-content: flex-start;
		}

		.modal {
			width: 95%;
			margin: 1rem;
		}

		.modal form {
			padding: 1rem;
		}

		.modal-header {
			padding: 1rem;
		}
	}

	@media (max-width: 480px) {
		.analytics-grid {
			grid-template-columns: 1fr;
		}

		.analytics-row {
			grid-template-columns: 1fr;
		}

		.customer-stats {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.customer-metrics {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-content h1 {
			font-size: 1.5rem;
		}

		.tab-button {
			padding: 0.5rem 1rem;
			font-size: 0.85rem;
		}
	}
</style>