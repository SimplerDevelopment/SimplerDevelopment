import crypto from 'crypto';
import { db } from '@/lib/db';
import { portalApiKeys, oauthAccessTokens, clients } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export const PORTAL_KEY_PREFIX = 'sd_mcp_';
export const OAUTH_TOKEN_PREFIX = 'sd_oauth_';

export interface PortalMcpContext {
  userId: number;
  client: typeof clients.$inferSelect;
  scopes: string[];
  keyId: number;
  /**
   * RFC 8707 resource indicator (audience) the token is bound to, or null when
   * the token carries no audience restriction (e.g. portal API keys, or OAuth
   * tokens minted before/without a resource). `null` = unrestricted — accepted
   * at any protected resource. Enforced by the protected resource itself
   * (see `resourceIndicatorMatches` + app/api/mcp/route.ts).
   */
  resource?: string | null;
  /**
   * The agentic-OS run this MCP session belongs to, when the caller is an agent
   * spawned by `POST /api/admin/agentic-os/run` (propagated via the
   * `AGENTIC_RUN_ID` env → an `x-agentic-run-id` request header). null for
   * interactive/portal sessions. Recorded on agent_action_logs for run
   * correlation. (Full env→header propagation is a remaining Phase 2 item.)
   */
  runId?: string | null;
}

export function generatePortalApiKey(): { key: string; hash: string; preview: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const key = `${PORTAL_KEY_PREFIX}${raw}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const preview = `${key.slice(0, 12)}…${key.slice(-4)}`;
  return { key, hash, preview };
}

export function hashPortalApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validate a bearer token against the portal_api_keys table and return the
 * authenticated portal context (userId + client + scopes).
 */
export async function resolvePortalApiKey(rawKey: string): Promise<PortalMcpContext | null> {
  if (!rawKey.startsWith(PORTAL_KEY_PREFIX)) return null;

  const hash = hashPortalApiKey(rawKey);
  const [record] = await db
    .select()
    .from(portalApiKeys)
    .where(and(eq(portalApiKeys.keyHash, hash), eq(portalApiKeys.active, true)))
    .limit(1);

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, record.clientId))
    .limit(1);

  if (!client) return null;

  // Fire-and-forget usage tracking
  db.update(portalApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(portalApiKeys.id, record.id))
    .then(() => {})
    .catch(() => {});

  return {
    userId: record.userId,
    client,
    scopes: record.scopes ?? [],
    keyId: record.id,
    // Portal API keys are not audience-bound — unrestricted.
    resource: null,
  };
}

/**
 * Validate an OAuth-issued bearer token (`sd_oauth_…`) against the
 * `oauth_access_tokens` table. Same shape as `resolvePortalApiKey` so callers
 * can treat both auth methods identically downstream.
 */
export async function resolveOAuthToken(rawToken: string): Promise<PortalMcpContext | null> {
  if (!rawToken.startsWith(OAUTH_TOKEN_PREFIX)) return null;

  const hash = hashPortalApiKey(rawToken);
  const [record] = await db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.tokenHash, hash))
    .limit(1);

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, record.clientId))
    .limit(1);
  if (!client) return null;

  db.update(oauthAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthAccessTokens.id, record.id))
    .then(() => {})
    .catch(() => {});

  return {
    userId: record.userId,
    client,
    scopes: record.scopes ?? [],
    keyId: record.id,
    // RFC 8707 audience binding (e.g. the MCP server URL), or null = unrestricted.
    resource: record.resource ?? null,
  };
}

/**
 * Extract and validate a bearer token from a Request's Authorization header.
 */
export async function resolvePortalFromRequest(req: Request): Promise<PortalMcpContext | null> {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  return resolvePortalFromAuthHeader(auth);
}

/**
 * Same as `resolvePortalFromRequest` but pulls the Authorization header from
 * Next.js's `next/headers` runtime context. Lets centralised helpers (e.g.
 * `authorizePortal`) accept bearer tokens without each route having to thread
 * a `Request` through. Safe to call from any Server Component / route handler
 * / Server Action — bails (returns null) outside a request context.
 */
export async function resolvePortalFromCurrentRequest(): Promise<PortalMcpContext | null> {
  try {
    // Dynamic import keeps this file usable from non-Next contexts (e.g.
    // standalone scripts) — `next/headers` throws at import time outside Next.
    const { headers } = await import('next/headers');
    const h = await headers();
    const auth = h.get('authorization') ?? h.get('Authorization');
    return resolvePortalFromAuthHeader(auth);
  } catch {
    return null;
  }
}

async function resolvePortalFromAuthHeader(
  authHeader: string | null,
): Promise<PortalMcpContext | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (token.startsWith(OAUTH_TOKEN_PREFIX)) return resolveOAuthToken(token);
  return resolvePortalApiKey(token);
}

/**
 * Check whether a granted scope list satisfies a required scope.
 * Scopes look like "projects:read", "tickets:write", "*", or "projects:*".
 */
export function hasScope(granted: string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [resource] = required.split(':');
  if (granted.includes(`${resource}:*`)) return true;
  return false;
}
