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
				if (userRole !== 'customer') {
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
		<div class="max-w-4xl mx-auto">
			<div class="flex justify-between items-center mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Customer Dashboard</h1>
				<button 
					on:click={() => auth.signOut()}
					class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition duration-200 flex items-center gap-2"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
					</svg>
					Logout
				</button>
			</div>
			
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">My Orders</h2>
					<p class="text-gray-600">View and track your recent orders</p>
					<button class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-200">
						View Orders
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">Browse Products</h2>
					<p class="text-gray-600">Discover new products and deals</p>
					<button class="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition duration-200">
						Shop Now
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-md p-6">
					<h2 class="text-xl font-semibold text-gray-800 mb-4">Account Settings</h2>
					<p class="text-gray-600">Manage your profile and preferences</p>
					<button class="mt-4 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200">
						Settings
					</button>
				</div>
			</div>

			<div class="mt-8 bg-blue-50 rounded-lg p-6">
				<h3 class="text-lg font-semibold text-blue-900 mb-2">Welcome to your Customer Dashboard!</h3>
				<p class="text-blue-800">You have successfully logged in as a customer. Here you can manage your orders, browse products, and update your account settings.</p>
			</div>
		</div>
	</div>
{/if}