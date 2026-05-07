/**
 * Plan-aware gating for AI calls.
 *
 * The pricing pivot introduces three subscription tiers (Starter / Growth /
 * Scale) — encoded as `services` rows with `category='subscription'` and
 * `slug='tier-{starter,growth,scale}'`. Each tier's `usageLimits.tier` JSON
 * field carries the canonical lowercase label.
 *
 * Tier rules (BYOK plumbing brief, deliverable 5):
 *   - Starter: NO platform AI. AI calls require a BYOK key. Block with a
 *     clear error if the client has neither a BYOK row nor an upgrade.
 *   - Growth, Scale: AI works with BYOK or platform credits (legacy).
 *   - No tier row found (legacy clients, internal accounts): treat as
 *     unrestricted — fall through to platform key.
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

async function clientHasByokForProvider(
  clientId: number,
  provider: AiProvider,
): Promise<boolean> {
  // Embeddings share the OpenAI bucket.
  const stored = provider === 'embedding' ? 'openai' : provider;
  const [row] = await db
    .select({ id: clientApiKeys.id })
    .from(clientApiKeys)
    .where(and(eq(clientApiKeys.clientId, clientId), eq(clientApiKeys.provider, stored)))
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
 * v1 semantics:
 *   - Starter without BYOK for the requested provider → blocked.
 *   - Otherwise → allowed.
 *
 * Call sites should treat `verdict.allowed === false` as a 402/403 surface.
 */
export async function checkAiPlanGate(
  opts: CheckPlanGateOptions,
): Promise<PlanGateVerdict> {
  const tier = await getClientTier(opts.clientId);
  const hasAnyByok = await clientHasAnyByok(opts.clientId);

  if (tier === 'starter') {
    const hasProviderByok = await clientHasByokForProvider(
      opts.clientId,
      opts.provider,
    );
    if (!hasProviderByok) {
      const providerLabel = opts.provider === 'anthropic'
        ? 'Anthropic'
        : opts.provider === 'embedding'
          ? 'OpenAI (for embeddings)'
          : 'OpenAI';
      return {
        allowed: false,
        tier,
        reason: 'starter_requires_byok',
        message:
          `AI is unavailable on Starter tier without your own provider key. ` +
          `Add an ${providerLabel} key in Portal → Settings → API Keys, or upgrade to Growth.`,
        hasAnyByok,
      };
    }
  }

  return {
    allowed: true,
    tier,
    hasAnyByok,
  };
}
