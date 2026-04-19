/**
 * Database Connection Pool
 * ----------------------------------------------------------------------------
 * PostgreSQL pool manager pro celou aplikaci.
 * Používá pg Pool pro connection pooling (výkon + ochrana proti overflow).
 *
 * Export:
 *   - pool        : přímý přístup k pg.Pool
 *   - query(...)  : wrapper s logováním a error handling
 *   - getClient() : transaction-safe client pro BEGIN/COMMIT
 */

'use strict';

const { Pool } = require('pg');

// Pool konfigurace - optimalizováno pro produkční zátěž
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                          // max 20 současných spojení
  idleTimeoutMillis: 30000,         // 30s idle → close
  connectionTimeoutMillis: 5000,    // 5s timeout při connect
  // SSL pouze v produkci (pokud je potřeba)
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Globální error handler pro pool - nesmí crashnout aplikaci
pool.on('error', (err) => {
  console.error('[DB] Neočekávaná chyba na idle klientovi:', err);
});

/**
 * Wrapper pro parametrizované dotazy.
 * VŽDY používej parametrizované queries ($1, $2, ...) - ochrana proti SQL injection.
 *
 * @param {string} text - SQL query (s $1, $2, ... placeholdery)
 * @param {Array} params - hodnoty parametrů
 * @returns {Promise<QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // V dev módu logujeme pomalé queries (>100ms)
    if (process.env.NODE_ENV !== 'production' && duration > 100) {
      console.warn(`[DB SLOW] ${duration}ms | ${text.substring(0, 80)}`);
    }
    return result;
  } catch (err) {
    console.error('[DB ERROR]', {
      query: text.substring(0, 200),
      params: params,
      error: err.message,
      code: err.code,
    });
    throw err;
  }
}

/**
 * Získá dedikovaného klienta z poolu pro transakce.
 * VŽDY volej client.release() ve finally bloku!
 *
 * Použití:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... queries
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  return pool.connect();
}

/**
 * Graceful shutdown - zavře všechny connections.
 * Volat při SIGTERM/SIGINT.
 */
async function closePool() {
  await pool.end();
  console.log('[DB] Pool uzavřen.');
}

module.exports = {
  pool,
  query,
  getClient,
  closePool,
};
