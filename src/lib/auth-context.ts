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
function createAuthStore() {
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
      authToken.subscribe(tokenValue => {
        update(state => ({
          ...state,
          isAuthenticated: !!tokenValue,
          isLoading: false,
          user: tokenValue ? user : null,
        }));
      });

      user.subscribe(userValue => {
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
        
        if (error.response?.status === 400) {
          const data = error.response?._data;
          if (data?.username) {
            errorMessage = 'Username already exists';
          } else if (data?.password) {
            errorMessage = 'Password requirements not met';
          }
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