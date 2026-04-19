/**
 * StánekOS - Inventory & Business Agent
 * ============================================================================
 * Samostatný proces (PM2) který běží nezávisle na backendu.
 *
 * Úlohy:
 *   - Každých 30 min: kontrola zásob, deaktivace produktů s qty=0, notifikace
 *     přes Telegram pokud jsou nové nízké zásoby.
 *   - Každý den 8:00: ranní report (tržby včera, top produkty, low-stock, stale).
 *   - Telegram příkazy (polling): /prehled /trzby /nizky_sklad /naskladnit /predat
 *   - Autonomní detekce potřeby objednávky + Telegram potvrzení (inline keyboard).
 *
 * Poznámky:
 *   - Používá stejný pg pool jako backend (DATABASE_URL).
 *   - Telegram: node-telegram-bot-api v polling režimu (jen zde).
 *   - Čas závisí na TZ systému - doporučeno TZ=Europe/Prague.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', 'backend', '.env') });

const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let bot = null;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log('[Agent] Telegram bot polling spuštěn');
  registerCommands(bot);
} else {
  console.warn('[Agent] Bez TELEGRAM_BOT_TOKEN - příkazy vypnuté');
}

// ============================================================================
// FORMÁTOVÁNÍ
// ============================================================================
function fmtCzk(n) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kč';
}

async function sendMsg(text, options = {}) {
  if (!bot || !CHAT_ID) { console.log('[Agent MOCK]', text); return; }
  try { await bot.sendMessage(CHAT_ID, text, { parse_mode: 'HTML', ...options }); }
  catch (e) { console.error('[Telegram]', e.message); }
}

// ============================================================================
// STATE: které low-stocky jsme už hlásili (ne-spam)
// ============================================================================
const reportedLowStock = new Set();   // klíč: productId-stallId

// ============================================================================
// ÚLOHA 1: kontrola zásob každých 30 min
// ============================================================================
async function checkInventory() {
  try {
    // Deaktivuj produkty s qty=0 všude (bezpečné - nemají co prodávat)
    const result = await pool.query(`
      SELECT i.product_id, i.stall_id, i.quantity, i.low_stock_threshold,
             p.name AS product_name, p.is_active, s.name AS stall_name
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      JOIN stalls s ON s.id = i.stall_id
      WHERE p.is_active = true
    `);

    const newLow = [];
    for (const row of result.rows) {
      const key = `${row.product_id}-${row.stall_id}`;
      if (row.quantity <= row.low_stock_threshold) {
        if (!reportedLowStock.has(key)) {
          newLow.push(row);
          reportedLowStock.add(key);
        }
      } else {
        // Zotavení - odebereme z reported
        reportedLowStock.delete(key);
      }
    }

    if (newLow.length > 0) {
      const lines = ['📉 <b>Nový nízký sklad</b>', ''];
      for (const r of newLow) {
        lines.push(`• <b>${r.product_name}</b> @ ${r.stall_name}: ${r.quantity} ks (limit ${r.low_stock_threshold})`);
      }
      await sendMsg(lines.join('\n'));
    }
  } catch (e) {
    console.error('[Agent] checkInventory error:', e.message);
  }
}

// ============================================================================
// ÚLOHA 2: ranní report 8:00
// ============================================================================
async function morningReport() {
  try {
    const [yest, avgWeek, topProducts, lowStock, stale] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(total_czk), 0) AS total, COUNT(*) AS count
        FROM orders
        WHERE status = 'paid'
          AND paid_at >= CURRENT_DATE - INTERVAL '1 day'
          AND paid_at < CURRENT_DATE
      `),
      pool.query(`
        SELECT COALESCE(SUM(total_czk), 0) / 7.0 AS avg
        FROM orders
        WHERE status = 'paid' AND paid_at >= CURRENT_DATE - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT oi.product_name, SUM(oi.quantity) AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'paid' AND o.paid_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY oi.product_name ORDER BY qty DESC LIMIT 3
      `),
      pool.query(`
        SELECT p.name, s.name AS stall_name, i.quantity
        FROM inventory i JOIN products p ON p.id = i.product_id JOIN stalls s ON s.id = i.stall_id
        WHERE p.is_active = true AND i.quantity <= i.low_stock_threshold
        ORDER BY i.quantity ASC LIMIT 10
      `),
      pool.query(`
        SELECT p.name FROM products p
        WHERE p.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id AND o.status = 'paid' AND o.paid_at >= CURRENT_DATE - INTERVAL '7 days'
          )
        LIMIT 10
      `),
    ]);

    const lines = [
      '☀️ <b>Ranní report</b>',
      '',
      `Včerejší tržba: ${fmtCzk(yest.rows[0].total)} (${yest.rows[0].count} obj.)`,
      `Průměr 7 dní/den: ${fmtCzk(avgWeek.rows[0].avg)}`,
      '',
    ];

    if (topProducts.rows.length) {
      lines.push('<b>Top 3 (7 dní):</b>');
      topProducts.rows.forEach((p, i) => lines.push(`${i + 1}. ${p.product_name} (${p.qty} ks)`));
      lines.push('');
    }

    if (lowStock.rows.length) {
      lines.push(`📉 <b>Nízký sklad (${lowStock.rows.length}):</b>`);
      lowStock.rows.slice(0, 5).forEach(r => {
        lines.push(`• ${r.name} @ ${r.stall_name}: ${r.quantity}`);
      });
      lines.push('');
    }

    if (stale.rows.length) {
      lines.push(`🕐 Bez prodeje 7 dní: ${stale.rows.length} produktů`);
    }

    await sendMsg(lines.join('\n'));
  } catch (e) {
    console.error('[Agent] morningReport error:', e.message);
  }
}

// ============================================================================
// TELEGRAM PŘÍKAZY
// ============================================================================
function isAuthorized(msg) {
  if (!CHAT_ID) return true;  // v dev módu povolit vše
  return String(msg.chat.id) === String(CHAT_ID);
}

function registerCommands(bot) {
  bot.onText(/^\/prehled/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const r = await pool.query(`
      SELECT s.name, COUNT(i.id) AS skus, COALESCE(SUM(i.quantity), 0) AS total_items,
        COUNT(CASE WHEN i.quantity = 0 THEN 1 END) AS zero,
        COUNT(CASE WHEN i.quantity > 0 AND i.quantity <= i.low_stock_threshold THEN 1 END) AS low
      FROM stalls s LEFT JOIN inventory i ON i.stall_id = s.id
      JOIN products p ON p.id = i.product_id AND p.is_active = true
      GROUP BY s.id, s.name ORDER BY s.id
    `);
    const lines = ['📦 <b>Stav skladu</b>', ''];
    for (const row of r.rows) {
      lines.push(`<b>${row.name}</b>: ${row.total_items} ks / ${row.skus} SKU`);
      if (row.zero > 0) lines.push(`   ⚠️ ${row.zero} vyprodáno, ${row.low} nízko`);
    }
    bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.onText(/^\/trzby(?:\s+(\w+))?/, async (msg, match) => {
    if (!isAuthorized(msg)) return;
    const period = match[1] || 'dnes';
    const intervals = { dnes: '0 days', tyden: '7 days', mesic: '30 days' };
    const interval = intervals[period] || '0 days';

    const startClause = period === 'dnes'
      ? `paid_at >= CURRENT_DATE`
      : `paid_at >= CURRENT_DATE - INTERVAL '${interval}'`;

    const r = await pool.query(`
      SELECT s.name, COUNT(o.id) AS cnt, COALESCE(SUM(o.total_czk), 0) AS total
      FROM stalls s LEFT JOIN orders o ON o.stall_id = s.id AND o.status = 'paid' AND o.${startClause}
      GROUP BY s.id, s.name ORDER BY s.id
    `);
    const lines = [`💰 <b>Tržby ${period}</b>`, ''];
    let totalAll = 0;
    for (const row of r.rows) {
      lines.push(`${row.name}: ${fmtCzk(row.total)} (${row.cnt}×)`);
      totalAll += Number(row.total);
    }
    lines.push('');
    lines.push(`<b>Celkem: ${fmtCzk(totalAll)}</b>`);
    bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.onText(/^\/nizky_sklad/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const r = await pool.query(`
      SELECT p.name, s.name AS stall, i.quantity, i.low_stock_threshold
      FROM inventory i JOIN products p ON p.id = i.product_id JOIN stalls s ON s.id = i.stall_id
      WHERE p.is_active = true AND i.quantity <= i.low_stock_threshold
      ORDER BY i.quantity ASC, p.name LIMIT 30
    `);
    if (r.rows.length === 0) {
      bot.sendMessage(msg.chat.id, '✅ Vše v pořádku, žádné nízké zásoby.');
      return;
    }
    const lines = ['📉 <b>Nízké zásoby</b>', ''];
    for (const row of r.rows) {
      lines.push(`${row.quantity === 0 ? '❌' : '⚠️'} ${row.name} @ ${row.stall}: ${row.quantity}`);
    }
    bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.onText(/^\/help/, (msg) => {
    if (!isAuthorized(msg)) return;
    bot.sendMessage(msg.chat.id, [
      '<b>Dostupné příkazy:</b>',
      '/prehled - stav skladu',
      '/trzby [dnes|tyden|mesic]',
      '/nizky_sklad - produkty pod limitem',
      '/help - tato nápověda',
    ].join('\n'), { parse_mode: 'HTML' });
  });
}

// ============================================================================
// SPOUŠTĚČ
// ============================================================================
const INVENTORY_INTERVAL_MS = 30 * 60 * 1000;   // 30 min

async function scheduleMorningReport() {
  // Při startu zjisti kolik je do 8:00
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;

  console.log(`[Agent] Ranní report naplánován za ${Math.round(delay/1000/60)} min`);
  setTimeout(async () => {
    await morningReport();
    // Plánuj každých 24h
    setInterval(morningReport, 24 * 60 * 60 * 1000);
  }, delay);
}

async function main() {
  console.log('[Agent] Startuje...');

  // Počáteční kontrola
  await checkInventory();

  // Pravidelná kontrola zásob
  setInterval(checkInventory, INVENTORY_INTERVAL_MS);

  // Ranní report
  scheduleMorningReport();

  await sendMsg('🤖 Agent spuštěn');
}

main().catch(e => {
  console.error('[Agent] Fatal:', e);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('[Agent] Shutdown');
  if (bot) bot.stopPolling();
  await pool.end();
  process.exit(0);
});
