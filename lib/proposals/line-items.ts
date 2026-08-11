/**
 * Proposal line items live as untyped JSON in `crm_proposals.line_items`.
 *
 * The canonical shape (`ProposalLineItem` in lib/db/schema/crm.ts) uses `quantity`,
 * but the portal proposal editor historically read AND wrote `qty`. So stored rows
 * carry either name depending on which path created them — an MCP/admin-created
 * proposal has `quantity`, an editor-saved one has `qty`. A reader that assumes one
 * name gets `undefined * unitPrice` = NaN, which `Intl.NumberFormat` renders as
 * "$NaN" — including on the client-facing /proposal/[token] page a prospect opens.
 *
 * Normalize on read so no renderer has to guard, and always write `quantity`.
 */
import type { ProposalLineItem } from '@/lib/db/schema';

/** Coerce whatever JSON handed us into a finite number. */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Stored rows may use either the canonical `quantity` or the legacy `qty` alias. */
type RawLineItem = Partial<ProposalLineItem> & { qty?: unknown };

export function normalizeLineItems(raw: unknown): ProposalLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((li: RawLineItem, i: number) => ({
    id: typeof li?.id === 'string' && li.id ? li.id : `li-${i}`,
    description: typeof li?.description === 'string' ? li.description : '',
    details: typeof li?.details === 'string' ? li.details : '',
    quantity: num(li?.quantity ?? li?.qty),
    unitPrice: num(li?.unitPrice),
    optional: li?.optional === true,
    accepted: li?.accepted === true,
  }));
}

/** Line total in cents. Never NaN. */
export function lineItemTotal(li: Pick<ProposalLineItem, 'quantity' | 'unitPrice'>): number {
  return num(li.quantity) * num(li.unitPrice);
}

/** Sum of the given items, in cents. Never NaN. */
export function sumLineItems(items: Pick<ProposalLineItem, 'quantity' | 'unitPrice'>[]): number {
  return items.reduce((sum, li) => sum + lineItemTotal(li), 0);
}
