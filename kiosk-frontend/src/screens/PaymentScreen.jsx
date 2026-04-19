/**
 * PaymentScreen - platba kartou přes Stripe Terminal
 * ----------------------------------------------------------------------------
 * Flow:
 *   1. Získej connection token a připoj se k Terminal SDK
 *   2. Discover + připoj se k čtečce (simulátor nebo reálná)
 *   3. Vytvoř PaymentIntent (backend)
 *   4. Pošli PI do Terminal SDK → čtečka čeká na kartu
 *   5. Terminal SDK zpracuje a čeká na webhook (status=succeeded)
 *   6. Pollingem zjistíme že order.status=paid → přejdeme na Success
 *
 * Pro zákazníka (zvláště seniora):
 *   - OBROVSKÁ ČÁSTKA k zaplacení (nejzřetelnější prvek)
 *   - Jasná animace / instrukce "Přiložte kartu"
 *   - Žádná zmatená stavová hlášení
 *   - Tlačítko "ZRUŠIT" jen pro případ nouze
 */

import { useEffect, useState, useRef } from 'react';
import useKioskStore, { SCREENS } from '../store/useKioskStore';
import { kioskApi } from '../api/kioskApi';
import { formatCzk } from '../utils/format';

const STATES = {
  INIT: 'init',
  CONNECTING: 'connecting',
  READY: 'ready',
  WAITING_CARD: 'waiting_card',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
};

export default function PaymentScreen() {
  const {
    orderId, cart, getTotal, setScreen, clearCart, setError, resetToWelcome,
  } = useKioskStore();

  const [state, setState] = useState(STATES.INIT);
  const [statusMessage, setStatusMessage] = useState('Připravuji platbu...');
  const [paymentIntent, setPaymentIntent] = useState(null);
  const terminalRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const total = getTotal();

  // ============ Inicializace Terminal SDK ===================================
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!orderId) {
          throw new Error('Chybí ID objednávky');
        }

        setState(STATES.CONNECTING);
        setStatusMessage('Připojuji platební terminál...');

        // Dynamický import (jen na kiosku s instalovaným SDK)
        let StripeTerminal;
        try {
          const m = await import('@stripe/terminal-js');
          StripeTerminal = m.loadStripeTerminal ? await m.loadStripeTerminal() : m.default;
        } catch (e) {
          // Fallback: pokud SDK není dostupné, pokusíme se jen o createPaymentIntent
          // a použijeme ruční platbu. V reálné produkci je SDK povinné.
          throw new Error('Platební terminál není k dispozici. Kontaktujte prosím obsluhu.');
        }

        // Získej connection token
        const terminal = StripeTerminal.create({
          onFetchConnectionToken: async () => {
            const data = await kioskApi.getConnectionToken();
            return data.secret;
          },
          onUnexpectedReaderDisconnect: () => {
            console.warn('[Stripe] Čtečka odpojena');
            if (!cancelled) setStatusMessage('Terminál odpojen');
          },
        });
        terminalRef.current = terminal;

        // Najdi čtečku
        const discoverResult = await terminal.discoverReaders({
          simulated: import.meta.env.VITE_STRIPE_SIMULATED === 'true',
        });
        if (discoverResult.error) {
          throw new Error(`Nelze najít čtečku: ${discoverResult.error.message}`);
        }
        if (!discoverResult.discoveredReaders.length) {
          throw new Error('Žádná platební čtečka není k dispozici');
        }

        const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
        if (connectResult.error) {
          throw new Error(`Nelze se připojit ke čtečce: ${connectResult.error.message}`);
        }

        if (cancelled) return;
        setState(STATES.READY);
        setStatusMessage('Vytvářím platbu...');

        // Vytvoř Payment Intent
        const pi = await kioskApi.createPaymentIntent(orderId);
        setPaymentIntent(pi);

        if (cancelled) return;
        setState(STATES.WAITING_CARD);
        setStatusMessage('');

        // Čekej na kartu
        const collectResult = await terminal.collectPaymentMethod(pi.client_secret);
        if (collectResult.error) {
          throw new Error(`Chyba při čtení karty: ${collectResult.error.message}`);
        }

        if (cancelled) return;
        setState(STATES.PROCESSING);
        setStatusMessage('Zpracovávám platbu...');

        // Potvrzení
        const processResult = await terminal.processPayment(collectResult.paymentIntent);
        if (processResult.error) {
          throw new Error(`Platba neúspěšná: ${processResult.error.message}`);
        }

        // Teď čekáme na webhook na serveru - pollingem zjistíme že order.status=paid
        setStatusMessage('Dokončuji platbu...');
        startPolling();
      } catch (e) {
        if (cancelled) return;
        console.error('[Payment] Error:', e);
        setState(STATES.FAILED);
        setStatusMessage(e.message || 'Platba selhala');
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (terminalRef.current) {
        try { terminalRef.current.disconnectReader(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // ============ Polling stavu objednávky =====================================
  function startPolling() {
    let attempts = 0;
    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const data = await kioskApi.getOrder(orderId);
        if (data.order.status === 'paid') {
          clearInterval(pollIntervalRef.current);
          setState(STATES.SUCCESS);
          setScreen(SCREENS.SUCCESS);
        } else if (data.order.status === 'failed') {
          clearInterval(pollIntervalRef.current);
          setState(STATES.FAILED);
          setStatusMessage('Platba byla odmítnuta');
        } else if (attempts > 30) {
          // 30 pokusů × 2s = 60s timeout
          clearInterval(pollIntervalRef.current);
          setState(STATES.FAILED);
          setStatusMessage('Časový limit vypršel');
        }
      } catch (e) {
        console.error('[Poll] error:', e);
      }
    }, 2000);
  }

  const handleCancel = () => {
    if (confirm('Opravdu chcete zrušit platbu?')) {
      resetToWelcome();
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  // ============ RENDERING ====================================================
  return (
    <div className="min-h-screen flex flex-col bg-midnight p-12">
      {/* Částka k zaplacení - obrovská */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-cream text-kiosk-xl mb-6">K zaplacení</div>
        <div className="text-gold text-[10rem] leading-none font-bold mb-16">
          {formatCzk(total)}
        </div>

        {/* Stav */}
        {state === STATES.WAITING_CARD && (
          <div className="flex flex-col items-center fade-in">
            <CardAnimation />
            <div className="text-cream text-kiosk-xl mt-8 text-center">
              Přiložte kartu k terminálu
            </div>
            <div className="text-cream/60 text-kiosk-base mt-4">
              nebo přibližte telefon
            </div>
          </div>
        )}

        {(state === STATES.INIT || state === STATES.CONNECTING || state === STATES.READY) && (
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 border-8 border-gold border-t-transparent rounded-full spin-slow mb-8" />
            <div className="text-cream text-kiosk-lg">{statusMessage}</div>
          </div>
        )}

        {state === STATES.PROCESSING && (
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 border-8 border-success border-t-transparent rounded-full spin-slow mb-8" />
            <div className="text-cream text-kiosk-xl">{statusMessage}</div>
            <div className="text-cream/60 text-kiosk-base mt-4">Nevytahujte kartu</div>
          </div>
        )}

        {state === STATES.FAILED && (
          <div className="flex flex-col items-center fade-in">
            <div className="text-kiosk-3xl mb-6">❌</div>
            <div className="text-danger text-kiosk-xl mb-4 text-center">
              {statusMessage}
            </div>
            <div className="text-cream/60 text-kiosk-base mb-12 text-center max-w-2xl">
              Pokud problém přetrvává, obraťte se na obsluhu.
            </div>
            <div className="flex gap-6">
              <button onClick={handleRetry} className="btn-primary text-kiosk-lg">
                ZKUSIT ZNOVU
              </button>
              <button onClick={resetToWelcome} className="btn-secondary text-kiosk-lg">
                ZPĚT NA ZAČÁTEK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tlačítko zrušit */}
      {state !== STATES.FAILED && state !== STATES.PROCESSING && state !== STATES.SUCCESS && (
        <div className="flex justify-center">
          <button onClick={handleCancel} className="btn-secondary text-kiosk-base">
            ZRUŠIT PLATBU
          </button>
        </div>
      )}
    </div>
  );
}

function CardAnimation() {
  return (
    <div className="relative w-64 h-40">
      {/* Terminál */}
      <div className="absolute inset-x-4 bottom-0 top-12 bg-panel rounded-xl border-2 border-gold/40 flex items-center justify-center">
        <div className="w-16 h-1 bg-gold/40 rounded-full" />
      </div>
      {/* Karta (pulzuje dolů) */}
      <div className="absolute inset-x-8 top-0 h-20 bg-gradient-to-br from-gold to-goldLo rounded-xl shadow-xl animate-bounce">
        <div className="p-3">
          <div className="w-8 h-6 bg-goldHi/60 rounded-sm mb-1" />
          <div className="w-12 h-1 bg-midnight/30 rounded-full" />
        </div>
      </div>
    </div>
  );
}
