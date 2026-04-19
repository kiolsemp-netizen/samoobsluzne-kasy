/**
 * Admin App - router + autentizace
 */

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { adminApi, setAccessToken, setUnauthorizedHandler } from './api/adminApi';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Pokus o automatické přihlášení (pokud je platný refresh cookie)
  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await adminApi.refresh();
        setAccessToken(accessToken);
        const { user } = await adminApi.me();
        setUser(user);
      } catch (e) {
        // Není přihlášen
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Při 401 (selhání refresh) → reset
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
  }, []);

  const handleLogin = async (email, password) => {
    const { accessToken, user } = await adminApi.login(email, password);
    setAccessToken(accessToken);
    setUser(user);
  };

  const handleLogout = async () => {
    try { await adminApi.logout(); } catch {}
    setAccessToken(null);
    setUser(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Načítám...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produkty" element={<Products user={user} />} />
          <Route path="/sklad" element={<Inventory user={user} />} />
          <Route path="/objednavky" element={<Orders user={user} />} />
          <Route path="/reporty" element={<Reports />} />
          <Route path="/nastaveni" element={<Settings user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = user.role === 'superadmin';

  const links = [
    { to: '/', label: 'Přehled', icon: '📊' },
    { to: '/produkty', label: 'Produkty', icon: '👜', requireSuper: true },
    { to: '/sklad', label: 'Sklad', icon: '📦' },
    { to: '/objednavky', label: 'Objednávky', icon: '🧾' },
    { to: '/reporty', label: 'Reporty', icon: '📈' },
    { to: '/nastaveni', label: 'Nastavení', icon: '⚙️' },
  ].filter(l => !l.requireSuper || isSuper);

  return (
    <aside className="w-64 bg-primary text-white flex flex-col">
      <div className="p-6 border-b border-white/10">
        <div className="text-accent font-bold text-xl">StánekOS</div>
        <div className="text-white/60 text-xs mt-1">Admin panel</div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              location.pathname === link.to
                ? 'bg-accent text-primary font-semibold'
                : 'text-white/70 hover:bg-white/10'
            }`}
          >
            <span>{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <div className="text-white/50 text-xs mb-2">{user.email}</div>
        <button
          onClick={onLogout}
          className="w-full text-left text-sm text-white/70 hover:text-white py-2"
        >
          Odhlásit se →
        </button>
      </div>
    </aside>
  );
}
