<script>
	import { auth, pb } from '$lib/pocketbase.js';
	import { onMount } from 'svelte';
	
	let userInfo = null;
	let authState = 'checking...';
	
	onMount(() => {
		const updateAuthInfo = () => {
			if (pb && pb.authStore.isValid) {
				userInfo = pb.authStore.model;
				authState = 'authenticated';
			} else {
				userInfo = null;
				authState = 'not authenticated';
			}
		};
		
		// Initial check
		updateAuthInfo();
		
		// Listen for changes
		const unsubscribe = pb?.authStore.onChange(() => {
			updateAuthInfo();
		});
		
		return unsubscribe;
	});
	
	function testRedirect() {
		if (userInfo) {
			console.log('Testing redirect for user:', userInfo);
			auth.redirectByRole(userInfo);
		}
	}
</script>

<div class="bg-gray-100 p-4 rounded-lg border border-gray-300 text-sm">
	<h3 class="font-bold text-lg mb-2">Auth Debug Info</h3>
	<p><strong>Auth State:</strong> {authState}</p>
	
	{#if userInfo}
		<div class="mt-2">
			<p><strong>User Email:</strong> {userInfo.email}</p>
			<p><strong>User Role:</strong> {userInfo.role || 'No role set'}</p>
			<p><strong>User ID:</strong> {userInfo.id}</p>
			<p><strong>Is Admin:</strong> {auth.isAdmin()}</p>
			<p><strong>Current Role (normalized):</strong> {auth.getCurrentUserRole()}</p>
		</div>
		
		<button 
			on:click={testRedirect}
			class="mt-2 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
		>
			Test Redirect
		</button>
	{:else}
		<p class="mt-2 text-gray-600">No user information available</p>
	{/if}
</div>
