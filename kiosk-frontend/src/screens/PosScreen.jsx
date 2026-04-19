/**
 * PosScreen — POS terminál ve stylu souly.cz
 * Tmavé pozadí #06060a, zlatý akcent #c8a078, elegantní
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { kioskApi } from '../api/kioskApi';

// ── Barvy (souly.cz styl) ──
const C = {
  bg: '#06060a',
  panel: '#111114',
  card: '#16161a',
  border: 'rgba(255,255,255,0.06)',
  gold: '#c8a078',
  goldLight: '#d4a574',
  text: '#f0ebe3',
  textMuted: 'rgba(240,235,227,0.45)',
  green: '#6db87f',
  red: '#d4827a',
};

const CZK = (n) => Number(n).toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });

// ── SVG Ikony kategorií ──
const Icons = {
  penezenky: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="16" width="56" height="36" rx="6" stroke="#c8a078" strokeWidth="3" fill="rgba(200,160,120,0.08)"/>
      <rect x="36" y="28" width="18" height="12" rx="4" fill="rgba(200,160,120,0.2)" stroke="#c8a078" strokeWidth="2"/>
      <circle cx="45" cy="34" r="2.5" fill="#c8a078"/>
      <path d="M4 24h56" stroke="#c8a078" strokeWidth="2" opacity="0.5"/>
      <path d="M12 16V12a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v4" stroke="#c8a078" strokeWidth="2.5"/>
    </svg>
  ),
  kabelky: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 28V20a12 12 0 0 1 24 0v8" stroke="#c8a078" strokeWidth="3" strokeLinecap="round"/>
      <rect x="8" y="28" width="48" height="28" rx="6" fill="rgba(200,160,120,0.08)" stroke="#c8a078" strokeWidth="3"/>
      <path d="M22 40h20M32 36v8" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  'tasky-batohy': (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 20V16a8 8 0 0 1 16 0v4" stroke="#c8a078" strokeWidth="3" strokeLinecap="round"/>
      <rect x="12" y="20" width="40" height="36" rx="8" fill="rgba(200,160,120,0.08)" stroke="#c8a078" strokeWidth="3"/>
      <path d="M12 34h40" stroke="#c8a078" strokeWidth="2" opacity="0.5"/>
      <path d="M26 20v4M38 20v4" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 42h16" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  'opasky-doplnky': (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="26" width="52" height="12" rx="6" fill="rgba(200,160,120,0.08)" stroke="#c8a078" strokeWidth="3"/>
      <rect x="24" y="24" width="16" height="16" rx="3" fill="rgba(200,160,120,0.15)" stroke="#c8a078" strokeWidth="2.5"/>
      <circle cx="48" cy="44" r="6" fill="rgba(200,160,120,0.1)" stroke="#c8a078" strokeWidth="2.5"/>
      <path d="M48 40v4l2.5 2.5" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  'darkove-sety': (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="28" width="44" height="28" rx="5" fill="rgba(200,160,120,0.08)" stroke="#c8a078" strokeWidth="3"/>
      <rect x="8" y="20" width="48" height="12" rx="4" fill="rgba(200,160,120,0.12)" stroke="#c8a078" strokeWidth="2.5"/>
      <path d="M32 20V56" stroke="#c8a078" strokeWidth="2.5"/>
      <path d="M32 20C32 20 24 14 20 10c-2-2-2-6 2-6s8 6 10 10" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M32 20C32 20 40 14 44 10c2-2 2-6-2-6s-8 6-10 10" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
};

const SubIconsSVG = {
  'panske-penezenky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="4" y="12" width="40" height="26" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M4 18h40" stroke="#c8a078" strokeWidth="2" opacity="0.5"/><circle cx="34" cy="27" r="3" fill="#c8a078"/><path d="M14 6h8" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M12 24h8" stroke="#c8a078" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/></svg>
  ),
  'damske-penezenky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="6" y="12" width="36" height="28" rx="6" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M16 12V8a8 8 0 0 1 16 0v4" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M16 26h16" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/><circle cx="24" cy="32" r="2.5" fill="rgba(200,160,120,0.4)" stroke="#c8a078" strokeWidth="1.5"/></svg>
  ),
  'pouzdra-dokladovky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="6" y="8" width="36" height="32" rx="4" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M14 18h20M14 24h20M14 30h12" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.6"/><rect x="28" y="6" width="12" height="8" rx="2" fill="rgba(200,160,120,0.15)" stroke="#c8a078" strokeWidth="2"/></svg>
  ),
  'dolarovky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="4" y="16" width="40" height="22" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M24 10v4M24 34v4" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M17 22c0-2.2 3.1-4 7-4s7 1.8 7 4-3.1 4-7 4-7 1.8-7 4 3.1 4 7 4" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  'kasirky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="4" y="14" width="40" height="24" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><rect x="10" y="20" width="8" height="12" rx="2" fill="rgba(200,160,120,0.15)" stroke="#c8a078" strokeWidth="2"/><path d="M24 22h10M24 27h8M24 32h6" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.6"/></svg>
  ),
  'vzorove-penezenky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="6" y="12" width="36" height="26" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M14 20c2-4 4-6 10-6s8 2 10 6" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/><path d="M10 28l4-8 4 5 4-3 4 6 4-4 6 8" stroke="#c8a078" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
  ),
  'crossbody': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="10" y="16" width="28" height="22" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M38 22L44 10" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M10 22L4 38" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M16 16v-4a8 8 0 0 1 16 0v4" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/><path d="M18 28h12" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/></svg>
  ),
  'shopper': (
    <svg viewBox="0 0 48 48" fill="none"><path d="M8 16h32l-4 24H12z" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)" strokeLinejoin="round"/><path d="M17 16v-4a7 7 0 0 1 14 0v4" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M15 26h18" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/></svg>
  ),
  'ledvinky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="6" y="18" width="36" height="18" rx="9" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M6 27h36" stroke="#c8a078" strokeWidth="1.5" opacity="0.3"/><rect x="20" y="14" width="8" height="6" rx="3" fill="rgba(200,160,120,0.12)" stroke="#c8a078" strokeWidth="2"/><circle cx="34" cy="27" r="3" fill="rgba(200,160,120,0.3)" stroke="#c8a078" strokeWidth="1.5"/></svg>
  ),
  'klasicke-kabelky': (
    <svg viewBox="0 0 48 48" fill="none"><path d="M8 22h32v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><rect x="6" y="16" width="36" height="10" rx="4" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.12)"/><path d="M18 22V16a6 6 0 0 1 12 0v6" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M20 32h8" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/></svg>
  ),
  'elegantni-kabelky': (
    <svg viewBox="0 0 48 48" fill="none"><path d="M12 20h24v20a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M18 20v-6a6 6 0 0 1 12 0v6" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M24 6l2 4-2-1-2 1z" fill="#c8a078"/><circle cx="24" cy="34" r="3" fill="rgba(200,160,120,0.2)" stroke="#c8a078" strokeWidth="2"/><path d="M16 30h16" stroke="#c8a078" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/></svg>
  ),
  'panske-tasky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="6" y="16" width="36" height="26" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M16 16v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M6 28h36" stroke="#c8a078" strokeWidth="2" opacity="0.4"/><path d="M18 22h4v6h-4z" fill="rgba(200,160,120,0.2)" stroke="#c8a078" strokeWidth="1.5"/></svg>
  ),
  'tasky-notebook': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="6" y="12" width="36" height="28" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><rect x="12" y="18" width="24" height="15" rx="2" stroke="#c8a078" strokeWidth="2" fill="rgba(200,160,120,0.1)"/><path d="M10 40h28" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M22 10h4" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  'tasky-opasek': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="14" y="8" width="20" height="28" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><rect x="6" y="28" width="36" height="10" rx="5" stroke="#c8a078" strokeWidth="2" fill="rgba(200,160,120,0.1)"/><circle cx="24" cy="33" r="2.5" fill="#c8a078"/><path d="M20 16h8M20 21h6" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/></svg>
  ),
  'etue': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="8" y="10" width="32" height="22" rx="4" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M8 18h32" stroke="#c8a078" strokeWidth="2" opacity="0.4"/><path d="M20 32v6M28 32v6" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M16 38h16" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><circle cx="24" cy="24" r="3" fill="rgba(200,160,120,0.3)" stroke="#c8a078" strokeWidth="1.5"/></svg>
  ),
  'batohy': (
    <svg viewBox="0 0 48 48" fill="none"><path d="M16 12v-2a8 8 0 0 1 16 0v2" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><rect x="10" y="12" width="28" height="30" rx="8" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M10 24h28" stroke="#c8a078" strokeWidth="2" opacity="0.4"/><rect x="18" y="28" width="12" height="8" rx="3" fill="rgba(200,160,120,0.15)" stroke="#c8a078" strokeWidth="2"/></svg>
  ),
  'opasky': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="4" y="20" width="40" height="10" rx="5" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><rect x="20" y="18" width="10" height="14" rx="2" fill="rgba(200,160,120,0.15)" stroke="#c8a078" strokeWidth="2.5"/><path d="M30 25h8" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><circle cx="25" cy="25" r="2" fill="#c8a078"/></svg>
  ),
  'klicenky': (
    <svg viewBox="0 0 48 48" fill="none"><circle cx="18" cy="22" r="10" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><circle cx="18" cy="22" r="4" fill="rgba(200,160,120,0.2)" stroke="#c8a078" strokeWidth="2"/><path d="M26 28l12 12" stroke="#c8a078" strokeWidth="2.5" strokeLinecap="round"/><path d="M34 34l4-2M38 38l2-4" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  'myslivecke-sety': (
    <svg viewBox="0 0 48 48" fill="none"><path d="M24 6c0 0-8 6-8 14a8 8 0 0 0 16 0c0-8-8-14-8-14z" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M16 10c-2-2-6-4-8-2M32 10c2-2 6-4 8-2" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/><path d="M18 10l-4-6M30 10l4-6" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/><path d="M20 38c0 0 4 4 8 0" stroke="#c8a078" strokeWidth="2" strokeLinecap="round"/><circle cx="24" cy="26" r="3" fill="rgba(200,160,120,0.3)" stroke="#c8a078" strokeWidth="2"/></svg>
  ),
  'ryb-sety': (
    <svg viewBox="0 0 48 48" fill="none"><path d="M6 24c4-8 12-12 20-12 6 0 12 4 16 12-4 8-10 12-16 12-8 0-16-4-20-12z" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><path d="M38 18l6-4v12l-6-4" stroke="#c8a078" strokeWidth="2" strokeLinejoin="round" fill="rgba(200,160,120,0.12)"/><circle cx="34" cy="22" r="2.5" fill="#c8a078"/><path d="M14 22c2-3 6-4 10-4" stroke="#c8a078" strokeWidth="2" strokeLinecap="round" opacity="0.5"/></svg>
  ),
  'elegantni-sety': (
    <svg viewBox="0 0 48 48" fill="none"><rect x="8" y="22" width="32" height="22" rx="4" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.07)"/><rect x="6" y="16" width="36" height="10" rx="3" stroke="#c8a078" strokeWidth="2.5" fill="rgba(200,160,120,0.12)"/><path d="M24 16V44" stroke="#c8a078" strokeWidth="2"/><path d="M24 16c0 0-5-5-8-9-1-2-1-5 2-5s5 4 6 6c1-2 3-6 6-6s3 3 2 5c-3 4-8 9-8 9z" stroke="#c8a078" strokeWidth="2" fill="rgba(200,160,120,0.1)" strokeLinejoin="round"/></svg>
  ),
};

// ── Pulzující animace tlačítka platby ──
const pulseStyle = `
@keyframes pos-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(200,160,120,0.5), 0 0 30px rgba(200,160,120,0.2); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(200,160,120,0), 0 0 50px rgba(200,160,120,0.35); }
}
@keyframes pos-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}
.pay-btn { animation: pos-pulse 2.2s ease-in-out infinite; }
.pay-btn:hover { animation: none; transform: scale(1.06); box-shadow: 0 0 60px rgba(200,160,120,0.6); }
.pay-btn:disabled { animation: none; }
`;

// Wrapper kvůli volání SubIconsSVG před definicí
const SubIcon = ({ slug }) => {
  const icon = SubIconsSVG[slug];
  return icon ? (
    <div style={{ width: 72, height: 72 }}>{icon}</div>
  ) : (
    <div style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.6 }}>📦</div>
  );
};

export default function PosScreen() {
  const [categories, setCategories] = useState([]);
  const [selectedParent, setSelectedParent] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [paying, setPaying] = useState(false);
  const [payStatus, setPayStatus] = useState(null);
  const [payMsg, setPayMsg] = useState('');
  const [feedback, setFeedback] = useState(null);
  const searchRef = useRef(null);
  const eanBuffer = useRef('');
  const eanTimer = useRef(null);

  const parents = categories.filter(c => !c.parent_id);
  const getSubs = (parentId) => categories.filter(c => c.parent_id === parentId);

  useEffect(() => {
    kioskApi.getCategories().then(d => setCategories(d.categories || []));
  }, []);

  const loadProducts = useCallback(async (pg = 1, catId = null, q = '') => {
    setLoading(true);
    try {
      const data = await kioskApi.getProducts(pg, 60, catId, q);
      setProducts(data.products || []);
      setTotalPages(data.pages || 1);
      setTotalProducts(data.total || 0);
      setPage(pg);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const handleParentClick = (cat) => {
    const subs = getSubs(cat.id);
    setSelectedParent(cat);
    setSelectedSub(null);
    setSearch('');
    if (subs.length === 0) {
      // Žádné podkategorie → rovnou produkty
      loadProducts(1, cat.id, '');
    } else {
      setProducts([]);
    }
  };

  const handleSubClick = (cat) => {
    setSelectedSub(cat);
    setSearch('');
    loadProducts(1, cat.id, '');
  };

  const handleBack = () => {
    if (selectedSub) {
      setSelectedSub(null);
      setProducts([]);
    } else {
      setSelectedParent(null);
      setProducts([]);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const catId = selectedSub?.id || selectedParent?.id || null;
    loadProducts(1, catId, search);
  };

  // EAN čtečka
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement === searchRef.current) return;
      if (e.key === 'Enter') {
        const ean = eanBuffer.current.trim();
        if (ean.length >= 8) handleEan(ean);
        eanBuffer.current = '';
        clearTimeout(eanTimer.current);
        return;
      }
      if (e.key.length === 1) {
        eanBuffer.current += e.key;
        clearTimeout(eanTimer.current);
        eanTimer.current = setTimeout(() => { eanBuffer.current = ''; }, 500);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleEan = async (ean) => {
    try {
      const data = await kioskApi.getProducts(1, 1, null, '', ean);
      if (data.products?.length > 0) {
        addToCart(data.products[0]);
        toast(`✅ Přidáno: ${data.products[0].name}`);
      } else toast(`❌ EAN ${ean} nenalezen`, 'err');
    } catch { toast('❌ Chyba čtečky', 'err'); }
  };

  const toast = (msg, type = 'ok') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 2500);
  };

  const addToCart = (p) => setCart(prev => {
    const idx = prev.findIndex(it => it.p.id === p.id);
    if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n; }
    return [...prev, { p, qty: 1 }];
  });

  const changeQty = (id, d) => setCart(prev =>
    prev.map(it => it.p.id === id ? { ...it, qty: it.qty + d } : it).filter(it => it.qty > 0)
  );

  const cartTotal = cart.reduce((s, it) => s + Number(it.p.price_czk) * it.qty, 0);
  const cartCount = cart.reduce((s, it) => s + it.qty, 0);

  const handlePay = async () => {
    if (!cart.length || paying) return;
    setPaying(true); setPayStatus('processing'); setPayMsg('Zpracovávám objednávku...');
    try {
      const items = cart.map(it => ({ productId: it.p.id, quantity: it.qty }));
      const order = await kioskApi.createOrder(items, 'simplified');
      setPayMsg('Přiložte kartu k terminálu...');
      if (import.meta.env.VITE_STRIPE_SIMULATED === 'true') {
        await new Promise(r => setTimeout(r, 2000));
        setPayStatus('success'); setPayMsg(`✅ Zaplaceno!\n#${order.order?.order_number || '?'}`);
        setTimeout(() => { setCart([]); setPaying(false); setPayStatus(null); setPayMsg(''); }, 3000);
      }
    } catch (e) {
      setPayStatus('error'); setPayMsg(`❌ ${e.response?.data?.error || e.message}`);
      setTimeout(() => { setPaying(false); setPayStatus(null); setPayMsg(''); }, 3000);
    }
  };

  // ── VIEW: Úvodní obrazovka s ikonami kategorií ──
  const HomeView = () => (
    <div style={{ padding: 20 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 }}>Kožené zboží</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.gold, margin: 0 }}>Vyberte kategorii</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {parents.map(cat => (
          <div key={cat.id} onClick={() => handleParentClick(cat)} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '20px 12px 16px', cursor: 'pointer', textAlign: 'center',
            transition: 'all .2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}
            onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${C.gold}`; e.currentTarget.style.background = 'rgba(200,160,120,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.border = `1px solid ${C.border}`; e.currentTarget.style.background = C.card; }}
          >
            <div style={{ width: 64, height: 64, flexShrink: 0 }}>{Icons[cat.slug] || <span style={{ fontSize: 40 }}>📦</span>}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{cat.name}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{getSubs(cat.id).length > 0 ? `${getSubs(cat.id).length} podkat.` : 'Otevřít'}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── VIEW: Podkategorie ──
  const SubCatView = () => {
    const subs = getSubs(selectedParent.id);
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <button onClick={handleBack} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }}>← Zpět</button>
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>Kategorie</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>{selectedParent.name}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {subs.map(cat => (
            <div key={cat.id} onClick={() => handleSubClick(cat)} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '18px 10px 14px', cursor: 'pointer', textAlign: 'center',
              transition: 'all .2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}
              onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${C.gold}`; e.currentTarget.style.background = 'rgba(200,160,120,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.border = `1px solid ${C.border}`; e.currentTarget.style.background = C.card; }}
            >
              <div style={{ width: 56, height: 56, flexShrink: 0 }}><SubIcon slug={cat.slug} /></div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{cat.name}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── VIEW: Produkty ──
  const ProductsView = () => {
    const title = selectedSub?.name || selectedParent?.name || 'Produkty';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.panel, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={handleBack} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>← Zpět</button>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.gold, whiteSpace: 'nowrap' }}>{title}</div>
          <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: 8 }}>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Hledat..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 14 }}
            />
            <button type="submit" style={{ padding: '8px 14px', background: C.gold, color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Hledat</button>
            {search && <button type="button" onClick={() => { setSearch(''); const id = selectedSub?.id || selectedParent?.id || null; loadProducts(1, id, ''); }} style={{ padding: '8px 10px', background: C.card, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>}
          </form>
          <div style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>{totalProducts} ks</div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: C.textMuted }}>Načítám...</div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: C.textMuted }}>Žádné produkty</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {products.map(p => {
                const imgs = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []);
                const img = imgs[0];
                return (
                  <div key={p.id} onClick={() => { addToCart(p); toast(`✅ ${p.name.substring(0, 30)}`); }} style={{
                    background: C.card, borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                    border: `1px solid ${C.border}`, transition: 'border-color .15s', display: 'flex', flexDirection: 'column',
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.gold}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                  >
                    {img
                      ? <img src={img} alt={p.name} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                      : <div style={{ height: 220, background: C.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>👜</div>
                    }
                    <div style={{ padding: '10px 12px', flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 5, color: C.text }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{p.sku}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.gold }}>{CZK(p.price_czk)}</div>
                    </div>
                    <div style={{ background: 'rgba(200,160,120,0.12)', textAlign: 'center', padding: '8px', fontSize: 13, fontWeight: 700, color: C.gold, borderTop: `1px solid rgba(200,160,120,0.2)` }}>
                      + PŘIDAT
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stránkování */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '14px 20px 10px', borderTop: `1px solid ${C.border}`, background: C.panel, flexShrink: 0 }}>
            <button disabled={page <= 1} onClick={() => loadProducts(page - 1, selectedSub?.id || selectedParent?.id, search)}
              style={{ padding: '12px 28px', background: page > 1 ? 'rgba(200,160,120,0.12)' : 'transparent', color: page > 1 ? C.gold : C.textMuted, border: `1px solid ${page > 1 ? C.gold : C.border}`, borderRadius: 8, cursor: page > 1 ? 'pointer' : 'default', fontSize: 16, fontWeight: 700, transition: 'all .2s' }}>← Předchozí</button>
            <span style={{ color: C.textMuted, fontSize: 14, minWidth: 80, textAlign: 'center' }}>strana {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => loadProducts(page + 1, selectedSub?.id || selectedParent?.id, search)}
              style={{ padding: '12px 28px', background: page < totalPages ? 'rgba(200,160,120,0.12)' : 'transparent', color: page < totalPages ? C.gold : C.textMuted, border: `1px solid ${page < totalPages ? C.gold : C.border}`, borderRadius: 8, cursor: page < totalPages ? 'pointer' : 'default', fontSize: 16, fontWeight: 700, transition: 'all .2s' }}>Další →</button>
          </div>
        )}
      </div>
    );
  };

  const showProducts = selectedSub || (selectedParent && getSubs(selectedParent.id).length === 0);

  return (
    <>
      <style>{pulseStyle}</style>
      {/* Toast */}
      {feedback && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: feedback.type === 'err' ? C.red : '#1a3a1e', color: C.text, padding: '10px 28px', borderRadius: 8, fontSize: 15, fontWeight: 600, zIndex: 9999, border: `1px solid ${feedback.type === 'err' ? C.red : C.green}`, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
          {feedback.msg}
        </div>
      )}

      <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* ══ LEVÁ STRANA — KATALOG (2/3) ══ */}
        <div style={{ flex: 2, borderRight: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}`, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase' }}>Mercucio</span>
          </div>
          {/* Obsah */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!selectedParent && <HomeView />}
            {selectedParent && !showProducts && <SubCatView />}
            {showProducts && <ProductsView />}
          </div>
        </div>

        {/* ══ PRAVÁ STRANA — KOŠÍK (1/3) ══ */}
        <div style={{ flex: 1, minWidth: 360, display: 'flex', flexDirection: 'column', background: C.panel }}>
          {/* Košík header */}
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: C.textMuted, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 2 }}>Namarkované zboží</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text }}>{cartCount > 0 ? `${cartCount} položek` : 'Košík je prázdný'}</div>
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} style={{ background: 'none', border: `1px solid rgba(212,130,122,0.35)`, color: C.red, borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                Smazat vše
              </button>
            )}
          </div>

          {/* Položky */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 30px', color: C.textMuted }}>
                <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.25 }}>🛒</div>
                <div style={{ fontSize: 20, marginBottom: 8, fontWeight: 600 }}>Košík je prázdný</div>
                <div style={{ fontSize: 15, opacity: 0.7 }}>Vyberte produkt z katalogu nebo<br />naskenujte čárový kód</div>
              </div>
            ) : cart.map(({ p, qty }) => (
              <div key={p.id} style={{ padding: '14px 24px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, fontSize: 16, fontWeight: 600, lineHeight: 1.3, paddingRight: 12, color: C.text }}>{p.name}</div>
                  <button onClick={() => changeQty(p.id, -qty)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => changeQty(p.id, -1)} style={{ width: 40, height: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, cursor: 'pointer', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: 22, fontWeight: 800, minWidth: 32, textAlign: 'center', color: C.text }}>{qty}</span>
                    <button onClick={() => changeQty(p.id, +1)} style={{ width: 40, height: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, cursor: 'pointer', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {qty > 1 && <div style={{ fontSize: 13, color: C.textMuted }}>{CZK(p.price_czk)} × {qty}</div>}
                    <div style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>{CZK(Number(p.price_czk) * qty)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Souhrn + platba */}
          <div style={{ padding: '20px 24px', borderTop: `2px solid ${C.border}` }}>
            {/* Celkem */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
              <span style={{ fontSize: 18, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 3 }}>Celkem k úhradě</span>
              <span style={{ fontSize: 48, fontWeight: 900, color: C.gold, letterSpacing: -1 }}>{CZK(cartTotal)}</span>
            </div>

            {/* Stav platby */}
            {payStatus && (
              <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, textAlign: 'center', background: payStatus === 'success' ? 'rgba(109,184,127,0.1)' : payStatus === 'error' ? 'rgba(212,130,122,0.1)' : 'rgba(200,160,120,0.08)', border: `1px solid ${payStatus === 'success' ? C.green : payStatus === 'error' ? C.red : C.gold}`, fontSize: 18, fontWeight: 700, color: payStatus === 'success' ? C.green : payStatus === 'error' ? C.red : C.gold, whiteSpace: 'pre-line' }}>
                {payMsg}
              </div>
            )}

            {/* Tlačítko ZAPLATIT — velké, zlaté, pulsující */}
            <button onClick={handlePay} disabled={cart.length === 0 || paying}
              className={cart.length > 0 && !paying ? 'pay-btn' : ''}
              style={{
                width: '100%', padding: '28px 0', borderRadius: 60, border: 'none',
                background: cart.length === 0 || paying
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, #d4b483 0%, #c8a078 40%, #b8884a 100%)',
                color: cart.length === 0 || paying ? C.textMuted : '#1a0f00',
                fontSize: 26, fontWeight: 900, cursor: cart.length === 0 || paying ? 'default' : 'pointer',
                letterSpacing: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                textTransform: 'uppercase',
              }}>
              {paying ? '⏳  Zpracovávám...' : <><span style={{ fontSize: 28 }}>💳</span> Zaplatit kartou</>}
            </button>

            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 12, letterSpacing: 1 }}>
              Pouze bezhotovostní platba · Čtečka čárových kódů aktivní
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
