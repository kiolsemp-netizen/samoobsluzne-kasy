/**
 * CartScreen - zobrazení košíku
 * ----------------------------------------------------------------------------
 * Akce:
 *   - "POKRAČOVAT V NÁKUPU" → zpět do katalogu
 *   - "ZAPLATIT KARTOU" → přejde na PaymentScreen
 *
 * Před platbou se volá validate - zkontroluje dostupnost a ceny.
 */

import { useState } from 'react';
import useKioskStore, { SCREENS } from '../store/useKioskStore';
import { kioskApi } from '../api/kioskApi';
import CartItem from '../components/CartItem';
import { formatCzk } from '../utils/format';

export default function CartScreen() {
  const {
    cart, changeQuantity, removeFromCart, setScreen,
    getTotal, getItemCount, getCartPayload, setOrder, setError,
  } = useKioskStore();

  const [processing, setProcessing] = useState(false);
  const total = getTotal();
  const count = getItemCount();

  if (count === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-12">
        <div className="text-kiosk-3xl mb-8">🛍️</div>
        <h2 className="text-cream text-kiosk-xl mb-12 text-center">Košík je prázdný</h2>
        <button
          onClick={() => setScreen(SCREENS.CATALOG)}
          className="btn-primary text-kiosk-lg"
        >
          VYBRAT ZBOŽÍ
        </button>
      </div>
    );
  }

  const handleCheckout = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      // Validace (ověří aktuální zásoby a ceny)
      const validation = await kioskApi.validateCart(getCartPayload());
      if (!validation.valid) {
        const firstIssue = validation.issues[0];
        setError(`${firstIssue.error || 'Problém s košíkem'}. Zkontrolujte košík prosím.`);
        setProcessing(false);
        return;
      }

      // Vytvoř objednávku (status=pending)
      const order = await kioskApi.createOrder(getCartPayload(), 'simplified');
      setOrder({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        paymentIntentId: null,
      });

      setScreen(SCREENS.PAYMENT);
    } catch (e) {
      setError(e.response?.data?.error || 'Chyba při přípravě platby');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-midnight">
      {/* TOP BAR */}
      <div className="bg-panel shadow-lg px-8 py-6 flex items-center justify-between">
        <button
          onClick={() => setScreen(SCREENS.CATALOG)}
          className="btn-secondary"
        >
          ← POKRAČOVAT V NÁKUPU
        </button>
        <h1 className="text-gold text-kiosk-lg font-bold">VÁŠ KOŠÍK</h1>
        <div className="w-[280px]" />
      </div>

      {/* SEZNAM POLOŽEK */}
      <div className="flex-1 overflow-y-auto p-6 pb-48">
        <div className="space-y-4 fade-in">
          {cart.map(item => (
            <CartItem
              key={item.product.id}
              item={item}
              onPlus={() => changeQuantity(item.product.id, 1)}
              onMinus={() => changeQuantity(item.product.id, -1)}
              onRemove={() => removeFromCart(item.product.id)}
            />
          ))}
        </div>
      </div>

      {/* DOLNÍ LIŠTA - celkem + zaplatit */}
      <div className="fixed bottom-0 inset-x-0 bg-panel border-t-4 border-gold shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-cream text-kiosk-lg">
            Celkem {count} {count === 1 ? 'položka' : count < 5 ? 'položky' : 'položek'}
          </div>
          <div className="text-gold text-kiosk-2xl font-bold">
            {formatCzk(total)}
          </div>
        </div>
        <button
          onClick={handleCheckout}
          disabled={processing}
          className="btn-primary w-full text-kiosk-xl py-8 disabled:opacity-50"
          aria-label="Zaplatit kartou"
        >
          {processing ? 'Připravuji platbu...' : '💳  ZAPLATIT KARTOU'}
        </button>
      </div>
    </div>
  );
}
