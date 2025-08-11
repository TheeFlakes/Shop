import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

// Only initialize PocketBase on the client side
export const pb = browser ? new PocketBase('http://178.18.250.118:8091') : null;

// Create stores for authentication state
export const currentUser = writable(browser && pb ? pb.authStore.model : null);
export const isAuthenticated = writable(browser && pb ? pb.authStore.isValid : false);

// Listen for auth changes only on client side
if (browser && pb) {
	pb.authStore.onChange((auth) => {
		currentUser.set(pb.authStore.model);
		isAuthenticated.set(pb.authStore.isValid);
	});
}

// Auth functions
export const auth = {
	/**
	 * Redirect user based on their role
	 */
	redirectByRole(/** @type {any} */ user) {
		if (!browser || !user) {
			console.warn('Cannot redirect: browser context or user not available');
			return;
		}
		
		const role = user.role;
		console.log('Redirecting user based on role:', { 
			userEmail: user.email, 
			role: role, 
			userObject: user 
		});
		
		// Handle role-based redirection with case-insensitive comparison
		const normalizedRole = role ? role.toLowerCase().trim() : '';
		
		switch (normalizedRole) {
			case 'admin':
				console.log('Redirecting admin user to /admin');
				goto('/admin');
				break;
			case 'manager':
				console.log('Redirecting manager user to /manager');
				goto('/manager');
				break;
			case 'customer':
				console.log('Redirecting customer user to /dashboard');
				goto('/dashboard');
				break;
			default:
				// If role is not recognized, default to dashboard
				console.warn('Unknown role or no role found:', role, 'defaulting to /dashboard');
				goto('/dashboard');
				break;
		}
	},

	/**
	 * Sign up a new user
	 */
	async signUp(/** @type {any} */ userData) {
		if (!browser || !pb) {
			return { success: false, error: 'PocketBase not available' };
		}

		try {
			// Generate a valid username from email (remove special characters and make unique)
			const baseUsername = userData.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
			const timestamp = Date.now().toString();
			const randomSuffix = Math.random().toString(36).substring(2, 8);
			const username = baseUsername + timestamp.slice(-6) + randomSuffix;

			/** @type {any} */
			const data = {
				username: username,
				email: userData.email,
				emailVisibility: true,
				password: userData.password,
				passwordConfirm: userData.passwordConfirm,
				name: userData.name,
				role: 'customer' // Default role is customer
			};

			// Only add phone if it has a value
			if (userData.phone && userData.phone.trim()) {
				// Convert phone to number if it's all digits, otherwise keep as string
				const phoneValue = userData.phone.trim();
				const numericPhone = phoneValue.replace(/\D/g, ''); // Remove non-digits
				data.phone = numericPhone ? parseInt(numericPhone, 10) : phoneValue;
			}

			console.log('Attempting to create user with data:', {
				...data,
				password: '[HIDDEN]',
				passwordConfirm: '[HIDDEN]'
			});
			const record = await pb.collection('users').create(data);
			
			// Send verification email
			try {
				await pb.collection('users').requestVerification(userData.email);
				console.log('Verification email sent successfully');
			} catch (verificationError) {
				console.warn('Email verification failed:', verificationError);
				// Continue even if verification fails
			}

			return { success: true, user: record };
		} catch (error) {
			console.error('Sign up error:', error);
			
			// Extract more specific error information
			let errorMessage = 'Failed to create account';
			const err = /** @type {any} */ (error);
			
			// Handle ClientResponseError specifically
			if (err && err.name === 'ClientResponseError') {
				console.error('PocketBase ClientResponseError:', {
					status: err.status,
					data: err.data,
					originalError: err.originalError,
					response: err.response
				});
				
				if (err.data && typeof err.data === 'object') {
					const fieldErrors = [];
					for (const [field, details] of Object.entries(err.data)) {
						if (details && typeof details === 'object' && 'message' in details) {
							fieldErrors.push(`${field}: ${/** @type {any} */ (details).message}`);
						} else if (details && typeof details === 'object' && 'code' in details) {
							fieldErrors.push(`${field}: ${/** @type {any} */ (details).code}`);
						} else if (typeof details === 'string') {
							fieldErrors.push(`${field}: ${details}`);
						}
					}
					if (fieldErrors.length > 0) {
						errorMessage = fieldErrors.join(', ');
					}
				}
				
				if (err.message && errorMessage === 'Failed to create account') {
					errorMessage = err.message;
				}
			} else if (err && typeof err === 'object' && 'response' in err && err.response) {
				const errorData = /** @type {any} */ (err.response).data;
				console.error('PocketBase error response:', errorData);
				
				if (errorData && errorData.message) {
					errorMessage = errorData.message;
				} else if (errorData && errorData.data) {
					// Handle field-specific validation errors
					const fieldErrors = [];
					for (const [field, details] of Object.entries(errorData.data)) {
						if (details && typeof details === 'object' && 'message' in details) {
							fieldErrors.push(`${field}: ${/** @type {any} */ (details).message}`);
						} else if (details && typeof details === 'object' && 'code' in details) {
							fieldErrors.push(`${field}: ${/** @type {any} */ (details).code}`);
						}
					}
					if (fieldErrors.length > 0) {
						errorMessage = fieldErrors.join(', ');
					}
				}
			} else if (err && typeof err === 'object' && 'message' in err) {
				errorMessage = err.message;
			}
			
			// Log the full error details for debugging
			console.error('Full error object:', {
				message: err.message,
				status: err.status,
				response: err.response,
				data: err.data
			});
			
			return { 
				success: false, 
				error: errorMessage
			};
		}
	},

	/**
	 * Sign in with email and password
	 */
	async signIn(/** @type {string} */ email, /** @type {string} */ password) {
		if (!browser || !pb) {
			return { success: false, error: 'PocketBase not available' };
		}

		try {
			// Since we now generate usernames from emails, we need to authenticate with the email field
			// PocketBase allows authentication with email even if username is different
			const authData = await pb.collection('users').authWithPassword(email, password);
			
			if (browser && authData.record) {
				// Redirect based on user role
				this.redirectByRole(authData.record);
			}
			
			return { success: true, user: authData.record };
		} catch (error) {
			console.error('Sign in error:', error);
			
			// Extract more detailed error information
			let errorMessage = 'Invalid email or password';
			const err = /** @type {any} */ (error);
			
			if (err && err.name === 'ClientResponseError') {
				if (err.status === 400) {
					errorMessage = 'Invalid email or password. Please check your credentials.';
				} else if (err.status === 404) {
					errorMessage = 'User not found. Please check your email or sign up for a new account.';
				} else if (err.message) {
					errorMessage = err.message;
				}
			} else if (err && typeof err === 'object' && 'message' in err) {
				errorMessage = err.message;
			}
			
			return { 
				success: false, 
				error: errorMessage
			};
		}
	},

	/**
	 * Sign out the current user
	 */
	signOut() {
		if (!browser || !pb) return;
		
		pb.authStore.clear();
		if (browser) {
			goto('/login');
		}
	},

	/**
	 * Request password reset
	 */
	async requestPasswordReset(/** @type {string} */ email) {
		if (!browser || !pb) {
			return { success: false, error: 'PocketBase not available' };
		}

		try {
			await pb.collection('users').requestPasswordReset(email);
			return { success: true };
		} catch (error) {
			console.error('Password reset error:', error);
			return { 
				success: false, 
				error: (error instanceof Error) ? error.message : 'Failed to send reset email' 
			};
		}
	},

	/**
	 * Update user profile
	 */
	async updateProfile(/** @type {string} */ userId, /** @type {any} */ userData) {
		if (!browser || !pb) {
			return { success: false, error: 'PocketBase not available' };
		}

		try {
			const record = await pb.collection('users').update(userId, userData);
			return { success: true, user: record };
		} catch (error) {
			console.error('Profile update error:', error);
			return { 
				success: false, 
				error: (error instanceof Error) ? error.message : 'Failed to update profile' 
			};
		}
	},

	/**
	 * Refresh the authentication if needed
	 */
	async refresh() {
		if (!browser || !pb) return;

		try {
			if (pb.authStore.isValid) {
				await pb.collection('users').authRefresh();
			}
		} catch (error) {
			console.error('Auth refresh error:', error);
			pb.authStore.clear();
		}
	},

	/**
	 * Get the current user's role
	 */
	getCurrentUserRole() {
		if (!browser || !pb || !pb.authStore.model) {
			return null;
		}
		const role = pb.authStore.model.role || 'customer';
		return role.toLowerCase().trim();
	},

	/**
	 * Check if current user has a specific role
	 */
	hasRole(/** @type {string} */ role) {
		const currentRole = this.getCurrentUserRole();
		return currentRole === role.toLowerCase().trim();
	},

	/**
	 * Check if current user has admin privileges
	 */
	isAdmin() {
		return this.hasRole('admin');
	},

	/**
	 * Check if current user is a manager
	 */
	isManager() {
		return this.hasRole('manager');
	},

	/**
	 * Check if current user is a customer
	 */
	isCustomer() {
		return this.hasRole('customer');
	}
};

// Initialize auth on client-side
if (browser) {
	// Refresh auth on page load if token exists
	auth.refresh();
}
