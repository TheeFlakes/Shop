<script>
	import { onMount } from 'svelte';
	import { pb } from '$lib/pocketbase.js';
	import { Chart, registerables } from 'chart.js';

	// Register Chart.js components
	Chart.register(...registerables);

	// Data stores
	let users = [];
	let orders = [];
	let loading = true;
	let showAddForm = false;
	let editingUser = null;
	let searchTerm = '';
	let roleFilter = 'all';
	let statusFilter = 'all';
	let selectedUsers = [];

	// Analytics data
	let analytics = {
		totalUsers: 0,
		activeUsers: 0,
		admins: 0,
		managers: 0,
		customers: 0,
		newUsersThisMonth: 0,
		topCustomers: [],
		userGrowth: [],
		usersByRole: [],
		recentRegistrations: [],
		monthlyGrowth: [],
		customersBySpending: [],
		verificationRate: 0
	};

	// Form data
	let formData = {
		email: '',
		name: '',
		role: 'customer',
		verified: false,
		password: '',
		confirmPassword: '',
		avatar: null
	};

	// Charts
	let roleChart = null;
	let growthChart = null;
	let spendingChart = null;
	let verificationChart = null;

	onMount(async () => {
		await loadData();
		await calculateAnalytics();
		createCharts();
		loading = false;
	});

	async function loadData() {
		try {
			// Load users and orders
			[users, orders] = await Promise.all([
				pb.collection('users').getFullList({
					sort: '-created'
				}),
				pb.collection('orders').getFullList({
					expand: 'customer',
					sort: '-created'
				})
			]);
		} catch (error) {
			console.error('Error loading data:', error);
		}
	}

	async function calculateAnalytics() {
		analytics.totalUsers = users.length;
		
		// Count by role
		const roleCounts = users.reduce((acc, user) => {
			const role = user.role || 'customer';
			acc[role] = (acc[role] || 0) + 1;
			return acc;
		}, {});

		analytics.admins = roleCounts.admin || 0;
		analytics.managers = roleCounts.manager || 0;
		analytics.customers = roleCounts.customer || 0;
		analytics.activeUsers = users.filter(user => user.verified).length;
		
		// Verification rate
		analytics.verificationRate = analytics.totalUsers > 0 
			? Math.round((analytics.activeUsers / analytics.totalUsers) * 100) 
			: 0;

		// New users this month
		const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
		analytics.newUsersThisMonth = users.filter(user => 
			user.created.startsWith(thisMonth)
		).length;

		// Recent registrations (last 5)
		analytics.recentRegistrations = users.slice(0, 5);

		// Monthly growth (last 6 months)
		analytics.monthlyGrowth = Array.from({ length: 6 }, (_, i) => {
			const date = new Date();
			date.setMonth(date.getMonth() - (5 - i));
			const monthStr = date.toISOString().slice(0, 7); // YYYY-MM
			
			const count = users.filter(user => 
				user.created.startsWith(monthStr)
			).length;

			return {
				month: date.toLocaleDateString('en-US', { month: 'short' }),
				count
			};
		});

		// User growth (last 7 days)
		analytics.userGrowth = Array.from({ length: 7 }, (_, i) => {
			const date = new Date();
			date.setDate(date.getDate() - (6 - i));
			const dateStr = date.toISOString().split('T')[0];
			
			const count = users.filter(user => 
				user.created.startsWith(dateStr)
			).length;

			return {
				date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				count
			};
		});

		// Top customers by order count
		const customerOrders = {};
		orders.forEach(order => {
			if (order.customer) {
				customerOrders[order.customer] = (customerOrders[order.customer] || 0) + 1;
			}
		});

		analytics.topCustomers = users
			.filter(user => user.role === 'customer')
			.map(user => ({
				...user,
				orderCount: customerOrders[user.id] || 0,
				totalSpent: orders
					.filter(order => order.customer === user.id)
					.reduce((sum, order) => sum + (order.total || 0), 0)
			}))
			.sort((a, b) => b.totalSpent - a.totalSpent)
			.slice(0, 5);

		// Customer spending tiers for chart
		const spendingTiers = [
			{ label: 'KSh 0 - 5,000', min: 0, max: 5000, color: '#EF4444' },
			{ label: 'KSh 5,001 - 15,000', min: 5001, max: 15000, color: '#F59E0B' },
			{ label: 'KSh 15,001 - 50,000', min: 15001, max: 50000, color: '#10B981' },
			{ label: 'KSh 50,000+', min: 50001, max: Infinity, color: '#3B82F6' }
		];

		analytics.customersBySpending = spendingTiers.map(tier => ({
			...tier,
			count: users.filter(user => {
				if (user.role !== 'customer') return false;
				const totalSpent = orders
					.filter(order => order.customer === user.id)
					.reduce((sum, order) => sum + (order.total || 0), 0);
				return totalSpent >= tier.min && totalSpent <= tier.max;
			}).length
		}));

		// Users by role for chart
		analytics.usersByRole = [
			{ role: 'Customers', count: analytics.customers, color: '#3B82F6' },
			{ role: 'Managers', count: analytics.managers, color: '#10B981' },
			{ role: 'Admins', count: analytics.admins, color: '#F59E0B' }
		].filter(item => item.count > 0);
	}

	function createCharts() {
		// Role Distribution Chart
		const roleCtx = document.getElementById('roleChart');
		if (roleCtx && analytics.usersByRole.length > 0) {
			roleChart = new Chart(roleCtx, {
				type: 'doughnut',
				data: {
					labels: analytics.usersByRole.map(item => item.role),
					datasets: [{
						data: analytics.usersByRole.map(item => item.count),
						backgroundColor: analytics.usersByRole.map(item => item.color),
						borderWidth: 3,
						borderColor: '#ffffff',
						hoverBorderWidth: 4
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'bottom',
							labels: {
								padding: 20,
								usePointStyle: true
							}
						},
						title: {
							display: true,
							text: 'Users by Role Distribution',
							font: {
								size: 16,
								weight: 'bold'
							},
							padding: 20
						}
					},
					cutout: '60%'
				}
			});
		}

		// Monthly Growth Chart
		const growthCtx = document.getElementById('growthChart');
		if (growthCtx && analytics.monthlyGrowth.length > 0) {
			growthChart = new Chart(growthCtx, {
				type: 'bar',
				data: {
					labels: analytics.monthlyGrowth.map(item => item.month),
					datasets: [{
						label: 'New Users',
						data: analytics.monthlyGrowth.map(item => item.count),
						backgroundColor: 'rgba(59, 130, 246, 0.8)',
						borderColor: '#3B82F6',
						borderWidth: 2,
						borderRadius: 8,
						borderSkipped: false
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
							},
							grid: {
								color: 'rgba(0, 0, 0, 0.1)'
							}
						},
						x: {
							grid: {
								display: false
							}
						}
					},
					plugins: {
						legend: {
							display: false
						},
						title: {
							display: true,
							text: 'Monthly User Growth',
							font: {
								size: 16,
								weight: 'bold'
							},
							padding: 20
						}
					}
				}
			});
		}

		// Customer Spending Distribution Chart
		const spendingCtx = document.getElementById('spendingChart');
		if (spendingCtx && analytics.customersBySpending.length > 0) {
			spendingChart = new Chart(spendingCtx, {
				type: 'bar',
				data: {
					labels: analytics.customersBySpending.map(item => item.label),
					datasets: [{
						label: 'Customers',
						data: analytics.customersBySpending.map(item => item.count),
						backgroundColor: analytics.customersBySpending.map(item => item.color),
						borderWidth: 0,
						borderRadius: 8,
						borderSkipped: false
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					indexAxis: 'y',
					scales: {
						x: {
							beginAtZero: true,
							ticks: {
								stepSize: 1
							},
							grid: {
								color: 'rgba(0, 0, 0, 0.1)'
							}
						},
						y: {
							grid: {
								display: false
							}
						}
					},
					plugins: {
						legend: {
							display: false
						},
						title: {
							display: true,
							text: 'Customer Spending Distribution',
							font: {
								size: 16,
								weight: 'bold'
							},
							padding: 20
						}
					}
				}
			});
		}

		// Verification Rate Chart
		const verificationCtx = document.getElementById('verificationChart');
		if (verificationCtx) {
			verificationChart = new Chart(verificationCtx, {
				type: 'doughnut',
				data: {
					labels: ['Verified', 'Unverified'],
					datasets: [{
						data: [analytics.activeUsers, analytics.totalUsers - analytics.activeUsers],
						backgroundColor: ['#10B981', '#EF4444'],
						borderWidth: 3,
						borderColor: '#ffffff',
						hoverBorderWidth: 4
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'bottom',
							labels: {
								padding: 20,
								usePointStyle: true
							}
						},
						title: {
							display: true,
							text: `User Verification Rate: ${analytics.verificationRate}%`,
							font: {
								size: 16,
								weight: 'bold'
							},
							padding: 20
						}
					},
					cutout: '60%'
				}
			});
		}
	}

	// Form handling
	async function handleSubmit() {
		try {
			if (formData.password !== formData.confirmPassword) {
				alert('Passwords do not match');
				return;
			}

			const data = { ...formData };
			delete data.confirmPassword;
			
			if (editingUser) {
				// Don't update password if empty
				if (!data.password) {
					delete data.password;
				}
				await pb.collection('users').update(editingUser.id, data);
			} else {
				await pb.collection('users').create(data);
			}
			
			await loadData();
			await calculateAnalytics();
			resetForm();
		} catch (error) {
			console.error('Error saving user:', error);
			alert('Error saving user. Please try again.');
		}
	}

	function editUser(user) {
		editingUser = user;
		formData = { 
			...user, 
			password: '', 
			confirmPassword: '' 
		};
		showAddForm = true;
	}

	async function deleteUser(userId) {
		if (!confirm('Are you sure you want to delete this user?')) return;
		
		try {
			await pb.collection('users').delete(userId);
			await loadData();
			await calculateAnalytics();
		} catch (error) {
			console.error('Error deleting user:', error);
			alert('Error deleting user. Please try again.');
		}
	}

	async function toggleUserStatus(user) {
		try {
			await pb.collection('users').update(user.id, {
				verified: !user.verified
			});
			await loadData();
			await calculateAnalytics();
		} catch (error) {
			console.error('Error updating user status:', error);
		}
	}

	function resetForm() {
		formData = {
			email: '',
			name: '',
			role: 'customer',
			verified: false,
			password: '',
			confirmPassword: '',
			avatar: null
		};
		editingUser = null;
		showAddForm = false;
	}

	// Filtered users
	$: filteredUsers = users.filter(user => {
		const matchesSearch = user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.name?.toLowerCase().includes(searchTerm.toLowerCase());
		const matchesRole = roleFilter === 'all' || user.role === roleFilter;
		const matchesStatus = statusFilter === 'all' || 
			(statusFilter === 'verified' && user.verified) ||
			(statusFilter === 'unverified' && !user.verified);
		return matchesSearch && matchesRole && matchesStatus;
	});

	// Get user order count and total spent
	function getUserStats(userId) {
		const userOrders = orders.filter(order => order.customer === userId);
		return {
			orderCount: userOrders.length,
			totalSpent: userOrders.reduce((sum, order) => sum + (order.total || 0), 0)
		};
	}

	// Format currency in Kenyan Shillings
	function formatCurrency(amount) {
		return `KSh ${new Intl.NumberFormat('en-KE', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(amount)}`;
	}
</script>

<svelte:head>
	<title>User Management - Admin</title>
</svelte:head>

<div class="p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
	<!-- Header -->
	<div class="mb-6 sm:mb-8">
		<div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
			<h1 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
				User Management Dashboard
			</h1>
			<p class="text-gray-600 text-sm sm:text-base">Comprehensive user analytics and management system</p>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else}
		<!-- Analytics Cards -->
		<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6 mb-6 sm:mb-8">
			<div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-4 sm:p-6 text-white">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-blue-100 text-xs sm:text-sm font-medium">Total Users</p>
						<p class="text-2xl sm:text-3xl font-bold">{analytics.totalUsers}</p>
					</div>
					<div class="p-2 sm:p-3 rounded-full bg-blue-400 bg-opacity-30">
						<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
						</svg>
					</div>
				</div>
			</div>

			<div class="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-4 sm:p-6 text-white">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-green-100 text-xs sm:text-sm font-medium">Verified</p>
						<p class="text-2xl sm:text-3xl font-bold">{analytics.activeUsers}</p>
						<p class="text-green-200 text-xs">{analytics.verificationRate}% verified</p>
					</div>
					<div class="p-2 sm:p-3 rounded-full bg-green-400 bg-opacity-30">
						<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
					</div>
				</div>
			</div>

			<div class="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-4 sm:p-6 text-white">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-purple-100 text-xs sm:text-sm font-medium">Customers</p>
						<p class="text-2xl sm:text-3xl font-bold">{analytics.customers}</p>
					</div>
					<div class="p-2 sm:p-3 rounded-full bg-purple-400 bg-opacity-30">
						<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
						</svg>
					</div>
				</div>
			</div>

			<div class="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-4 sm:p-6 text-white">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-orange-100 text-xs sm:text-sm font-medium">New This Month</p>
						<p class="text-2xl sm:text-3xl font-bold">{analytics.newUsersThisMonth}</p>
					</div>
					<div class="p-2 sm:p-3 rounded-full bg-orange-400 bg-opacity-30">
						<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
						</svg>
					</div>
				</div>
			</div>

			<div class="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-4 sm:p-6 text-white">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-indigo-100 text-xs sm:text-sm font-medium">Staff</p>
						<p class="text-2xl sm:text-3xl font-bold">{analytics.admins + analytics.managers}</p>
						<p class="text-indigo-200 text-xs">{analytics.admins}A / {analytics.managers}M</p>
					</div>
					<div class="p-2 sm:p-3 rounded-full bg-indigo-400 bg-opacity-30">
						<svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.25-4.5a12 12 0 00-16.5 0"></path>
						</svg>
					</div>
				</div>
			</div>
		</div>

		<!-- Advanced Analytics Charts -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
			<div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
				<div class="h-64 sm:h-80">
					<canvas id="roleChart"></canvas>
				</div>
			</div>
			<div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
				<div class="h-64 sm:h-80">
					<canvas id="verificationChart"></canvas>
				</div>
			</div>
			<div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
				<div class="h-64 sm:h-80">
					<canvas id="growthChart"></canvas>
				</div>
			</div>
			<div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
				<div class="h-64 sm:h-80">
					<canvas id="spendingChart"></canvas>
				</div>
			</div>
		</div>

		<!-- Top Customers Insights -->
		<div class="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-8">
			<div class="flex items-center justify-between mb-6">
				<h3 class="text-xl font-bold text-gray-900">💰 Top Spending Customers</h3>
				<span class="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
					Revenue Leaders
				</span>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each analytics.topCustomers as customer, index}
					<div class="relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
						<div class="flex items-start justify-between mb-3">
							<div class="flex items-center">
								<div class="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
									{index + 1}
								</div>
								<div class="ml-3 min-w-0 flex-1">
									<p class="text-sm font-semibold text-gray-900 truncate">{customer.name || customer.email}</p>
									<p class="text-xs text-gray-500 truncate">{customer.email}</p>
								</div>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-3 text-sm">
							<div class="bg-white rounded-lg p-2 text-center">
								<p class="text-xs text-gray-500 font-medium">Orders</p>
								<p class="text-lg font-bold text-blue-600">{customer.orderCount}</p>
							</div>
							<div class="bg-white rounded-lg p-2 text-center">
								<p class="text-xs text-gray-500 font-medium">Spent</p>
								<p class="text-lg font-bold text-green-600">{formatCurrency(customer.totalSpent)}</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Controls Section -->
		<div class="bg-white rounded-lg shadow-sm p-4 sm:p-6 border mb-6">
			<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<div class="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-1 w-full sm:w-auto">
					<!-- Search -->
					<div class="relative flex-1 sm:flex-initial">
						<input
							type="text"
							placeholder="Search users..."
							bind:value={searchTerm}
							class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
						<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
							</svg>
						</div>
					</div>

					<!-- Role Filter -->
					<select
						bind:value={roleFilter}
						class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					>
						<option value="all">All Roles</option>
						<option value="customer">Customers</option>
						<option value="manager">Managers</option>
						<option value="admin">Admins</option>
					</select>

					<!-- Status Filter -->
					<select
						bind:value={statusFilter}
						class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					>
						<option value="all">All Status</option>
						<option value="verified">Verified</option>
						<option value="unverified">Unverified</option>
					</select>
				</div>

				<!-- Add User Button -->
				<button
					on:click={() => showAddForm = true}
					class="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 flex items-center justify-center text-sm"
				>
					<svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
					</svg>
					Add User
				</button>
			</div>
		</div>

		<!-- Add/Edit Form Modal -->
		{#if showAddForm}
			<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
				<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
					<div class="p-4 sm:p-6">
						<div class="flex justify-between items-center mb-6">
							<h3 class="text-lg font-semibold text-gray-900">
								{editingUser ? 'Edit User' : 'Add New User'}
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
									<label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
									<input
										type="email"
										bind:value={formData.email}
										required
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
									<input
										type="text"
										bind:value={formData.name}
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
							</div>

							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Role</label>
									<select
										bind:value={formData.role}
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										<option value="customer">Customer</option>
										<option value="manager">Manager</option>
										<option value="admin">Admin</option>
									</select>
								</div>

								<div class="flex items-center">
									<label class="flex items-center">
										<input
											type="checkbox"
											bind:checked={formData.verified}
											class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
										/>
										<span class="ml-2 text-sm text-gray-700">Verified</span>
									</label>
								</div>
							</div>

							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">
										Password {editingUser ? '(leave blank to keep current)' : ''}
									</label>
									<input
										type="password"
										bind:value={formData.password}
										required={!editingUser}
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
									<input
										type="password"
										bind:value={formData.confirmPassword}
										required={!editingUser || formData.password}
										class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
							</div>

							<div class="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4">
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
									{editingUser ? 'Update' : 'Create'} User
								</button>
							</div>
						</form>
					</div>
				</div>
			</div>
		{/if}

		<!-- Users Table -->
		<div class="bg-white rounded-lg shadow-sm border overflow-hidden">
			<!-- Mobile Cards View -->
			<div class="md:hidden">
				{#each filteredUsers as user}
					{@const stats = getUserStats(user.id)}
					<div class="p-4 border-b border-gray-200">
						<div class="flex items-start justify-between mb-3">
							<div class="flex-1 min-w-0">
								<h4 class="text-sm font-medium text-gray-900 truncate">
									{user.name || user.email}
								</h4>
								<p class="text-sm text-gray-500 truncate">{user.email}</p>
							</div>
							<div class="flex space-x-2 ml-3">
								<button
									on:click={() => editUser(user)}
									class="text-blue-600 hover:text-blue-900 text-sm"
								>
									Edit
								</button>
								<button
									on:click={() => deleteUser(user.id)}
									class="text-red-600 hover:text-red-900 text-sm"
								>
									Delete
								</button>
							</div>
						</div>
						
						<div class="flex flex-wrap gap-2 mb-3">
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
								{user.role}
							</span>
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {user.verified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
								{user.verified ? 'Verified' : 'Unverified'}
							</span>
						</div>
						
						<div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
							<div>
								<span class="font-medium">Orders:</span> {stats.orderCount}
							</div>
							<div>
								<span class="font-medium">Spent:</span> {formatCurrency(stats.totalSpent)}
							</div>
						</div>
						
						<div class="mt-3 text-xs text-gray-500">
							Joined: {new Date(user.created).toLocaleDateString()}
						</div>
					</div>
				{/each}
			</div>

			<!-- Desktop Table View -->
			<div class="hidden md:block overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spent</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each filteredUsers as user}
							{@const stats = getUserStats(user.id)}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap">
									<div>
										<div class="text-sm font-medium text-gray-900">{user.name || 'No name'}</div>
										<div class="text-sm text-gray-500">{user.email}</div>
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
										{user.role}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<button
										on:click={() => toggleUserStatus(user)}
										class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors {user.verified ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}"
									>
										{user.verified ? 'Verified' : 'Unverified'}
									</button>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{stats.orderCount}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{formatCurrency(stats.totalSpent)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{new Date(user.created).toLocaleDateString()}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
									<div class="flex justify-end space-x-2">
										<button
											on:click={() => editUser(user)}
											class="text-blue-600 hover:text-blue-900 transition duration-200"
										>
											Edit
										</button>
										<button
											on:click={() => deleteUser(user.id)}
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

			{#if filteredUsers.length === 0}
				<div class="text-center py-12">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
					</svg>
					<h3 class="mt-2 text-sm font-medium text-gray-900">No users found</h3>
					<p class="mt-1 text-sm text-gray-500">Get started by creating your first user.</p>
					<div class="mt-6">
						<button
							on:click={() => showAddForm = true}
							class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
						>
							<svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
							</svg>
							Add User
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
