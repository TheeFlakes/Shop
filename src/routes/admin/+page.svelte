<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/pocketbase.js';
	import { authStore } from '$lib/authStore.js';

	let loading = true;

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
				if (userRole !== 'admin') {
					// Wrong role, redirect to appropriate page
					auth.redirectByRole(state.user);
					return;
				}

				loading = false;
			}
		});

		return unsubscribe;
	});
</script>

{#if loading}
	<div class="flex items-center justify-center min-h-screen">
		<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
	</div>
{:else}
	<div class="container mx-auto px-4 py-8">
		<div class="max-w-6xl mx-auto">
			<h1 class="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>
			
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">User Management</h2>
					<p class="text-gray-600">Manage users, roles, and permissions</p>
					<button class="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition duration-200">
						Manage Users
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">System Settings</h2>
					<p class="text-gray-600">Configure system-wide settings</p>
					<button class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200">
						Settings
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">Analytics</h2>
					<p class="text-gray-600">View system analytics and metrics</p>
					<button class="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-200">
						View Analytics
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">Database</h2>
					<p class="text-gray-600">Database management and backups</p>
					<button class="mt-4 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition duration-200">
						Manage DB
					</button>
				</div>
			</div>

			<div class="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div class="bg-white rounded-lg shadow-md p-6">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h3>
					<div class="space-y-3">
						<div class="flex items-center justify-between border-b pb-2">
							<span class="text-sm text-gray-600">New user registration</span>
							<span class="text-xs text-gray-500">2 minutes ago</span>
						</div>
						<div class="flex items-center justify-between border-b pb-2">
							<span class="text-sm text-gray-600">System backup completed</span>
							<span class="text-xs text-gray-500">1 hour ago</span>
						</div>
						<div class="flex items-center justify-between border-b pb-2">
							<span class="text-sm text-gray-600">Manager role assigned</span>
							<span class="text-xs text-gray-500">3 hours ago</span>
						</div>
					</div>
				</div>

				<div class="bg-white rounded-lg shadow-md p-6">
					<h3 class="text-lg font-semibold text-gray-800 mb-4">System Status</h3>
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Database Status</span>
							<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Online</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Server Health</span>
							<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Good</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Active Users</span>
							<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">24</span>
						</div>
					</div>
				</div>
			</div>

			<div class="mt-8 bg-red-50 rounded-lg p-6">
				<h3 class="text-lg font-semibold text-red-900 mb-2">Administrator Access</h3>
				<p class="text-red-800">You have full administrative privileges. Use these powers responsibly to manage users, system settings, and maintain the platform.</p>
			</div>
		</div>
	</div>
{/if}