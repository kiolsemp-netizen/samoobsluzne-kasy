/**
 * ARES service - načtení firemních údajů dle IČO
 * ----------------------------------------------------------------------------
 * ARES = Administrativní registr ekonomických subjektů (gov.cz).
 * Veřejné API, bez autentizace, rate limit ~100 req/min.
 *
 * Endpoint: https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}
 *
 * Vrací strukturu s název firmy, adresu, DIČ.
 */

'use strict';

const axios = require('axios');

const ARES_BASE = process.env.ARES_BASE_URL || 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest';
const REQUEST_TIMEOUT = 8000;

/**
 * Validace IČO - 8 číslic.
 */
function isValidIco(ico) {
  return typeof ico === 'string' && /^\d{8}$/.test(ico.trim());
}

/**
 * Načte údaje z ARES pro dané IČO.
 * @param {string} ico
 * @returns {Promise<{name, address, dic, ico} | null>}
 */
async function lookupByIco(ico) {
  const cleanIco = String(ico).trim();
  if (!isValidIco(cleanIco)) {
    throw new Error('Neplatné IČO - musí mít přesně 8 číslic');
  }

  try {
    const response = await axios.get(
      `${ARES_BASE}/ekonomicke-subjekty/${cleanIco}`,
      {
        timeout: REQUEST_TIMEOUT,
        headers: { Accept: 'application/json' },
        validateStatus: (status) => status < 500,
      }
    );

    if (response.status === 404) {
      return null;  // IČO neexistuje
    }
    if (response.status !== 200) {
      throw new Error(`ARES API vrátilo status ${response.status}`);
    }

    const data = response.data;

    // Sestav adresu
    const sidlo = data.sidlo || {};
    const addressParts = [
      sidlo.nazevUlice && `${sidlo.nazevUlice} ${sidlo.cisloDomovni || ''}${sidlo.cisloOrientacni ? '/' + sidlo.cisloOrientacni : ''}`.trim(),
      sidlo.psc && sidlo.nazevObce && `${sidlo.psc} ${sidlo.nazevObce}`,
    ].filter(Boolean);

    return {
      ico: cleanIco,
      name: data.obchodniJmeno || null,
      dic: data.dic || null,
      address: addressParts.join(', ') || null,
      rawData: data,
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new Error('ARES API je pomalé / nedostupné');
    }
    throw err;
  }
}

module.exports = {
  lookupByIco,
  isValidIco,
};
