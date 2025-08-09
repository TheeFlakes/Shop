import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { pb } from './pocketbase.js';

function createAuthStore() {
	const { subscribe, set, update } = writable({
		user: /** @type {any} */ (null),
		isLoading: true,
		isAuthenticated: false
	});

	return {
		subscribe,
		init: () => {
			if (browser && pb) {
				// Initialize with current auth state
				const user = pb.authStore.model || null;
				const isAuthenticated = pb.authStore.isValid;
				
				set({
					user,
					isLoading: false,
					isAuthenticated
				});

				// Listen for changes
				pb.authStore.onChange((auth) => {
					if (pb) {
						set({
							user: pb.authStore.model || null,
							isLoading: false,
							isAuthenticated: pb.authStore.isValid
						});
					}
				});
			} else {
				// On server side or when pb is not available
				set({
					user: null,
					isLoading: false,
					isAuthenticated: false
				});
			}
		},
		setLoading: (/** @type {boolean} */ loading) => {
			update(state => ({ ...state, isLoading: loading }));
		}
	};
}

export const authStore = createAuthStore();
