import axios from 'axios';
import { API_URL } from './apiURL';
import { URL } from './webURL';
import { useAuthStore } from '@/store/auth';
export { axios, API_URL, URL };

// ----------------------------------------------------------------------
// Disable console logs in production for Vite
if (import.meta.env.MODE === 'production') {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}

// Debug Environment
console.log('MODE:', import.meta.env.MODE);
console.log('DEV:', import.meta.env.DEV);
console.log('PROD:', import.meta.env.PROD);
console.log('All env vars:', import.meta.env);

export const api = axios.create({
  baseURL: API_URL.BASE_URL,
  withCredentials: true,
  timeout: 5000,
});

// ----------------------------------------------------------------------
// Request Interceptor
// ไม่ต้องแนบ Authorization Header แล้ว
api.interceptors.request.use((config) => {
  return config;
});

// ----------------------------------------------------------------------
// Response Interceptor
api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';

    // If 401 and not the login endpoint, try refresh once and retry
    if (status === 401 && !url.includes(API_URL.LOGIN)) {
      // If this request explicitly opted out of auth-redirect (e.g. initial silent refresh on app mount),
      // perform a silent logout and do not force a full-page redirect. This prevents a reload/redirect loop
      // when cookies are missing (cleared) and the app's mount triggers a refresh request.
      if (error.config?._skipAuthRedirect) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      // If the request was the refresh endpoint itself, don't loop — perform redirect to login
      if (url.includes(API_URL.REFRESH)) {
        useAuthStore.getState().logout();
        window.location.href = URL.LOGIN;
        return Promise.reject(error);
      }

      // Only retry once per request
      if (!error.config._retry) {
        error.config._retry = true;

        try {
          // Call refresh endpoint directly with axios to avoid re-triggering this interceptor
          const base = API_URL.BASE_URL || '';
          const refreshRes = await axios.post(`${base}${API_URL.REFRESH}`, {}, { withCredentials: true });

          // Update local auth store from refresh response
          const { id, fullname, profile_image, username, role, permissions } = refreshRes.data || {};
          if (username && role) {
            useAuthStore.getState().setAuth(id, fullname, profile_image, username, role, permissions || []);
          }

          // Retry original request
          return api.request(error.config);
        } catch (refreshErr) {
          useAuthStore.getState().logout();
          window.location.href = URL.LOGIN;
          return Promise.reject(refreshErr);
        }
      }

      // If we've already retried, perform logout
      useAuthStore.getState().logout();
      window.location.href = URL.LOGIN;
    }

    return Promise.reject(error);
  }
);
