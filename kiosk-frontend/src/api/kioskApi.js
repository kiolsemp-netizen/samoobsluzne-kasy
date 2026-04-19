/**
 * Kiosk API client
 * ----------------------------------------------------------------------------
 * Axios instance s X-Kiosk-Key headerem (čteme z Vite env nebo localStorage).
 * Automaticky detekuje offline stav.
 */

import axios from 'axios';

// Base URL - default na stejný origin (kiosk a backend na stejném PC)
const BASE_URL = import.meta.env.VITE_API_URL || '';

// Kiosk API klíč - buď ze build-time env (Vite substituuje) nebo ze localStorage
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY || localStorage.getItem('kiosk_key') || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'X-Kiosk-Key': KIOSK_KEY,
    'Content-Type': 'application/json',
  },
});

// Response interceptor pro error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
      err.isNetworkError = true;
    }
    return Promise.reject(err);
  }
);

// ============================================================================
// API metody
// ============================================================================

export const kioskApi = {
  /** Heartbeat - test připojení */
  heartbeat: () => api.post('/api/kiosk/heartbeat').then(r => r.data),

  /** Produkty dostupné na tomto stánku (s vyhledáváním a stránkováním) */
  getProducts: (page = 1, limit = 20, categoryId = null, search = '', ean = '') =>
    api.get('/api/kiosk/products', { params: { page, limit, categoryId, search, ean } }).then(r => r.data),

  /** Kategorie */
  getCategories: () => api.get('/api/kiosk/categories').then(r => r.data),

  /** Validace košíku před platbou */
  validateCart: (items) =>
    api.post('/api/kiosk/cart/validate', { items }).then(r => r.data),

  /** Vytvoření objednávky */
  createOrder: (items, receiptType = 'simplified') =>
    api.post('/api/kiosk/order', { items, receiptType }).then(r => r.data),

  /** Stav objednávky (polling po Payment Intent) */
  getOrder: (orderId) =>
    api.get(`/api/kiosk/order/${orderId}`).then(r => r.data),

  /** Stripe PaymentIntent */
  createPaymentIntent: (orderId) =>
    api.post('/api/payments/create-intent', { orderId }).then(r => r.data),

  /** Stripe Terminal connection token */
  getConnectionToken: () =>
    api.post('/api/payments/connection-token').then(r => r.data),

  /** Tisk účtenky / vygenerování faktury */
  printReceipt: (orderId, customerData = null) =>
    api.post('/api/kiosk/receipt/print', { orderId, customerData }).then(r => r.data),

  /** ARES lookup dle IČO */
  aresLookup: (ico) =>
    api.get(`/api/ares/${encodeURIComponent(ico)}`).then(r => r.data),
};

export default api;
