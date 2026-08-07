import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuth } from '@/auth/store';

// In dev, Vite proxies /api → localhost:8000 (see vite.config.ts).
// In prod, VITE_API_BASE_URL points to the deployed backend, e.g.
// https://idcard-api.onrender.com/api/v1  — set it in Vercel project settings.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const t = useAuth.getState().accessToken;
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refresh(): Promise<string | null> {
  const rt = useAuth.getState().refreshToken;
  if (!rt) return null;
  try {
    const resp = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: rt });
    const { access_token, refresh_token } = resp.data;
    useAuth.getState().setTokens(access_token, refresh_token);
    return access_token as string;
  } catch {
    useAuth.getState().clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshing ??= refresh().finally(() => { refreshing = null; });
      const newToken = await refreshing;
      if (newToken) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);
