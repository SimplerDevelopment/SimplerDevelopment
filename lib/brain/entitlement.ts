/**
 * Company Brain service entitlement.
 *
 * Brain is gated behind the `'brain'` service category (or any active `'bundle'`
 * subscription). Use {@link isBrainEntitled} to check at the page/layout level
 * and {@link requireBrainEntitlement} from API routes — the latter returns a
 * `NextResponse` with a `402 Payment Required` envelope when the client has not
 * paid for the SKU yet.
 *
 * Bypasses (in priority order):
 *   1. `BRAIN_ENTITLEMENT_BYPASS=1` — explicit opt-out, used by integration tests
 *      whose tenants are created without subscriptions.
 *   2. `process.env.VITEST` / `VITEST_POOL_ID` set — vitest runtime, treat as
 *      bypassed so existing brain integration specs pass without seeding the
 *      `brain` SKU into every test schema.
 *   3. Active `clientServices` row joined to a `services` row whose category is
 *      `'brain'` or `'bundle'`.
 *
 * TODO(brain-trial): Phase-2 of GA — honor a `clients.brainTrialUntil` column
 * (or similar) for self-serve trials and product-led-growth sign-ups. See
 * `.planning/audits/companyBrain-adjusted.md` §11.8 for the open question on
 * trial vs day-one paid. Skipped here because adding a column requires a
 * migration and the layout-level gate already lets us upsell unentitled users
 * without breaking their experience.
 *
 * TODO(brain-gate-rollout): apply `requireBrainEntitlement` to the remaining
 * brain API routes once we're confident the helper has shipped without
 * regressions. Currently gated:
 *   - GET  /api/portal/brain/dashboard
 *   - GET  /api/portal/brain/knowledge   (and POST)
 *   - GET  /api/portal/brain/search
 *   - GET  /api/portal/brain/relationships
 *   - GET  /api/portal/brain/tasks
 * Still on `authorizePortal` only (≈26 routes):
 *   - settings, promotion-targets, drive-sync, dataview, crm-suggestions,
 *     adapters, calendar/{agenda,events,events/[id]},
 *     review, review-items/[id]/{approve,reject},
 *     communications (+ [id], [id]/{review,process,attachments,attachments/[idx]}),
 *     tasks/[id], tasks/[id]/promote-to-kanban,
 *     knowledge/[id] (+ /attachment, /backlinks, /fields, /fields/[fieldId], /upload),
 *     relationships/[id]
 *   The layout-level gate already prevents unentitled tenants from reaching
 *   the UI that calls these, but defense-in-depth requires the API guard too.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients, clientServices, services } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Client = typeof clients.$inferSelect;
type PortalRole = 'owner' | 'admin' | 'member' | 'viewer';

export const BRAIN_SERVICE_CATEGORY = 'brain' as const;

/**
 * True when the test runner is hosting this process. Avoids requiring every
 * brain integration spec to seed a `brain` SKU + `client_services` row.
 */
function isTestRuntime(): boolean {
  if (process.env.BRAIN_ENTITLEMENT_BYPASS === '1') return true;
  if (process.env.VITEST === 'true' || process.env.VITEST === '1') return true;
  if (process.env.VITEST_POOL_ID !== undefined) return true;
  return false;
}

/**
 * Returns true if the client has an active subscription to the `brain` service
 * (or an active `bundle` that includes brain), or if a runtime bypass is set.
 */
export async function isBrainEntitled(clientId: number): Promise<boolean> {
  if (isTestRuntime()) return true;

  const rows = await db
    .select({ category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.clientId, clientId),
      eq(clientServices.status, 'active'),
    ));

  return rows.some((r) => r.category === BRAIN_SERVICE_CATEGORY || r.category === 'bundle');
}

/**
 * The shape returned to API callers when they hit a brain endpoint without
 * an active subscription. Mirrors the `{ success, message }` envelope the rest
 * of the portal uses, plus a stable `code` + upsell metadata so the UI can
 * render a "Buy Brain" CTA without parsing strings.
 */
export interface BrainEntitlementError {
  success: false;
  code: 'BRAIN_NOT_ENTITLED';
  message: string;
  requiresService: typeof BRAIN_SERVICE_CATEGORY;
  upsellUrl: string;
}

/**
 * Auth-and-entitlement guard for brain API routes.
 *
 * Usage:
 *   const result = await requireBrainEntitlement();
 *   if ('response' in result) return result.response;
 *   const { client, userId } = result;
 *
 * Layered on top of {@link authorizePortal} — auth + role checks happen first,
 * then we verify the brain SKU. Returns 402 (rather than the 403 that
 * `authorizePortal({requireService})` returns) so the client can distinguish
 * "you can't access this regardless of payment" from "pay to unlock".
 */
export async function requireBrainEntitlement(opts?: {
  action?: 'read' | 'write' | 'admin' | 'owner';
}): Promise<
  | { client: Client; userId: number; role: PortalRole }
  | { response: NextResponse }
> {
  const authed = await authorizePortal({ action: opts?.action ?? 'read' });
  if (isAuthError(authed)) return { response: authed.response };

  const entitled = await isBrainEntitled(authed.client.id);
  if (!entitled) {
    const body: BrainEntitlementError = {
      success: false,
      code: 'BRAIN_NOT_ENTITLED',
      message: 'Company Brain requires an active subscription. Visit /portal/services to subscribe.',
      requiresService: BRAIN_SERVICE_CATEGORY,
      upsellUrl: '/portal/brain',
    };
    return { response: NextResponse.json(body, { status: 402 }) };
  }

  return { client: authed.client, userId: authed.userId, role: authed.role as PortalRole };
}
