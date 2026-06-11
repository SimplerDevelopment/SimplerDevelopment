// Central module-entitlement resolution for the per-domain SaaS catalog.
//
// Semantics:
// - billingMode 'agency' (legacy default) bypasses module gating entirely —
//   every existing client keeps full access with zero behavior change.
// - 'saas' and 'byok' clients are entitled only to domains with an active
//   clientServices row whose services.category matches the domain key, or an
//   active 'bundle' row (grants everything), or an active legacy
//   'subscription' tier row (tier clients predate per-domain SKUs and keep
//   full access).
// - brainTrialUntil still grants 'brain' while in the future (PLG trial).

import { db } from '@/lib/db';
import { clients, clientServices, services } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { FEATURE_DOMAINS, type BillingMode } from '@/lib/billing/domain-catalog';

export interface ClientEntitlements {
  mode: BillingMode;
  /** Domain keys the client may use. For bypass modes this is every key. */
  domains: Set<string>;
  /** True when access comes from the all-in bundle (or a bypass). */
  hasBundle: boolean;
  /** True when module gating is not applied (agency / legacy tier). */
  gatingBypassed: boolean;
}

const ALL_DOMAIN_KEYS = FEATURE_DOMAINS.map((d) => d.key);

function allEntitlements(mode: BillingMode, hasBundle: boolean, gatingBypassed: boolean): ClientEntitlements {
  return { mode, domains: new Set(ALL_DOMAIN_KEYS), hasBundle, gatingBypassed };
}

/**
 * Resolve which feature domains a client is entitled to. One query against
 * clientServices ⨝ services; pass the already-loaded client row when you have
 * it (authorizePortal does) to skip the clients lookup.
 */
export async function getClientEntitlements(
  clientId: number,
  preloadedClient?: { billingMode: string; brainTrialUntil: Date | null },
): Promise<ClientEntitlements> {
  let client = preloadedClient;
  if (!client) {
    const [row] = await db
      .select({ billingMode: clients.billingMode, brainTrialUntil: clients.brainTrialUntil })
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
  // Legacy tier subscriptions (tier-starter/growth/scale) predate per-domain
  // SKUs; they keep full module access so flipping billingMode is non-breaking.
  if (categories.has('subscription')) return allEntitlements(mode, false, true);

  const domains = new Set(ALL_DOMAIN_KEYS.filter((k) => categories.has(k)));
  if (client?.brainTrialUntil && client.brainTrialUntil > new Date()) domains.add('brain');

  return { mode, domains, hasBundle: false, gatingBypassed: false };
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
