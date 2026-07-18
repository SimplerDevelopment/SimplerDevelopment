// Central module-entitlement resolution for the per-domain SaaS catalog.
//
// Semantics:
// - billingMode 'agency' (legacy default) bypasses module gating entirely —
//   every existing client keeps full access with zero behavior change.
// - 'saas' and 'byok' clients are entitled to: domains with an active
//   clientServices row whose services.category matches the domain key (à-la-
//   carte modules); OR the domain set of an active plan-TIER row (category =
//   tier.slug, e.g. 'plan-growth'); OR an active 'bundle' row (everything); OR
//   an active legacy 'subscription' row (predates per-domain SKUs, full access).
// - byokEligible: only a Scale-tier client (or bundle / bypass) may enter byok
//   mode and have the metered-AI waiver honored — the "BYOK inversion".
// - brainTrialUntil still grants 'brain' while in the future (PLG trial).

import { db } from '@/lib/db';
import { clients, clientServices, services } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { FEATURE_DOMAINS, getTierByCategory, tierDomainKeys, type BillingMode } from '@/lib/billing/domain-catalog';

export interface ClientEntitlements {
  mode: BillingMode;
  /** Domain keys the client may use. For bypass modes this is every key. */
  domains: Set<string>;
  /** True when access comes from the all-in bundle (or a bypass). */
  hasBundle: boolean;
  /** True when module gating is not applied (agency / legacy tier). */
  gatingBypassed: boolean;
  /** True when on a BYOK-eligible tier (Scale / bundle / bypass) — the gate for
   *  entering byok mode and honoring the metered-AI waiver (the inversion). */
  byokEligible: boolean;
}

const ALL_DOMAIN_KEYS = FEATURE_DOMAINS.map((d) => d.key);

function allEntitlements(mode: BillingMode, hasBundle: boolean, gatingBypassed: boolean): ClientEntitlements {
  // All-access paths (agency bypass, the all-modules bundle, legacy tier subs)
  // sit at/above Scale, so they are BYOK-eligible.
  return { mode, domains: new Set(ALL_DOMAIN_KEYS), hasBundle, gatingBypassed, byokEligible: true };
}

/**
 * Resolve which feature domains a client is entitled to. One query against
 * clientServices ⨝ services; pass the already-loaded client row when you have
 * it (authorizePortal does) to skip the clients lookup.
 */
export async function getClientEntitlements(
  clientId: number,
  preloadedClient?: { billingMode: string; brainTrialUntil: Date | null; byokEligibleOverride?: boolean | null },
): Promise<ClientEntitlements> {
  let client = preloadedClient;
  if (!client) {
    const [row] = await db
      .select({
        billingMode: clients.billingMode,
        brainTrialUntil: clients.brainTrialUntil,
        byokEligibleOverride: clients.byokEligibleOverride,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    client = row;
  }

  const mode = (client?.billingMode ?? 'agency') as BillingMode;
  if (mode === 'agency') return allEntitlements(mode, false, true);

  const rows = await db
    .select({ category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));

  const categories = new Set(rows.map((r) => r.category));

  if (categories.has('bundle')) return allEntitlements(mode, true, false);
  // Legacy all-access tier subs (category 'subscription') predate per-domain
  // SKUs; they keep full module access so flipping billingMode is non-breaking.
  if (categories.has('subscription')) return allEntitlements(mode, false, true);

  const domains = new Set(ALL_DOMAIN_KEYS.filter((k) => categories.has(k)));

  // Plan-tier subscriptions grant a curated domain set; only a byokEligible
  // tier (Scale) unlocks BYOK (the inversion).
  let byokEligible = false;
  for (const category of categories) {
    const tier = getTierByCategory(category);
    if (!tier) continue;
    for (const key of tierDomainKeys(tier)) domains.add(key);
    if (tier.byokEligible) byokEligible = true;
  }
  // Admin/sales grant: BYOK is contact-sales now, so a staff-set override grants
  // eligibility regardless of tier (à-la-carte clients have no byokEligible tier).
  if (client?.byokEligibleOverride) byokEligible = true;

  if (client?.brainTrialUntil && client.brainTrialUntil > new Date()) domains.add('brain');

  return { mode, domains, hasBundle: false, gatingBypassed: false, byokEligible };
}

/** Convenience wrapper for a single-domain check. */
export async function isEntitledToDomain(
  clientId: number,
  domainKey: string,
  preloadedClient?: { billingMode: string; brainTrialUntil: Date | null },
): Promise<boolean> {
  const ent = await getClientEntitlements(clientId, preloadedClient);
  return ent.domains.has(domainKey);
}
