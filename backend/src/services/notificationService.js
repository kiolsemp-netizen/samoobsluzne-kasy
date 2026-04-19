/**
 * Notification service - Telegram Bot API
 * ----------------------------------------------------------------------------
 * Posílá zprávy majiteli do Telegramu:
 *   - nová prodej (tržba)
 *   - nízký sklad
 *   - denní ranní report
 *   - upozornění na chybu (tisk, platba)
 *
 * Fallback: pokud TELEGRAM_BOT_TOKEN není nastaven, funkce jen logují do konzole.
 */

'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { formatCzk } = require('../utils/vatCalculator');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
if (BOT_TOKEN) {
  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
    console.log('[Telegram] Bot inicializován');
  } catch (e) {
    console.error('[Telegram] Chyba inicializace:', e.message);
  }
} else {
  console.warn('[Telegram] TELEGRAM_BOT_TOKEN není nastaven - notifikace vypnuté');
}

/**
 * Pošle zprávu do výchozího chatu.
 */
async function sendMessage(text, options = {}) {
  if (!bot || !CHAT_ID) {
    console.log('[Telegram MOCK]', text);
    return;
  }
  try {
    await bot.sendMessage(CHAT_ID, text, { parse_mode: 'HTML', ...options });
  } catch (err) {
    console.error('[Telegram] Chyba při odesílání:', err.message);
  }
}

/**
 * Notifikace o nové prodeji.
 */
async function notifySale({ orderId, orderNumber, total, stallName }) {
  const msg = [
    '💰 <b>Nový prodej</b>',
    `Stánek: ${stallName}`,
    `Doklad: ${orderNumber || orderId}`,
    `Celkem: ${formatCzk(total)}`,
  ].join('\n');
  await sendMessage(msg);
}

/**
 * Notifikace o chybě (pro monitoring).
 */
async function notifyError(title, details) {
  const msg = [
    `⚠️ <b>${title}</b>`,
    typeof details === 'string' ? details : JSON.stringify(details, null, 2),
  ].join('\n');
  await sendMessage(msg);
}

/**
 * Low-stock upozornění.
 */
async function notifyLowStock(items) {
  if (!items || items.length === 0) return;
  const lines = ['📉 <b>Nízký sklad</b>'];
  for (const item of items.slice(0, 20)) {
    lines.push(`• ${item.product_name} @ ${item.stall_name}: ${item.quantity} ks (limit: ${item.low_stock_threshold})`);
  }
  if (items.length > 20) lines.push(`... a dalších ${items.length - 20} položek`);
  await sendMessage(lines.join('\n'));
}

/**
 * Ranní report.
 */
async function sendMorningReport(data) {
  const lines = [
    '☀️ <b>Ranní report</b>',
    '',
    `Včerejší tržba: ${formatCzk(data.yesterdayTotal || 0)}`,
    `Průměr 7 dní: ${formatCzk(data.avgWeekly || 0)}`,
    '',
  ];

  if (data.topProducts && data.topProducts.length) {
    lines.push('<b>Top produkty (7 dní):</b>');
    data.topProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.product_name} (${p.qty_sold} ks)`);
    });
    lines.push('');
  }

  if (data.lowStock && data.lowStock.length) {
    lines.push(`📉 <b>Nízký sklad:</b> ${data.lowStock.length} položek`);
  }

  if (data.staleProducts && data.staleProducts.length) {
    lines.push(`🕐 Bez prodeje 7 dní: ${data.staleProducts.length}`);
  }

  await sendMessage(lines.join('\n'));
}

module.exports = {
  sendMessage,
  notifySale,
  notifyError,
  notifyLowStock,
  sendMorningReport,
  isEnabled: () => !!bot && !!CHAT_ID,
};
