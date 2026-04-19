/**
 * Invoice service - PDF faktury přes PDFKit
 * ----------------------------------------------------------------------------
 * Generuje plnou fakturu B2B (pro zákazníky s IČO).
 * Faktura splňuje požadavky zákona o DPH (§ 29 zákona č. 235/2004 Sb.).
 *
 * Uloží PDF do backend/invoices/FAKTURA-{number}.pdf a vrátí cestu.
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const settings = require('../config/settings');
const { generateInvoiceNumber } = require('../utils/orderNumber');
const { formatCzk } = require('../utils/vatCalculator');

const INVOICES_DIR = path.join(__dirname, '..', '..', 'invoices');

// Zajisti že složka existuje
if (!fs.existsSync(INVOICES_DIR)) {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

/**
 * Vygeneruje fakturu PDF pro objednávku.
 * @param {number} orderId
 * @returns {Promise<string>} cesta k vygenerovanému PDF
 */
async function generateInvoice(orderId) {
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

  // Generuj nebo použij existující invoice_number
  let invoiceNumber = order.invoice_number;
  if (!invoiceNumber) {
    invoiceNumber = await generateInvoiceNumber();
    await db.query(
      `UPDATE orders SET invoice_number = $1 WHERE id = $2`,
      [invoiceNumber, orderId]
    );
  }

  const config = await settings.getAll();
  const filename = `FAKTURA-${invoiceNumber}.pdf`;
  const filepath = path.join(INVOICES_DIR, filename);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: `Faktura ${invoiceNumber}`,
      Author: config.company_name || 'StánekOS',
    },
  });

  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // Registrace fontu s diakritikou
  try {
    const fontPath = path.join(__dirname, '..', '..', 'fonts', 'DejaVuSans.ttf');
    const fontBoldPath = path.join(__dirname, '..', '..', 'fonts', 'DejaVuSans-Bold.ttf');
    if (fs.existsSync(fontPath)) {
      doc.registerFont('Regular', fontPath);
      doc.registerFont('Bold', fs.existsSync(fontBoldPath) ? fontBoldPath : fontPath);
      doc.font('Regular');
    }
  } catch (e) {
    console.warn('[Invoice] DejaVu font nelze načíst, použije se default (bez plné diakritiky)');
  }

  // ===== HLAVIČKA =====
  doc.fontSize(20).text('FAKTURA', { align: 'right' });
  doc.fontSize(14).text(`č. ${invoiceNumber}`, { align: 'right' });
  doc.moveDown(0.5);

  const paidDate = order.paid_at ? new Date(order.paid_at) : new Date();
  doc.fontSize(9);
  doc.text(`Datum vystavení: ${paidDate.toLocaleDateString('cs-CZ')}`, { align: 'right' });
  doc.text(`Datum zdanitelného plnění: ${paidDate.toLocaleDateString('cs-CZ')}`, { align: 'right' });
  doc.text(`Datum splatnosti: ${paidDate.toLocaleDateString('cs-CZ')} (zaplaceno)`, { align: 'right' });
  doc.text(`Forma úhrady: platební karta`, { align: 'right' });
  doc.text(`Variabilní symbol: ${invoiceNumber}`, { align: 'right' });

  // ===== DODAVATEL & ODBĚRATEL (dvou sloupcový) =====
  doc.moveDown(2);
  const topY = doc.y;

  // Dodavatel (vlevo)
  doc.fontSize(10).text('DODAVATEL', 50, topY, { underline: true });
  doc.fontSize(11).text(config.company_name || 'Firma s.r.o.', 50, doc.y + 5);
  doc.fontSize(9);
  if (config.company_address) doc.text(config.company_address);
  if (config.company_ico) doc.text(`IČO: ${config.company_ico}`);
  if (config.company_dic && config.company_dic !== 'CZ00000000') doc.text(`DIČ: ${config.company_dic}`);
  if (config.company_phone) doc.text(`Tel: ${config.company_phone}`);

  // Odběratel (vpravo)
  doc.fontSize(10).text('ODBĚRATEL', 320, topY, { underline: true });
  doc.fontSize(11);
  doc.text(order.customer_company || order.customer_name || 'Konečný spotřebitel', 320, topY + 15);
  doc.fontSize(9);
  if (order.customer_address) doc.text(order.customer_address, 320);
  if (order.customer_ico) doc.text(`IČO: ${order.customer_ico}`, 320);
  if (order.customer_dic) doc.text(`DIČ: ${order.customer_dic}`, 320);
  if (order.customer_email) doc.text(`Email: ${order.customer_email}`, 320);

  // ===== TABULKA POLOŽEK =====
  doc.moveDown(3);
  const tableTop = doc.y;
  const colX = { name: 50, qty: 280, unit: 340, vat: 400, base: 450, total: 510 };

  doc.fontSize(9);
  doc.text('Položka', colX.name, tableTop);
  doc.text('Ks', colX.qty, tableTop, { width: 40, align: 'right' });
  doc.text('Cena/ks', colX.unit, tableTop, { width: 50, align: 'right' });
  doc.text('DPH %', colX.vat, tableTop, { width: 40, align: 'right' });
  doc.text('Základ', colX.base, tableTop, { width: 55, align: 'right' });
  doc.text('Celkem', colX.total, tableTop, { width: 55, align: 'right' });

  doc.moveTo(50, tableTop + 12).lineTo(565, tableTop + 12).stroke();

  let y = tableTop + 18;
  for (const item of items) {
    doc.text(item.product_name, colX.name, y, { width: 220 });
    doc.text(String(item.quantity), colX.qty, y, { width: 40, align: 'right' });
    doc.text(formatCzk(item.unit_price_czk), colX.unit, y, { width: 50, align: 'right' });
    doc.text(`${item.vat_rate}%`, colX.vat, y, { width: 40, align: 'right' });
    doc.text(formatCzk(Number(item.unit_price_base) * Number(item.quantity)), colX.base, y, { width: 55, align: 'right' });
    doc.text(formatCzk(item.line_total_czk), colX.total, y, { width: 55, align: 'right' });
    y += 20;
  }

  doc.moveTo(50, y).lineTo(565, y).stroke();
  y += 10;

  // ===== SOUHRN =====
  doc.fontSize(10);
  const sumX = 380;
  doc.text('Základ DPH celkem:', sumX, y, { width: 120, align: 'right' });
  doc.text(formatCzk(order.subtotal_czk), sumX + 125, y, { width: 60, align: 'right' });
  y += 15;
  doc.text('DPH 21 %:', sumX, y, { width: 120, align: 'right' });
  doc.text(formatCzk(order.vat_amount_czk), sumX + 125, y, { width: 60, align: 'right' });
  y += 15;

  doc.fontSize(12);
  doc.text('CELKEM K ÚHRADĚ:', sumX, y, { width: 120, align: 'right' });
  doc.text(formatCzk(order.total_czk), sumX + 125, y, { width: 60, align: 'right' });

  // ===== POZNÁMKA =====
  doc.moveDown(3);
  doc.fontSize(9);
  doc.text('Faktura byla zaplacena platební kartou na stánku.', 50);
  doc.text(`Doklad č. ${order.order_number} vystaven ${paidDate.toLocaleString('cs-CZ')}.`, 50);

  doc.end();

  // Čekej dokud se stream nezavře
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Ulož cestu do DB
  const relPath = path.join('invoices', filename);
  await db.query(
    `UPDATE orders SET invoice_pdf_path = $1 WHERE id = $2`,
    [relPath, orderId]
  );

  return filepath;
}

module.exports = { generateInvoice, INVOICES_DIR };
