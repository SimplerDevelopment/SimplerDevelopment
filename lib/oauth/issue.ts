import { db } from '@/lib/db';
import { oauthClients, oauthAccessTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateAccessToken } from '@/lib/oauth/server';

/**
 * Server-to-server (machine-to-machine) OAuth token minting for the agents
 * sub-service.
 *
 * The interactive flow in `app/oauth/token/route.ts` requires PKCE + consent +
 * issues a 1h access token PLUS a rotating refresh token — the wrong shape for
 * the app calling its own agents service on a tenant's behalf. This mints a
 * short-lived, single-tenant access token directly: no refresh token, no
 * consent. It reuses `generateAccessToken()` and the exact `oauth_access_tokens`
 * row shape, so the existing `resolveOAuthToken` validation path accepts it
 * unchanged — `clientId` stays the single source of tenant truth.
 */

/** Stable `client_id` for the internal agents M2M client. It never visits
 *  /authorize or /token (tokens are minted here, server-side), so it has no
 *  redirect URIs and auth method "none". Lazily self-seeded — a fresh template
 *  deploy needs no data migration. */
export const INTERNAL_AGENTS_CLIENT_ID = 'oc_internal_agents';

/** Default ~30 min — sized to cover a long agent run with one mint so the token
 *  can't expire mid-run. Re-mint-on-401 in the agents fetch wrapper is the
 *  upgrade path if a run ever exceeds this. */
export const DEFAULT_INTERNAL_TTL_SECONDS = 30 * 60;

// Cache the row id for the process lifetime — the client_id is constant.
let cachedAgentsOauthClientId: number | null = null;

/** Idempotently ensure the internal agents `oauth_clients` row exists and return
 *  its serial id. Safe to call on every mint and on every fresh deploy. */
async function getInternalAgentsOauthClientId(): Promise<number> {
  if (cachedAgentsOauthClientId != null) return cachedAgentsOauthClientId;

  await db
    .insert(oauthClients)
    .values({
      clientId: INTERNAL_AGENTS_CLIENT_ID,
      clientName: 'SimplerDevelopment Agents (internal)',
      redirectUris: [],
      tokenEndpointAuthMethod: 'none',
    })
    .onConflictDoNothing({ target: oauthClients.clientId });

  const [row] = await db
    .select({ id: oauthClients.id })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, INTERNAL_AGENTS_CLIENT_ID))
    .limit(1);

  if (!row) throw new Error('failed to ensure internal agents oauth client');
  cachedAgentsOauthClientId = row.id;
  return row.id;
}

export interface MintInternalTokenOpts {
  /** Tenant the token acts for — every MCP call made with it resolves to this
   *  `clientId`. The app MUST derive this from the authenticated session, never
   *  from anything the agents service supplies. */
  clientId: number;
  /** Portal user the token acts as (required FK on `oauth_access_tokens`). */
  userId: number;
  /** Least-privilege MCP scopes for the invoked agent (e.g.
   *  `["brain:read", "brain:write"]`). */
  scopes: string[];
  /** RFC 8707 audience — the MCP URL the token may be presented at (binds the
   *  token to the app's `/api/mcp`). `null` = unrestricted. */
  resource?: string | null;
  /** TTL in seconds; defaults to {@link DEFAULT_INTERNAL_TTL_SECONDS}. */
  ttlSeconds?: number;
}

/**
 * Mint a short-lived, single-tenant `sd_oauth_…` access token for a server-side
 * agent call. The returned raw token is the only copy (only its SHA-256 hash is
 * stored). No refresh token is issued.
 */
export async function mintInternalAccessToken(
  opts: MintInternalTokenOpts,
): Promise<{ token: string; expiresAt: Date }> {
  if (!Number.isInteger(opts.clientId) || !Number.isInteger(opts.userId)) {
    throw new Error('mintInternalAccessToken requires integer clientId and userId');
  }
  const oauthClientId = await getInternalAgentsOauthClientId();
  const ttl = opts.ttlSeconds ?? DEFAULT_INTERNAL_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const access = generateAccessToken();

  await db.insert(oauthAccessTokens).values({
    tokenHash: access.hash,
    tokenPreview: access.preview,
    oauthClientId,
    userId: opts.userId,
    clientId: opts.clientId,
    scopes: opts.scopes,
    resource: opts.resource ?? null,
    expiresAt,
  });

  return { token: access.token, expiresAt };
}
