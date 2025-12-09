import ky from 'ky';
import { authToken, baseUrl, globalLogout } from './stores';
import { get, writable } from 'svelte/store';

// Create API client with 401 handling
const createApiClient = () => {
  return ky.create({
    prefixUrl: get(baseUrl),
    hooks: {
      beforeRequest: [
        (request: any) => {
          const token = get(authToken);
          if (token) {
            request.headers.set('Authorization', `Token ${token}`);
          }
        },
      ],
      afterResponse: [
        async (request: any, options: any, response: any) => {
          // Check if response is 401 Unauthorized
          if (response.status === 401) {
            console.warn('Received 401 Unauthorized, logging out user');
            
            // Perform logout using global function with autoLogout flag
            globalLogout(true);
            
            // Throw an error to prevent further processing
            throw new Error('Authentication failed');
          }
        },
      ],
    },
  });
};

const apiStore = writable(createApiClient());

baseUrl.subscribe((url: string) => {
  apiStore.set(ky.create({
    prefixUrl: url,
    hooks: {
      beforeRequest: [
        (request: any) => {
          const token = get(authToken);
          if (token) {
            request.headers.set('Authorization', `Token ${token}`);
          }
        },
      ],
      afterResponse: [
        async (request: any, options: any, response: any) => {
          // Check if response is 401 Unauthorized
          if (response.status === 401) {
            console.warn('Received 401 Unauthorized, logging out user');
            
            // Perform logout using global function with autoLogout flag
            globalLogout(true);
            
            // Throw an error to prevent further processing
            throw new Error('Authentication failed');
          }
        },
      ],
    },
  }));
});

const api = {
  get: (url: string, options?: any) => get(apiStore).get(url, options),
  post: (url: string, options?: any) => get(apiStore).post(url, options),
  put: (url: string, options?: any) => get(apiStore).put(url, options),
  patch: (url: string, options?: any) => get(apiStore).patch(url, options),
  delete: (url: string, options?: any) => get(apiStore).delete(url, options),
};

export interface Project {
  id: number;
  title: string;
  description: string;
}

export interface TimeEntry {
  id: number;
  title: string;
  description: string;
  start_time: string;
  end_time: string | null;
  duration: string | null; // Duration in seconds as string (e.g., "8526")
  is_active: boolean;
  user: string;
  project: string;
  tags: string[];
}

export interface PaginatedTimeEntries {
  next: string | null;
  previous: string | null;
  results: TimeEntry[];
}

export interface FeatureFlag {
  id: number;
  key: string;
  name: string;
  description: string;
  is_enabled: boolean;
  rollout_percentage: number;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagsResponse {
  enabled_features: FeatureFlag[];
  disabled_features: FeatureFlag[];
  total_features: number;
}

export interface FeatureFlagCheck {
  feature_key: string;
  feature_name: string;
  is_enabled: boolean;
  feature_enabled_globally: boolean;
  user_has_access: boolean;
}

export interface Notification {
  id: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'CRITICAL' | 'OTHER';
  message: string;
  created_at: string;
  read: boolean;
  delivered_at: string | null;
}

// Cache for API responses to improve performance
const apiCache = new Map<string, { data: any; timestamp: number; ttl: number }>();

// Cache TTL in milliseconds (5 minutes for most data)
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key: string) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    console.log(`Cache hit for: ${key}`);
    return cached.data;
  }
  // Remove expired cache entry
  if (cached) {
    apiCache.delete(key);
  }
  return null;
}

function setCached(key: string, data: any, ttl: number = CACHE_TTL) {
  apiCache.set(key, { data, timestamp: Date.now(), ttl });
}

export const auth = {
  login: async (username: string, password: string) => {
    const response = await ky.post(`${get(baseUrl)}/auth/token/login/`, {
      json: { username, password },
    }).json<{ auth_token: string }>();
    return response.auth_token;
  },
  register: async (username: string, password: string, first_name: string, last_name: string) => {
    await ky.post(`${get(baseUrl)}/auth/users/`, {
      json: { username, password, first_name, last_name },
    });
  },
  getUser: async () => {
    const cacheKey = 'user:me';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await api.get('auth/users/me/').json<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null }>();
    setCached(cacheKey, result, CACHE_TTL);
    return result;
  },
  updateUser: async (data: { username?: string; first_name?: string; last_name?: string; profile_image?: string | null }) => {
    // Clear cache when updating
    apiCache.delete('user:me');
    // Use PUT to replace or update the resource; many DRF endpoints also accept PATCH
    const result = await api.put('auth/users/me/', { json: data }).json<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null }>();
    setCached('user:me', result, CACHE_TTL);
    return result;
  },
  updateUserForm: async (form: FormData) => {
    // Clear cache when updating
    apiCache.delete('user:me');
    // Use PATCH with form data to support partial updates and file upload.
    const result = await api.patch('auth/users/me/', { body: form }).json<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null }>();
    setCached('user:me', result, CACHE_TTL);
    return result;
  },
};

export const projects = {
  list: async () => {
    const cacheKey = 'projects:all';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await api.get('api/projects/').json<Project[]>();
    setCached(cacheKey, result, CACHE_TTL);
    return result;
  },
};

export const timeEntries = {
  list: async (cursor?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const url = `api/time_entries/?${params.toString()}`;
    const cacheKey = `time_entries:list:${url}`;

    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await api.get(url).json<PaginatedTimeEntries>();
    setCached(cacheKey, result, CACHE_TTL);
    return result;
  },
  listWithFilters: async (filters?: {
    start_date_after?: string;
    start_date_before?: string;
    end_date_after?: string;
    end_date_before?: string;
    duration_min?: string;
    duration_max?: string;
    project?: number;
    cursor?: string;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (filters?.start_date_after) params.append('start_date_after', filters.start_date_after);
    if (filters?.start_date_before) params.append('start_date_before', filters.start_date_before);
    if (filters?.end_date_after) params.append('end_date_after', filters.end_date_after);
    if (filters?.end_date_before) params.append('end_date_before', filters.end_date_before);
    if (filters?.duration_min) params.append('duration_min', filters.duration_min);
    if (filters?.duration_max) params.append('duration_max', filters.duration_max);
    if (filters?.project) params.append('project', filters.project.toString());
    if (filters?.cursor) params.append('cursor', filters.cursor);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    const url = `api/time_entries/?${params.toString()}`;
    const cacheKey = `time_entries:filtered:${url}`;

    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await api.get(url).json<PaginatedTimeEntries>();
    setCached(cacheKey, result, CACHE_TTL);
    return result;
  },
  start: async (data: { title: string; description?: string; project: number; tags?: number[] }) => {
    // Clear related caches when starting a new timer
    apiCache.delete('time_entries:all');
    apiCache.delete('time_entries:current_active');
    const result = await api.post('api/time_entries/', { json: data }).json<TimeEntry>();
    return result;
  },
  stop: async (id: number) => {
    // Clear related caches when stopping a timer
    apiCache.delete('time_entries:all');
    apiCache.delete('time_entries:current_active');
    const result = await api.post(`api/time_entries/${id}/stop/`).json<TimeEntry>();
    return result;
  },
  getCurrentActive: async () => {
    const cacheKey = 'time_entries:current_active';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await api.get('api/time_entries/current_active/').json<TimeEntry>();
      setCached(cacheKey, result, CACHE_TTL);
      return result;
    } catch (error) {
      // For current active, we cache null results briefly to avoid repeated API calls
      setCached(cacheKey, null, 30000); // 30 seconds for null results
      return null;
    }
  },
};

export const featureFlags = {
  getMyFeatures: async (): Promise<FeatureFlagsResponse> => {
    const cacheKey = 'feature-flags:my-features';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await api.get('api/feature-flags/user-features/my_features/').json<FeatureFlagsResponse>();
    setCached(cacheKey, result, CACHE_TTL); // Cache for 5 minutes
    return result;
  },

  checkFeature: async (featureKey: string): Promise<FeatureFlagCheck> => {
    const cacheKey = `feature-flags:check:${featureKey}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await api.get(`api/feature-flags/user-features/${featureKey}/check/`).json<FeatureFlagCheck>();
    setCached(cacheKey, result, CACHE_TTL);
    return result;
  },

  logAccess: async (featureKey: string): Promise<{ message: string; feature_key: string; feature_name: string }> => {
    // Don't cache log access calls as they should always hit the server
    return await api.post(`api/feature-flags/user-features/${featureKey}/log-access/`).json<{ message: string; feature_key: string; feature_name: string }>();
  }
};

export const notifications = {
  acknowledge: async (notificationId: string): Promise<{ message: string }> => {
    return await api.post(`api/notifications/${notificationId}/acknowledge/`).json<{ message: string }>();
  }
};