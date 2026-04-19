/**
 * Receipt service - tisk účtenek přes ESC/POS thermal tiskárny
 * ----------------------------------------------------------------------------
 * Každý stánek má svou tiskárnu - adresa z env (PRINTER_STALL_1, _2, _3).
 * Formát: 80 mm, 48 znaků na řádek.
 *
 * Knihovna node-thermal-printer posílá ESC/POS příkazy přes TCP nebo USB.
 */

'use strict';

const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const db = require('../config/database');
const settings = require('../config/settings');
const { formatCzk } = require('../utils/vatCalculator');

const LINE_WIDTH = 48;

/**
 * Získá adresu tiskárny pro daný stánek.
 */
function getPrinterInterface(stallId) {
  const iface = process.env[`PRINTER_STALL_${stallId}`];
  if (!iface) {
    throw new Error(`PRINTER_STALL_${stallId} není nastaveno`);
  }
  return iface;
}

/**
 * Vytvoří printer instance pro daný stánek.
 */
function createPrinter(stallId) {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: getPrinterInterface(stallId),
    characterSet: 'PC852_LATIN2',   // středoevropská diakritika (č, ě, ř, ...)
    removeSpecialCharacters: false,
    lineCharacter: '=',
    width: LINE_WIDTH,
    options: { timeout: 5000 },
  });
}

/**
 * Pomocné: zarovnání na řádek (label vlevo, value vpravo).
 */
function line2(label, value, width = LINE_WIDTH) {
  const labelStr = String(label);
  const valueStr = String(value);
  const spaces = Math.max(1, width - labelStr.length - valueStr.length);
  return labelStr + ' '.repeat(spaces) + valueStr;
}

/**
 * Vytiskne účtenku pro danou objednávku.
 * @param {number} orderId
 * @returns {Promise<void>}
 */
async function printReceipt(orderId) {
  // Načti data
  const orderResult = await db.query(
    `SELECT o.*, s.name AS stall_name
     FROM orders o JOIN stalls s ON s.id = o.stall_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) {
    throw new Error(`Order ${orderId} neexistuje`);
  }
  const order = orderResult.rows[0];

  const itemsResult = await db.query(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId]
  );
  const items = itemsResult.rows;

  const config = await settings.getAll();

  // Inicializace tiskárny
  const printer = createPrinter(order.stall_id);
  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    throw new Error(`Tiskárna stánku ${order.stall_id} není dostupná`);
  }

  // ===== HLAVIČKA =====
  printer.alignCenter();
  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println(config.company_name || 'FIRMA');
  printer.bold(false);
  printer.setTextNormal();

  if (config.company_ico) {
    printer.println(`IČO: ${config.company_ico}`);
  }
  if (config.company_dic && config.company_dic !== 'CZ00000000') {
    printer.println(`DIČ: ${config.company_dic}`);
  }
  if (config.company_address) {
    printer.println(config.company_address);
  }
  printer.drawLine();

  // ===== META =====
  printer.alignLeft();
  const dateStr = new Date(order.paid_at || order.created_at).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  printer.println(`Datum: ${dateStr}`);
  printer.println(`Doklad č.: ${order.order_number}`);
  printer.println(`Stánek: ${order.stall_name}`);
  printer.drawLine();

  // ===== POLOŽKY =====
  for (const item of items) {
    const qty = String(item.quantity);
    const name = String(item.product_name);
    // První řádek: "2x název produktu"
    printer.println(`${qty}x ${name}`);
    // Druhý řádek: cena za kus + celkem
    printer.println(line2(
      `   ${formatCzk(item.unit_price_czk)} / ks`,
      formatCzk(item.line_total_czk)
    ));
  }
  printer.drawLine();

  // ===== SOUHRN DPH =====
  printer.println(line2(
    `Základ DPH (${Math.round(Number(order.vat_amount_czk) / Number(order.subtotal_czk) * 100)}%):`,
    formatCzk(order.subtotal_czk)
  ).substring(0, LINE_WIDTH));
  printer.println(line2('DPH:', formatCzk(order.vat_amount_czk)));
  printer.drawLine();

  // ===== CELKEM =====
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.println(line2('CELKEM:', formatCzk(order.total_czk), LINE_WIDTH / 2));
  printer.setTextNormal();
  printer.bold(false);
  printer.drawLine();

  // ===== PLATBA =====
  const paymentLabel = order.payment_method && order.payment_method.startsWith('card')
    ? `Platba kartou (${order.payment_method.replace('card_', '**** ')})`
    : 'Platba kartou';
  printer.println(paymentLabel);
  printer.println(line2('Zaplaceno:', formatCzk(order.total_czk)));
  printer.drawLine();

  // ===== PATIČKA =====
  printer.alignCenter();
  if (config.receipt_footer) {
    printer.println(config.receipt_footer);
  }
  printer.newLine();

  // QR kód s číslem dokladu (volitelné)
  try {
    printer.printQR(order.order_number, { cellSize: 4, correction: 'M', model: 2 });
  } catch (e) {
    // Některé tiskárny QR nepodporují
  }

  printer.newLine();
  printer.cut();

  // Odešli
  await printer.execute();

  // Označ jako vytištěno
  await db.query(
    `UPDATE orders SET receipt_printed = true WHERE id = $1`,
    [orderId]
  );
}

/**
 * Otestuje spojení s tiskárnou daného stánku.
 */
async function testPrinter(stallId) {
  const printer = createPrinter(stallId);
  const connected = await printer.isPrinterConnected();
  if (!connected) {
    return { ok: false, error: 'Tiskárna není připojena' };
  }
  printer.alignCenter();
  printer.bold(true);
  printer.println('TEST TISKU');
  printer.bold(false);
  printer.println(`Stánek ${stallId}`);
  printer.println(new Date().toLocaleString('cs-CZ'));
  printer.drawLine();
  printer.println('Tiskárna funguje správně');
  printer.cut();
  await printer.execute();
  return { ok: true };
}

module.exports = {
  printReceipt,
  testPrinter,
};
