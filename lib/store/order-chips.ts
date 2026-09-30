/**
 * PUX-209 (design doc screen 73): seven order statuses as the three
 * questions a pack list asks — is it open, has it gone, did the money come
 * back — plus payment as its own fact from the columns orders already has.
 */
export const ORDER_CHIPS = [
  { key: 'open', label: 'Open', statuses: ['pending', 'confirmed', 'processing'] },
  { key: 'fulfilled', label: 'Fulfilled', statuses: ['shipped', 'delivered'] },
  { key: 'refunded', label: 'Refunded', statuses: ['cancelled', 'refunded'] },
] as const;

/** The `status` query value a chip sends — the route splits on commas. */
export function chipStatusParam(key: string): string {
  return ORDER_CHIPS.find((c) => c.key === key)?.statuses.join(',') ?? '';
}

export function paymentLabel(o: { status: string; paymentStatus?: string | null; paidAt?: string | Date | null }): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (o.status === 'refunded') return { label: 'Refunded', tone: 'warn' };
  if (o.paidAt || o.paymentStatus === 'paid' || o.paymentStatus === 'succeeded') return { label: 'Paid', tone: 'ok' };
  if (o.paymentStatus === 'failed') return { label: 'Failed', tone: 'warn' };
  return { label: 'Unpaid', tone: 'muted' };
}
