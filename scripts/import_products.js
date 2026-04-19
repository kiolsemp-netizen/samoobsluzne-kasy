#!/usr/bin/env node
/**
 * import_products.js
 * ============================================================================
 * Import produktů z JSON souboru do PostgreSQL.
 *
 * Očekává JSON formát z mercucio_scraper.py nebo ručně připravený:
 *   [{ name, sku, price_czk, category_slug, description, color, images, source_url }, ...]
 *
 * Vlastnosti:
 *   - ON CONFLICT (source_url) - idempotentní re-import
 *   - Automaticky vytvoří neznámé kategorie
 *   - Transakční (všechno nebo nic)
 *
 * Použití:
 *   node scripts/import_products.js ../mercucio_products/products.json
 *   node scripts/import_products.js ./my-products.json --stall 1 --default-stock 5
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', 'backend', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function parseArgs(argv) {
  const args = { file: null, stall: null, defaultStock: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stall') args.stall = parseInt(argv[++i], 10);
    else if (a === '--default-stock') args.defaultStock = parseInt(argv[++i], 10);
    else if (!args.file) args.file = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Použití: node import_products.js <cesta-k-products.json> [--stall N --default-stock M]');
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Soubor neexistuje: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const products = JSON.parse(raw);
  if (!Array.isArray(products)) throw new Error('JSON musí být pole produktů');

  console.log(`Načteno ${products.length} produktů z ${filePath}`);

  const client = await pool.connect();
  const stats = { imported: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    await client.query('BEGIN');

    // Mapa kategorií
    const catRes = await client.query(`SELECT id, slug FROM categories`);
    const categoryMap = new Map(catRes.rows.map(r => [r.slug, r.id]));

    for (const p of products) {
      try {
        if (!p.name || typeof p.price_czk !== 'number' || p.price_czk <= 0) {
          stats.skipped++;
          continue;
        }

        // Zajisti kategorii
        let categoryId = null;
        if (p.category_slug) {
          categoryId = categoryMap.get(p.category_slug);
          if (!categoryId) {
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

        // Upsert produkt
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
           RETURNING id, xmax`,
          [
            p.sku || null,
            p.name.trim(),
            p.description || null,
            categoryId,
            Number(p.price_czk),
            p.vat_rate !== undefined ? Number(p.vat_rate) : 21,
            JSON.stringify(p.images || []),
            JSON.stringify(p.attributes || { color: p.color || null }),
            p.source_url || null,
          ]
        );

        const productId = result.rows[0].id;
        const wasUpdate = result.rows[0].xmax !== '0';
        if (wasUpdate) stats.updated++;
        else stats.imported++;

        // Pokud je požadováno naskladnění
        if (args.stall && args.defaultStock > 0 && !wasUpdate) {
          await client.query(
            `INSERT INTO inventory (product_id, stall_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, stall_id) DO NOTHING`,
            [productId, args.stall, args.defaultStock]
          );
        }
      } catch (e) {
        stats.errors++;
        console.error(`✗ ${p.name}: ${e.message}`);
      }
    }

    await client.query('COMMIT');

    console.log('\n=== Import hotov ===');
    console.log(`  Nových:   ${stats.imported}`);
    console.log(`  Updated:  ${stats.updated}`);
    console.log(`  Přeskoč.: ${stats.skipped}`);
    console.log(`  Chyby:    ${stats.errors}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rollback:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
