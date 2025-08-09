<script>
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { authStore } from '$lib/authStore.js';
	
	let { children } = $props();

	onMount(() => {
		// Initialize auth state on client
		authStore.init();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
