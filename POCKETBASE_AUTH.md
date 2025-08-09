# PocketBase Authentication Integration

This project now includes PocketBase authentication with the following features:

## 🚀 Features

- **User Registration** - Create new accounts with email verification
- **User Login** - Authenticate with email and password
- **Password Reset** - Request password reset via email
- **Authentication State Management** - Reactive stores for auth status
- **Protected Routes** - Automatic redirection for unauthenticated users
- **Responsive Navigation** - Shows user status and logout functionality

## 🔧 Configuration

The PocketBase endpoint is configured in `src/lib/pocketbase.js`:
```javascript
export const pb = new PocketBase('http://178.18.250.118:8091');
```

## 📁 File Structure

```
src/
├── lib/
│   ├── pocketbase.js       # PocketBase client and auth functions
│   ├── authStore.js        # Svelte store for auth state
│   └── components/
│       └── Navbar.svelte   # Navigation with auth status
├── routes/
│   ├── (auth)/            # Auth route group
│   │   ├── +layout.svelte # Auth layout
│   │   ├── login/         # Login page
│   │   ├── signup/        # Registration page
│   │   └── forgot_password/ # Password reset page
│   ├── auth-test/         # Test page for auth functionality
│   └── +layout.svelte     # Main layout with auth initialization
└── hooks.server.js        # Server-side auth protection
```

## 🔑 User Schema

The PocketBase users collection should have these fields:
- `username` (text) - Used as email
- `email` (email) - User's email address
- `name` (text) - User's full name
- `role` (text) - User role (default: "user")
- `phone` (number, optional) - Phone number
- `addresses` (json, optional) - Address information

## 🎯 Usage

### Basic Authentication
```javascript
import { auth } from '$lib/pocketbase.js';

// Sign up
const result = await auth.signUp({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    passwordConfirm: 'password123'
});

// Sign in
const result = await auth.signIn('john@example.com', 'password123');

// Sign out
auth.signOut();
```

### Auth State Management
```javascript
import { authStore } from '$lib/authStore.js';

// Check authentication status
$authStore.isAuthenticated
$authStore.user
$authStore.isLoading
```

## 🧪 Testing

Visit `/auth-test` to test the authentication functionality with the provided test interface.

## 🛡️ Protected Routes

Routes are automatically protected based on the configuration in `hooks.server.js`:
- Protected routes: `/profile`, `/dashboard`, `/account`
- Auth routes (redirect if already logged in): `/login`, `/signup`, `/forgot_password`

## 📱 Features

- **Responsive Design** - Works on desktop and mobile
- **Error Handling** - User-friendly error messages
- **Success Messages** - Confirmation for successful actions
- **Email Verification** - Optional email verification on signup
- **Loading States** - Visual feedback during API calls

## 🔄 Auto-refresh

The authentication state is automatically refreshed on page load and synchronized across browser tabs.
