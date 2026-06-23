// Canonical money formatter. Input is integer cents (the storage unit across
// billing/storefront/CRM). Default: USD, thousands separators, 2 decimals.
// Pass fractionDigits:0 for whole-dollar display; pass currency for storefront
// multi-currency. For compact "$1.2M"-style output, this is the wrong helper.

export function formatMoney(
  cents: number,
  opts: { currency?: string; fractionDigits?: number } = {},
): string {
  const { currency = 'USD', fractionDigits } = opts;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    ...(fractionDigits != null
      ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
      : {}),
  }).format(cents / 100);
}
