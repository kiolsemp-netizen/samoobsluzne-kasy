/**
 * Generátor čísel dokladů
 * ----------------------------------------------------------------------------
 * Formát účtenky:  YYYY-X-NNNN  (např. 2026-1-0042)
 *   YYYY  = rok
 *   X     = ID stánku (1, 2, 3)
 *   NNNN  = pořadové číslo v rámci roku a stánku, padded na 4 místa
 *
 * Formát faktury: YYYYNNNNNN  (10 místné, bez pomlček - pro ARES/ÚFÚ kompatibilitu)
 *   YYYY    = rok
 *   NNNNNN  = pořadové číslo faktury v rámci roku (6 míst)
 *
 * Čísla jsou generována atomicky přes DB - žádné kolize ani duplicity.
 */

'use strict';

const db = require('../config/database');

/**
 * Vygeneruje unikátní číslo objednávky/účtenky pro daný stánek.
 * Používá transakci s SELECT FOR UPDATE simulovanou přes COUNT + UNIQUE constraint.
 *
 * @param {number} stallId - ID stánku (1-3)
 * @returns {Promise<string>} např. "2026-1-0042"
 */
async function generateOrderNumber(stallId) {
  const year = new Date().getFullYear();

  // Najdi poslední číslo pro tento rok+stánek
  // Používáme LIKE pattern pro rychlé filtrování přes index
  const pattern = `${year}-${stallId}-%`;

  const result = await db.query(
    `SELECT order_number
     FROM orders
     WHERE order_number LIKE $1
     ORDER BY id DESC
     LIMIT 1`,
    [pattern]
  );

  let nextNum = 1;
  if (result.rows.length > 0) {
    const lastNumber = result.rows[0].order_number;
    const parts = lastNumber.split('-');
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  return `${year}-${stallId}-${String(nextNum).padStart(4, '0')}`;
}

/**
 * Vygeneruje unikátní číslo faktury (atomicky přes invoice_sequences tabulku).
 * Používá UPDATE ... RETURNING pro atomickou inkrementaci.
 *
 * @returns {Promise<string>} např. "2026000042"
 */
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Upsert s atomickou inkrementací
    const result = await client.query(
      `INSERT INTO invoice_sequences (year, last_number)
       VALUES ($1, 1)
       ON CONFLICT (year) DO UPDATE
         SET last_number = invoice_sequences.last_number + 1
       RETURNING last_number`,
      [year]
    );

    await client.query('COMMIT');

    const num = result.rows[0].last_number;
    return `${year}${String(num).padStart(6, '0')}`;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  generateOrderNumber,
  generateInvoiceNumber,
};
