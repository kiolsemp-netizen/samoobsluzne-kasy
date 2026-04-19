/**
 * App.jsx - hlavní komponenta kiosku
 * ----------------------------------------------------------------------------
 * Zodpovědnosti:
 *   - načtení stall_id z URL (?stall=1)
 *   - online/offline detekce
 *   - idle timeout (reset do WelcomeScreen po 60s nečinnosti)
 *   - router mezi obrazovkami
 *   - globální error overlay
 */

import { useEffect, useRef } from 'react';
import useKioskStore, { SCREENS } from './store/useKioskStore';
import { kioskApi } from './api/kioskApi';

import PosScreen from './screens/PosScreen';
import OfflineScreen from './screens/OfflineScreen';

// Idle timeout - po 90s nečinnosti se vrátíme na uvítací obrazovku
const IDLE_TIMEOUT_MS = 90_000;

export default function App() {
  const {
    currentScreen, isOffline, lastActivity, errorMessage,
    setStallId, setIsOffline, setScreen, resetToWelcome, clearError,
  } = useKioskStore();

  const activityRef = useRef(lastActivity);
  activityRef.current = lastActivity;

  // ============ Načtení stall_id z URL ========================================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stallId = parseInt(params.get('stall'), 10);
    if (Number.isInteger(stallId) && stallId > 0) {
      setStallId(stallId);
    } else {
      console.warn('Chybí ?stall=X v URL kiosku');
    }
  }, [setStallId]);

  // ============ Online / offline detekce =====================================
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Periodický health check
    const healthCheck = setInterval(async () => {
      try {
        await kioskApi.heartbeat();
        setIsOffline(false);
      } catch (e) {
        if (e.isNetworkError) setIsOffline(true);
      }
    }, 20_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(healthCheck);
    };
  }, [setIsOffline]);

  // ============ Idle timeout =================================================
  useEffect(() => {
    const interval = setInterval(() => {
      // Neprovádíme reset na obrazovkách kde to nedává smysl
      const safeScreens = [
        SCREENS.PAYMENT, SCREENS.SUCCESS, SCREENS.INVOICE, SCREENS.PRINTING,
      ];
      if (safeScreens.includes(useKioskStore.getState().currentScreen)) return;

      const idle = Date.now() - activityRef.current;
      if (idle > IDLE_TIMEOUT_MS && useKioskStore.getState().currentScreen !== SCREENS.WELCOME) {
        resetToWelcome();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [resetToWelcome]);

  // ============ Auto-dismiss error message ===================================
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(clearError, 4000);
    return () => clearTimeout(t);
  }, [errorMessage, clearError]);

  // ============ Rendering ====================================================
  if (isOffline && currentScreen !== SCREENS.OFFLINE) {
    return <OfflineScreen />;
  }

  return (
    <div onClick={() => useKioskStore.getState().updateActivity()}>
      {isOffline ? <OfflineScreen /> : <PosScreen />}
    </div>
  );
}
