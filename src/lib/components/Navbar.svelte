<script>
	import { authStore } from '$lib/authStore.js';
	import { auth } from '$lib/pocketbase.js';
	import { onMount } from 'svelte';
	
	let showMobileMenu = $state(false);
	let showUserMenu = $state(false);

	function toggleMobileMenu() {
		showMobileMenu = !showMobileMenu;
	}

	function toggleUserMenu() {
		showUserMenu = !showUserMenu;
	}

	function handleSignOut() {
		auth.signOut();
		showUserMenu = false;
	}

	// Close menus when clicking outside
	onMount(() => {
		function handleClickOutside(event) {
			if (showUserMenu && !event.target.closest('.user-menu')) {
				showUserMenu = false;
			}
			if (showMobileMenu && !event.target.closest('.mobile-menu')) {
				showMobileMenu = false;
			}
		}

		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<nav class="bg-white shadow-lg border-b">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex justify-between h-16">
			<!-- Logo and main nav -->
			<div class="flex items-center">
				<a href="/" class="flex items-center">
					<div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center mr-3">
						<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
						</svg>
					</div>
					<span class="text-xl font-bold text-gray-900">Shop</span>
				</a>
				
				<!-- Desktop navigation -->
				<div class="hidden md:ml-10 md:flex space-x-8">
					<a href="/" class="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
						Home
					</a>
					<a href="/products" class="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
						Products
					</a>
					{#if $authStore.isAuthenticated}
						{#if auth.isAdmin()}
							<a href="/admin" class="text-blue-600 hover:text-blue-800 px-3 py-2 text-sm font-medium">
								Admin
							</a>
						{:else if auth.isManager()}
							<a href="/manager" class="text-green-600 hover:text-green-800 px-3 py-2 text-sm font-medium">
								Manager
							</a>
						{:else if auth.isCustomer()}
							<a href="/dashboard" class="text-purple-600 hover:text-purple-800 px-3 py-2 text-sm font-medium">
								Dashboard
							</a>
						{/if}
					{/if}
					<a href="/about" class="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
						About
					</a>
					<a href="/contact" class="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
						Contact
					</a>
				</div>
			</div>

			<!-- Desktop auth section -->
			<div class="hidden md:flex items-center space-x-4">
				{#if $authStore.isAuthenticated}
					<!-- Shopping cart -->
					<button class="text-gray-600 hover:text-gray-900 p-2">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6.5M7 13h10M7 13v6a2 2 0 002 2h6a2 2 0 002-2v-6"></path>
						</svg>
					</button>

					<!-- User menu -->
					<div class="relative user-menu">
						<button 
							onclick={toggleUserMenu}
							class="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
								<span class="text-sm font-medium text-gray-700">
									{$authStore.user?.name?.[0]?.toUpperCase() || 'U'}
								</span>
							</div>
							<span class="ml-2 text-gray-700 font-medium">{$authStore.user?.name || 'User'}</span>
							<svg class="ml-1 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
							</svg>
						</button>

						{#if showUserMenu}
							<div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border">
								{#if auth.isAdmin()}
									<a href="/admin" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
										Admin Dashboard
									</a>
								{:else if auth.isManager()}
									<a href="/manager" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
										Manager Dashboard
									</a>
								{:else if auth.isCustomer()}
									<a href="/dashboard" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
										Customer Dashboard
									</a>
								{/if}
								<a href="/profile" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
									Profile
								</a>
								<a href="/orders" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
									Orders
								</a>
								<a href="/settings" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
									Settings
								</a>
								<hr class="my-1">
								<button 
									onclick={handleSignOut}
									class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
								>
									Sign out
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<!-- Auth buttons -->
					<a 
						href="/login" 
						class="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"
					>
						Sign in
					</a>
					<a 
						href="/signup" 
						class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-200"
					>
						Sign up
					</a>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<div class="md:hidden flex items-center">
				<button 
					onclick={toggleMobileMenu}
					class="text-gray-600 hover:text-gray-900 p-2 mobile-menu"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
					</svg>
				</button>
			</div>
		</div>

		<!-- Mobile menu -->
		{#if showMobileMenu}
			<div class="md:hidden border-t border-gray-200 py-4">
				<div class="space-y-1">
					<a href="/" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
						Home
					</a>
					<a href="/products" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
						Products
					</a>
					<a href="/about" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
						About
					</a>
					<a href="/contact" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
						Contact
					</a>
				</div>

				<div class="mt-4 pt-4 border-t border-gray-200">
					{#if $authStore.isAuthenticated}
						<div class="flex items-center px-3 py-2">
							<div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center mr-3">
								<span class="text-sm font-medium text-gray-700">
									{$authStore.user?.name?.[0]?.toUpperCase() || 'U'}
								</span>
							</div>
							<span class="text-gray-900 font-medium">{$authStore.user?.name || 'User'}</span>
						</div>
						
						<div class="space-y-1 mt-2">
							<a href="/profile" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
								Profile
							</a>
							<a href="/orders" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
								Orders
							</a>
							<a href="/settings" class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium">
								Settings
							</a>
							<button 
								onclick={handleSignOut}
								class="block w-full text-left px-3 py-2 text-red-600 hover:text-red-900 text-base font-medium"
							>
								Sign out
							</button>
						</div>
					{:else}
						<div class="space-y-2">
							<a 
								href="/login" 
								class="block px-3 py-2 text-gray-600 hover:text-gray-900 text-base font-medium"
							>
								Sign in
							</a>
							<a 
								href="/signup" 
								class="block mx-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-base font-medium text-center transition duration-200"
							>
								Sign up
							</a>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</nav>