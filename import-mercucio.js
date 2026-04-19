/**
 * Import mercucio.db (SQLite) → stanek_os (PostgreSQL)
 * Mapuje produkty do správných kategorií a přidá zásoby pro všechny 3 stánky
 */
const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

const MERCUCIO_DB = path.join('/home/kiolsemp/Desktop/mercucio-scraper/mercucio.db');
const PG_URL = 'postgresql://kiolsemp:kiolsemp123@localhost:5432/stanek_os';
const DEFAULT_STOCK = 3; // výchozí zásoby per stánek

// Mapování produktů na kategorie podle názvu
function detectCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('peněženka') || n.includes('penaženka') || n.includes('peneženka') || n.includes('europeněženka') || n.includes('dolarovka') || n.includes('kasírka')) return 'penezenky';
  if (n.includes('kabelka') || n.includes('crossbody') || n.includes('batoh') || n.includes('taška') || n.includes('shopper') || n.includes('kufřík')) return 'kabelky';
  if (n.includes('opasek') || n.includes('pásek') || n.includes('řemen')) return 'opasky';
  return 'kozene-doplnky'; // klíčenky, dokladovky, pouzdra, etue, sety...
}

async function main() {
  console.log('📦 Import mercucio.db → PostgreSQL stanek_os\n');

  const sqlite = new Database(MERCUCIO_DB, { readonly: true, fileMustExist: true });
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  // Načti kategorie z PG
  const { rows: categories } = await pg.query('SELECT id, slug FROM categories');
  const catMap = {};
  categories.forEach(c => catMap[c.slug] = c.id);
  console.log('Kategorie:', Object.keys(catMap).join(', '));

  // Načti produkty z SQLite
  const products = sqlite.prepare('SELECT * FROM products ORDER BY id').all();
  console.log(`Produktů k importu: ${products.length}\n`);

  let imported = 0, skipped = 0;
  const categoryStats = {};

  for (const p of products) {
    // Zjisti kategorii
    const catSlug = detectCategory(p.name);
    const catId = catMap[catSlug] || catMap['kozene-doplnky'];
    categoryStats[catSlug] = (categoryStats[catSlug] || 0) + 1;

    // Fotky: hlavní + všechny z product_photos
    const photos = sqlite.prepare('SELECT url FROM product_photos WHERE product_id = ? ORDER BY photo_index').all(p.id);
    const imageUrls = photos.map(ph => ph.url);
    if (p.main_image && !imageUrls.includes(p.main_image)) {
      imageUrls.unshift(p.main_image);
    }

    // Attributes (barva, EAN atd.)
    const attributes = {};
    if (p.color) attributes.color = p.color;
    if (p.ean) attributes.ean = p.ean;
    if (p.brand) attributes.brand = p.brand;

    try {
      // Insert produkt
      const result = await pg.query(`
        INSERT INTO products (sku, name, description, category_id, price_czk, images, attributes, source_url, is_active)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, true)
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price_czk = EXCLUDED.price_czk,
          images = EXCLUDED.images,
          attributes = EXCLUDED.attributes,
          source_url = EXCLUDED.source_url
        RETURNING id
      `, [
        p.sku_unique,
        p.name,
        p.description || '',
        catId,
        p.price || 0,
        JSON.stringify(imageUrls),
        JSON.stringify(attributes),
        p.url
      ]);

      const productId = result.rows[0].id;

      // Přidej zásoby pro všechny 3 stánky
      for (let stallId = 1; stallId <= 3; stallId++) {
        await pg.query(`
          INSERT INTO inventory (product_id, stall_id, quantity, low_stock_threshold)
          VALUES ($1, $2, $3, 2)
          ON CONFLICT (product_id, stall_id) DO UPDATE SET quantity = EXCLUDED.quantity
        `, [productId, stallId, DEFAULT_STOCK]);
      }

      imported++;
      if (imported % 100 === 0) process.stdout.write(`\r  Importováno: ${imported}/${products.length}`);
    } catch (err) {
      console.error(`\n❌ Chyba pro ${p.sku_unique}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\r  Importováno: ${imported}/${products.length}     `);
  console.log(`\n✅ Import hotov!`);
  console.log(`   Importováno: ${imported}`);
  console.log(`   Přeskočeno: ${skipped}`);
  console.log(`\n📊 Kategorie:`);
  Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v} produktů`);
  });

  // Statistiky
  const { rows: [stats] } = await pg.query('SELECT COUNT(*) as products FROM products');
  const { rows: [invStats] } = await pg.query('SELECT COUNT(*) as records, SUM(quantity) as total_stock FROM inventory');
  console.log(`\n📦 V PostgreSQL:`);
  console.log(`   Produktů: ${stats.products}`);
  console.log(`   Skladových záznamů: ${invStats.records} (celkem ${invStats.total_stock} ks na skladě)`);

  sqlite.close();
  await pg.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
