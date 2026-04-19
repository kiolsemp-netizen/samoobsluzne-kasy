import { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Přihlášení selhalo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 p-4">
      <div className="card p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">StánekOS</h1>
        <p className="text-slate-500 mb-8">Přihlášení do admin panelu</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input
              type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              className="input" autoFocus
            />
          </div>
          <div>
            <label className="label">Heslo</label>
            <input
              type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="input"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          <button
            type="submit" disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Přihlašuji...' : 'Přihlásit se'}
          </button>
        </form>
      </div>
    </div>
  );
}
