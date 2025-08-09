<script>
	let { children } = $props();
</script>

<!-- Auth Layout with consistent styling and background -->
<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
	<!-- Optional: Auth-specific header/branding -->
	<div class="flex items-center justify-center min-h-screen p-4">
		<div class="w-full max-w-md">
			<!-- Auth card container with consistent styling -->
			<div class="bg-white rounded-xl shadow-xl overflow-hidden">
				<!-- Brand/Logo section -->
				<div class="px-8 pt-8 pb-6 text-center bg-white">
					<div class="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
						<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
						</svg>
					</div>
					<h1 class="text-2xl font-bold text-gray-900">Shop</h1>
					<p class="text-gray-600 text-sm mt-1">Your favorite online store</p>
				</div>
				
				<!-- Auth form content -->
				<div class="px-8 pb-8">
					{@render children()}
				</div>
			</div>
			
			<!-- Footer text -->
			<p class="text-center text-gray-500 text-sm mt-6">
				© 2025 Shop. All rights reserved.
			</p>
		</div>
	</div>
</div>