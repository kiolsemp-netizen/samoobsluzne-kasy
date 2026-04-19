/**
 * Kiosk routes - API pro stánky (autentizace přes X-Kiosk-Key)
 * ----------------------------------------------------------------------------
 * GET  /api/kiosk/products       - produkty dostupné pro daný stánek (qty > 0)
 * GET  /api/kiosk/categories     - kategorie
 * POST /api/kiosk/cart/validate  - validace košíku před platbou (zásoba, ceny)
 * POST /api/kiosk/order          - vytvoření objednávky (status=pending)
 * POST /api/kiosk/receipt/print  - příkaz k tisku účtenky
 * GET  /api/kiosk/order/:id      - stav objednávky (polling po platbě)
 * POST /api/kiosk/heartbeat      - kiosk hlásí že je online (monitoring)
 *
 * Všechny endpointy vracejí req.stallId z middleware.
 */

'use strict';

const express = require('express');
const db = require('../config/database');
const kioskAuth = require('../middleware/kioskAuth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { calcLine, calcTotals } = require('../utils/vatCalculator');

const router = express.Router();
router.use(kioskAuth);  // všechny endpointy vyžadují kiosk klíč

/**
 * GET /api/kiosk/products
 * Vrátí pouze produkty dostupné na daném stánku (qty > 0, is_active).
 */
router.get('/products', asyncHandler(async (req, res) => {
  const { search = '', categoryId = '', page = 1, limit = 20, ean = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [req.stallId];
  let where = 'p.is_active = true AND i.quantity > 0';

  // EAN hledání (pro čtečku)
  if (ean) {
    params.push(ean);
    where += ` AND p.attributes->>'ean' = $${params.length}`;
  }
  // Fulltext vyhledávání
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where += ` AND (LOWER(p.name) LIKE $${params.length} OR LOWER(p.sku) LIKE $${params.length})`;
  }
  // Filtr kategorie podle ID
  if (categoryId && categoryId !== '') {
    params.push(parseInt(categoryId));
    where += ` AND p.category_id = $${params.length}`;
  }

  const countResult = await db.query(
    `SELECT COUNT(*) FROM products p
     JOIN inventory i ON i.product_id = p.id AND i.stall_id = $1
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  params.push(parseInt(limit), offset);
  const result = await db.query(
    `SELECT p.id, p.sku, p.name, p.description, p.category_id, p.price_czk,
       p.images, p.attributes, c.name AS category_name, c.slug AS category_slug,
       i.quantity
     FROM products p
     JOIN inventory i ON i.product_id = p.id AND i.stall_id = $1
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}
     ORDER BY c.display_order, p.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({
    products: result.rows,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
  });
}));

/**
 * GET /api/kiosk/categories
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, slug, parent_id, display_order FROM categories ORDER BY display_order, name`
  );
  res.json({ categories: result.rows });
}));

/**
 * POST /api/kiosk/cart/validate
 * Body: { items: [{productId, quantity}] }
 *
 * Ověří:
 *  - produkt existuje a je aktivní
 *  - zásoba je dostatečná na daném stánku
 *  - vrátí aktuální ceny a celkem
 */
router.post('/cart/validate', asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'items musí být neprázdné pole');
  }

  const productIds = items.map(it => parseInt(it.productId, 10)).filter(id => !isNaN(id));
  if (productIds.length === 0) throw new ApiError(400, 'Chybí productId');

  const result = await db.query(
    `SELECT p.id, p.name, p.price_czk, p.vat_rate, p.is_active, i.quantity AS stock
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id AND i.stall_id = $1
     WHERE p.id = ANY($2::int[])`,
    [req.stallId, productIds]
  );
  const productMap = new Map(result.rows.map(r => [r.id, r]));

  const validatedLines = [];
  const issues = [];

  for (const item of items) {
    const pid = parseInt(item.productId, 10);
    const qty = parseInt(item.quantity, 10);
    const product = productMap.get(pid);

    if (!product) {
      issues.push({ productId: pid, error: 'Produkt nenalezen' });
      continue;
    }
    if (!product.is_active) {
      issues.push({ productId: pid, error: 'Produkt není dostupný' });
      continue;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      issues.push({ productId: pid, error: 'Neplatné množství' });
      continue;
    }
    if ((product.stock || 0) < qty) {
      issues.push({
        productId: pid,
        error: 'Nedostatečná zásoba',
        available: product.stock || 0,
        requested: qty,
      });
      continue;
    }

    const line = calcLine(product.price_czk, qty, product.vat_rate);
    validatedLines.push({
      productId: pid,
      productName: product.name,
      quantity: qty,
      ...line,
    });
  }

  const totals = calcTotals(validatedLines);
  res.json({
    valid: issues.length === 0,
    lines: validatedLines,
    totals,
    issues,
  });
}));

/**
 * POST /api/kiosk/order
 * Body: { items: [{productId, quantity}], receiptType: 'simplified'|'invoice'|'none' }
 *
 * Vytvoří order ve stavu 'pending'. Zásoby se odečítají až po úspěšné platbě.
 * Návrat: { orderId } - použije se pro vytvoření PaymentIntent.
 */
router.post('/order', asyncHandler(async (req, res) => {
  const { items, receiptType = 'simplified' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'items jsou povinné');
  }

  const { generateOrderNumber } = require('../utils/orderNumber');
  const orderNumber = await generateOrderNumber(req.stallId);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Načti produkty + zásobu, s FOR UPDATE na inventory (zabrání double-booking)
    const productIds = items.map(it => parseInt(it.productId, 10));
    const productResult = await client.query(
      `SELECT p.id, p.name, p.price_czk, p.vat_rate, p.is_active, i.quantity AS stock
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id AND i.stall_id = $1
       WHERE p.id = ANY($2::int[])
       FOR UPDATE OF i`,
      [req.stallId, productIds]
    );
    const pMap = new Map(productResult.rows.map(r => [r.id, r]));

    const lines = [];
    for (const item of items) {
      const pid = parseInt(item.productId, 10);
      const qty = parseInt(item.quantity, 10);
      const p = pMap.get(pid);
      if (!p || !p.is_active) throw new ApiError(400, `Produkt ${pid} není dostupný`);
      if ((p.stock || 0) < qty) {
        throw new ApiError(409, `Nedostatek zásoby pro ${p.name} (dostupné: ${p.stock || 0})`);
      }
      lines.push({
        productId: pid,
        productName: p.name,
        quantity: qty,
        ...calcLine(p.price_czk, qty, p.vat_rate),
      });
    }

    const totals = calcTotals(lines);

    // Vytvoř order
    const orderResult = await client.query(
      `INSERT INTO orders (stall_id, order_number, status, subtotal_czk, vat_amount_czk, total_czk, receipt_type)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6)
       RETURNING id, order_number, total_czk`,
      [req.stallId, orderNumber, totals.subtotal, totals.vatAmount, totals.total, receiptType]
    );
    const orderId = orderResult.rows[0].id;

    // Vytvoř položky
    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_czk, unit_price_base, unit_vat, vat_rate, line_total_czk)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [orderId, line.productId, line.productName, line.quantity, line.unitPriceCzk, line.unitPriceBase, line.unitVat, line.vatRate, line.lineTotalCzk]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      orderId,
      orderNumber: orderResult.rows[0].order_number,
      total: orderResult.rows[0].total_czk,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/kiosk/order/:id - stav objednávky (kiosk pollingem zjistí že platba prošla)
 */
router.get('/order/:id', asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) throw new ApiError(400, 'Neplatné ID');

  const result = await db.query(
    `SELECT id, order_number, status, payment_status, total_czk, stall_id,
       receipt_printed, invoice_number, created_at, paid_at
     FROM orders WHERE id = $1`,
    [orderId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');

  const order = result.rows[0];
  // Bezpečnost: kiosk vidí pouze své objednávky
  if (order.stall_id !== req.stallId) throw new ApiError(403, 'Přístup odepřen');

  res.json({ order });
}));

/**
 * POST /api/kiosk/receipt/print
 * Body: { orderId, customerData?: {name, company, ico, dic, address, email} }
 *
 * Zavolá tisk účtenky / vygeneruje fakturu dle receipt_type.
 */
router.post('/receipt/print', asyncHandler(async (req, res) => {
  const { orderId, customerData } = req.body;
  if (!orderId) throw new ApiError(400, 'orderId je povinné');

  const receiptService = require('../services/receiptService');
  const invoiceService = require('../services/invoiceService');

  // Načti order
  const orderResult = await db.query(
    `SELECT * FROM orders WHERE id = $1`,
    [parseInt(orderId, 10)]
  );
  if (orderResult.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');
  const order = orderResult.rows[0];

  if (order.stall_id !== req.stallId) throw new ApiError(403, 'Přístup odepřen');
  if (order.status !== 'paid') throw new ApiError(400, 'Objednávka není zaplacena');

  // Pokud je to faktura, aktualizuj zákaznická data
  if (customerData && order.receipt_type === 'invoice') {
    await db.query(
      `UPDATE orders SET
         customer_name = $1, customer_company = $2, customer_ico = $3,
         customer_dic = $4, customer_address = $5, customer_email = $6
       WHERE id = $7`,
      [
        customerData.name || null,
        customerData.company || null,
        customerData.ico || null,
        customerData.dic || null,
        customerData.address || null,
        customerData.email || null,
        order.id,
      ]
    );
  }

  // Vytiskni účtenku vždy (pokud není 'none')
  if (order.receipt_type !== 'none') {
    await receiptService.printReceipt(order.id);
  }

  // Pokud faktura, vygeneruj PDF
  let invoicePath = null;
  if (order.receipt_type === 'invoice') {
    invoicePath = await invoiceService.generateInvoice(order.id);
  }

  res.json({ success: true, invoicePath });
}));

/**
 * POST /api/kiosk/heartbeat - kiosk se hlásí online (pro monitoring)
 */
router.post('/heartbeat', asyncHandler(async (req, res) => {
  res.json({ ok: true, stallId: req.stallId, serverTime: new Date().toISOString() });
}));

module.exports = router;
