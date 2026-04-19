/**
 * PrintingScreen - tisk účtenky / faktury
 * ----------------------------------------------------------------------------
 * Po úspěchu: odpočítává 5 sekund a vrátí se na WelcomeScreen.
 * Animace progress baru, velké "VEZMĚTE SI ÚČTENKU".
 */

import { useEffect, useState } from 'react';
import useKioskStore, { SCREENS } from '../store/useKioskStore';
import { kioskApi } from '../api/kioskApi';

export default function PrintingScreen() {
  const {
    orderId, receiptType, customerData, resetToWelcome, setError,
  } = useKioskStore();

  const [status, setStatus] = useState('printing');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    let cancelled = false;

    async function doPrint() {
      try {
        await kioskApi.printReceipt(orderId, customerData);
        if (!cancelled) setStatus('done');
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError('Tisk selhal. Kontaktujte prosím obsluhu.');
        }
      }
    }

    // Pokud receipt_type = 'none', přeskoč tisk a rovnou odpočítávej
    if (receiptType === 'none') {
      setStatus('done');
    } else {
      doPrint();
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, receiptType]);

  // Odpočet na reset
  useEffect(() => {
    if (status !== 'done') return;
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          resetToWelcome();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, resetToWelcome]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-12 bg-gradient-to-br from-midnight via-ink to-panel">
      {status === 'printing' && (
        <div className="flex flex-col items-center fade-in">
          <div className="text-kiosk-3xl mb-8">🖨️</div>
          <h1 className="text-gold text-kiosk-2xl font-bold mb-6">TISKNU...</h1>
          <div className="w-96 h-4 bg-panel rounded-full overflow-hidden mb-8">
            <div className="h-full bg-gold rounded-full animate-pulse" style={{ width: '70%' }} />
          </div>
          <p className="text-cream text-kiosk-lg text-center max-w-2xl">
            Prosím počkejte chvíli
          </p>
        </div>
      )}

      {status === 'done' && (
        <div className="flex flex-col items-center fade-in">
          <div className="text-kiosk-3xl mb-8">✅</div>
          {receiptType !== 'none' ? (
            <>
              <h1 className="text-gold text-kiosk-2xl font-bold mb-6 text-center">
                VEZMĚTE SI DOKLAD
              </h1>
              <p className="text-cream text-kiosk-xl mb-12 text-center max-w-3xl">
                Doklad byl vytištěn z tiskárny
                {receiptType === 'invoice' ? ' (faktura)' : ''}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-success text-kiosk-2xl font-bold mb-6 text-center">
                HOTOVO
              </h1>
              <p className="text-cream text-kiosk-xl mb-12 text-center max-w-3xl">
                Děkujeme za nákup!
              </p>
            </>
          )}

          <div className="text-cream/60 text-kiosk-lg mb-8">
            Obrazovka se obnoví za {countdown}...
          </div>
          <button
            onClick={resetToWelcome}
            className="btn-primary text-kiosk-lg"
          >
            DOKONČIT
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center fade-in">
          <div className="text-kiosk-3xl mb-8">⚠️</div>
          <h1 className="text-danger text-kiosk-xl mb-8 text-center">
            Nelze vytisknout
          </h1>
          <p className="text-cream text-kiosk-base mb-12 text-center max-w-2xl">
            Platba proběhla úspěšně. Obraťte se prosím na obsluhu pro vytištění dokladu.
          </p>
          <button onClick={resetToWelcome} className="btn-primary">
            ZPĚT NA ZAČÁTEK
          </button>
        </div>
      )}
    </div>
  );
}
