/**
 * Orders routes - admin přehled objednávek
 * ----------------------------------------------------------------------------
 * GET  /api/orders             - seznam s filtry (stall, status, date)
 * GET  /api/orders/:id         - detail + položky
 * GET  /api/orders/:id/invoice - stáhnout PDF fakturu
 * POST /api/orders/:id/reprint - opakovaný tisk účtenky
 */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/orders - seznam
 * Query: ?stall_id=&status=&from=&to=&limit=&offset=&search=
 */
router.get('/', asyncHandler(async (req, res) => {
  const { stall_id, status, from, to, limit = 50, offset = 0, search } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  // Stall manager vidí pouze svůj stánek
  if (req.user.role === 'stall_manager' && req.user.stallId) {
    conditions.push(`o.stall_id = $${i}`);
    params.push(req.user.stallId);
    i++;
  } else if (stall_id) {
    conditions.push(`o.stall_id = $${i}`);
    params.push(parseInt(stall_id, 10));
    i++;
  }

  if (status) {
    conditions.push(`o.status = $${i}`);
    params.push(status);
    i++;
  }
  if (from) {
    conditions.push(`o.created_at >= $${i}`);
    params.push(from);
    i++;
  }
  if (to) {
    conditions.push(`o.created_at <= $${i}`);
    params.push(to);
    i++;
  }
  if (search) {
    conditions.push(`(o.order_number ILIKE $${i} OR o.customer_name ILIKE $${i} OR o.invoice_number ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 500);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  params.push(safeLimit, safeOffset);

  const [ordersResult, countResult] = await Promise.all([
    db.query(
      `SELECT o.id, o.order_number, o.invoice_number, o.status, o.total_czk, o.payment_method,
         o.receipt_type, o.customer_name, o.customer_company, o.created_at, o.paid_at,
         s.name AS stall_name,
         (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o LEFT JOIN stalls s ON s.id = o.stall_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      params
    ),
    db.query(
      `SELECT COUNT(*) AS total FROM orders o ${where}`,
      params.slice(0, -2)
    ),
  ]);

  res.json({
    orders: ordersResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit: safeLimit,
    offset: safeOffset,
  });
}));

/**
 * GET /api/orders/:id - detail
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw new ApiError(400, 'Neplatné ID');

  const orderResult = await db.query(
    `SELECT o.*, s.name AS stall_name
     FROM orders o LEFT JOIN stalls s ON s.id = o.stall_id
     WHERE o.id = $1`,
    [id]
  );
  if (orderResult.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');
  const order = orderResult.rows[0];

  // ACL pro stall_manager
  if (req.user.role === 'stall_manager' && req.user.stallId && order.stall_id !== req.user.stallId) {
    throw new ApiError(403, 'Přístup odepřen');
  }

  const itemsResult = await db.query(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
    [id]
  );

  res.json({ order, items: itemsResult.rows });
}));

/**
 * GET /api/orders/:id/invoice - stáhnout PDF fakturu
 */
router.get('/:id/invoice', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw new ApiError(400, 'Neplatné ID');

  const result = await db.query(
    `SELECT invoice_pdf_path, stall_id, invoice_number FROM orders WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');
  const order = result.rows[0];

  if (req.user.role === 'stall_manager' && req.user.stallId && order.stall_id !== req.user.stallId) {
    throw new ApiError(403, 'Přístup odepřen');
  }

  // Pokud PDF neexistuje, vygeneruj
  let pdfPath = order.invoice_pdf_path
    ? path.join(__dirname, '..', '..', order.invoice_pdf_path)
    : null;

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    const invoiceService = require('../services/invoiceService');
    pdfPath = await invoiceService.generateInvoice(id);
  }

  res.download(pdfPath, `faktura-${order.invoice_number || id}.pdf`);
}));

/**
 * POST /api/orders/:id/reprint - opakovaný tisk
 */
router.post('/:id/reprint', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw new ApiError(400, 'Neplatné ID');

  const result = await db.query(
    `SELECT stall_id, status FROM orders WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Objednávka nenalezena');
  if (result.rows[0].status !== 'paid') throw new ApiError(400, 'Objednávka není zaplacena');

  if (req.user.role === 'stall_manager' && req.user.stallId && result.rows[0].stall_id !== req.user.stallId) {
    throw new ApiError(403, 'Přístup odepřen');
  }

  const receiptService = require('../services/receiptService');
  await receiptService.printReceipt(id);
  res.json({ success: true });
}));

module.exports = router;
