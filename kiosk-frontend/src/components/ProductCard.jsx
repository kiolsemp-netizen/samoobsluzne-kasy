/**
 * ProductCard - karta produktu na CatalogScreen
 * ----------------------------------------------------------------------------
 * Design:
 *   - Velká fotka produktu
 *   - Jasný název (24-28px)
 *   - VELKÁ cena (zlatá, 40px+)
 *   - Jedno velké tlačítko "PŘIDAT" (80px+ výška)
 *   - Badge "POSLEDNÍ KUS!" když qty=1
 *   - Badge s počtem v košíku
 */

import { useState } from 'react';
import { formatCzk } from '../utils/format';

export default function ProductCard({ product, inCartQuantity, onAdd }) {
  const [imgError, setImgError] = useState(false);
  const images = Array.isArray(product.images) ? product.images : [];
  const mainImage = !imgError && images.length > 0 ? images[0] : null;
  const isLastPiece = product.quantity === 1;

  return (
    <div className="panel p-6 flex flex-col relative overflow-hidden">
      {/* Badges */}
      {isLastPiece && (
        <div className="absolute top-4 left-4 bg-danger text-white font-bold px-4 py-2 rounded-xl text-kiosk-sm z-10">
          POSLEDNÍ KUS!
        </div>
      )}
      {inCartQuantity > 0 && (
        <div className="absolute top-4 right-4 bg-gold text-midnight font-bold w-14 h-14 rounded-full flex items-center justify-center text-kiosk-lg z-10">
          {inCartQuantity}
        </div>
      )}

      {/* Fotka */}
      <div className="w-full aspect-square bg-midnight rounded-2xl mb-4 flex items-center justify-center overflow-hidden">
        {mainImage ? (
          <img
            src={mainImage}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-cream/40 text-kiosk-lg">📷</div>
        )}
      </div>

      {/* Název */}
      <h3 className="text-cream text-kiosk-base font-semibold mb-2 line-clamp-2 min-h-[3rem]">
        {product.name}
      </h3>

      {/* Popis (volitelné, krátce) */}
      {product.attributes?.color && (
        <div className="text-cream/60 text-kiosk-sm mb-3">
          Barva: {product.attributes.color}
        </div>
      )}

      {/* Cena - velká, zlatá */}
      <div className="text-gold text-kiosk-xl font-bold mb-4">
        {formatCzk(product.price_czk)}
      </div>

      {/* Tlačítko přidat */}
      <button
        onClick={onAdd}
        className="btn-primary w-full text-kiosk-lg py-6"
        aria-label={`Přidat ${product.name} do košíku`}
      >
        PŘIDAT DO KOŠÍKU
      </button>
    </div>
  );
}
