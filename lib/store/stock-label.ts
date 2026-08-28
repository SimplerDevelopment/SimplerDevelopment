/**
 * PUX-186 (design doc screen 45): inventory as a signal, not a bare number.
 * The threshold is the store's own `storeSettings.lowStockThreshold`
 * (default 5) — the same number the storefront's low-stock notices use.
 */
export const DEFAULT_LOW_STOCK = 5;

export type StockTone = 'ok' | 'warn' | 'muted';

export function stockLabel(
  p: { trackInventory: boolean; quantity: number },
  threshold: number = DEFAULT_LOW_STOCK,
): { label: string; tone: StockTone } {
  if (!p.trackInventory) return { label: 'Not tracked', tone: 'muted' };
  if (p.quantity <= 0) return { label: 'Sold out', tone: 'warn' };
  if (p.quantity <= threshold) return { label: `${p.quantity} left`, tone: 'warn' };
  return { label: `${p.quantity} in stock`, tone: 'ok' };
}
