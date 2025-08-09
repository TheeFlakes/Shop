<script>
	import { auth } from '$lib/pocketbase.js';
	
	let email = $state('');
	let loading = $state(false);
	let sent = $state(false);
	let error = $state('');

	async function handleSubmit(event) {
		event.preventDefault();
		if (!email.trim()) {
			error = 'Please enter your email address';
			return;
		}

		if (!/\S+@\S+\.\S+/.test(email)) {
			error = 'Please enter a valid email address';
			return;
		}

		loading = true;
		error = '';
		
		try {
			const result = await auth.requestPasswordReset(email);
			
			if (result.success) {
				sent = true;
			} else {
				error = result.error;
			}
		} catch (err) {
			error = 'Failed to send reset email. Please try again.';
			console.error('Password reset failed:', err);
		} finally {
			loading = false;
		}
	}

	function handleTryAgain() {
		sent = false;
		email = '';
		error = '';
	}
</script>

<div class="space-y-6">
	{#if !sent}
		<div class="text-center">
			<h2 class="text-2xl font-bold text-gray-900">Forgot your password?</h2>
			<p class="text-gray-600 mt-2">No worries! Enter your email and we'll send you reset instructions.</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-5">
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
					class:border-red-500={error}
					placeholder="Enter your email address"
				/>
				{#if error}
					<p class="text-red-500 text-sm mt-1">{error}</p>
				{/if}
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
					Sending reset link...
				{:else}
					Send reset link
				{/if}
			</button>
		</form>

		<div class="text-center">
			<p class="text-gray-600">
				Remember your password?
				<a href="/login" class="text-blue-600 hover:text-blue-500 font-medium hover:underline">
					Back to sign in
				</a>
			</p>
		</div>
	{:else}
		<!-- Success state -->
		<div class="text-center space-y-4">
			<div class="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
				<svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
			</div>
			
			<div>
				<h2 class="text-2xl font-bold text-gray-900">Check your email</h2>
				<p class="text-gray-600 mt-2">
					We've sent password reset instructions to
					<span class="font-medium text-gray-900">{email}</span>
				</p>
			</div>

			<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<div class="flex items-start">
					<svg class="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
					</svg>
					<div class="text-sm text-blue-800">
						<p class="font-medium">Didn't receive the email?</p>
						<p class="mt-1">Check your spam folder or click below to try again.</p>
					</div>
				</div>
			</div>

			<div class="space-y-3">
				<button
					onclick={handleTryAgain}
					class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
				>
					Try another email
				</button>
				
				<a
					href="/login"
					class="block w-full text-center py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
				>
					Back to sign in
				</a>
			</div>
		</div>
	{/if}
</div>