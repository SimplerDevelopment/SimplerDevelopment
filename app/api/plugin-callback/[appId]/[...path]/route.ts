// Plugin callback dispatcher — the cross-origin REST surface that registered
// plugins call back into the portal with their `x-sd-tenant` JWT.
//
// Flow (mirrors .planning/plugin-registry-spec.md §"Trust model"):
//   1. authenticateCallback() — Bearer JWT verify, Origin check, jti
//      replay dedup via UNIQUE(jti), tenancy re-check
//   2. rate-limit per (appId, clientId) — 30 req/min sliding window
//   3. registry lookup — `(appSlug, method, /<path>)` → handler + params
//   4. scope check — JWT's `scopes` claim must cover handler.scope
//   5. delegate to handler.handle(req, ctx, urlParams)
//
// `params.appId` in the URL is actually the app SLUG (e.g. 'postcaptain-tools').
// We use the path placeholder name from the plan ("[appId]") even though the
// value is a string slug — renaming would force a docs+manifest churn.

import { NextResponse, type NextRequest } from 'next/server';
import {
  authenticateCallback,
  requireScope,
  updateCallbackAuditStatus,
} from '@/lib/plugins/callback-auth';
import {
  checkPluginCallbackRateLimit,
} from '@/lib/plugins/rate-limit';
import { lookupHandler } from '@/lib/plugins/handlers/registry';
import { fail } from '@/lib/plugins/handlers/types';

// Side-effect import: registers every postcaptain-tools handler into the
// registry on first module load. Future plugins add their own index file
// here.
import '@/lib/plugins/handlers/content-tools/index';

type RouteParams = Promise<{ appId: string; path: string[] }>;

async function dispatch(
  req: NextRequest,
  paramsPromise: RouteParams,
): Promise<Response> {
  const { appId: appSlug, path } = await paramsPromise;
  const pathSuffix = '/' + (path ?? []).join('/');

  // 1. Authenticate
  const auth = await authenticateCallback(req, appSlug);
  if (!auth.ok) {
    return fail(auth.code, auth.message, auth.status);
  }
  const { ctx } = auth;

  // 2. Rate-limit per (appId, clientId)
  const rate = checkPluginCallbackRateLimit(ctx.app.id, ctx.client.id);
  if (!rate.ok) {
    const res = fail(
      'rate_limited',
      'Too many requests for this client + plugin.',
      429,
    );
    res.headers.set('Retry-After', String(rate.retryAfter));
    res.headers.set('X-RateLimit-Reset', rate.resetAt.toISOString());
    return res;
  }

  // 3. Route match
  const match = lookupHandler(appSlug, req.method, pathSuffix);
  if (!match) {
    return fail('not_found', `No handler for ${req.method} ${pathSuffix}.`, 404);
  }
  const { handler, params: urlParams } = match;

  // 4. Scope check
  if (!requireScope(ctx.claims.scopes, handler.scope)) {
    return fail(
      'forbidden',
      `Missing required scope '${handler.scope}'.`,
      403,
    );
  }

  // 5. Delegate, then patch the audit row's status to the final HTTP code
  //    so forensics reflect what the caller actually saw (not the provisional
  //    200 we wrote at audit-insert time).
  let response: Response;
  try {
    response = await handler.handle(req, ctx, urlParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Handler threw.';
    response = fail('internal_error', message, 500);
  }
  // Fire-and-forget; updateCallbackAuditStatus swallows DB errors so we
  // never block the response on the audit write.
  void updateCallbackAuditStatus(ctx.jti, response.status);
  return response;
}

export async function GET(req: NextRequest, ctx: { params: RouteParams }) {
  return dispatch(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: RouteParams }) {
  return dispatch(req, ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: RouteParams }) {
  return dispatch(req, ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: RouteParams }) {
  return dispatch(req, ctx.params);
}

// 405 fallback for unsupported verbs so middleware/cdn don't see a phantom
// 404 for a PUT or HEAD.
export async function PUT() {
  return NextResponse.json(
    { success: false, error: { code: 'method_not_allowed', message: 'PUT is not supported.' } },
    { status: 405 },
  );
}
