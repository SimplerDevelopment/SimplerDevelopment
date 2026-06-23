/**
 * Plan-aware gating for AI calls.
 *
 * The pricing pivot introduces three subscription tiers (Starter / Growth /
 * Scale) — encoded as `services` rows with `category='subscription'` and
 * `slug='tier-{starter,growth,scale}'`. Each tier's `usageLimits.tier` JSON
 * field carries the canonical lowercase label.
 *
 * Tier rules (the "BYOK inversion" — see lib/billing/domain-catalog.ts):
 *   - All paid tiers (Starter / Growth / Scale) get PLATFORM AI. The lower
 *     tiers run on marked-up metered/credit-billed platform AI (the profit
 *     centre); that is the product, not a paywall.
 *   - BYOK (bring your own provider key, spend-at-cost) is a SCALE-ONLY
 *     unlock. It is NOT required on any tier and NOT available below Scale.
 *     Eligibility + key entry are gated on `entitlements.byokEligible` at the
 *     key-storage route and re-checked at inference in resolveClientApiKey —
 *     NOT here. This gate no longer blocks any tier from making AI calls.
 *   - No tier row found (legacy clients, internal accounts): unrestricted.
 *
 * Returns a structured verdict so call sites can render error envelopes
 * directly without rebuilding messaging.
 */

import { db } from '@/lib/db';
import { clientServices, services, clientApiKeys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

import type { AiProvider } from './resolve-client-key';

export type ClientTier = 'starter' | 'growth' | 'scale' | 'unknown';

export interface PlanGateVerdict {
  allowed: boolean;
  tier: ClientTier;
  /** Reason code — useful in tests + envelope. */
  reason?: 'starter_requires_byok';
  /** Human-readable message safe to surface in API error envelopes. */
  message?: string;
  /** Whether the client has any BYOK row (any provider). */
  hasAnyByok: boolean;
}

/**
 * Determine the active subscription tier for a client.
 * Picks the highest-tier active subscription if a client has multiple.
 */
export async function getClientTier(clientId: number): Promise<ClientTier> {
  const rows = await db
    .select({
      slug: services.slug,
      usageLimits: services.usageLimits,
    })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(
      and(
        eq(clientServices.clientId, clientId),
        eq(clientServices.status, 'active'),
        eq(services.category, 'subscription'),
      ),
    );

  if (rows.length === 0) return 'unknown';

  // Rank tiers so a client subscribed to multiple gets the highest-effective.
  const RANK: Record<string, number> = { starter: 1, growth: 2, scale: 3 };
  let best: ClientTier = 'unknown';
  let bestRank = 0;

  for (const row of rows) {
    // Prefer the explicit `usageLimits.tier` label; fall back to slug parsing.
    const limits = (row.usageLimits ?? {}) as Record<string, unknown>;
    const labelRaw = typeof limits.tier === 'string'
      ? limits.tier
      : (row.slug?.startsWith('tier-') ? row.slug.slice(5) : null);
    const label = labelRaw?.toLowerCase();
    if (!label || !(label in RANK)) continue;
    const rank = RANK[label];
    if (rank > bestRank) {
      bestRank = rank;
      best = label as ClientTier;
    }
  }

  return best;
}

async function clientHasAnyByok(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientApiKeys.id })
    .from(clientApiKeys)
    .where(eq(clientApiKeys.clientId, clientId))
    .limit(1);
  return !!row;
}

export interface CheckPlanGateOptions {
  clientId: number;
  provider: AiProvider;
}

/**
 * Returns a verdict for whether `clientId` is allowed to make an AI call for
 * `provider` under their current subscription tier.
 *
 * Semantics (post BYOK-inversion):
 *   - Every paid tier gets platform AI, so this gate ALLOWS all tiers. It no
 *     longer blocks Starter — Starter runs on metered platform AI like the
 *     others. BYOK is a Scale-only *option*, gated at the key-storage route
 *     and re-checked at inference, not here.
 *   - `tier` and `hasAnyByok` are still returned for telemetry / metering
 *     decisions at the call site.
 *
 * Note: `provider` is retained in the options for back-compat and so future
 * per-provider gating can hook in without touching ~10 call sites.
 */
export async function checkAiPlanGate(
  opts: CheckPlanGateOptions,
): Promise<PlanGateVerdict> {
  const tier = await getClientTier(opts.clientId);
  const hasAnyByok = await clientHasAnyByok(opts.clientId);

  return {
    allowed: true,
    tier,
    hasAnyByok,
  };
}
