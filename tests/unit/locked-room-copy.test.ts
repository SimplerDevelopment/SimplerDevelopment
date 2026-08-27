/**
 * PUX-146 — the drift guard: every billing-gated nav item must have (a) a
 * catalog entry with a price and three features to sell from, and (b) an
 * in-room pitch. Add a `requiredDomain` to portal-nav without either and the
 * room renders a half-empty sell surface — this is what catches it.
 */
import { describe, it, expect } from 'vitest';
import { buildPortalNavItems } from '@/lib/portal-nav';
import { getDomainByKey } from '@/lib/billing/domain-catalog';
import { LOCKED_ROOM_COPY } from '@/lib/billing/locked-room-copy';

function gatedKeys(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => gatedKeys(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.requiredDomain === 'string') out.add(o.requiredDomain);
    Object.values(o).forEach((v) => { if (v && typeof v === 'object') gatedKeys(v, out); });
  }
  return out;
}

describe('locked-room copy vs nav vs catalog (PUX-146)', () => {
  const keys = [...gatedKeys(buildPortalNavItems(null, null))];

  it('finds the gated nav items at all', () => {
    expect(keys.length).toBeGreaterThanOrEqual(5);
    expect(keys).toContain('seo');
  });

  it.each(keys)('%s: catalog entry with price + ≥3 features, and a pitch', (key) => {
    const d = getDomainByKey(key);
    expect(d, `no catalog entry for ${key}`).toBeTruthy();
    expect(d!.monthlyPriceCents).toBeGreaterThan(0);
    expect(d!.features.length).toBeGreaterThanOrEqual(3);
    const copy = LOCKED_ROOM_COPY[key];
    expect(copy, `no LOCKED_ROOM_COPY for ${key}`).toBeTruthy();
    expect(copy.pitch('ridgelineoutfitters.com')).toMatch(/\S/);
    expect(copy.pitch(null)).not.toContain('null');
  });
});
