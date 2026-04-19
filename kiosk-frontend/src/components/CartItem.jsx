/**
 * CartItem - řádek v košíku
 * ----------------------------------------------------------------------------
 * Každý řádek má:
 *   - fotku (malou)
 *   - název
 *   - cenu za kus
 *   - tlačítka + a - (obě obrovská, 80x80)
 *   - celkovou cenu
 *   - tlačítko smazat (koš)
 */

import { useState } from 'react';
import { formatCzk } from '../utils/format';

export default function CartItem({ item, onPlus, onMinus, onRemove }) {
  const [imgError, setImgError] = useState(false);
  const { product, quantity } = item;
  const images = Array.isArray(product.images) ? product.images : [];
  const mainImage = !imgError && images.length > 0 ? images[0] : null;
  const lineTotal = Number(product.price_czk) * quantity;

  return (
    <div className="panel p-5 flex items-center gap-5">
      {/* Fotka */}
      <div className="w-24 h-24 bg-midnight rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
        {mainImage ? (
          <img
            src={mainImage} alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="text-cream/40">📷</span>
        )}
      </div>

      {/* Název + cena za kus */}
      <div className="flex-1 min-w-0">
        <div className="text-cream text-kiosk-base font-semibold truncate">
          {product.name}
        </div>
        <div className="text-cream/60 text-kiosk-sm mt-1">
          {formatCzk(product.price_czk)} / ks
        </div>
      </div>

      {/* Kvantita (- qty +) */}
      <div className="flex items-center gap-4">
        <button onClick={onMinus} className="btn-qty" aria-label="Snížit množství">
          −
        </button>
        <div className="text-cream text-kiosk-xl font-bold w-14 text-center">
          {quantity}
        </div>
        <button onClick={onPlus} className="btn-qty" aria-label="Zvýšit množství">
          +
        </button>
      </div>

      {/* Celkem */}
      <div className="text-gold text-kiosk-lg font-bold w-36 text-right">
        {formatCzk(lineTotal)}
      </div>

      {/* Smazat */}
      <button
        onClick={onRemove}
        className="w-16 h-16 rounded-2xl bg-danger/20 active:bg-danger/40 flex items-center justify-center text-kiosk-xl"
        aria-label="Odebrat z košíku"
      >
        🗑
      </button>
    </div>
  );
}
