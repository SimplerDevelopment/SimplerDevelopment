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
 * The broad store sub-resource surface is gated via the `resolveStoreSite`
 * helper (lib/portal-auth.ts): swapping a route's `resolveClientSite` →
 * `resolveStoreSite` makes an unsubscribed client fall through to the route's
 * not-found path. STORE_WRITE_UNGATED below are the routes deliberately left
 * ungated (store onboarding + integration-test endpoints) — adding a NEW store
 * write route not on that list, without a gate, fails this test.
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
const hasEntitlementCall = (src: string) => /hasServiceAccess|requireService|resolveStoreSite/.test(src);

// Store write routes intentionally NOT entitlement-gated, each with a reason:
//  - stripe-connect: store *onboarding* — gating on a store sub would be circular
//  - stripe/test: integration smoke-test (no external cost/quota burned)
// (easypost/test is now gated via resolveStoreSite — it fires metered EasyPost
//  API calls, so it must require the store subscription.)
const STORE_WRITE_UNGATED = new Set<string>([
  'app/api/portal/websites/[siteId]/store/stripe-connect/route.ts',
  'app/api/portal/websites/[siteId]/store/stripe/test/route.ts',
]);

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

  it('every store write route is entitlement-gated (or explicitly allow-listed)', () => {
    const offenders = walkRouteFiles(resolve(ROOT, 'app/api/portal/websites'))
      .filter((f) => f.replace(ROOT + '/', '').includes('/store/'))
      .filter((f) => {
        const rel = f.replace(ROOT + '/', '');
        if (STORE_WRITE_UNGATED.has(rel)) return false;
        const src = readFileSync(f, 'utf8');
        return hasWriteHandler(src) && !hasEntitlementCall(src);
      })
      .map((f) => f.replace(ROOT + '/', ''));
    expect(
      offenders,
      `ungated store write routes (gate via resolveStoreSite, or add to STORE_WRITE_UNGATED with a reason):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
