/**
 * OfflineScreen - zobrazí se při ztrátě internetu
 * ----------------------------------------------------------------------------
 * Kiosek se snaží reconnectnout každých 10s.
 * Jakmile se obnoví připojení, App.jsx automaticky skryje tuto obrazovku.
 */

import { useEffect, useState } from 'react';
import { kioskApi } from '../api/kioskApi';
import useKioskStore from '../store/useKioskStore';

export default function OfflineScreen() {
  const [attempts, setAttempts] = useState(0);
  const setIsOffline = useKioskStore(s => s.setIsOffline);

  useEffect(() => {
    const interval = setInterval(async () => {
      setAttempts(a => a + 1);
      try {
        await kioskApi.heartbeat();
        setIsOffline(false);
      } catch (e) {
        // stále offline
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [setIsOffline]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-12 bg-midnight">
      <div className="text-[10rem] mb-8">📡</div>
      <h1 className="text-gold text-kiosk-2xl font-bold mb-8 text-center">
        CHVILKOVÉ<br/>OMEZENÍ
      </h1>
      <p className="text-cream text-kiosk-xl text-center max-w-3xl mb-12">
        Terminál se pokouší obnovit spojení.<br/>
        Prosím zkuste to za chvíli.
      </p>
      <div className="flex items-center gap-4 text-cream/60 text-kiosk-base">
        <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full spin-slow" />
        <span>Pokus {attempts + 1}...</span>
      </div>
      <p className="text-cream/40 text-kiosk-sm mt-16 text-center max-w-2xl">
        Pokud problém přetrvává, obraťte se na obsluhu.
      </p>
    </div>
  );
}
