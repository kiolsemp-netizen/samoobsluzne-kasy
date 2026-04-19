/**
 * Pomocné formátovací funkce (CZK, čísla).
 */

export function formatCzk(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0 Kč';
  return n.toLocaleString('cs-CZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + ' Kč';
}

export function formatCzkDecimal(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0,00 Kč';
  return n.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' Kč';
}
