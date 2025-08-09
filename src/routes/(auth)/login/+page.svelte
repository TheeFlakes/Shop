<script>
	import { auth } from '$lib/pocketbase.js';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	
	let email = $state('');
	let password = $state('');
	let remember = $state(false);
	let loading = $state(false);
	let error = $state('');
	let successMessage = $state('');

	onMount(() => {
		// Check for success message in URL params
		const message = $page.url.searchParams.get('message');
		if (message) {
			successMessage = message;
		}
	});

	async function handleSubmit(event) {
		event.preventDefault();
		loading = true;
		error = '';
		
		try {
			const result = await auth.signIn(email, password);
			
			if (!result.success) {
				error = result.error;
			}
			// If successful, the auth service will handle navigation
		} catch (err) {
			console.error('Login failed:', err);
			error = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="text-center">
		<h2 class="text-2xl font-bold text-gray-900">Welcome back</h2>
		<p class="text-gray-600 mt-2">Sign in to your account to continue</p>
	</div>

	<form onsubmit={handleSubmit} class="space-y-5">
		{#if successMessage}
			<div class="bg-green-50 border border-green-200 rounded-lg p-4">
				<div class="flex">
					<svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
					</svg>
					<p class="text-sm text-green-800">{successMessage}</p>
				</div>
			</div>
		{/if}
		
		{#if error}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4">
				<div class="flex">
					<svg class="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
					</svg>
					<p class="text-sm text-red-800">{error}</p>
				</div>
			</div>
		{/if}

		<div>
			<label for="email" class="block text-sm font-medium text-gray-700 mb-2">
				Email address
			</label>
			<input
				type="email"
				id="email"
				bind:value={email}
				required
				class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
				placeholder="Enter your email"
			/>
		</div>

		<div>
			<label for="password" class="block text-sm font-medium text-gray-700 mb-2">
				Password
			</label>
			<input
				type="password"
				id="password"
				bind:value={password}
				required
				class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
				placeholder="Enter your password"
			/>
		</div>

		<div class="flex items-center justify-between">
			<div class="flex items-center">
				<input
					type="checkbox"
					id="remember"
					bind:checked={remember}
					class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
				/>
				<label for="remember" class="ml-2 block text-sm text-gray-700">
					Remember me
				</label>
			</div>
			<a href="/forgot_password" class="text-sm text-blue-600 hover:text-blue-500 hover:underline">
				Forgot your password?
			</a>
		</div>

		<button
			type="submit"
			disabled={loading}
			class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if loading}
				<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
				Signing in...
			{:else}
				Sign in
			{/if}
		</button>
	</form>

	<div class="text-center">
		<p class="text-gray-600">
			Don't have an account?
			<a href="/signup" class="text-blue-600 hover:text-blue-500 font-medium hover:underline">
				Create one now
			</a>
		</p>
	</div>
</div>
