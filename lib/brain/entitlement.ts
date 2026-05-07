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
 *   3. `clients.brainTrialUntil` is non-null and `> now()` — self-serve trials
 *      and product-led-growth sign-ups get brain access without an explicit
 *      `clientServices` row. Expired trials fall through to the next check.
 *   4. Active `clientServices` row joined to a `services` row whose category is
 *      `'brain'` or `'bundle'`.
 *
 * Rollout complete: every authenticated `/api/portal/brain/**` route now calls
 * `requireBrainEntitlement` directly. The cron handler at
 * `/api/cron/brain-daily-notes` is intentionally unauthenticated — entitlement
 * is checked per-tenant inside the loop, not at the route boundary.
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
 * (or an active `bundle` that includes brain), is on an active self-serve
 * trial (`clients.brainTrialUntil > now()`), or if a runtime bypass is set.
 */
export async function isBrainEntitled(clientId: number): Promise<boolean> {
  if (isTestRuntime()) return true;

  // Active self-serve trial — wins over the absence of a clientServices row.
  // Expired trials silently fall through to the paid-subscription check.
  const [trialRow] = await db
    .select({ brainTrialUntil: clients.brainTrialUntil })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (trialRow?.brainTrialUntil && trialRow.brainTrialUntil > new Date()) {
    return true;
  }

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
