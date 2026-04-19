const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://kiolsemp:kiolsemp123@localhost:5432/stanek_os' });

async function run() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    // 1. Přidej parent_id sloupec pokud chybí
    await db.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id)`);

    // 2. Smaž staré kategorie a vytvoř nové
    await db.query(`UPDATE products SET category_id = NULL`);
    await db.query(`DELETE FROM categories`);
    await db.query(`ALTER SEQUENCE categories_id_seq RESTART WITH 1`);

    // 3. Hlavní kategorie
    const parents = [
      { name: 'Peněženky', slug: 'penezenky', order: 1 },
      { name: 'Kabelky', slug: 'kabelky', order: 2 },
      { name: 'Tašky a batohy', slug: 'tasky-batohy', order: 3 },
      { name: 'Opasky a doplňky', slug: 'opasky-doplnky', order: 4 },
      { name: 'Dárkové sety', slug: 'darkove-sety', order: 5 },
    ];

    const parentIds = {};
    for (const p of parents) {
      const r = await db.query(
        `INSERT INTO categories (name, slug, parent_id, display_order) VALUES ($1, $2, NULL, $3) RETURNING id`,
        [p.name, p.slug, p.order]
      );
      parentIds[p.slug] = r.rows[0].id;
      console.log(`Kategorie: ${p.name} (id=${r.rows[0].id})`);
    }

    // 4. Podkategorie
    const subs = [
      // Peněženky
      { name: 'Pánské peněženky', slug: 'panske-penezenky', parent: 'penezenky', order: 1 },
      { name: 'Dámské peněženky', slug: 'damske-penezenky', parent: 'penezenky', order: 2 },
      { name: 'Pouzdra a dokladovky', slug: 'pouzdra-dokladovky', parent: 'penezenky', order: 3 },
      { name: 'Dolarovky', slug: 'dolarovky', parent: 'penezenky', order: 4 },
      { name: 'Kasírky', slug: 'kasirky', parent: 'penezenky', order: 5 },
      { name: 'Vzorové peněženky', slug: 'vzorove-penezenky', parent: 'penezenky', order: 6 },
      // Kabelky
      { name: 'Crossbody', slug: 'crossbody', parent: 'kabelky', order: 1 },
      { name: 'Shopper kabelky', slug: 'shopper', parent: 'kabelky', order: 2 },
      { name: 'Ledvinky', slug: 'ledvinky', parent: 'kabelky', order: 3 },
      { name: 'Klasické kabelky', slug: 'klasicke-kabelky', parent: 'kabelky', order: 4 },
      { name: 'Elegantní kabelky', slug: 'elegantni-kabelky', parent: 'kabelky', order: 5 },
      // Tašky a batohy
      { name: 'Pánské tašky', slug: 'panske-tasky', parent: 'tasky-batohy', order: 1 },
      { name: 'Tašky na notebook', slug: 'tasky-notebook', parent: 'tasky-batohy', order: 2 },
      { name: 'Tašky na opasek', slug: 'tasky-opasek', parent: 'tasky-batohy', order: 3 },
      { name: 'Příruční tašky (etue)', slug: 'etue', parent: 'tasky-batohy', order: 4 },
      { name: 'Batohy', slug: 'batohy', parent: 'tasky-batohy', order: 5 },
      // Opasky a doplňky
      { name: 'Opasky', slug: 'opasky', parent: 'opasky-doplnky', order: 1 },
      { name: 'Klíčenky', slug: 'klicenky', parent: 'opasky-doplnky', order: 2 },
      // Dárkové sety
      { name: 'Myslivecké sety', slug: 'myslivecke-sety', parent: 'darkove-sety', order: 1 },
      { name: 'Rybářské sety', slug: 'ryb-sety', parent: 'darkove-sety', order: 2 },
      { name: 'Elegantní sety', slug: 'elegantni-sety', parent: 'darkove-sety', order: 3 },
    ];

    const subIds = {};
    for (const s of subs) {
      const r = await db.query(
        `INSERT INTO categories (name, slug, parent_id, display_order) VALUES ($1, $2, $3, $4) RETURNING id`,
        [s.name, s.slug, parentIds[s.parent], s.order]
      );
      subIds[s.slug] = r.rows[0].id;
    }
    console.log(`\nPodkategorií: ${Object.keys(subIds).length}`);

    // 5. Přeřaď produkty dle názvu
    const products = await db.query(`SELECT id, name FROM products`);
    let assigned = 0;
    for (const p of products.rows) {
      const n = p.name.toLowerCase();
      let catId = null;

      // Myslivecké / rybářské (musí být před obecnými)
      if (/jelen|srn|divočák|medvěd|kanec|vlk|liška|zajíc|divoč|myslivec/.test(n)) catId = subIds['myslivecke-sety'];
      else if (/ryb|sumec|kapr|štika|pstruh|okoun/.test(n)) catId = subIds['ryb-sety'];
      else if (/kasírka|kasirka/.test(n)) catId = subIds['kasirky'];
      else if (/dolarovka/.test(n)) catId = subIds['dolarovky'];
      else if (/dokladovka|pouzdro|etue/.test(n)) catId = subIds['pouzdra-dokladovky'];
      else if (/pánsk.*peněženka|pánský.*peněženka/.test(n) || (/pánsk/.test(n) && /peněženka|peneženka/.test(n))) catId = subIds['panske-penezenky'];
      else if (/vzor/.test(n) && /peněženka|peneženka/.test(n)) catId = subIds['vzorove-penezenky'];
      else if (/dámsk.*peněženka|peněženka.*dámsk/.test(n) || (/dámsk|damsk/.test(n) && /peněženka|peneženka/.test(n))) catId = subIds['damske-penezenky'];
      else if (/peněženka|peneženka|kasírka|dolarovka/.test(n)) catId = subIds['damske-penezenky'];
      else if (/crossbody/.test(n)) catId = subIds['crossbody'];
      else if (/shopper/.test(n)) catId = subIds['shopper'];
      else if (/ledvinka/.test(n)) catId = subIds['ledvinky'];
      else if (/elegantní.*kabelka|kabelka.*elegantní/.test(n)) catId = subIds['elegantni-kabelky'];
      else if (/kabelka/.test(n)) catId = subIds['klasicke-kabelky'];
      else if (/batoh/.test(n)) catId = subIds['batohy'];
      else if (/notebook/.test(n)) catId = subIds['tasky-notebook'];
      else if (/taška.*opasek|opasek.*taška/.test(n)) catId = subIds['tasky-opasek'];
      else if (/pánská.*taška|taška.*pánská|pánský.*batoh/.test(n) || (/pánsk/.test(n) && /taška|batoh/.test(n))) catId = subIds['panske-tasky'];
      else if (/taška/.test(n)) catId = subIds['panske-tasky'];
      else if (/opasek|pásek|řemen/.test(n)) catId = subIds['opasky'];
      else if (/klíčenka|klicenka/.test(n)) catId = subIds['klicenky'];
      else if (/set|sada/.test(n)) catId = subIds['elegantni-sety'];

      if (catId) {
        await db.query(`UPDATE products SET category_id = $1 WHERE id = $2`, [catId, p.id]);
        assigned++;
      }
    }

    await db.query('COMMIT');

    // Statistiky
    console.log(`\nPřiřazeno produktů: ${assigned}/${products.rows.length}`);
    const stats = await db.query(`
      SELECT c.name, COUNT(p.id) as cnt
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      WHERE c.parent_id IS NOT NULL
      GROUP BY c.id, c.name
      ORDER BY cnt DESC
    `);
    stats.rows.forEach(r => console.log(`  ${r.name}: ${r.cnt}`));

  } catch (e) {
    await db.query('ROLLBACK');
    console.error('Chyba:', e.message);
  } finally {
    db.release();
    pool.end();
  }
}
run();
