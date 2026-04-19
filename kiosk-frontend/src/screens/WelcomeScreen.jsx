/**
 * WelcomeScreen - úvodní obrazovka
 * ----------------------------------------------------------------------------
 * Co vidí zákazník (zejména senior):
 *   - VELKÝ nápis "VÍTEJTE"
 *   - JEDEN velký hlavní tlačítko "ZAČÍT NÁKUP"
 *   - Čas / přívětivé přivítání
 *   - Žádné menu, žádné ikony, žádné nadbytečné prvky
 */

import { useEffect, useState } from 'react';
import useKioskStore, { SCREENS } from '../store/useKioskStore';

export default function WelcomeScreen() {
  const setScreen = useKioskStore(s => s.setScreen);
  const stallId = useKioskStore(s => s.stallId);

  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 10) return 'Dobré ráno';
    if (h < 18) return 'Dobrý den';
    return 'Dobrý večer';
  })();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-12 bg-gradient-to-br from-midnight via-ink to-panel">
      {/* Čas v rohu */}
      <div className="absolute top-8 right-12 text-cream/60 text-kiosk-base font-mono">
        {timeStr}
      </div>

      {/* Hlavní obsah */}
      <div className="flex-1 flex flex-col items-center justify-center fade-in">
        <div className="text-gold text-kiosk-lg mb-4 tracking-widest">
          {greeting}
        </div>

        <h1 className="text-gold text-[12rem] leading-none font-bold mb-4 text-center">
          VÍTEJTE
        </h1>

        <p className="text-cream text-kiosk-xl mb-20 text-center max-w-4xl">
          Kvalitní kožené doplňky
        </p>

        {/* Hlavní tlačítko - obrovské, zlaté, pulzuje */}
        <button
          onClick={() => setScreen(SCREENS.CATALOG)}
          className="btn-primary text-kiosk-2xl px-24 py-12 min-h-[180px] pulse-gold"
          aria-label="Začít nákup"
        >
          ZAČÍT NÁKUP
        </button>

        <p className="text-cream/60 text-kiosk-sm mt-16 text-center max-w-3xl">
          Stačí se dotknout obrazovky
        </p>
      </div>

      {/* Footer */}
      <div className="text-cream/40 text-kiosk-sm">
        Stánek {stallId || '?'}
      </div>
    </div>
  );
}
