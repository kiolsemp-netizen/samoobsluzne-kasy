import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';

export default function Inventory({ user }) {
  const [items, setItems] = useState([]);
  const [stalls, setStalls] = useState([]);
  const [filter, setFilter] = useState({ stall_id: '', search: '', low_only: false });
  const [action, setAction] = useState(null);
  const [movements, setMovements] = useState([]);
  const [showMovements, setShowMovements] = useState(false);

  const load = async () => {
    const params = {};
    if (filter.stall_id) params.stall_id = filter.stall_id;
    if (filter.search) params.search = filter.search;
    if (filter.low_only) params.low_only = 'true';
    const [inv, s] = await Promise.all([adminApi.inventory(params), adminApi.stalls()]);
    setItems(inv.inventory);
    setStalls(s.stalls);
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadMovements = async () => {
    const data = await adminApi.movements({ limit: 100 });
    setMovements(data.movements);
    setShowMovements(true);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Sklad</h1>
        <button onClick={loadMovements} className="btn-secondary">Historie pohybů</button>
      </div>

      {/* Filtry */}
      <div className="card p-4 mb-4 flex gap-3 flex-wrap">
        <input
          placeholder="Hledat produkt..." className="input flex-1 min-w-[200px]"
          value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })}
        />
        <select className="input" style={{ width: 'auto' }}
          value={filter.stall_id} onChange={e => setFilter({ ...filter, stall_id: e.target.value })}>
          <option value="">Všechny stánky</option>
          {stalls.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filter.low_only} onChange={e => setFilter({ ...filter, low_only: e.target.checked })} />
          Jen nízký sklad
        </label>
      </div>

      {/* Tabulka */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-sm">
            <tr>
              <th className="px-4 py-3 font-medium">Produkt</th>
              <th className="px-4 py-3 font-medium">Stánek</th>
              <th className="px-4 py-3 font-medium text-right">Ks</th>
              <th className="px-4 py-3 font-medium text-right">Limit</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t border-slate-100 text-sm hover:bg-slate-50">
                <td className="px-4 py-2">
                  <div className="font-medium">{item.product_name}</div>
                  <div className="text-xs text-slate-500">{item.sku}</div>
                </td>
                <td className="px-4 py-2 text-slate-600">{item.stall_name}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`font-bold ${
                    item.quantity === 0 ? 'text-red-600'
                    : item.quantity <= item.low_stock_threshold ? 'text-orange-600'
                    : 'text-green-700'
                  }`}>{item.quantity}</span>
                </td>
                <td className="px-4 py-2 text-right text-slate-500">{item.low_stock_threshold}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setAction({ type: 'restock', item })} className="text-green-600 text-xs hover:underline">+ Naskladnit</button>
                    <button onClick={() => setAction({ type: 'adjust', item })} className="text-blue-600 text-xs hover:underline">Upravit</button>
                    <button onClick={() => setAction({ type: 'transfer', item })} className="text-purple-600 text-xs hover:underline">Přesunout</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-8 text-center text-slate-400">Žádné položky</div>}
      </div>

      {action && <ActionModal action={action} stalls={stalls} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); }} />}
      {showMovements && <MovementsModal movements={movements} onClose={() => setShowMovements(false)} />}
    </div>
  );
}

function ActionModal({ action, stalls, onClose, onDone }) {
  const { type, item } = action;
  const [qty, setQty] = useState(type === 'adjust' ? item.quantity : 1);
  const [toStall, setToStall] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const otherStalls = stalls.filter(s => s.id !== item.stall_id);

  const handle = async () => {
    setError(null); setSaving(true);
    try {
      if (type === 'restock') {
        await adminApi.restock({ productId: item.product_id, stallId: item.stall_id, quantity: qty, note });
      } else if (type === 'adjust') {
        await adminApi.adjust({ productId: item.product_id, stallId: item.stall_id, newQuantity: qty, note });
      } else if (type === 'transfer') {
        if (!toStall) throw new Error('Vyberte cílový stánek');
        await adminApi.transfer({ productId: item.product_id, fromStallId: item.stall_id, toStallId: Number(toStall), quantity: qty, note });
      }
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  const titles = { restock: 'Naskladnění', adjust: 'Úprava zásoby (inventura)', transfer: 'Přesun mezi stánky' };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">{titles[type]}</h2>
        <div className="mb-4 text-sm text-slate-600">
          <div><b>{item.product_name}</b></div>
          <div>{item.stall_name} — momentálně {item.quantity} ks</div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">{type === 'adjust' ? 'Nový stav zásob' : 'Množství'}</label>
            <input type="number" min={type === 'adjust' ? 0 : 1} className="input" value={qty} onChange={e => setQty(Number(e.target.value))} />
          </div>
          {type === 'transfer' && (
            <div>
              <label className="label">Cílový stánek</label>
              <select className="input" value={toStall} onChange={e => setToStall(e.target.value)}>
                <option value="">— vyberte —</option>
                {otherStalls.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Poznámka (nepovinné)</label>
            <input className="input" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary">Zrušit</button>
          <button onClick={handle} disabled={saving} className="btn-primary">{saving ? 'Ukládám...' : 'Potvrdit'}</button>
        </div>
      </div>
    </div>
  );
}

function MovementsModal({ movements, onClose }) {
  const reasonLabels = { sale: '💰 Prodej', restock: '📦 Naskladnění', transfer: '↔ Přesun', adjustment: '✏️ Úprava', return: '↩ Vratka' };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Historie pohybů</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Čas</th>
                <th className="px-3 py-2 text-left">Produkt</th>
                <th className="px-3 py-2 text-left">Stánek</th>
                <th className="px-3 py-2 text-left">Typ</th>
                <th className="px-3 py-2 text-right">Změna</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2 text-slate-500">{new Date(m.created_at).toLocaleString('cs-CZ')}</td>
                  <td className="px-3 py-2">{m.product_name}</td>
                  <td className="px-3 py-2 text-slate-500">{m.stall_name}</td>
                  <td className="px-3 py-2">{reasonLabels[m.reason] || m.reason}</td>
                  <td className={`px-3 py-2 text-right font-bold ${m.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
