import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Regression guard for the paid-module billing bypass fixed in 8d0df3bf (MCP)
 * and fe4e1f66 (REST): a paid-module WRITE that is only scope/auth-gated but
 * NOT entitlement-gated lets a client mutate a feature they don't subscribe to.
 * Distilled finding #1 (.claude/distill/guardrail-proposals-2026-06-24.md).
 *
 * "Entitlement-gated" = the handler clears one of:
 *   - requireService(clientId, '<cat>') / the requireStore() helper (MCP), or
 *   - hasServiceAccess(client.id, '<cat>') / authorizePortal({ requireService })  (REST).
 *
 * Source-scan, DB-free → runs in the default unit gate. Coarse by design (like
 * cron-registry-parity): it catches a NEW ungated write before prod, it does
 * not prove per-line correctness.
 *
 * NOTE: writing this test surfaced that the store REST surface has ~20 further
 * ungated write sub-routes (variants, options, bulk-pricing, shipping zones,
 * categories/[id], discounts/[id], orders label/rates/printful, …) beyond the
 * [productId] route fixed here — plus some likely-intentional ones (stripe
 * onboarding, *test* endpoints). That broader gap needs its own triage; this
 * test deliberately guards only the confirmed-fixed surfaces so it starts green
 * without blessing the untriaged routes.
 */
const ROOT = resolve(__dirname, '..', '..');

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkRouteFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const hasWriteHandler = (src: string) => /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/.test(src);
const hasEntitlementCall = (src: string) => /hasServiceAccess|requireService/.test(src);

describe('paid-module entitlement guards', () => {
  it('store MCP adapter: every store:write tool clears an entitlement check', () => {
    const src = readFileSync(resolve(ROOT, 'lib/storefront/mcp-sdk-adapter.ts'), 'utf8');
    const writes = (src.match(/return denied\('store:write'\)/g) ?? []).length;
    const guards = (src.match(/requireStore\(\)/g) ?? []).length;
    expect(writes, 'sanity: the adapter should have write tools').toBeGreaterThan(0);
    // One requireStore() guard per write handler (helper definition adds one more).
    expect(guards, `store:write handlers (${writes}) must each call requireStore()`).toBeGreaterThanOrEqual(writes);
  });

  it('every pitch-deck write route checks the pitch-decks entitlement', () => {
    const offenders = walkRouteFiles(resolve(ROOT, 'app/api/portal/tools/pitch-decks'))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return hasWriteHandler(src) && !(hasEntitlementCall(src) && src.includes("'pitch-decks'"));
      })
      .map((f) => f.replace(ROOT + '/', ''));
    expect(offenders, `ungated pitch-deck write routes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('store product-detail route entitlement-gates its writes', () => {
    const src = readFileSync(
      resolve(ROOT, 'app/api/portal/websites/[siteId]/store/products/[productId]/route.ts'),
      'utf8',
    );
    expect(hasWriteHandler(src)).toBe(true);
    expect(/hasServiceAccess\([^)]*'store'\)/.test(src), "PUT/DELETE must check hasServiceAccess(..,'store')").toBe(true);
  });
});
