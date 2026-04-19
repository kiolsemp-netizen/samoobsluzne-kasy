import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';

const EDITABLE_KEYS = [
  { key: 'company_name', label: 'Název firmy' },
  { key: 'company_ico', label: 'IČO' },
  { key: 'company_dic', label: 'DIČ' },
  { key: 'company_address', label: 'Adresa' },
  { key: 'company_phone', label: 'Telefon' },
  { key: 'receipt_footer', label: 'Text na patičce účtenky' },
  { key: 'low_stock_check_interval', label: 'Interval kontroly zásob (min)' },
  { key: 'telegram_chat_id', label: 'Telegram Chat ID' },
];

export default function Settings({ user }) {
  const [settings, setSettings] = useState({});
  const [edited, setEdited] = useState({});
  const [stalls, setStalls] = useState([]);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null);
  const isSuper = user.role === 'superadmin';

  const load = async () => {
    const [s, st] = await Promise.all([adminApi.settings(), adminApi.stalls()]);
    setSettings(s.settings);
    setStalls(st.stalls);
    if (isSuper) {
      try { const u = await adminApi.adminUsers(); setUsers(u.users); } catch {}
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (key) => {
    const value = edited[key] ?? settings[key] ?? '';
    try {
      await adminApi.setSetting(key, value);
      setMsg({ type: 'ok', text: 'Uloženo' });
      setTimeout(() => setMsg(null), 2000);
      load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Chyba' });
    }
  };

  const testPrinter = async (stallId) => {
    try {
      const res = await adminApi.testPrinter(stallId);
      alert(res.ok ? 'Test tisku odeslán' : `Chyba: ${res.error}`);
    } catch (e) { alert(e.response?.data?.error || 'Chyba'); }
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Nastavení</h1>

      {msg && (
        <div className={`p-3 rounded ${msg.type === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Firemní údaje */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Firemní údaje (na dokladech)</h2>
        {!isSuper && <div className="text-sm text-slate-500 mb-4">Pouze superadmin může měnit.</div>}
        <div className="space-y-3">
          {EDITABLE_KEYS.map(({ key, label }) => (
            <div key={key} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="label">{label}</label>
                <input className="input" disabled={!isSuper}
                  value={edited[key] ?? settings[key] ?? ''}
                  onChange={e => setEdited({ ...edited, [key]: e.target.value })} />
              </div>
              {isSuper && (
                <button onClick={() => save(key)} className="btn-secondary">Uložit</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Test tiskáren */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Tiskárny</h2>
        <div className="space-y-2">
          {stalls.map(s => (
            <div key={s.id} className="flex justify-between items-center py-2 border-t first:border-0">
              <div>
                <b>{s.name}</b>
                <span className="text-sm text-slate-500 ml-3">{s.location}</span>
              </div>
              <button onClick={() => testPrinter(s.id)} className="btn-secondary text-sm">
                🖨 Test tisku
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Admin uživatelé (jen superadmin) */}
      {isSuper && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Admin uživatelé</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Stánek</th>
                <th className="px-3 py-2">Poslední přihlášení</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="px-3 py-2">{u.stall_id ? stalls.find(s => s.id === u.stall_id)?.name || '—' : '— všechny —'}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {u.last_login ? new Date(u.last_login).toLocaleString('cs-CZ') : 'nikdy'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-sm text-slate-500">
            Nového uživatele vytvoříte přes API endpoint <code>POST /api/admin-users</code> nebo skript <code>node backend/scripts/createAdmin.js</code>.
          </div>
        </div>
      )}
    </div>
  );
}
