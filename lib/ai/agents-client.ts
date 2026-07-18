import { mintInternalAccessToken } from '@/lib/oauth/issue';

/**
 * App → agents sub-service client.
 *
 * Calls the standalone Mastra agents service (`simplerdevelopment-agents/`) over
 * Railway's private network. Multi-tenancy rides on the token, not the service:
 * for each call we mint a SHORT-LIVED, single-tenant `sd_oauth_…` token bound to
 * the authenticated session's `clientId`/`userId`, and hand it to the agents
 * service, which forwards it to the app's MCP. The agents service holds no
 * long-lived tenant secret.
 *
 * Transport (verified against @mastra/server@1.46.0):
 *  - `Authorization: Bearer <SD_AGENTS_INTERNAL_SECRET>` proves the caller is the
 *    app — the agents server's inbound middleware rejects anything else (the
 *    service is private-network-only and otherwise unauthenticated).
 *  - The tenant token travels two ways: an `x-sd-tenant-token` header (the agents
 *    middleware injects it into the run's `requestContext`, server-wins =
 *    tamper-proof) AND `body.requestContext.token` (Mastra merges this into the
 *    run context — the functional path when no middleware ran, e.g. local dev).
 *    Only the app can pass the internal secret, so the body path is trusted too.
 */

const AGENTS_URL = process.env.SD_AGENTS_URL;
const INTERNAL_SECRET = process.env.SD_AGENTS_INTERNAL_SECRET;

/** Default MCP scopes for the brain workflow — least privilege (brain only). */
const DEFAULT_BRAIN_SCOPES = ['brain:read', 'brain:write'];

/** Generous client-side ceiling for a long-running agent run. Sits under the
 *  ~30 min token TTL so the token can't expire before the call returns. */
const DEFAULT_TIMEOUT_MS = 25 * 60 * 1000;

/** Thrown when the agents service is unconfigured, unreachable, or errors. The
 *  caller (a background job / cron) is expected to log + retry with backoff —
 *  long-running work must NOT silently fall back to in-process (it would hit the
 *  same serverless timeout that motivated the offload). */
export class AgentsServiceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AgentsServiceError';
  }
}

export function agentsServiceConfigured(): boolean {
  return Boolean(AGENTS_URL && INTERNAL_SECRET);
}

/** The Mastra workflow-run envelope (`POST …/start-async`). */
export interface AgentsRunResult {
  status: string;
  result?: unknown;
  error?: unknown;
  steps?: unknown;
}

export interface RunBrainWorkflowOpts {
  /** Tenant — MUST come from the authenticated session, never from a caller. */
  clientId: number;
  /** Acting portal user — from the session. */
  userId: number;
  /** The brain query / task to run. */
  query: string;
  /** Override the minted token's MCP scopes (default: brain read+write). */
  scopes?: string[];
  /** Override the token TTL (default 30 min, set in the mint helper). */
  ttlSeconds?: number;
  /** Abort/timeout signal (default: 25 min timeout). */
  signal?: AbortSignal;
}

/** Resolve the app's own MCP URL for RFC 8707 audience binding of the token. */
function mcpResource(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL;
  return base ? `${base.replace(/\/+$/, '')}/api/mcp` : null;
}

/**
 * Run the `brainWorkflow` on the agents service for one tenant, blocking until
 * it completes. Throws {@link AgentsServiceError} on misconfig / transport /
 * non-2xx so the caller can retry.
 */
export async function runBrainWorkflowOnService(opts: RunBrainWorkflowOpts): Promise<AgentsRunResult> {
  if (!AGENTS_URL || !INTERNAL_SECRET) {
    throw new AgentsServiceError('agents service not configured (SD_AGENTS_URL / SD_AGENTS_INTERNAL_SECRET unset)');
  }

  const { token } = await mintInternalAccessToken({
    clientId: opts.clientId,
    userId: opts.userId,
    scopes: opts.scopes ?? DEFAULT_BRAIN_SCOPES,
    resource: mcpResource(),
    ttlSeconds: opts.ttlSeconds,
  });

  const url = `${AGENTS_URL.replace(/\/+$/, '')}/api/workflows/brainWorkflow/start-async`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INTERNAL_SECRET}`,
        'x-sd-tenant-token': token,
      },
      body: JSON.stringify({
        inputData: { query: opts.query },
        requestContext: { token },
      }),
      signal: opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new AgentsServiceError(`agents service unreachable: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AgentsServiceError(`agents service returned ${res.status}: ${body.slice(0, 300)}`, res.status);
  }

  return (await res.json()) as AgentsRunResult;
}
