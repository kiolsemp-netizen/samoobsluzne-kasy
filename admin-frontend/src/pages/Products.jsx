import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';

function fmtCzk(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kč';
}

export default function Products({ user }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const isSuper = user.role === 'superadmin';

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.products({ search, limit: 500 });
      setItems(data.products);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleToggleActive = async (p) => {
    await adminApi.updateProduct(p.id, { is_active: !p.is_active });
    load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Produkty</h1>
        {isSuper && (
          <button onClick={() => setShowNew(true)} className="btn-primary">
            + Nový produkt
          </button>
        )}
      </div>

      <div className="card p-4 mb-4">
        <input
          type="text" placeholder="Hledat podle názvu nebo SKU..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <div className="text-slate-500 text-center py-8">Načítám...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-left text-sm">
              <tr>
                <th className="px-4 py-3 font-medium">Foto</th>
                <th className="px-4 py-3 font-medium">Název</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Kategorie</th>
                <th className="px-4 py-3 font-medium text-right">Cena</th>
                <th className="px-4 py-3 font-medium text-right">Sklad</th>
                <th className="px-4 py-3 font-medium">Stav</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50 text-sm">
                  <td className="px-4 py-2">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt="" className="w-12 h-12 object-contain bg-slate-100 rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400">—</div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-slate-500">{p.sku || '—'}</td>
                  <td className="px-4 py-2 text-slate-500">{p.category_name || '—'}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtCzk(p.price_czk)}</td>
                  <td className="px-4 py-2 text-right">{p.total_stock}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      p.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {p.is_active ? 'Aktivní' : 'Skrytý'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {isSuper && (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditItem(p)} className="text-blue-600 hover:underline">Upravit</button>
                        <button onClick={() => handleToggleActive(p)} className="text-slate-500 hover:underline">
                          {p.is_active ? 'Skrýt' : 'Zobrazit'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="p-8 text-center text-slate-400">Žádné produkty</div>
          )}
        </div>
      )}

      {(showNew || editItem) && (
        <ProductModal
          product={editItem}
          onClose={() => { setShowNew(false); setEditItem(null); }}
          onSaved={() => { setShowNew(false); setEditItem(null); load(); }}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    description: product?.description || '',
    price_czk: product?.price_czk || '',
    vat_rate: product?.vat_rate || 21,
    category_id: product?.category_id || '',
    images: (product?.images || []).join('\n'),
  });
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi.categories().then(d => setCategories(d.categories));
  }, []);

  const handleSave = async () => {
    setError(null); setSaving(true);
    try {
      const payload = {
        ...form,
        price_czk: Number(form.price_czk),
        vat_rate: Number(form.vat_rate),
        category_id: form.category_id ? Number(form.category_id) : null,
        images: form.images.split('\n').map(s => s.trim()).filter(Boolean),
      };
      if (product) await adminApi.updateProduct(product.id, payload);
      else await adminApi.createProduct(payload);
      onSaved();
    } catch (e) {
      setError(e.response?.data?.error || 'Chyba při ukládání');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{product ? 'Upravit produkt' : 'Nový produkt'}</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Název *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">SKU</label>
              <input className="input" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="label">Kategorie</label>
              <select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">—</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cena s DPH (Kč) *</label>
              <input type="number" step="0.01" className="input" value={form.price_czk} onChange={e => setForm({ ...form, price_czk: e.target.value })} />
            </div>
            <div>
              <label className="label">DPH %</label>
              <input type="number" step="0.01" className="input" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Popis</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">URL obrázků (jedna na řádek)</label>
            <textarea className="input font-mono text-xs" rows={3} value={form.images} onChange={e => setForm({ ...form, images: e.target.value })} />
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary">Zrušit</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Ukládám...' : 'Uložit'}
          </button>
        </div>
      </div>
    </div>
  );
}
