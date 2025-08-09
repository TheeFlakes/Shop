<!-- Test page to verify PocketBase authentication -->
<script>
	import { authStore } from '$lib/authStore.js';
	import { auth } from '$lib/pocketbase.js';
	import Navbar from '$lib/components/Navbar.svelte';
	
	let testEmail = $state('test@example.com');
	let testPassword = $state('12345678');
	let loading = $state(false);
	let message = $state('');

	async function testSignUp() {
		loading = true;
		message = '';
		
		try {
			const result = await auth.signUp({
				name: 'Test User',
				email: testEmail,
				password: testPassword,
				passwordConfirm: testPassword,
				phone: '1234567890'
			});

			if (result.success) {
				message = 'Sign up successful! User created.';
			} else {
				message = `Sign up failed: ${result.error}`;
			}
		} catch (error) {
			message = `Error: ${error.message}`;
		} finally {
			loading = false;
		}
	}

	async function testSignIn() {
		loading = true;
		message = '';
		
		try {
			const result = await auth.signIn(testEmail, testPassword);

			if (result.success) {
				message = 'Sign in successful!';
			} else {
				message = `Sign in failed: ${result.error}`;
			}
		} catch (error) {
			message = `Error: ${error.message}`;
		} finally {
			loading = false;
		}
	}

	function testSignOut() {
		auth.signOut();
		message = 'Signed out successfully';
	}
</script>

<Navbar />

<div class="max-w-2xl mx-auto p-8">
	<h1 class="text-3xl font-bold mb-6">PocketBase Auth Test</h1>
	
	<div class="bg-white rounded-lg shadow-md p-6 mb-6">
		<h2 class="text-xl font-semibold mb-4">Authentication Status</h2>
		
		{#if $authStore.isLoading}
			<p class="text-gray-600">Loading...</p>
		{:else if $authStore.isAuthenticated}
			<div class="bg-green-50 border border-green-200 rounded-lg p-4">
				<p class="text-green-800 font-medium">✅ Authenticated</p>
				<p class="text-sm text-green-700 mt-1">
					User: {$authStore.user?.name} ({$authStore.user?.email})
				</p>
				<p class="text-sm text-green-700">
					Role: {$authStore.user?.role}
				</p>
			</div>
		{:else}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4">
				<p class="text-red-800 font-medium">❌ Not authenticated</p>
			</div>
		{/if}
	</div>

	<div class="bg-white rounded-lg shadow-md p-6 mb-6">
		<h2 class="text-xl font-semibold mb-4">Test Credentials</h2>
		
		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
				<input 
					type="email" 
					bind:value={testEmail}
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
				<input 
					type="password" 
					bind:value={testPassword}
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
		</div>
	</div>

	<div class="bg-white rounded-lg shadow-md p-6 mb-6">
		<h2 class="text-xl font-semibold mb-4">Test Actions</h2>
		
		<div class="space-y-3">
			<button 
				onclick={testSignUp}
				disabled={loading}
				class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
			>
				{loading ? 'Processing...' : 'Test Sign Up'}
			</button>
			
			<button 
				onclick={testSignIn}
				disabled={loading}
				class="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
			>
				{loading ? 'Processing...' : 'Test Sign In'}
			</button>
			
			<button 
				onclick={testSignOut}
				disabled={loading || !$authStore.isAuthenticated}
				class="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
			>
				Sign Out
			</button>
		</div>
	</div>

	{#if message}
		<div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
			<p class="text-gray-800">{message}</p>
		</div>
	{/if}

	<div class="mt-8 text-center">
		<a href="/" class="text-blue-600 hover:text-blue-500 underline">← Back to Home</a>
	</div>
</div>
