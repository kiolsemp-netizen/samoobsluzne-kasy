/**
 * Zustand store - globální stav kiosku
 * ----------------------------------------------------------------------------
 * Drží:
 *   - košík
 *   - aktuální obrazovku (navigace)
 *   - metadata objednávky (po vytvoření)
 *   - online/offline stav
 *   - timestamp poslední aktivity (pro idle timeout)
 */

import { create } from 'zustand';

export const SCREENS = {
  WELCOME: 'welcome',
  CATALOG: 'catalog',
  CART: 'cart',
  PAYMENT: 'payment',
  SUCCESS: 'success',
  INVOICE: 'invoice',
  PRINTING: 'printing',
  OFFLINE: 'offline',
};

const useKioskStore = create((set, get) => ({
  // ============ Stav =========================================================
  stallId: null,
  products: [],
  categories: [],
  cart: [],                       // [{ product, quantity }]
  currentScreen: SCREENS.WELCOME,
  orderId: null,
  orderNumber: null,
  paymentIntentId: null,
  receiptType: 'simplified',      // 'simplified' | 'invoice' | 'none'
  customerData: null,
  lastActivity: Date.now(),
  isOffline: !navigator.onLine,
  errorMessage: null,

  // ============ Akce =========================================================

  setStallId: (id) => set({ stallId: id }),
  setProducts: (products) => set({ products }),
  setCategories: (categories) => set({ categories }),
  setIsOffline: (isOffline) => set({ isOffline }),
  setError: (msg) => set({ errorMessage: msg }),
  clearError: () => set({ errorMessage: null }),

  /** Přejdi na danou obrazovku (aktualizuje lastActivity) */
  setScreen: (screen) => set({ currentScreen: screen, lastActivity: Date.now() }),

  /** Reset aktivity (na dotyk) */
  updateActivity: () => set({ lastActivity: Date.now() }),

  /** Přidá produkt do košíku (nebo zvýší kvantitu) */
  addToCart: (product) => {
    const cart = get().cart;
    const existing = cart.find(it => it.product.id === product.id);

    // Zkontroluj zásobu
    const currentQty = existing ? existing.quantity : 0;
    if (currentQty + 1 > product.quantity) {
      set({ errorMessage: `Máme pouze ${product.quantity} ks tohoto zboží.` });
      return false;
    }

    if (existing) {
      set({
        cart: cart.map(it =>
          it.product.id === product.id ? { ...it, quantity: it.quantity + 1 } : it
        ),
        lastActivity: Date.now(),
      });
    } else {
      set({
        cart: [...cart, { product, quantity: 1 }],
        lastActivity: Date.now(),
      });
    }
    return true;
  },

  /** Změna množství (+/- tlačítka) */
  changeQuantity: (productId, delta) => {
    const cart = get().cart;
    const item = cart.find(it => it.product.id === productId);
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      set({ cart: cart.filter(it => it.product.id !== productId), lastActivity: Date.now() });
      return;
    }
    if (newQty > item.product.quantity) {
      set({ errorMessage: `Máme pouze ${item.product.quantity} ks tohoto zboží.` });
      return;
    }
    set({
      cart: cart.map(it => (it.product.id === productId ? { ...it, quantity: newQty } : it)),
      lastActivity: Date.now(),
    });
  },

  /** Úplné odebrání z košíku */
  removeFromCart: (productId) => {
    set({
      cart: get().cart.filter(it => it.product.id !== productId),
      lastActivity: Date.now(),
    });
  },

  /** Vymaž košík a kompletní stav objednávky (po úspěšné platbě nebo reset) */
  clearCart: () => set({
    cart: [],
    orderId: null,
    orderNumber: null,
    paymentIntentId: null,
    receiptType: 'simplified',
    customerData: null,
    errorMessage: null,
  }),

  /** Nastav metadata objednávky (po volání createOrder) */
  setOrder: ({ orderId, orderNumber, paymentIntentId }) =>
    set({ orderId, orderNumber, paymentIntentId, lastActivity: Date.now() }),

  setReceiptType: (type) => set({ receiptType: type, lastActivity: Date.now() }),
  setCustomerData: (data) => set({ customerData: data }),

  /** Reset do úvodní obrazovky (po timeoutu nebo dokončení) */
  resetToWelcome: () => set({
    cart: [],
    orderId: null,
    orderNumber: null,
    paymentIntentId: null,
    receiptType: 'simplified',
    customerData: null,
    errorMessage: null,
    currentScreen: SCREENS.WELCOME,
    lastActivity: Date.now(),
  }),

  // ============ Vypočtené =================================================

  /** Celková cena v košíku */
  getTotal: () => {
    return get().cart.reduce(
      (sum, it) => sum + Number(it.product.price_czk) * it.quantity,
      0
    );
  },

  /** Počet položek v košíku */
  getItemCount: () => {
    return get().cart.reduce((sum, it) => sum + it.quantity, 0);
  },

  /** Formát pro backend (items pole) */
  getCartPayload: () => {
    return get().cart.map(it => ({
      productId: it.product.id,
      quantity: it.quantity,
    }));
  },
}));

export default useKioskStore;
