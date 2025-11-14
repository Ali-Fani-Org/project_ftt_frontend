import ky from 'ky';
import { authToken, baseUrl } from './stores';
import { get, writable } from 'svelte/store';

const apiStore = writable(ky.create({
  prefixUrl: get(baseUrl),
  hooks: {
    beforeRequest: [
      (request) => {
        const token = get(authToken);
        if (token) {
          request.headers.set('Authorization', `Token ${token}`);
        }
      },
    ],
  },
}));

baseUrl.subscribe((url) => {
  apiStore.set(ky.create({
    prefixUrl: url,
    hooks: {
      beforeRequest: [
        (request) => {
          const token = get(authToken);
          if (token) {
            request.headers.set('Authorization', `Token ${token}`);
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
  duration: string | null;
  is_active: boolean;
  user: string;
  project: string;
  tags: string[];
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
    return await api.get('auth/users/me/').json<{ id: number; username: string; first_name: string; last_name: string; profile_image: string | null }>();
  },
};

export const projects = {
  list: async () => {
    return await api.get('api/projects/').json<Project[]>();
  },
};

export const timeEntries = {
  list: async () => {
    return await api.get('api/time_entries/').json<TimeEntry[]>();
  },
  start: async (data: { title: string; description?: string; project: number; tags?: number[] }) => {
    return await api.post('api/time_entries/', { json: data }).json<TimeEntry>();
  },
  stop: async (id: number) => {
    return await api.post(`api/time_entries/${id}/stop/`).json<TimeEntry>();
  },
  getCurrentActive: async () => {
    return await api.get('api/time_entries/current_active/').json<TimeEntry>();
  },
};