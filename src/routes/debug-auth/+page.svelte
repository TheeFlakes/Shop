<script>
	import { pb } from '$lib/pocketbase.js';
	import { onMount } from 'svelte';
	
	let testEmail = $state('test@example.com');
	let testPassword = $state('password123');
	let testName = $state('Test User');
	let results = $state([]);
	let loading = $state(false);

	function addResult(type, message, data = null) {
		results.push({
			type,
			message,
			data: data ? JSON.stringify(data, null, 2) : null,
			timestamp: new Date().toLocaleTimeString()
		});
		results = [...results]; // Trigger reactivity
	}

	async function testConnection() {
		loading = true;
		addResult('info', 'Testing PocketBase connection...');
		
		try {
			// Test basic health check
			const response = await fetch('http://178.18.250.118:8091/api/health');
			const health = await response.json();
			addResult('success', 'PocketBase server is healthy', health);
		} catch (error) {
			addResult('error', 'Failed to connect to PocketBase server', error);
		}
		
		loading = false;
	}

	async function testCreateUser() {
		loading = true;
		addResult('info', 'Testing user creation...');
		
		try {
			const userData = {
				username: testEmail,
				email: testEmail,
				emailVisibility: true,
				password: testPassword,
				passwordConfirm: testPassword,
				name: testName,
				role: 'customer'
			};
			
			addResult('info', 'Sending user creation request', userData);
			
			const record = await pb.collection('users').create(userData);
			addResult('success', 'User created successfully', record);
		} catch (error) {
			addResult('error', 'User creation failed', {
				message: error.message,
				status: error.status,
				data: error.data,
				response: error.response
			});
		}
		
		loading = false;
	}

	async function testAuth() {
		loading = true;
		addResult('info', 'Testing authentication...');
		
		try {
			addResult('info', `Attempting to authenticate with email: ${testEmail}`);
			
			const authData = await pb.collection('users').authWithPassword(testEmail, testPassword);
			addResult('success', 'Authentication successful', {
				user: authData.record,
				token: authData.token ? '[TOKEN_PRESENT]' : '[NO_TOKEN]'
			});
		} catch (error) {
			addResult('error', 'Authentication failed', {
				message: error.message,
				status: error.status,
				data: error.data,
				response: error.response
			});
		}
		
		loading = false;
	}

	async function testListUsers() {
		loading = true;
		addResult('info', 'Testing user list (this might fail if not admin)...');
		
		try {
			const records = await pb.collection('users').getList(1, 10);
			addResult('success', 'Users retrieved', records);
		} catch (error) {
			addResult('error', 'Failed to list users (expected if not admin)', {
				message: error.message,
				status: error.status
			});
		}
		
		loading = false;
	}

	function clearResults() {
		results = [];
	}

	onMount(() => {
		addResult('info', 'Debug page loaded. PocketBase instance:', {
			url: pb?.baseUrl || 'Not available',
			isValid: pb?.authStore?.isValid || false,
			user: pb?.authStore?.model || null
		});
	});
</script>

<div class="container mx-auto p-6 max-w-4xl">
	<h1 class="text-3xl font-bold mb-6">PocketBase Authentication Debug</h1>
	
	<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
		<div class="space-y-4">
			<h2 class="text-xl font-semibold">Test Configuration</h2>
			
			<div>
				<label class="block text-sm font-medium mb-1">Test Email:</label>
				<input 
					bind:value={testEmail} 
					type="email" 
					class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			
			<div>
				<label class="block text-sm font-medium mb-1">Test Password:</label>
				<input 
					bind:value={testPassword} 
					type="password" 
					class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			
			<div>
				<label class="block text-sm font-medium mb-1">Test Name:</label>
				<input 
					bind:value={testName} 
					type="text" 
					class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
				/>
			</div>
		</div>
		
		<div class="space-y-2">
			<h2 class="text-xl font-semibold">Test Actions</h2>
			
			<button 
				onclick={testConnection} 
				disabled={loading}
				class="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
			>
				Test Connection
			</button>
			
			<button 
				onclick={testCreateUser} 
				disabled={loading}
				class="w-full p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
			>
				Test Create User
			</button>
			
			<button 
				onclick={testAuth} 
				disabled={loading}
				class="w-full p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
			>
				Test Authentication
			</button>
			
			<button 
				onclick={testListUsers} 
				disabled={loading}
				class="w-full p-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
			>
				Test List Users
			</button>
			
			<button 
				onclick={clearResults}
				class="w-full p-2 bg-gray-500 text-white rounded hover:bg-gray-600"
			>
				Clear Results
			</button>
		</div>
	</div>
	
	<div class="bg-gray-50 p-4 rounded">
		<div class="flex justify-between items-center mb-3">
			<h2 class="text-xl font-semibold">Debug Results</h2>
			{#if loading}
				<span class="text-blue-500">Loading...</span>
			{/if}
		</div>
		
		<div class="space-y-3 max-h-96 overflow-y-auto">
			{#each results as result}
				<div class="p-3 rounded border-l-4 {
					result.type === 'success' ? 'bg-green-50 border-green-400' :
					result.type === 'error' ? 'bg-red-50 border-red-400' :
					'bg-blue-50 border-blue-400'
				}">
					<div class="flex justify-between items-start">
						<span class="font-medium text-sm text-gray-600">{result.timestamp}</span>
						<span class="text-xs px-2 py-1 rounded {
							result.type === 'success' ? 'bg-green-200 text-green-800' :
							result.type === 'error' ? 'bg-red-200 text-red-800' :
							'bg-blue-200 text-blue-800'
						}">
							{result.type.toUpperCase()}
						</span>
					</div>
					<p class="mt-1 text-sm">{result.message}</p>
					{#if result.data}
						<pre class="mt-2 text-xs bg-gray-800 text-green-400 p-2 rounded overflow-x-auto">{result.data}</pre>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
