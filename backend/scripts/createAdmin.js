/**
 * Skript: vytvoření prvního superadmin uživatele
 * ----------------------------------------------------------------------------
 * Spuštění:
 *   cd backend
 *   node scripts/createAdmin.js admin@firma.cz HesloKterePamatujes123
 */

'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Použití: node scripts/createAdmin.js <email> <heslo>');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Heslo musí mít alespoň 10 znaků.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await db.query(
      `INSERT INTO admin_users (email, password_hash, role)
       VALUES ($1, $2, 'superadmin')
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, is_active = true
       RETURNING id, email, role`,
      [email.toLowerCase().trim(), hash]
    );
    console.log('✓ Superadmin vytvořen/aktualizován:', result.rows[0]);
  } catch (e) {
    console.error('Chyba:', e.message);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

main();
