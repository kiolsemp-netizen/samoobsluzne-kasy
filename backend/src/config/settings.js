/**
 * Settings loader - cache pro DB settings tabulku
 * ----------------------------------------------------------------------------
 * Nastavení (firemní údaje, atd.) se čtou z DB s in-memory cache.
 * Cache se invaliduje po 5 minutách nebo explicitně přes invalidate().
 */

'use strict';

const db = require('./database');

let cache = null;
let cacheExpires = 0;
const CACHE_TTL = 5 * 60 * 1000;  // 5 minut

/**
 * Získá všechna settings jako objekt {key: value}.
 * @returns {Promise<Object>}
 */
async function getAll() {
  const now = Date.now();
  if (cache && now < cacheExpires) {
    return cache;
  }

  const result = await db.query('SELECT key, value FROM settings');
  const obj = {};
  for (const row of result.rows) {
    obj[row.key] = row.value;
  }

  cache = obj;
  cacheExpires = now + CACHE_TTL;
  return obj;
}

/**
 * Získá jednu hodnotu nastavení.
 * @param {string} key
 * @param {string} [defaultValue]
 */
async function get(key, defaultValue = null) {
  const all = await getAll();
  return all[key] ?? defaultValue;
}

/**
 * Uloží hodnotu nastavení a invaliduje cache.
 */
async function set(key, value) {
  await db.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(value)]
  );
  invalidate();
}

/**
 * Vyčistí cache - volat po změně nastavení.
 */
function invalidate() {
  cache = null;
  cacheExpires = 0;
}

module.exports = { getAll, get, set, invalidate };
