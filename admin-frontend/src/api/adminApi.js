/**
 * Admin API client
 * ----------------------------------------------------------------------------
 * Axios s automatickou správou JWT:
 *   - accessToken v memory (není v localStorage - XSS ochrana)
 *   - refreshToken v httpOnly cookie (prohlížeč automaticky posílá)
 *   - 401 → auto-refresh → retry
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

let accessToken = null;
let refreshPromise = null;
let onUnauthorized = null;  // Callback při selhání refreshe (App.jsx zobrazí login)

export function setAccessToken(token) { accessToken = token; }
export function getAccessToken() { return accessToken; }
export function setUnauthorizedHandler(cb) { onUnauthorized = cb; }

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  withCredentials: true,  // posílá httpOnly cookies
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && !original.url.includes('/auth/')) {
      original._retry = true;
      try {
        // Deduplikace - pokud už probíhá refresh, počkej
        if (!refreshPromise) {
          refreshPromise = axios.post(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
            .finally(() => { refreshPromise = null; });
        }
        const response = await refreshPromise;
        accessToken = response.data.accessToken;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (e) {
        accessToken = null;
        if (onUnauthorized) onUnauthorized();
        return Promise.reject(e);
      }
    }
    return Promise.reject(err);
  }
);

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const adminApi = {
  // Auth
  login: (email, password) => api.post('/api/auth/login', { email, password }).then(r => r.data),
  logout: () => api.post('/api/auth/logout').then(r => r.data),
  me: () => api.get('/api/auth/me').then(r => r.data),
  refresh: () => api.post('/api/auth/refresh').then(r => r.data),

  // Dashboard / reports
  dashboard: () => api.get('/api/reports/dashboard').then(r => r.data),
  sales: (params) => api.get('/api/reports/sales', { params }).then(r => r.data),
  topProducts: (params) => api.get('/api/reports/top-products', { params }).then(r => r.data),
  exportCsv: (params) => api.get('/api/reports/export.csv', { params, responseType: 'blob' }),

  // Products
  products: (params) => api.get('/api/products', { params }).then(r => r.data),
  product: (id) => api.get(`/api/products/${id}`).then(r => r.data),
  createProduct: (data) => api.post('/api/products', data).then(r => r.data),
  updateProduct: (id, data) => api.put(`/api/products/${id}`, data).then(r => r.data),
  deleteProduct: (id) => api.delete(`/api/products/${id}`).then(r => r.data),
  bulkImportProducts: (products) => api.post('/api/products/bulk', { products }).then(r => r.data),

  // Inventory
  inventory: (params) => api.get('/api/inventory', { params }).then(r => r.data),
  lowStock: (params) => api.get('/api/inventory/low-stock', { params }).then(r => r.data),
  movements: (params) => api.get('/api/inventory/movements', { params }).then(r => r.data),
  restock: (data) => api.post('/api/inventory/restock', data).then(r => r.data),
  adjust: (data) => api.post('/api/inventory/adjust', data).then(r => r.data),
  transfer: (data) => api.post('/api/inventory/transfer', data).then(r => r.data),
  setThreshold: (id, threshold) => api.put(`/api/inventory/${id}/threshold`, { threshold }).then(r => r.data),

  // Orders
  orders: (params) => api.get('/api/orders', { params }).then(r => r.data),
  order: (id) => api.get(`/api/orders/${id}`).then(r => r.data),
  invoice: (id) => api.get(`/api/orders/${id}/invoice`, { responseType: 'blob' }),
  reprint: (id) => api.post(`/api/orders/${id}/reprint`).then(r => r.data),
  refund: (id, amount, reason) => api.post(`/api/payments/refund/${id}`, { amount, reason }).then(r => r.data),

  // Settings
  settings: () => api.get('/api/settings').then(r => r.data),
  setSetting: (key, value) => api.put(`/api/settings/${encodeURIComponent(key)}`, { value }).then(r => r.data),
  stalls: () => api.get('/api/stalls').then(r => r.data),
  categories: () => api.get('/api/categories').then(r => r.data),
  testPrinter: (stallId) => api.post(`/api/printer/test/${stallId}`).then(r => r.data),

  // Admin users
  adminUsers: () => api.get('/api/admin-users').then(r => r.data),
  createAdminUser: (data) => api.post('/api/admin-users', data).then(r => r.data),
};

export default api;
