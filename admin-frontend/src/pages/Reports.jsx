import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function fmtCzk(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kč';
}

export default function Reports() {
  const [period, setPeriod] = useState('30');
  const [salesByStall, setSalesByStall] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    (async () => {
      const from = new Date(Date.now() - Number(period) * 86400e3).toISOString();
      const [sales, top] = await Promise.all([
        adminApi.sales({ from, groupBy: 'stall' }),
        adminApi.topProducts({ from, limit: 20 }),
      ]);
      setSalesByStall(sales.data);
      setTopProducts(top.products);
    })();
  }, [period]);

  const handleExport = async () => {
    const from = new Date(Date.now() - Number(period) * 86400e3).toISOString();
    const res = await adminApi.exportCsv({ from });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `trzby-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reporty</h1>
        <div className="flex gap-3">
          <select className="input" style={{ width: 'auto' }}
            value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="7">7 dní</option>
            <option value="30">30 dní</option>
            <option value="90">90 dní</option>
            <option value="365">1 rok</option>
          </select>
          <button onClick={handleExport} className="btn-primary">📥 Export CSV</button>
        </div>
      </div>

      {/* Tržby per stánek */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Tržby per stánek</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={salesByStall.map(d => ({
            name: d.stall_name,
            tržby: Number(d.total),
            objednávky: Number(d.orders),
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v, name) => name === 'tržby' ? fmtCzk(v) : v} />
            <Bar dataKey="tržby" fill="#d4a574" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top produkty - detailní */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Nejprodávanější produkty</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Produkt</th>
              <th className="px-3 py-2 text-right">Prodáno ks</th>
              <th className="px-3 py-2 text-right">Tržby</th>
              <th className="px-3 py-2 text-right">Objednávek</th>
            </tr>
          </thead>
          <tbody>
            {topProducts.map((p, i) => (
              <tr key={p.product_id} className="border-t">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{p.product_name}</td>
                <td className="px-3 py-2 text-right">{p.qty_sold}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtCzk(p.revenue)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{p.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {topProducts.length === 0 && <div className="p-8 text-center text-slate-400">Zatím žádná data</div>}
      </div>
    </div>
  );
}
