/**
 * CatalogScreen - mřížka produktů
 * ----------------------------------------------------------------------------
 * Design pro seniory:
 *   - 2 sloupce (velké karty)
 *   - Filtr kategorií jako VELKÉ záložky (min 80px výška)
 *   - Viditelný "KOŠÍK" tlačítko dole s počtem a cenou
 *   - Zpět → obrovské tlačítko "ZPĚT"
 */

import { useEffect, useState } from 'react';
import useKioskStore, { SCREENS } from '../store/useKioskStore';
import { kioskApi } from '../api/kioskApi';
import ProductCard from '../components/ProductCard';
import { formatCzk } from '../utils/format';

export default function CatalogScreen() {
  const {
    products, categories, cart, setProducts, setCategories,
    addToCart, setScreen, resetToWelcome, getItemCount, getTotal,
  } = useKioskStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Načti produkty a kategorie
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [pData, cData] = await Promise.all([
          kioskApi.getProducts(),
          kioskApi.getCategories(),
        ]);
        if (!mounted) return;
        setProducts(pData.products || []);
        setCategories(cData.categories || []);
        setLoadError(null);
      } catch (e) {
        if (!mounted) return;
        setLoadError(e.isNetworkError ? 'Problém s připojením' : 'Nelze načíst zboží');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [setProducts, setCategories]);

  // Jen kategorie, které mají alespoň jeden produkt
  const usedCategoryIds = new Set(products.map(p => p.category_id).filter(Boolean));
  const visibleCategories = categories.filter(c => usedCategoryIds.has(c.id));

  // Filtrované produkty
  const filtered = selectedCategory === 'all'
    ? products
    : products.filter(p => p.category_id === selectedCategory);

  const itemCount = getItemCount();
  const total = getTotal();

  // Mapa productId → qty v košíku
  const cartMap = new Map(cart.map(it => [it.product.id, it.quantity]));

  return (
    <div className="min-h-screen flex flex-col bg-midnight">

      {/* ======== TOP BAR ======== */}
      <div className="bg-panel shadow-lg px-8 py-6 flex items-center justify-between">
        <button
          onClick={resetToWelcome}
          className="btn-secondary text-kiosk-base"
          aria-label="Zpět na úvodní obrazovku"
        >
          ← ZPĚT
        </button>
        <h1 className="text-gold text-kiosk-lg font-bold">VYBERTE ZBOŽÍ</h1>
        <div className="w-[180px]" />  {/* spacer pro zarovnání */}
      </div>

      {/* ======== FILTR KATEGORIÍ ======== */}
      {visibleCategories.length > 0 && (
        <div className="bg-ink px-8 py-4 flex gap-4 overflow-x-auto">
          <CategoryTab
            label="VŠE"
            active={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            count={products.length}
          />
          {visibleCategories.map(c => (
            <CategoryTab
              key={c.id}
              label={c.name.toUpperCase()}
              active={selectedCategory === c.id}
              onClick={() => setSelectedCategory(c.id)}
              count={products.filter(p => p.category_id === c.id).length}
            />
          ))}
        </div>
      )}

      {/* ======== MŘÍŽKA PRODUKTŮ ======== */}
      <div className="flex-1 overflow-y-auto p-6 pb-40">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-20 h-20 border-8 border-gold border-t-transparent rounded-full spin-slow" />
            <p className="text-cream text-kiosk-lg mt-8">Načítám zboží...</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="text-center py-32">
            <p className="text-danger text-kiosk-xl mb-8">{loadError}</p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              Zkusit znovu
            </button>
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div className="text-center py-32 text-cream/60 text-kiosk-lg">
            V této kategorii momentálně není žádné zboží.
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-6 fade-in">
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                inCartQuantity={cartMap.get(p.id) || 0}
                onAdd={() => addToCart(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ======== DOLNÍ LIŠTA S KOŠÍKEM ======== */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-panel border-t-4 border-gold shadow-2xl p-6 flex items-center gap-6 fade-in">
          <div className="flex-1">
            <div className="text-cream/60 text-kiosk-sm">V košíku</div>
            <div className="text-cream text-kiosk-lg font-bold">
              {itemCount} {itemCount === 1 ? 'položka' : itemCount < 5 ? 'položky' : 'položek'}
            </div>
          </div>
          <div className="text-gold text-kiosk-xl font-bold">
            {formatCzk(total)}
          </div>
          <button
            onClick={() => setScreen(SCREENS.CART)}
            className="btn-primary text-kiosk-lg py-6 px-10"
          >
            KOŠÍK →
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryTab({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-shrink-0 px-8 py-4 rounded-2xl font-semibold text-kiosk-base
        min-h-[80px] min-w-[140px] transition-all
        ${active
          ? 'bg-gold text-midnight scale-105 shadow-lg'
          : 'bg-panel text-cream border-2 border-cream/20 active:scale-95'}
      `}
    >
      {label}
      <div className={`text-kiosk-sm mt-1 ${active ? 'text-midnight/70' : 'text-cream/50'}`}>
        ({count})
      </div>
    </button>
  );
}
