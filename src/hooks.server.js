import { redirect } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Note: PocketBase auth handling will be done client-side only
	// Server-side redirects based on auth state will be handled in load functions
	
	return await resolve(event);
}
