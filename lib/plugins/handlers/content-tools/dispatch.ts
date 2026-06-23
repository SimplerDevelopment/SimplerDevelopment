// Dispatch a queued plugin run to the postcaptain-tools worker.
//
// In Wave 1 of the plugin registry the runner executed Anthropic calls
// directly inside SD's drain cron. Wave 2 moves the heavy compute (Anthropic
// + web_search, 30-300s) to the second-server postcaptain-tools deploy. SD
// keeps owning storage, scheduling, the audit trail, and the run state
// machine; postcaptain-tools owns execution.
//
// Flow (Pattern P — push):
//   1. SD's `executeRun()` CAS-claims a queued run → status='running' (was
//      already in place; unchanged).
//   2. SD mints a short-lived dispatch JWT bound to the plugin's signing
//      key and POSTs `{ runId, kind, args, clientId }` to the worker's
//      `${hostUrl}/internal/execute-run` endpoint.
//   3. The worker responds 202 immediately, then processes the work in
//      `after()` (Vercel Pro, 300s ceiling).
//   4. When the worker finishes (success or failure) it calls back to SD's
//      `POST /scripts/runs/:id/complete` callback with the result payload.
//      That handler persists the row into postcaptain_briefs/drafts and
//      transitions the run to succeeded/failed.
//
// The dispatch JWT uses the standard plugin JWT contract (HS256, iss=
// simplerdev-portal, aud=<app slug>) with a system subject (`sub='system'`)
// and a dedicated scope (`postcaptain:internal:execute`). The worker's
// inbound `/internal/execute-run` route verifies this scope and rejects
// anything else, so a leaked user-context JWT can't trigger executions.
//
// Failure modes:
//   - Network error / 5xx from worker → return `{ ok:false, retriable:true }`.
//     Caller reverts the run to 'queued' so the next drain tick tries again.
//   - 4xx from worker (bad kind, validation) → return `{ ok:false,
//     retriable:false }`. Caller transitions the run straight to 'failed'.
//   - Stuck 'running' runs (worker crashed mid-process, never called back)
//     are out of scope for this wave; a stuck-run reaper is TODO.

import { signPluginJwt } from '../../jwt';
import type { RegisteredApp } from '@/lib/db/schema';

// Bounded — SD's drain cron only has 60s total, and the worker should
// respond 202 within a few seconds. Don't sit on a connection longer than
// necessary.
const DISPATCH_TIMEOUT_MS = 10_000;

export const DISPATCH_SCOPE = 'postcaptain:internal:execute' as const;

export interface DispatchPayload {
  runId: number;
  kind: string;
  args: Record<string, unknown>;
  clientId: number;
}

export type DispatchResult =
  | { ok: true; status: number }
  | { ok: false; retriable: boolean; status: number; reason: string };

/**
 * Mint a dispatch JWT for `app` and POST the payload to the worker's
 * `/internal/execute-run` endpoint. Returns a discriminated result that
 * tells the caller whether to retry, fail, or carry on.
 *
 * Caller is expected to have already CAS-claimed the run row from
 * 'queued' → 'running'. We deliberately don't touch the DB here so the
 * dispatch logic stays pure and testable.
 */
export async function dispatchRun(
  app: Pick<RegisteredApp, 'id' | 'slug' | 'hostUrl'>,
  payload: DispatchPayload,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<DispatchResult> {
  const jwt = await signPluginJwt(app.id, {
    aud: app.slug,
    sub: 'system',
    clientId: payload.clientId,
    siteId: null,
    scopes: [DISPATCH_SCOPE],
  });

  const url = `${app.hostUrl.replace(/\/$/, '')}/internal/execute-run`;
  const f = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DISPATCH_TIMEOUT_MS;

  let res: Response;
  try {
    res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sd-tenant': jwt,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'dispatch fetch failed';
    return { ok: false, retriable: true, status: 0, reason };
  }

  if (res.status === 202 || res.status === 200) {
    return { ok: true, status: res.status };
  }

  // 4xx = bad request; the worker actively rejected. Don't retry — fail fast.
  // 5xx = transient; retry on next drain tick.
  const retriable = res.status >= 500;
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    detail = '<no body>';
  }
  return {
    ok: false,
    retriable,
    status: res.status,
    reason: `worker ${res.status}: ${detail}`,
  };
}
