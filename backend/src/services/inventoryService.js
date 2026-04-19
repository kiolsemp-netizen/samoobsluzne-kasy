/**
 * Inventory service - centrální logika pro sklad
 * ----------------------------------------------------------------------------
 * Všechny změny zásob procházejí těmito funkcemi.
 * Každá změna zapíše záznam do inventory_movements (audit trail).
 *
 * Důležité: funkce jsou transakční bezpečné - buď všechno projde nebo nic.
 */

'use strict';

const db = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Naskladnění (přidání kusů).
 * @param {Object} params - { productId, stallId, quantity, note, userEmail }
 */
async function restock({ productId, stallId, quantity, note = null, userEmail = null }) {
  const qty = parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ApiError(400, 'quantity musí být kladné celé číslo');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Upsert inventory (vytvoří řádek pokud neexistuje)
    const invResult = await client.query(
      `INSERT INTO inventory (product_id, stall_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, stall_id) DO UPDATE
         SET quantity = inventory.quantity + $3
       RETURNING *`,
      [productId, stallId, qty]
    );

    // Audit log
    await client.query(
      `INSERT INTO inventory_movements (product_id, stall_id, quantity_change, reason, note, created_by)
       VALUES ($1, $2, $3, 'restock', $4, $5)`,
      [productId, stallId, qty, note, userEmail]
    );

    await client.query('COMMIT');
    return invResult.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Úprava zásoby (inventura, oprava) - nastaví absolutní hodnotu.
 */
async function adjust({ productId, stallId, newQuantity, note = null, userEmail = null }) {
  const qty = parseInt(newQuantity, 10);
  if (!Number.isInteger(qty) || qty < 0) {
    throw new ApiError(400, 'newQuantity musí být nezáporné celé číslo');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Získej aktuální stav
    const current = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND stall_id = $2`,
      [productId, stallId]
    );
    const oldQty = current.rows.length > 0 ? current.rows[0].quantity : 0;
    const change = qty - oldQty;

    const invResult = await client.query(
      `INSERT INTO inventory (product_id, stall_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, stall_id) DO UPDATE SET quantity = $3
       RETURNING *`,
      [productId, stallId, qty]
    );

    if (change !== 0) {
      await client.query(
        `INSERT INTO inventory_movements (product_id, stall_id, quantity_change, reason, note, created_by)
         VALUES ($1, $2, $3, 'adjustment', $4, $5)`,
        [productId, stallId, change, note, userEmail]
      );
    }

    await client.query('COMMIT');
    return invResult.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Přesun mezi stánky.
 */
async function transfer({ productId, fromStallId, toStallId, quantity, note = null, userEmail = null }) {
  const qty = parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ApiError(400, 'quantity musí být kladné');
  }
  if (fromStallId === toStallId) {
    throw new ApiError(400, 'Zdroj a cíl musí být různé stánky');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Zkontroluj zásobu zdrojového stánku s FOR UPDATE (lock)
    const fromCheck = await client.query(
      `SELECT quantity FROM inventory
       WHERE product_id = $1 AND stall_id = $2
       FOR UPDATE`,
      [productId, fromStallId]
    );
    if (fromCheck.rows.length === 0 || fromCheck.rows[0].quantity < qty) {
      throw new ApiError(400, 'Nedostatek zásoby na zdrojovém stánku');
    }

    // Odečti
    await client.query(
      `UPDATE inventory SET quantity = quantity - $1
       WHERE product_id = $2 AND stall_id = $3`,
      [qty, productId, fromStallId]
    );

    // Přičti na cílový (upsert)
    await client.query(
      `INSERT INTO inventory (product_id, stall_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, stall_id) DO UPDATE
         SET quantity = inventory.quantity + $3`,
      [productId, toStallId, qty]
    );

    // Vytvoř záznam transferu
    const tRes = await client.query(
      `INSERT INTO stock_transfers (product_id, from_stall_id, to_stall_id, quantity, status, note, completed_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, NOW()) RETURNING id`,
      [productId, fromStallId, toStallId, qty, note]
    );
    const transferId = tRes.rows[0].id;

    // Audit log - dva záznamy (out + in)
    await client.query(
      `INSERT INTO inventory_movements (product_id, stall_id, quantity_change, reason, reference_id, note, created_by)
       VALUES ($1, $2, $3, 'transfer', $4, $5, $6),
              ($1, $7, $8, 'transfer', $4, $5, $6)`,
      [productId, fromStallId, -qty, transferId, note, userEmail, toStallId, qty]
    );

    await client.query('COMMIT');
    return { transferId, quantity: qty };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Odečet prodaného zboží (volá se po úspěšné platbě).
 * Ujistí se, že zásoba neklesne pod 0.
 * @param {pg.Client} client - MUSÍ být v existující transakci (předáno z payment flow)
 */
async function deductSale(client, { productId, stallId, quantity, orderId }) {
  const qty = parseInt(quantity, 10);

  // Lock + kontrola
  const check = await client.query(
    `SELECT quantity FROM inventory
     WHERE product_id = $1 AND stall_id = $2
     FOR UPDATE`,
    [productId, stallId]
  );
  if (check.rows.length === 0 || check.rows[0].quantity < qty) {
    throw new ApiError(409, `Produkt ${productId} - nedostatek zásoby (požadováno ${qty}, dostupné ${check.rows[0]?.quantity || 0})`);
  }

  await client.query(
    `UPDATE inventory SET quantity = quantity - $1
     WHERE product_id = $2 AND stall_id = $3`,
    [qty, productId, stallId]
  );

  await client.query(
    `INSERT INTO inventory_movements (product_id, stall_id, quantity_change, reason, reference_id)
     VALUES ($1, $2, $3, 'sale', $4)`,
    [productId, stallId, -qty, orderId]
  );
}

/**
 * Low-stock query - vrátí produkty, které jsou pod threshold.
 */
async function getLowStock(stallId = null) {
  const params = [];
  let where = 'i.quantity <= i.low_stock_threshold AND p.is_active = true';
  if (stallId !== null) {
    where += ' AND i.stall_id = $1';
    params.push(stallId);
  }

  const result = await db.query(
    `SELECT i.*, p.name AS product_name, p.sku, s.name AS stall_name
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN stalls s ON s.id = i.stall_id
     WHERE ${where}
     ORDER BY i.quantity ASC, p.name`,
    params
  );
  return result.rows;
}

module.exports = {
  restock,
  adjust,
  transfer,
  deductSale,
  getLowStock,
};
