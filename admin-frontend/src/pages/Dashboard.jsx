import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

function fmtCzk(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kč';
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try { setData(await adminApi.dashboard()); }
      catch (e) { setError(e.response?.data?.error || 'Nelze načíst data'); }
    })();
  }, []);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-slate-500">Načítám...</div>;

  const chartData = data.chart30.map(d => ({
    day: new Date(d.day).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }),
    tržby: Number(d.total),
    objednávky: Number(d.orders),
  }));

  const topData = data.topProducts.map(p => ({
    name: p.product_name.slice(0, 20),
    prodáno: Number(p.qty_sold),
  }));

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Přehled</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Dnes" total={data.today.total} count={data.today.count} />
        <KpiCard title="7 dní" total={data.week.total} count={data.week.count} />
        <KpiCard title="30 dní" total={data.month.total} count={data.month.count} />
      </div>

      {/* Graf tržeb */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Tržby za posledních 30 dní</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" stroke="#64748b" />
            <YAxis stroke="#64748b" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmtCzk(v)} />
            <Line type="monotone" dataKey="tržby" stroke="#d4a574" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top produkty */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Top 5 produktů (30 dní)</h2>
          {topData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="prodáno" fill="#d4a574" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-slate-400 text-sm py-8 text-center">Zatím žádné prodeje</div>
          )}
        </div>

        {/* Low stock */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Nízký sklad ⚠️</h2>
          {data.lowStock.length === 0 ? (
            <div className="text-slate-400 text-sm py-8 text-center">Vše je v pořádku ✓</div>
          ) : (
            <ul className="space-y-2 max-h-[250px] overflow-y-auto">
              {data.lowStock.map(item => (
                <li key={`${item.product_id}-${item.stall_id}`}
                    className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="font-medium text-sm">{item.product_name}</div>
                    <div className="text-xs text-slate-500">{item.stall_name}</div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                    item.quantity === 0 ? 'bg-red-100 text-red-700'
                    : item.quantity <= 1 ? 'bg-orange-100 text-orange-700'
                    : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {item.quantity} ks
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, total, count }) {
  return (
    <div className="card p-6">
      <div className="text-slate-500 text-sm">{title}</div>
      <div className="text-3xl font-bold mt-1">{fmtCzk(total)}</div>
      <div className="text-slate-400 text-sm mt-1">{count} {count === 1 ? 'objednávka' : 'objednávek'}</div>
    </div>
  );
}
