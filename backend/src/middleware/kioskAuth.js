/**
 * Kiosk autentizace - X-Kiosk-Key header
 * ----------------------------------------------------------------------------
 * Každý stánek má vlastní API klíč v env proměnné KIOSK_API_KEY_{STALL_ID}.
 * Middleware ověří klíč a nastaví req.stallId pro následnou logiku.
 *
 * Bezpečnost:
 *   - API klíče min. 32 znaků (generované z crypto.randomBytes)
 *   - Porovnání přes timingSafeEqual (ochrana proti timing attacks)
 *   - Klíče NIKDY nejsou v URL ani v logu (pouze v HTTP headeru)
 */

'use strict';

const crypto = require('crypto');
const { ApiError } = require('./errorHandler');

/**
 * Načte všechny platné kiosk klíče z env proměnných.
 * Vrací mapu { klíč → stallId }.
 */
function loadKioskKeys() {
  const keys = new Map();
  // Podporujeme stánky 1..10 (dostatek rezervy)
  for (let i = 1; i <= 10; i++) {
    const envKey = `KIOSK_API_KEY_${i}`;
    const value = process.env[envKey];
    if (value && value.length >= 16) {
      keys.set(value, i);
    }
  }
  return keys;
}

// Cache klíčů - načteme jednou při startu
const KIOSK_KEYS = loadKioskKeys();

if (KIOSK_KEYS.size === 0) {
  console.warn('[KIOSK AUTH] POZOR: žádné KIOSK_API_KEY_X proměnné nejsou nastaveny!');
} else {
  console.log(`[KIOSK AUTH] Načteno ${KIOSK_KEYS.size} kiosk klíčů`);
}

/**
 * Timing-safe porovnání - ochrana proti timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Middleware - ověří X-Kiosk-Key a nastaví req.stallId.
 */
function kioskAuth(req, res, next) {
  const providedKey = req.get('X-Kiosk-Key');

  if (!providedKey) {
    return next(new ApiError(401, 'Chybí X-Kiosk-Key header'));
  }

  // Timing-safe lookup (projdeme všechny klíče s konstantním časem)
  let matchedStallId = null;
  for (const [key, stallId] of KIOSK_KEYS) {
    if (safeCompare(providedKey, key)) {
      matchedStallId = stallId;
      // Nebreakujeme - kompletní iterace pro timing safety
    }
  }

  if (matchedStallId === null) {
    return next(new ApiError(401, 'Neplatný kiosk klíč'));
  }

  req.stallId = matchedStallId;
  next();
}

module.exports = kioskAuth;
