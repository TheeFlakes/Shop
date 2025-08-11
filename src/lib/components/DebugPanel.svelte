<script>
	import { onMount } from 'svelte';
	import { pb } from '$lib/pocketbase.js';

	let connectionStatus = 'Testing...';
	let userSchema = null;
	let testResults = [];

	onMount(async () => {
		await testConnection();
	});

	async function testConnection() {
		testResults = [];
		
		try {
			// Test 1: Basic connection
			addResult('Testing basic connection...', 'info');
			await pb.health();
			addResult('✓ Basic connection successful', 'success');

			// Test 2: Check collections
			addResult('Checking collections...', 'info');
			const collections = await pb.collections.getFullList();
			addResult(`✓ Found ${collections.length} collections`, 'success');

			// Test 3: Find users collection
			const usersCollection = collections.find(c => c.name === 'users');
			if (usersCollection) {
				addResult('✓ Users collection found', 'success');
				userSchema = usersCollection.schema;
				console.log('Users schema:', userSchema);
			} else {
				addResult('✗ Users collection not found', 'error');
			}

			// Test 4: Try to list users (with role filter)
			addResult('Testing user search...', 'info');
			const users = await pb.collection('users').getList(1, 5, {
				filter: 'role = "customer"'
			});
			addResult(`✓ Found ${users.items.length} customer users`, 'success');

			// Test 5: Check authentication
			if (pb.authStore.isValid) {
				addResult(`✓ Authenticated as: ${pb.authStore.model?.email || 'Unknown'}`, 'success');
				addResult(`✓ User role: ${pb.authStore.model?.role || 'Unknown'}`, 'success');
			} else {
				addResult('⚠ Not authenticated - this might limit functionality', 'warning');
			}

		} catch (error) {
			addResult(`✗ Connection failed: ${error.message}`, 'error');
			console.error('Connection test error:', error);
		}
	}

	function addResult(message, type) {
		testResults = [...testResults, { message, type, timestamp: new Date().toLocaleTimeString() }];
	}

	async function testCreateCustomer() {
		addResult('Testing customer creation...', 'info');
		
		try {
			const testData = {
				username: 'testuser' + Date.now(),
				email: `test${Date.now()}@example.com`,
				emailVisibility: true,
				password: 'test123456',
				passwordConfirm: 'test123456',
				name: 'Test Customer',
				role: 'customer',
				phone: '254712345678',
				addresses: JSON.stringify([])
			};

			console.log('Test data:', testData);
			const record = await pb.collection('users').create(testData);
			addResult(`✓ Customer created successfully: ${record.name} (${record.email})`, 'success');
			
			// Clean up - delete the test user
			await pb.collection('users').delete(record.id);
			addResult('✓ Test customer cleaned up', 'success');
			
		} catch (error) {
			addResult(`✗ Customer creation failed: ${error.message}`, 'error');
			if (error.response?.data) {
				addResult(`Details: ${JSON.stringify(error.response.data)}`, 'error');
			}
			console.error('Create customer test error:', error);
		}
	}

	async function testSearch() {
		addResult('Testing customer search...', 'info');
		
		try {
			// Test different search patterns
			const searchTests = [
				{ filter: 'role = "customer"', desc: 'All customers' },
				{ filter: 'name ?~ "test" && role = "customer"', desc: 'Name contains "test"' },
				{ filter: 'email ?~ "@" && role = "customer"', desc: 'Valid email addresses' }
			];

			for (const test of searchTests) {
				try {
					const results = await pb.collection('users').getList(1, 5, {
						filter: test.filter
					});
					addResult(`✓ ${test.desc}: Found ${results.items.length} results`, 'success');
				} catch (err) {
					addResult(`✗ ${test.desc}: Failed - ${err.message}`, 'error');
				}
			}
			
		} catch (error) {
			addResult(`✗ Search test failed: ${error.message}`, 'error');
			console.error('Search test error:', error);
		}
	}
</script>

<div class="debug-panel">
	<h2>🔧 Debug Panel</h2>
	
	<div class="actions">
		<button on:click={testConnection}>Test Connection</button>
		<button on:click={testCreateCustomer}>Test Create Customer</button>
		<button on:click={testSearch}>Test Search</button>
	</div>

	<div class="results">
		<h3>Test Results:</h3>
		{#each testResults as result}
			<div class="result {result.type}">
				<span class="timestamp">[{result.timestamp}]</span>
				<span class="message">{result.message}</span>
			</div>
		{/each}
	</div>

	{#if userSchema}
		<div class="schema">
			<h3>Users Collection Schema:</h3>
			<pre>{JSON.stringify(userSchema, null, 2)}</pre>
		</div>
	{/if}
</div>

<style>
	.debug-panel {
		background: #f5f5f5;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 20px;
		margin: 20px 0;
		font-family: monospace;
	}

	.actions {
		margin-bottom: 20px;
	}

	button {
		background: #007acc;
		color: white;
		border: none;
		padding: 8px 16px;
		border-radius: 4px;
		margin-right: 10px;
		cursor: pointer;
	}

	button:hover {
		background: #005999;
	}

	.results {
		background: #fff;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 10px;
		max-height: 400px;
		overflow-y: auto;
	}

	.result {
		padding: 4px 0;
		border-bottom: 1px solid #eee;
	}

	.result:last-child {
		border-bottom: none;
	}

	.timestamp {
		color: #666;
		font-size: 0.8em;
	}

	.message {
		margin-left: 10px;
	}

	.success { color: #28a745; }
	.error { color: #dc3545; }
	.warning { color: #ffc107; }
	.info { color: #17a2b8; }

	.schema {
		margin-top: 20px;
		background: #fff;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 10px;
	}

	pre {
		font-size: 0.8em;
		overflow-x: auto;
	}
</style>
