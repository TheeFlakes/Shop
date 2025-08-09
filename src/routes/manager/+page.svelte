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
				if (userRole !== 'manager') {
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
	<div class="flex items-center justify-center min-h-screen bg-white">
		<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
	</div>
{:else}
	<!-- Main content -->
	<div class="flex flex-col flex-1 overflow-y-auto bg-white">
		<!-- Desktop header -->
		<div class="hidden md:flex items-center justify-between h-16 bg-white border-b border-gray-200">
			<div class="flex items-center px-4 flex-1">
				<input class="mx-4 w-full max-w-md border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" placeholder="Search">
			</div>
			<div class="flex items-center pr-4">
				<button
					class="flex items-center text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 bg-gray-100/80 backdrop-blur-md px-3 py-2 rounded-lg"
					aria-label="Navigation options">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
						stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
							d="M12 19l-7-7 7-7m5 14l7-7-7-7" />
					</svg>
				</button>
			</div>
		</div>
		
		<div class="p-4 md:p-6 lg:p-8">
			<div class="mb-6">
				<h1 class="text-2xl md:text-3xl font-bold text-gray-800">Manager Dashboard</h1>
				<p class="mt-2 text-gray-600 text-sm md:text-base">Welcome to the manager portal. Manage your team and operations.</p>
			</div>
			
			<!-- Mobile search bar -->
			<div class="md:hidden mb-6">
				<input class="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" type="text" placeholder="Search">
			</div>
			
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-4 md:p-6">
					<h2 class="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Team Management</h2>
					<p class="text-gray-600 text-sm md:text-base mb-4">Manage staff schedules and assignments</p>
					<button class="w-full md:w-auto bg-blue-600/90 backdrop-blur-md text-white px-4 py-2.5 md:py-2 rounded-lg hover:bg-blue-700/90 transition duration-200 font-medium">
						Manage Team
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-4 md:p-6">
					<h2 class="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Inventory Control</h2>
					<p class="text-gray-600 text-sm md:text-base mb-4">Monitor and manage product inventory</p>
					<button class="w-full md:w-auto bg-green-600/90 backdrop-blur-md text-white px-4 py-2.5 md:py-2 rounded-lg hover:bg-green-700/90 transition duration-200 font-medium">
						View Inventory
					</button>
				</div>

				<div class="bg-white rounded-lg shadow-lg border border-gray-100 p-4 md:p-6 md:col-span-2 lg:col-span-1">
					<h2 class="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Reports</h2>
					<p class="text-gray-600 text-sm md:text-base mb-4">Generate and view business reports</p>
					<button class="w-full md:w-auto bg-purple-600/90 backdrop-blur-md text-white px-4 py-2.5 md:py-2 rounded-lg hover:bg-purple-700/90 transition duration-200 font-medium">
						View Reports
					</button>
				</div>
			</div>

			<div class="mt-6 md:mt-8 bg-green-50 rounded-lg p-4 md:p-6 border border-green-200">
				<h3 class="text-base md:text-lg font-semibold text-green-900 mb-2">Manager Access Confirmed</h3>
				<p class="text-green-800 text-sm md:text-base">You have successfully logged in as a manager. You have access to team management, inventory control, and reporting features.</p>
			</div>
		</div>
	</div>
{/if}
