/**
 * Inventory routes - správa skladu pro admin
 * ----------------------------------------------------------------------------
 * GET  /api/inventory              - přehled zásob (filtr stall_id)
 * GET  /api/inventory/low-stock    - produkty pod threshold
 * GET  /api/inventory/movements    - historie pohybů
 * POST /api/inventory/restock      - naskladnění
 * POST /api/inventory/adjust       - úprava (inventura)
 * POST /api/inventory/transfer     - přesun mezi stánky
 * PUT  /api/inventory/:id/threshold - nastavení low_stock_threshold
 */

'use strict';

const express = require('express');
const db = require('../config/database');
const inventoryService = require('../services/inventoryService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/inventory - přehled zásob
 * Query: ?stall_id=&search=&low_only=true
 */
router.get('/', asyncHandler(async (req, res) => {
  const { stall_id, search, low_only } = req.query;
  const conditions = ['p.is_active = true'];
  const params = [];
  let i = 1;

  if (stall_id) {
    conditions.push(`i.stall_id = $${i}`);
    params.push(parseInt(stall_id, 10));
    i++;
  }
  if (search) {
    conditions.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }
  if (low_only === 'true') {
    conditions.push(`i.quantity <= i.low_stock_threshold`);
  }

  const result = await db.query(
    `SELECT i.*, p.name AS product_name, p.sku, p.price_czk, p.images,
       s.name AS stall_name
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN stalls s ON s.id = i.stall_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.name, s.id`,
    params
  );

  res.json({ inventory: result.rows });
}));

/**
 * GET /api/inventory/low-stock - produkty pod threshold
 */
router.get('/low-stock', asyncHandler(async (req, res) => {
  const stallId = req.query.stall_id ? parseInt(req.query.stall_id, 10) : null;
  const items = await inventoryService.getLowStock(stallId);
  res.json({ items });
}));

/**
 * GET /api/inventory/movements - historie pohybů
 */
router.get('/movements', asyncHandler(async (req, res) => {
  const { stall_id, product_id, limit = 100 } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (stall_id) {
    conditions.push(`m.stall_id = $${i}`);
    params.push(parseInt(stall_id, 10));
    i++;
  }
  if (product_id) {
    conditions.push(`m.product_id = $${i}`);
    params.push(parseInt(product_id, 10));
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(parseInt(limit, 10) || 100, 500);
  params.push(safeLimit);

  const result = await db.query(
    `SELECT m.*, p.name AS product_name, s.name AS stall_name
     FROM inventory_movements m
     LEFT JOIN products p ON p.id = m.product_id
     LEFT JOIN stalls s ON s.id = m.stall_id
     ${where}
     ORDER BY m.created_at DESC
     LIMIT $${i}`,
    params
  );
  res.json({ movements: result.rows });
}));

/**
 * POST /api/inventory/restock
 * Body: { productId, stallId, quantity, note }
 */
router.post('/restock', asyncHandler(async (req, res) => {
  const { productId, stallId, quantity, note } = req.body;
  if (!productId || !stallId || !quantity) {
    throw new ApiError(400, 'productId, stallId, quantity jsou povinné');
  }
  const result = await inventoryService.restock({
    productId: parseInt(productId, 10),
    stallId: parseInt(stallId, 10),
    quantity: parseInt(quantity, 10),
    note,
    userEmail: req.user.email,
  });
  res.json({ inventory: result });
}));

/**
 * POST /api/inventory/adjust
 * Body: { productId, stallId, newQuantity, note }
 */
router.post('/adjust', asyncHandler(async (req, res) => {
  const { productId, stallId, newQuantity, note } = req.body;
  if (!productId || !stallId || newQuantity === undefined) {
    throw new ApiError(400, 'productId, stallId, newQuantity jsou povinné');
  }
  const result = await inventoryService.adjust({
    productId: parseInt(productId, 10),
    stallId: parseInt(stallId, 10),
    newQuantity: parseInt(newQuantity, 10),
    note,
    userEmail: req.user.email,
  });
  res.json({ inventory: result });
}));

/**
 * POST /api/inventory/transfer
 * Body: { productId, fromStallId, toStallId, quantity, note }
 */
router.post('/transfer', asyncHandler(async (req, res) => {
  const { productId, fromStallId, toStallId, quantity, note } = req.body;
  if (!productId || !fromStallId || !toStallId || !quantity) {
    throw new ApiError(400, 'productId, fromStallId, toStallId, quantity jsou povinné');
  }
  const result = await inventoryService.transfer({
    productId: parseInt(productId, 10),
    fromStallId: parseInt(fromStallId, 10),
    toStallId: parseInt(toStallId, 10),
    quantity: parseInt(quantity, 10),
    note,
    userEmail: req.user.email,
  });
  res.json(result);
}));

/**
 * PUT /api/inventory/:id/threshold - nastavení low_stock_threshold
 */
router.put('/:id/threshold', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const threshold = parseInt(req.body.threshold, 10);
  if (isNaN(id) || !Number.isInteger(threshold) || threshold < 0) {
    throw new ApiError(400, 'Neplatné parametry');
  }
  const result = await db.query(
    `UPDATE inventory SET low_stock_threshold = $1 WHERE id = $2 RETURNING *`,
    [threshold, id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Nenalezeno');
  res.json({ inventory: result.rows[0] });
}));

module.exports = router;
