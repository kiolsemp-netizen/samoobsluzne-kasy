import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';

function fmtCzk(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' Kč';
}

export default function Orders() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const data = await adminApi.orders({ ...filter, limit: 100 });
    setItems(data.orders);
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const downloadInvoice = async (orderId) => {
    try {
      const res = await adminApi.invoice(orderId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `faktura-${orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.response?.data?.error || 'Nelze stáhnout fakturu');
    }
  };

  const statusColors = {
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    refunded: 'bg-purple-100 text-purple-700',
    cancelled: 'bg-slate-200 text-slate-600',
  };
  const statusLabels = { paid: 'Zaplaceno', pending: 'Čeká', failed: 'Selhalo', refunded: 'Vráceno', cancelled: 'Zrušeno' };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Objednávky</h1>

      <div className="card p-4 mb-4 flex gap-3 flex-wrap">
        <input placeholder="Číslo, zákazník..." className="input flex-1 min-w-[200px]"
          value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })} />
        <select className="input" style={{ width: 'auto' }}
          value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Všechny stavy</option>
          <option value="paid">Zaplacené</option>
          <option value="pending">Čekající</option>
          <option value="failed">Selhaly</option>
          <option value="refunded">Vrácené</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3">Doklad</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Stánek</th>
              <th className="px-4 py-3">Položky</th>
              <th className="px-4 py-3 text-right">Celkem</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(o => (
              <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono font-medium">{o.order_number}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(o.paid_at || o.created_at).toLocaleString('cs-CZ')}
                </td>
                <td className="px-4 py-2 text-slate-600">{o.stall_name}</td>
                <td className="px-4 py-2 text-slate-600">{o.item_count}×</td>
                <td className="px-4 py-2 text-right font-medium">{fmtCzk(o.total_czk)}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs ${statusColors[o.status] || ''}`}>
                    {statusLabels[o.status] || o.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setDetail(o.id)} className="text-blue-600 hover:underline">Detail</button>
                    {o.receipt_type === 'invoice' && o.status === 'paid' && (
                      <button onClick={() => downloadInvoice(o.id)} className="text-accent hover:underline">PDF</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-8 text-center text-slate-400">Žádné objednávky</div>}
      </div>

      {detail && <OrderDetailModal orderId={detail} onClose={() => setDetail(null)} onReload={load} />}
    </div>
  );
}

function OrderDetailModal({ orderId, onClose, onReload }) {
  const [data, setData] = useState(null);
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    adminApi.order(orderId).then(setData).catch(e => alert('Chyba: ' + e.message));
  }, [orderId]);

  const handleReprint = async () => {
    try {
      await adminApi.reprint(orderId);
      alert('Doklad odeslán k tisku');
    } catch (e) { alert(e.response?.data?.error || 'Tisk selhal'); }
  };

  const handleRefund = async () => {
    if (!confirm(`Opravdu vrátit ${data.order.total_czk} Kč?`)) return;
    setRefunding(true);
    try {
      await adminApi.refund(orderId, null, 'requested_by_customer');
      alert('Vráceno');
      onReload();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Refund selhal');
    } finally { setRefunding(false); }
  };

  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">{data.order.order_number}</h2>
            <div className="text-sm text-slate-500">{new Date(data.order.created_at).toLocaleString('cs-CZ')}</div>
          </div>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div><span className="text-slate-500">Stav:</span> <b>{data.order.status}</b></div>
          <div><span className="text-slate-500">Platba:</span> <b>{data.order.payment_method}</b></div>
          <div><span className="text-slate-500">Typ:</span> <b>{data.order.receipt_type}</b></div>
          <div><span className="text-slate-500">Faktura:</span> <b>{data.order.invoice_number || '—'}</b></div>
        </div>

        {data.order.customer_name && (
          <div className="mb-4 p-3 bg-slate-50 rounded text-sm">
            <div><b>{data.order.customer_company || data.order.customer_name}</b></div>
            {data.order.customer_ico && <div>IČO: {data.order.customer_ico}</div>}
            {data.order.customer_address && <div>{data.order.customer_address}</div>}
            {data.order.customer_email && <div>{data.order.customer_email}</div>}
          </div>
        )}

        <table className="w-full text-sm mb-4">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left">Položka</th>
              <th className="px-2 py-2 text-right">Ks</th>
              <th className="px-2 py-2 text-right">Cena</th>
              <th className="px-2 py-2 text-right">Celkem</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(it => (
              <tr key={it.id} className="border-t">
                <td className="px-2 py-2">{it.product_name}</td>
                <td className="px-2 py-2 text-right">{it.quantity}</td>
                <td className="px-2 py-2 text-right">{fmtCzk(it.unit_price_czk)}</td>
                <td className="px-2 py-2 text-right font-medium">{fmtCzk(it.line_total_czk)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold">
              <td colSpan={3} className="px-2 py-2 text-right">Celkem:</td>
              <td className="px-2 py-2 text-right">{fmtCzk(data.order.total_czk)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Zavřít</button>
          {data.order.status === 'paid' && (
            <>
              <button onClick={handleReprint} className="btn-secondary">Tisk znovu</button>
              <button onClick={handleRefund} disabled={refunding} className="btn-danger">
                {refunding ? 'Zpracovávám...' : 'Vrátit peníze'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
