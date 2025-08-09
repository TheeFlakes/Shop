<script>
	import { auth } from '$lib/pocketbase.js';
	import { goto } from '$app/navigation';
	
	let fullName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let phone = $state('');
	let acceptTerms = $state(false);
	let loading = $state(false);
	let errors = $state({});

	function validateForm() {
		errors = {};
		
		if (!fullName.trim()) {
			errors.fullName = 'Full name is required';
		}
		
		if (!email.trim()) {
			errors.email = 'Email is required';
		} else if (!/\S+@\S+\.\S+/.test(email)) {
			errors.email = 'Please enter a valid email';
		}
		
		if (!password) {
			errors.password = 'Password is required';
		} else if (password.length < 8) {
			errors.password = 'Password must be at least 8 characters';
		}
		
		if (password !== confirmPassword) {
			errors.confirmPassword = 'Passwords do not match';
		}
		
		if (!acceptTerms) {
			errors.terms = 'You must accept the terms and conditions';
		}
		
		return Object.keys(errors).length === 0;
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (!validateForm()) return;
		
		loading = true;
		errors = {};
		
		try {
			const userData = {
				name: fullName,
				email: email,
				password: password,
				passwordConfirm: confirmPassword,
				phone: phone || null
			};
			
			const result = await auth.signUp(userData);
			
			if (result.success) {
				// Success - now automatically log in the user and redirect based on role
				try {
					const loginResult = await auth.signIn(email, password);
					if (loginResult.success) {
						// User is now logged in and will be redirected by the signIn function based on their role
						// No need for manual redirect here as signIn handles role-based redirection
					} else {
						// If auto-login fails, redirect to login page
						goto('/login?message=Account created successfully! Please log in.');
					}
				} catch (loginError) {
					console.error('Auto-login failed:', loginError);
					goto('/login?message=Account created successfully! Please log in.');
				}
			} else {
				// Handle specific errors
				if (result.error.includes('email')) {
					errors.email = 'This email is already registered';
				} else if (result.error.includes('username')) {
					errors.email = 'This email is already registered';
				} else {
					errors.general = result.error;
				}
			}
		} catch (error) {
			console.error('Registration failed:', error);
			errors.general = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="text-center">
		<h2 class="text-2xl font-bold text-gray-900">Create your account</h2>
		<p class="text-gray-600 mt-2">Join us and start shopping today</p>
	</div>

	<form onsubmit={handleSubmit} class="space-y-5">
		{#if errors.general}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4">
				<div class="flex">
					<svg class="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
					</svg>
					<p class="text-sm text-red-800">{errors.general}</p>
				</div>
			</div>
		{/if}

		<div>
			<label for="fullName" class="block text-sm font-medium text-gray-700 mb-2">
				Full name
			</label>
			<input
				type="text"
				id="fullName"
				bind:value={fullName}
				required
				class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
				class:border-red-500={errors.fullName}
				placeholder="Enter your full name"
			/>
			{#if errors.fullName}
				<p class="text-red-500 text-sm mt-1">{errors.fullName}</p>
			{/if}
		</div>

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
				class:border-red-500={errors.email}
				placeholder="Enter your email"
			/>
			{#if errors.email}
				<p class="text-red-500 text-sm mt-1">{errors.email}</p>
			{/if}
		</div>

		<div>
			<label for="phone" class="block text-sm font-medium text-gray-700 mb-2">
				Phone number (optional)
			</label>
			<input
				type="tel"
				id="phone"
				bind:value={phone}
				class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
				placeholder="Enter your phone number"
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
				class:border-red-500={errors.password}
				placeholder="Create a password"
			/>
			{#if errors.password}
				<p class="text-red-500 text-sm mt-1">{errors.password}</p>
			{/if}
		</div>

		<div>
			<label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-2">
				Confirm password
			</label>
			<input
				type="password"
				id="confirmPassword"
				bind:value={confirmPassword}
				required
				class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
				class:border-red-500={errors.confirmPassword}
				placeholder="Confirm your password"
			/>
			{#if errors.confirmPassword}
				<p class="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>
			{/if}
		</div>

		<div>
			<div class="flex items-start">
				<input
					type="checkbox"
					id="terms"
					bind:checked={acceptTerms}
					class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
				/>
				<label for="terms" class="ml-2 block text-sm text-gray-700">
					I agree to the
					<a href="/terms" class="text-blue-600 hover:text-blue-500 hover:underline">
						Terms and Conditions
					</a>
					and
					<a href="/privacy" class="text-blue-600 hover:text-blue-500 hover:underline">
						Privacy Policy
					</a>
				</label>
			</div>
			{#if errors.terms}
				<p class="text-red-500 text-sm mt-1">{errors.terms}</p>
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
				Creating account...
			{:else}
				Create account
			{/if}
		</button>
	</form>

	<div class="text-center">
		<p class="text-gray-600">
			Already have an account?
			<a href="/login" class="text-blue-600 hover:text-blue-500 font-medium hover:underline">
				Sign in here
			</a>
		</p>
	</div>
</div>