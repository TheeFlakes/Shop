<script>
	import { auth, pb } from '$lib/pocketbase.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	
	let sidebarOpen = false;
	let isAuthorized = false;
	let isLoading = true;
	
	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	onMount(() => {
		if (browser) {
			// Check if user is authenticated and has admin role
			const checkAuth = () => {
				if (!auth.isAdmin()) {
					console.warn('Access denied: Admin role required');
					goto('/login');
					return;
				}
				isAuthorized = true;
				isLoading = false;
			};

			// Initial check
			checkAuth();

			// Listen for auth changes
			const unsubscribe = pb?.authStore.onChange(() => {
				if (!auth.isAdmin()) {
					console.warn('Access denied: Admin role required after auth change');
					goto('/login');
				}
			});

			return () => {
				if (unsubscribe && typeof unsubscribe === 'function') {
					unsubscribe();
				}
			};
		}
	});
</script>

<!-- Loading state -->
{#if isLoading}
	<div class="flex items-center justify-center min-h-screen bg-gray-100">
		<div class="text-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
			<p class="text-gray-600">Verifying access permissions...</p>
		</div>
	</div>
{:else if !isAuthorized}
	<!-- Unauthorized access -->
	<div class="flex items-center justify-center min-h-screen bg-gray-100">
		<div class="text-center">
			<div class="text-red-500 text-6xl mb-4">🚫</div>
			<h1 class="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
			<p class="text-gray-600 mb-4">You don't have permission to access this area.</p>
			<a href="/login" class="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
				Go to Login
			</a>
		</div>
	</div>
{:else}
	<!-- Main admin layout -->
	<div class="flex h-screen bg-white">
    <!-- Mobile sidebar overlay -->
    {#if sidebarOpen}
        <div 
            class="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden" 
            on:click={toggleSidebar} 
            on:keydown={(e) => e.key === 'Escape' && toggleSidebar()}
            role="button"
            tabindex="0"
            aria-label="Close sidebar"
        ></div>
    {/if}
    
    <!-- sidebar -->
    <div class="fixed inset-y-0 left-0 z-50 w-64 bg-gray-800 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:flex flex-col">
        <div class="flex items-center justify-between h-16 bg-gray-900 px-4">
            <span class="text-white font-bold uppercase text-sm md:text-base">Admin Dashboard</span>
            <!-- Close button for mobile -->
            <button class="md:hidden text-white" on:click={toggleSidebar} aria-label="Close sidebar">
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div class="flex flex-col flex-1 overflow-y-auto">
            <nav class="flex-1 px-2 py-4 bg-gray-800">
                <a href="/admin" class="flex items-center px-4 py-2 text-gray-100 hover:bg-gray-700">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"
                        />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 21l4-4 4 4" />
                    </svg>
                    Dashboard
                </a>
                <a href="/admin/products" class="flex items-center px-4 py-2 mt-2 text-gray-100 hover:bg-gray-700">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                    </svg>
                    Products
                </a>
                <a href="/admin/category" class="flex items-center px-4 py-2 mt-2 text-gray-100 hover:bg-gray-700">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                    </svg>
                    Categories
                </a>
                <a href="/admin/user" class="flex items-center px-4 py-2 mt-2 text-gray-100 hover:bg-gray-700">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                        />
                    </svg>
                    Users
                </a>
                <a href="/admin/orders" class="flex items-center px-4 py-2 mt-2 text-gray-100 hover:bg-gray-700">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                    </svg>
                    Orders
                </a>
                   <a href="/admin/crm" class="flex items-center px-4 py-2 mt-2 text-gray-100 hover:bg-gray-700">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                    </svg>
                    CRM
                </a>

                <!-- Logout Button -->
                <button 
                    on:click={() => auth.signOut()}
                    class="flex items-center w-full px-4 py-2 mt-4 text-white bg-red-600/80 backdrop-blur-md hover:bg-red-700/80 transition duration-200 rounded-lg mx-2"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                    </svg>
                    Logout
                </button>
            </nav>
        </div>
    </div>

    <!-- Main content area -->
    <div class="flex flex-col flex-1 overflow-y-auto">
        <!-- Mobile header with hamburger menu -->
        <div class="md:hidden flex items-center justify-between h-16 bg-white border-b border-gray-200 px-4">
            <button 
                class="text-gray-600 hover:text-gray-800 focus:outline-none" 
                on:click={toggleSidebar}
                aria-label="Toggle menu"
            >
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>
            <span class="text-lg font-semibold text-gray-800">Admin</span>
            <div class="w-6"></div> <!-- Spacer for centering -->
        </div>
        
        <!-- Page content -->
        <div class="flex-1 overflow-y-auto">
            <slot />
        </div>
    </div>
</div>
{/if}
