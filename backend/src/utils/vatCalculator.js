/**
 * VAT (DPH) calculator pro CZK
 * ----------------------------------------------------------------------------
 * Standardní sazba v ČR: 21 %
 * Ceny produktů jsou uloženy jako "price_czk" (s DPH).
 * Funkce počítají základ a DPH z ceny s DPH.
 *
 * Matematika:
 *   price_base = price_czk / (1 + vat_rate/100)
 *   price_vat  = price_czk - price_base
 *
 * Všechny hodnoty se zaokrouhlují na 2 desetinná místa (haléře).
 */

'use strict';

/**
 * Zaokrouhlí na 2 desetinná místa (bezpečně, bez floating point chyb).
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Vypočítá základ DPH z ceny včetně DPH.
 * @param {number} priceWithVat - cena s DPH
 * @param {number} vatRate - sazba DPH v % (např. 21)
 * @returns {number} základ bez DPH
 */
function calcBase(priceWithVat, vatRate) {
  const base = Number(priceWithVat) / (1 + Number(vatRate) / 100);
  return round2(base);
}

/**
 * Vypočítá částku DPH z ceny včetně DPH.
 * @param {number} priceWithVat - cena s DPH
 * @param {number} vatRate - sazba DPH v %
 * @returns {number} DPH částka
 */
function calcVat(priceWithVat, vatRate) {
  const base = calcBase(priceWithVat, vatRate);
  return round2(Number(priceWithVat) - base);
}

/**
 * Vypočítá všechny částky pro řádek objednávky.
 * @param {number} unitPriceCzk - jednotková cena s DPH
 * @param {number} quantity - množství
 * @param {number} vatRate - sazba DPH v %
 * @returns {Object} { unitPriceCzk, unitPriceBase, unitVat, lineTotalCzk, lineTotalBase, lineTotalVat, vatRate }
 */
function calcLine(unitPriceCzk, quantity, vatRate = 21) {
  const unit = Number(unitPriceCzk);
  const qty = Number(quantity);
  const rate = Number(vatRate);

  const unitBase = calcBase(unit, rate);
  const unitVatAmount = round2(unit - unitBase);
  const lineTotal = round2(unit * qty);
  const lineBase = round2(unitBase * qty);
  const lineVat = round2(lineTotal - lineBase);

  return {
    unitPriceCzk: round2(unit),
    unitPriceBase: unitBase,
    unitVat: unitVatAmount,
    lineTotalCzk: lineTotal,
    lineTotalBase: lineBase,
    lineTotalVat: lineVat,
    vatRate: rate,
  };
}

/**
 * Vypočítá součty pro celý košík (array položek z calcLine).
 * @param {Array} lines - pole objektů z calcLine()
 * @returns {Object} { subtotal, vatAmount, total }
 */
function calcTotals(lines) {
  let subtotal = 0;
  let vatAmount = 0;
  let total = 0;

  for (const line of lines) {
    subtotal += Number(line.lineTotalBase);
    vatAmount += Number(line.lineTotalVat);
    total += Number(line.lineTotalCzk);
  }

  return {
    subtotal: round2(subtotal),
    vatAmount: round2(vatAmount),
    total: round2(total),
  };
}

/**
 * Formátuje cenu pro zobrazení v CZK.
 * @param {number} amount
 * @returns {string} např. "1 250,00 Kč"
 */
function formatCzk(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0,00 Kč';
  return n.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' Kč';
}

module.exports = {
  round2,
  calcBase,
  calcVat,
  calcLine,
  calcTotals,
  formatCzk,
};
