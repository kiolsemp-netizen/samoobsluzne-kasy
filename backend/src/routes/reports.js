/**
 * Reports routes - statistiky, tržby, top produkty
 * ----------------------------------------------------------------------------
 * GET /api/reports/dashboard        - přehled pro dashboard
 * GET /api/reports/sales            - tržby dle filtru (pro graf)
 * GET /api/reports/top-products     - nejprodávanější produkty
 * GET /api/reports/export.csv       - export objednávek CSV
 */

'use strict';

const express = require('express');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/reports/dashboard
 * Vrací: dnešní tržby, týdenní, měsíční, graf 30 dní, top 5 produktů, low-stock.
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  // ACL - stall_manager vidí jen svůj stánek
  const stallFilter = (req.user.role === 'stall_manager' && req.user.stallId)
    ? `AND o.stall_id = ${parseInt(req.user.stallId, 10)}` : '';

  const [today, week, month, chart30, topProducts, lowStock] = await Promise.all([
    db.query(`
      SELECT COALESCE(SUM(total_czk), 0) AS total, COUNT(*) AS count
      FROM orders o WHERE o.status = 'paid' AND o.paid_at >= CURRENT_DATE ${stallFilter}
    `),
    db.query(`
      SELECT COALESCE(SUM(total_czk), 0) AS total, COUNT(*) AS count
      FROM orders o WHERE o.status = 'paid' AND o.paid_at >= CURRENT_DATE - INTERVAL '7 days' ${stallFilter}
    `),
    db.query(`
      SELECT COALESCE(SUM(total_czk), 0) AS total, COUNT(*) AS count
      FROM orders o WHERE o.status = 'paid' AND o.paid_at >= CURRENT_DATE - INTERVAL '30 days' ${stallFilter}
    `),
    db.query(`
      SELECT DATE(paid_at) AS day, SUM(total_czk) AS total, COUNT(*) AS orders
      FROM orders o WHERE status = 'paid' AND paid_at >= CURRENT_DATE - INTERVAL '30 days' ${stallFilter}
      GROUP BY DATE(paid_at) ORDER BY day
    `),
    db.query(`
      SELECT oi.product_id, oi.product_name, SUM(oi.quantity) AS qty_sold,
        SUM(oi.line_total_czk) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'paid' AND o.paid_at >= CURRENT_DATE - INTERVAL '30 days' ${stallFilter}
      GROUP BY oi.product_id, oi.product_name
      ORDER BY qty_sold DESC LIMIT 5
    `),
    db.query(`
      SELECT i.*, p.name AS product_name, s.name AS stall_name
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      JOIN stalls s ON s.id = i.stall_id
      WHERE i.quantity <= i.low_stock_threshold AND p.is_active = true
      ${req.user.role === 'stall_manager' && req.user.stallId ? `AND i.stall_id = ${parseInt(req.user.stallId, 10)}` : ''}
      ORDER BY i.quantity ASC LIMIT 20
    `),
  ]);

  res.json({
    today: today.rows[0],
    week: week.rows[0],
    month: month.rows[0],
    chart30: chart30.rows,
    topProducts: topProducts.rows,
    lowStock: lowStock.rows,
  });
}));

/**
 * GET /api/reports/sales - tržby per stánek / per den
 * Query: ?from=&to=&groupBy=day|stall
 */
router.get('/sales', asyncHandler(async (req, res) => {
  const { from, to, groupBy = 'day' } = req.query;
  const conditions = [`o.status = 'paid'`];
  const params = [];
  let i = 1;

  if (req.user.role === 'stall_manager' && req.user.stallId) {
    conditions.push(`o.stall_id = $${i}`);
    params.push(req.user.stallId);
    i++;
  }
  if (from) {
    conditions.push(`o.paid_at >= $${i}`);
    params.push(from);
    i++;
  }
  if (to) {
    conditions.push(`o.paid_at <= $${i}`);
    params.push(to);
    i++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  let query;
  if (groupBy === 'stall') {
    query = `
      SELECT s.id AS stall_id, s.name AS stall_name,
        COUNT(o.id) AS orders, COALESCE(SUM(o.total_czk), 0) AS total
      FROM stalls s LEFT JOIN orders o ON o.stall_id = s.id AND o.status = 'paid'
      ${from ? `AND o.paid_at >= $1` : ''}
      ${to ? `AND o.paid_at <= $${from ? 2 : 1}` : ''}
      GROUP BY s.id, s.name ORDER BY s.id
    `;
    const result = await db.query(query, params.filter((_, idx) => idx < (from ? 1 : 0) + (to ? 1 : 0)));
    return res.json({ data: result.rows });
  }

  query = `
    SELECT DATE(paid_at) AS day, o.stall_id, s.name AS stall_name,
      COUNT(*) AS orders, SUM(total_czk) AS total
    FROM orders o JOIN stalls s ON s.id = o.stall_id
    ${where}
    GROUP BY DATE(paid_at), o.stall_id, s.name
    ORDER BY day DESC
  `;
  const result = await db.query(query, params);
  res.json({ data: result.rows });
}));

/**
 * GET /api/reports/top-products - nejprodávanější
 */
router.get('/top-products', asyncHandler(async (req, res) => {
  const { from, to, limit = 20 } = req.query;
  const conditions = [`o.status = 'paid'`];
  const params = [];
  let i = 1;

  if (req.user.role === 'stall_manager' && req.user.stallId) {
    conditions.push(`o.stall_id = $${i}`);
    params.push(req.user.stallId);
    i++;
  }
  if (from) { conditions.push(`o.paid_at >= $${i}`); params.push(from); i++; }
  if (to) { conditions.push(`o.paid_at <= $${i}`); params.push(to); i++; }

  params.push(Math.min(parseInt(limit, 10) || 20, 100));
  const result = await db.query(
    `SELECT oi.product_id, oi.product_name, SUM(oi.quantity) AS qty_sold,
       SUM(oi.line_total_czk) AS revenue, COUNT(DISTINCT o.id) AS orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY oi.product_id, oi.product_name
     ORDER BY qty_sold DESC LIMIT $${i}`,
    params
  );
  res.json({ products: result.rows });
}));

/**
 * GET /api/reports/export.csv - export CSV
 */
router.get('/export.csv', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const conditions = [`o.status = 'paid'`];
  const params = [];
  let i = 1;

  if (req.user.role === 'stall_manager' && req.user.stallId) {
    conditions.push(`o.stall_id = $${i}`); params.push(req.user.stallId); i++;
  }
  if (from) { conditions.push(`o.paid_at >= $${i}`); params.push(from); i++; }
  if (to) { conditions.push(`o.paid_at <= $${i}`); params.push(to); i++; }

  const result = await db.query(
    `SELECT o.order_number, o.invoice_number, s.name AS stall_name,
       o.paid_at, o.total_czk, o.subtotal_czk, o.vat_amount_czk,
       o.receipt_type, o.customer_name, o.customer_ico
     FROM orders o JOIN stalls s ON s.id = o.stall_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY o.paid_at DESC`,
    params
  );

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = 'Číslo dokladu;Faktura;Stánek;Datum;Celkem Kč;Základ Kč;DPH Kč;Typ;Zákazník;IČO';
  const rows = result.rows.map(r => [
    r.order_number, r.invoice_number, r.stall_name,
    new Date(r.paid_at).toISOString(),
    r.total_czk, r.subtotal_czk, r.vat_amount_czk,
    r.receipt_type, r.customer_name, r.customer_ico,
  ].map(escape).join(';'));

  const csv = '\uFEFF' + [header, ...rows].join('\n');  // BOM pro Excel

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trzby-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

module.exports = router;
