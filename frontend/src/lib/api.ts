import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config;
    if (err.response?.status === 401 && original && !(original as any)._retried) {
      (original as any)._retried = true;
      try {
        refreshing ||= api.post('/auth/refresh').then(() => undefined).finally(() => {
          refreshing = null;
        });
        await refreshing;
        return api(original);
      } catch {
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export interface ApiError {
  error: { code: string; message: string; requestId?: string; details?: unknown };
}
