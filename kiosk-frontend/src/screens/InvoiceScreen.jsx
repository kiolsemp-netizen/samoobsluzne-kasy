/**
 * InvoiceScreen - zadání IČO pro fakturu
 * ----------------------------------------------------------------------------
 * Krok 1: IČO přes numerickou klávesnici → ARES lookup vrátí firemní údaje
 * Krok 2: Potvrzení / editace email
 * Krok 3: Pokračuj na tisk (PrintingScreen)
 *
 * Tento flow je komplexnější (pro seniory nejvíc náročný),
 * proto maximálně minimalizujeme vstup a spoléháme na ARES auto-complete.
 */

import { useState } from 'react';
import useKioskStore, { SCREENS } from '../store/useKioskStore';
import { kioskApi } from '../api/kioskApi';
import NumericKeyboard from '../components/NumericKeyboard';

const STEPS = {
  ICO: 'ico',
  CONFIRM: 'confirm',
  EMAIL: 'email',
};

export default function InvoiceScreen() {
  const { setScreen, setCustomerData, setError } = useKioskStore();

  const [step, setStep] = useState(STEPS.ICO);
  const [ico, setIco] = useState('');
  const [companyData, setCompanyData] = useState(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAres = async () => {
    if (ico.length !== 8) {
      setError('IČO musí mít přesně 8 číslic');
      return;
    }
    setLoading(true);
    try {
      const data = await kioskApi.aresLookup(ico);
      setCompanyData({
        ico: data.ico,
        name: data.name,
        company: data.name,
        dic: data.dic,
        address: data.address,
      });
      setStep(STEPS.CONFIRM);
    } catch (e) {
      if (e.response?.status === 404) {
        setError('IČO nenalezeno v ARES. Zkontrolujte číslo.');
      } else {
        setError('Nelze načíst údaje firmy. Zkuste to znovu.');
      }
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    setCustomerData({
      ...(companyData || {}),
      email: email || null,
    });
    setScreen(SCREENS.PRINTING);
  };

  // ============ KROK 1: IČO ================================================
  if (step === STEPS.ICO) {
    return (
      <ScreenShell title="FAKTURA PRO FIRMU" onBack={() => setScreen(SCREENS.SUCCESS)}>
        <div className="text-cream text-kiosk-lg mb-8 text-center max-w-2xl">
          Zadejte prosím <b className="text-gold">IČO</b> vaší firmy.<br/>
          Zbytek údajů doplníme automaticky.
        </div>

        <NumericKeyboard
          value={ico}
          onChange={setIco}
          maxLength={8}
          label="IČO (8 číslic)"
          placeholder="00000000"
          onSubmit={fetchAres}
        />

        {loading && (
          <div className="mt-8 text-cream text-kiosk-base">Hledám v registru...</div>
        )}
      </ScreenShell>
    );
  }

  // ============ KROK 2: Potvrzení údajů =====================================
  if (step === STEPS.CONFIRM) {
    return (
      <ScreenShell title="ZKONTROLUJTE ÚDAJE" onBack={() => setStep(STEPS.ICO)}>
        <div className="panel p-10 w-full max-w-2xl space-y-4 text-kiosk-base">
          <InfoRow label="Firma" value={companyData?.name} />
          <InfoRow label="IČO" value={companyData?.ico} />
          <InfoRow label="DIČ" value={companyData?.dic} />
          <InfoRow label="Adresa" value={companyData?.address} />
        </div>

        <div className="flex gap-6 mt-8">
          <button
            onClick={() => setStep(STEPS.ICO)}
            className="btn-secondary text-kiosk-lg"
          >
            ← OPRAVIT
          </button>
          <button
            onClick={() => setStep(STEPS.EMAIL)}
            className="btn-primary text-kiosk-lg"
          >
            POKRAČOVAT →
          </button>
        </div>
      </ScreenShell>
    );
  }

  // ============ KROK 3: Email (volitelné) ===================================
  if (step === STEPS.EMAIL) {
    return (
      <ScreenShell title="E-MAIL" onBack={() => setStep(STEPS.CONFIRM)}>
        <div className="text-cream text-kiosk-lg mb-8 text-center max-w-2xl">
          Chcete fakturu poslat na e-mail?<br/>
          <span className="text-cream/60 text-kiosk-base">(nepovinné - fakturu dostanete i vytištěnou)</span>
        </div>

        <EmailKeyboard value={email} onChange={setEmail} />

        <div className="flex gap-6 mt-8">
          <button onClick={finish} className="btn-secondary text-kiosk-lg">
            PŘESKOČIT
          </button>
          <button onClick={finish} className="btn-primary text-kiosk-lg">
            DOKONČIT →
          </button>
        </div>
      </ScreenShell>
    );
  }
}

function ScreenShell({ title, onBack, children }) {
  return (
    <div className="min-h-screen flex flex-col bg-midnight">
      <div className="bg-panel shadow-lg px-8 py-6 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary">← ZPĚT</button>
        <h1 className="text-gold text-kiosk-lg font-bold">{title}</h1>
        <div className="w-[180px]" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-cream/50 text-kiosk-sm mb-1">{label}</div>
      <div className="text-cream text-kiosk-lg font-semibold">{value || '—'}</div>
    </div>
  );
}

function EmailKeyboard({ value, onChange }) {
  const rows = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m','.'],
  ];

  const append = (ch) => onChange(value + ch);
  const del = () => onChange(value.slice(0, -1));

  return (
    <div className="w-full max-w-4xl">
      <div className="bg-midnight border-2 border-gold rounded-2xl p-6 mb-4 min-h-[5rem] text-center">
        <div className="text-gold text-kiosk-lg font-mono break-all">
          {value || <span className="text-cream/30">vas@email.cz</span>}
        </div>
      </div>

      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 justify-center mb-2">
          {row.map(ch => (
            <button
              key={ch}
              onClick={() => append(ch)}
              className="bg-panel text-cream font-semibold rounded-xl w-14 h-16 text-kiosk-base active:bg-gold active:text-midnight"
            >
              {ch}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-2 justify-center">
        <button onClick={() => append('@')} className="bg-panel text-cream rounded-xl w-20 h-16 text-kiosk-base font-bold active:bg-gold active:text-midnight">@</button>
        <button onClick={() => append('.')} className="bg-panel text-cream rounded-xl w-20 h-16 text-kiosk-base font-bold active:bg-gold active:text-midnight">.</button>
        <button onClick={() => append('_')} className="bg-panel text-cream rounded-xl w-20 h-16 text-kiosk-base font-bold active:bg-gold active:text-midnight">_</button>
        <button onClick={() => append('-')} className="bg-panel text-cream rounded-xl w-20 h-16 text-kiosk-base font-bold active:bg-gold active:text-midnight">-</button>
        <button onClick={del} className="bg-danger/40 text-cream rounded-xl w-32 h-16 text-kiosk-base font-bold active:bg-danger">⌫ SMAZAT</button>
      </div>
    </div>
  );
}
