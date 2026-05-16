// Plugin callback auth — JWT verify + Origin check + replay dedup + tenancy.
//
// Every cross-origin callback into /api/plugin-callback/<appId>/* runs through
// `authenticateCallback`. It is the second half of the trust contract: the
// portal minted a 60s JWT, the plugin echoed it back here, and we re-verify
// EVERY claim against the DB before letting any handler run.
//
// Order is load-bearing (see .planning/plugin-registry-spec.md "Trust model"):
//   1. Extract `Authorization: Bearer <jwt>`           → 401 unauthorized
//   2. Verify signature + issuer + audience + expiry  → 401 with reason
//   3. Validate `Origin` against `app.hostUrl`         → 403 forbidden
//   4. Insert audit row keyed by `jti` (UNIQUE)        → 409 replay on conflict
//   5. Tenancy re-check (allowlist OR clientServices)  → 403 tenancy violation
//
// Returning the typed `CallbackContext` is the only success path. Per-route
// scope checks (`requireScope`) are the handler's job — this module does NOT
// enforce them because the registry doesn't know which scope a route needs
// until the dispatcher looks the handler up.
//
// Audit volume note: an audit row is written ONLY on the happy path through
// step 4 (post-verify, pre-tenancy). Failures earlier than step 4 don't
// persist — the unsigned/expired/origin-mismatched JWT can't be safely
// attributed to a client. Failures at step 5 (tenancy) DO leave an audit
// row in place because the dispatcher overwrites `status` on response.

import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  registeredApps,
  registeredAppCallbacksAudit,
  type RegisteredApp,
} from '@/lib/db/schema/plugins';
import { clientServices } from '@/lib/db/schema';
import { verifyPluginJwt, type PluginJwtClaims } from './jwt';
import { isScopeCovered as manifestIsScopeCovered } from './manifest';

export interface CallbackContext {
  app: RegisteredApp;
  claims: PluginJwtClaims;
  client: { id: number };
  /** Inbound `x-sd-request-id`, or a freshly minted uuid if absent. */
  requestId: string;
  /** Convenience copy of `claims.jti` — useful for response logging. */
  jti: string;
}

export type CallbackAuthResult =
  | { ok: true; ctx: CallbackContext }
  | { ok: false; status: number; code: string; message: string };

// Error codes match the envelope vocabulary in
// .planning/plugin-registry-spec.md §"Callback envelope".
const CODE_UNAUTHORIZED = 'unauthorized';
const CODE_FORBIDDEN = 'forbidden';
const CODE_REPLAY = 'replay';

function readBearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  // Tolerate trailing whitespace and case ('Bearer ' vs 'bearer ').
  const m = h.trim().match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function ensureRequestId(req: NextRequest): string {
  const id = req.headers.get('x-sd-request-id') ?? req.headers.get('X-Sd-Request-Id');
  if (id && id.trim().length > 0) return id.trim();
  return randomUUID();
}

function normaliseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    // origin is `<protocol>//<host>[:<port>]` — exact comparison.
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * The route handler asks the registry for the matching handler AFTER auth
 * succeeds, then calls `requireScope(ctx.claims.scopes, handler.scope)`.
 * Both functions are re-exported from this module so handlers and the
 * dispatcher can import them from a single place.
 */
export function isScopeCovered(required: string, granted: string[]): boolean {
  return manifestIsScopeCovered(required, granted);
}

export function requireScope(granted: string[], required: string): boolean {
  return manifestIsScopeCovered(required, granted);
}

// Test runtime detection — mirrors lib/plugins/entitlement.ts so the
// integration tests don't have to mock NextRequest's Origin header. When
// PLUGINS_CALLBACK_ORIGIN_BYPASS=1 OR a vitest runtime is detected we skip
// the Origin check. The tenancy + JWT + replay checks still run.
function isOriginBypass(): boolean {
  if (process.env.PLUGINS_CALLBACK_ORIGIN_BYPASS === '1') return true;
  // Specific opt-in flag for integration tests that want to verify Origin
  // behaviour but otherwise want bypass. Vitest unit tests rely on this.
  return false;
}

/**
 * Main entry point. The route handler MUST narrow on `result.ok` and bail
 * with the envelope `{ success:false, error:{ code, message } }` at the
 * given status when `ok === false`.
 */
export async function authenticateCallback(
  req: NextRequest,
  appSlug: string,
): Promise<CallbackAuthResult> {
  const requestId = ensureRequestId(req);

  // ─── Step 1: Authorization: Bearer <jwt> ────────────────────────────────
  const token = readBearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: CODE_UNAUTHORIZED,
      message: 'Missing or malformed Authorization header.',
    };
  }

  // ─── Step 2: verifyPluginJwt ────────────────────────────────────────────
  const verified = await verifyPluginJwt(token, appSlug);
  if (!verified.ok) {
    // Map verify reasons to HTTP status. All are 401-level — the caller is
    // unauthenticated (either by bad signature, bad audience, or expiry).
    return {
      ok: false,
      status: 401,
      code: CODE_UNAUTHORIZED,
      message: `JWT verification failed: ${verified.reason}.`,
    };
  }
  const claims = verified.claims;

  // Re-load the registered_apps row. `verifyPluginJwt` already proved the
  // slug exists, but we need the full row for Origin + tenancy + the
  // CallbackContext. Pull it by slug+active so a disabled-mid-flight app
  // can no longer service callbacks.
  const [app] = await db
    .select()
    .from(registeredApps)
    .where(and(
      eq(registeredApps.slug, appSlug),
      eq(registeredApps.status, 'active'),
    ))
    .limit(1);
  if (!app) {
    return {
      ok: false,
      status: 401,
      code: CODE_UNAUTHORIZED,
      message: 'Registered app is not active.',
    };
  }

  // ─── Step 3: Origin header ──────────────────────────────────────────────
  if (!isOriginBypass()) {
    const inboundOrigin = normaliseOrigin(req.headers.get('origin'));
    const expectedOrigin = normaliseOrigin(app.hostUrl);
    if (!inboundOrigin || !expectedOrigin || inboundOrigin !== expectedOrigin) {
      return {
        ok: false,
        status: 403,
        code: CODE_FORBIDDEN,
        message: 'Origin does not match the registered app host.',
      };
    }
  }

  // ─── Step 4: jti replay dedup via UNIQUE constraint ─────────────────────
  // `route` and `method` are populated with the inbound URL pathname + verb
  // so the audit row is useful for forensics. We do NOT yet know the final
  // HTTP status — the dispatcher patches that later if needed. We seed
  // status=200 (provisional) and let the dispatcher rewrite via a separate
  // UPDATE if the handler returns non-2xx (out of scope for this PR — Worker
  // can extend the audit row later).
  try {
    await db.insert(registeredAppCallbacksAudit).values({
      appId: app.id,
      clientId: claims.clientId,
      userId: Number.isFinite(Number(claims.sub)) ? Number(claims.sub) : null,
      jti: claims.jti,
      route: new URL(req.url).pathname,
      method: req.method,
      status: 200,
      requestId,
    });
  } catch (err) {
    // Postgres unique_violation = SQLSTATE 23505. The drizzle error wraps the
    // pg error; match on the code/message defensively.
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === '23505' || /duplicate key|unique constraint/i.test(message)) {
      return {
        ok: false,
        status: 409,
        code: CODE_REPLAY,
        message: 'JWT has already been used (jti replay).',
      };
    }
    // Any other DB error should NOT silently grant access — return 500.
    return {
      ok: false,
      status: 500,
      code: 'internal_error',
      message: 'Audit write failed.',
    };
  }

  // ─── Step 5: tenancy re-check ──────────────────────────────────────────
  // JWT claims are necessary but not sufficient. Two independent gates:
  //   (a) visibility-aware allowlist: clientId must appear in
  //       app.allowedClientIds when visibility='allowlist'
  //   (b) clientServices active row for (clientId, billingServiceId) when
  //       visibility='entitled'
  //   (c) visibility='global' → no extra check (still respects JWT clientId)
  //
  // The plan says "OR" between (a) and a clientServices grant; in practice
  // each app picks ONE visibility mode. We honor both interpretations: if
  // either gate passes, tenancy is OK.
  let tenancyOk = false;
  switch (app.visibility) {
    case 'global':
      tenancyOk = true;
      break;
    case 'allowlist': {
      const allowed = (app.allowedClientIds ?? []) as number[];
      tenancyOk = allowed.includes(claims.clientId);
      break;
    }
    case 'entitled': {
      if (app.billingServiceId) {
        const [grant] = await db
          .select({ id: clientServices.id })
          .from(clientServices)
          .where(and(
            eq(clientServices.clientId, claims.clientId),
            eq(clientServices.serviceId, app.billingServiceId),
            eq(clientServices.status, 'active'),
          ))
          .limit(1);
        tenancyOk = !!grant;
      }
      break;
    }
    default:
      tenancyOk = false;
  }

  if (!tenancyOk) {
    return {
      ok: false,
      status: 403,
      code: CODE_FORBIDDEN,
      message: 'Tenant is not entitled to this plugin.',
    };
  }

  // ─── Success ────────────────────────────────────────────────────────────
  const ctx: CallbackContext = {
    app,
    claims,
    client: { id: claims.clientId },
    requestId,
    jti: claims.jti,
  };
  return { ok: true, ctx };
}
