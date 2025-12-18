import { setContext, getContext } from 'svelte';
import { writable } from 'svelte/store';
import { authToken, user, globalLogout } from './stores';
import { auth } from './api';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

// Authentication state interface
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: any | null;
}

// Create the auth state store
export function createAuthStore(): AuthStore {
  const { subscribe, set, update } = writable<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
    user: null,
  });

  return {
    subscribe,

    // Initialize authentication state from stores
    initialize: () => {
      // Subscribe to changes in auth stores
      authToken.subscribe((tokenValue: string | null) => {
        update(state => ({
          ...state,
          isAuthenticated: !!tokenValue,
          isLoading: false,
          user: tokenValue ? user : null,
        }));
      });

      user.subscribe((userValue: any | null) => {
        update(state => ({
          ...state,
          user: userValue,
        }));
      });
    },

    // Login function with session management
    login: async (username: string, password: string, rememberMe = false) => {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const token = await auth.login(username, password);

        // Handle session management based on remember me
        if (browser) {
          if (rememberMe) {
            // For "remember me", keep token in localStorage (already handled by createPersistentStore)
            sessionStorage.setItem('session_type', 'persistent');
          } else {
            // For no "remember me", use sessionStorage instead
            sessionStorage.setItem('auth_token', token);
            sessionStorage.setItem('session_type', 'session');

            // Clear from localStorage but keep the token for now
            // In a real app, you'd want to handle this more carefully
            localStorage.removeItem('authToken');
          }
        }

        authToken.set(token);

        const userData = await auth.getUser();
        user.set(userData);

        update(state => ({
          ...state,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          user: userData,
        }));

        return { success: true };
      } catch (error: any) {
        const errorMessage = error.response?.status === 400
          ? 'Invalid username or password'
          : 'Login failed. Please try again.';

        update(state => ({
          ...state,
          isLoading: false,
          error: errorMessage,
        }));

        return { success: false, error: errorMessage };
      }
    },

    // Register function
    register: async (username: string, password: string, firstName: string, lastName: string) => {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        await auth.register(username, password, firstName, lastName);

        // After successful registration, automatically login
        const result = await auth.login(username, password);
        authToken.set(result);

        const userData = await auth.getUser();
        user.set(userData);

        update(state => ({
          ...state,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          user: userData,
        }));

        return { success: true };
      } catch (error: any) {
        let errorMessage = 'Registration failed. Please try again.';
        const validationErrors: {[key: string]: string} = {};

        if (error.response?.status === 400) {
          // Try multiple possible locations for the error data depending on Ky's response format
          let data = error.response?._data || error.response?.data || error.data;

          // Handle field-specific validation errors
          if (data) {
            // Map server-side field validation errors to field names
            if (Array.isArray(data.username)) {
              validationErrors.username = data.username.join(', ');
            } else if (typeof data.username === 'string') {
              validationErrors.username = data.username;
            }

            if (Array.isArray(data.password)) {
              validationErrors.password = data.password.join(', ');
            } else if (typeof data.password === 'string') {
              validationErrors.password = data.password;
            }

            if (Array.isArray(data.first_name)) {
              validationErrors.firstName = data.first_name.join(', ');
            } else if (typeof data.first_name === 'string') {
              validationErrors.firstName = data.first_name;
            }

            if (Array.isArray(data.last_name)) {
              validationErrors.lastName = data.last_name.join(', ');
            } else if (typeof data.last_name === 'string') {
              validationErrors.lastName = data.last_name;
            }

            if (Array.isArray(data.email)) {
              validationErrors.email = data.email.join(', ');
            } else if (typeof data.email === 'string') {
              validationErrors.email = data.email;
            }

            // If we have field-specific validation errors, return them
            if (Object.keys(validationErrors).length > 0) {
              update(state => ({
                ...state,
                isLoading: false,
                error: null,
              }));

              return { success: false, validationErrors };
            }

            // If we have a general error message from the server
            if (data.detail) {
              errorMessage = data.detail;
            } else if (data.non_field_errors && Array.isArray(data.non_field_errors)) {
              errorMessage = data.non_field_errors[0];
            }
          }
          // If no specific field errors were found but status is 400, try to show raw response
          else {
            console.log('Error response data structure:', error.response);
          }
        } else if (error.response?.status === 401) {
          errorMessage = 'Unauthorized access. Please try again.';
        } else if (error.response?.status === 500) {
          errorMessage = 'Server error. Please try again later.';
        }

        update(state => ({
          ...state,
          isLoading: false,
          error: errorMessage,
        }));

        return { success: false, error: errorMessage };
      }
    },

    // Logout function with session cleanup
    logout: () => {
      // Use global logout function for consistency
      globalLogout(false);
    },

    // Clear error
    clearError: () => {
      update(state => ({ ...state, error: null }));
    },

    // Check authentication status
    checkAuthStatus: () => {
      const currentToken = authToken;
      const currentUser = user;

      update(state => ({
        ...state,
        isAuthenticated: !!currentToken,
        user: currentUser,
      }));
    },

    // Get current session type
    getSessionType: () => {
      if (browser) {
        return sessionStorage.getItem('session_type') || 'persistent';
      }
      return 'persistent';
    }
  };
}

// Create and export the auth store
export const authStore = createAuthStore();

// Context key for authentication
export const AUTH_CONTEXT_KEY = 'auth-context';

// Function to set auth context
export function setAuthContext() {
  return setContext(AUTH_CONTEXT_KEY, authStore);
}

// Function to get auth context
export function getAuthContext() {
  return getContext(AUTH_CONTEXT_KEY);
}

// AuthStore interface
export interface AuthStore {
  subscribe: any;
  initialize: () => void;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean } | { success: false, error: string }>;
  register: (username: string, password: string, firstName: string, lastName: string) => Promise<{ success: boolean } | { success: false, error: string }>;
  logout: () => void;
  clearError: () => void;
  checkAuthStatus: () => void;
  getSessionType: () => string;
}