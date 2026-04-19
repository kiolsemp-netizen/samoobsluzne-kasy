/**
 * Products routes - CRUD pro admin + bulk import
 * ----------------------------------------------------------------------------
 * Všechny endpointy vyžadují admin JWT.
 *
 * GET    /api/products            - seznam (s filtry)
 * GET    /api/products/:id        - detail
 * POST   /api/products            - vytvoření
 * PUT    /api/products/:id        - úprava
 * DELETE /api/products/:id        - soft delete (is_active=false)
 * POST   /api/products/bulk       - hromadný import (JSON array)
 * GET    /api/categories          - seznam kategorií
 */

'use strict';

const express = require('express');
const db = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();

// Všechny endpointy vyžadují auth
router.use(requireAuth);

/**
 * GET /api/products - seznam s filtry
 * Query params: ?search=&category_id=&is_active=&limit=&offset=
 */
router.get('/', asyncHandler(async (req, res) => {
  const { search, category_id, is_active, limit = 100, offset = 0 } = req.query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (search) {
    conditions.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }
  if (category_id) {
    conditions.push(`p.category_id = $${i}`);
    params.push(parseInt(category_id, 10));
    i++;
  }
  if (is_active !== undefined) {
    conditions.push(`p.is_active = $${i}`);
    params.push(is_active === 'true');
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(parseInt(limit, 10) || 100, 500);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  params.push(safeLimit, safeOffset);

  const result = await db.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
       COALESCE((SELECT SUM(quantity) FROM inventory WHERE product_id = p.id), 0) AS total_stock
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ${where}
     ORDER BY p.name
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );

  res.json({ products: result.rows, limit: safeLimit, offset: safeOffset });
}));

/**
 * GET /api/products/:id - detail produktu + zásoby per stánek
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) throw new ApiError(400, 'Neplatné ID');

  const productResult = await db.query(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1`,
    [productId]
  );

  if (productResult.rows.length === 0) throw new ApiError(404, 'Produkt nenalezen');

  const stockResult = await db.query(
    `SELECT i.*, s.name AS stall_name
     FROM inventory i
     JOIN stalls s ON s.id = i.stall_id
     WHERE i.product_id = $1
     ORDER BY s.id`,
    [productId]
  );

  res.json({
    product: productResult.rows[0],
    stock: stockResult.rows,
  });
}));

/**
 * POST /api/products - vytvoření nového produktu
 */
router.post('/', requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { sku, name, description, category_id, price_czk, vat_rate, images, attributes, source_url } = req.body;

  // Validace
  if (!name || typeof name !== 'string') throw new ApiError(400, 'name je povinný');
  if (price_czk === undefined || isNaN(Number(price_czk))) throw new ApiError(400, 'price_czk musí být číslo');
  if (Number(price_czk) < 0) throw new ApiError(400, 'price_czk nesmí být záporná');

  const result = await db.query(
    `INSERT INTO products (sku, name, description, category_id, price_czk, vat_rate, images, attributes, source_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      sku || null,
      name.trim(),
      description || null,
      category_id || null,
      Number(price_czk),
      vat_rate !== undefined ? Number(vat_rate) : 21.0,
      JSON.stringify(images || []),
      JSON.stringify(attributes || {}),
      source_url || null,
    ]
  );

  res.status(201).json({ product: result.rows[0] });
}));

/**
 * PUT /api/products/:id - aktualizace
 */
router.put('/:id', requireRole('superadmin'), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) throw new ApiError(400, 'Neplatné ID');

  const allowedFields = ['sku', 'name', 'description', 'category_id', 'price_czk', 'vat_rate', 'images', 'attributes', 'is_active'];
  const updates = [];
  const params = [];
  let i = 1;

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === 'images' || field === 'attributes') {
        updates.push(`${field} = $${i}`);
        params.push(JSON.stringify(req.body[field]));
      } else {
        updates.push(`${field} = $${i}`);
        params.push(req.body[field]);
      }
      i++;
    }
  }

  if (updates.length === 0) throw new ApiError(400, 'Žádné změny');

  params.push(productId);
  const result = await db.query(
    `UPDATE products SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );

  if (result.rows.length === 0) throw new ApiError(404, 'Produkt nenalezen');
  res.json({ product: result.rows[0] });
}));

/**
 * DELETE /api/products/:id - soft delete (nastaví is_active=false)
 */
router.delete('/:id', requireRole('superadmin'), asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) throw new ApiError(400, 'Neplatné ID');

  const result = await db.query(
    `UPDATE products SET is_active = false WHERE id = $1 RETURNING id`,
    [productId]
  );

  if (result.rows.length === 0) throw new ApiError(404, 'Produkt nenalezen');
  res.json({ success: true });
}));

/**
 * POST /api/products/bulk - hromadný import (používá scraper/import scripts)
 * Body: { products: [{sku, name, price_czk, category_slug, images, ...}] }
 */
router.post('/bulk', requireRole('superadmin'), asyncHandler(async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    throw new ApiError(400, 'products musí být neprázdné pole');
  }

  const client = await db.getClient();
  const imported = [];
  const errors = [];

  try {
    await client.query('BEGIN');

    // Načti mapu kategorií slug → id
    const catResult = await client.query(`SELECT id, slug FROM categories`);
    const categoryMap = new Map(catResult.rows.map(r => [r.slug, r.id]));

    for (let idx = 0; idx < products.length; idx++) {
      const p = products[idx];
      try {
        if (!p.name || p.price_czk === undefined) {
          throw new Error('chybí name nebo price_czk');
        }

        let categoryId = null;
        if (p.category_slug) {
          categoryId = categoryMap.get(p.category_slug);
          // Automaticky vytvoř kategorii pokud neexistuje
          if (!categoryId && p.category_slug) {
            const newCat = await client.query(
              `INSERT INTO categories (name, slug) VALUES ($1, $2)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
               RETURNING id`,
              [p.category_name || p.category_slug, p.category_slug]
            );
            categoryId = newCat.rows[0].id;
            categoryMap.set(p.category_slug, categoryId);
          }
        }

        // UPSERT přes source_url (idempotent re-import)
        const result = await client.query(
          `INSERT INTO products (sku, name, description, category_id, price_czk, vat_rate, images, attributes, source_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (source_url) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             category_id = EXCLUDED.category_id,
             price_czk = EXCLUDED.price_czk,
             images = EXCLUDED.images,
             attributes = EXCLUDED.attributes,
             updated_at = NOW()
           RETURNING id, name`,
          [
            p.sku || null,
            p.name.trim(),
            p.description || null,
            categoryId,
            Number(p.price_czk),
            p.vat_rate !== undefined ? Number(p.vat_rate) : 21.0,
            JSON.stringify(p.images || []),
            JSON.stringify(p.attributes || { color: p.color }),
            p.source_url || null,
          ]
        );

        imported.push(result.rows[0]);
      } catch (e) {
        errors.push({ index: idx, name: p.name, error: e.message });
      }
    }

    await client.query('COMMIT');
    res.json({ imported: imported.length, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
