import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientMembers, clientServices, services, clientWebsites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient, resolveClientSite, resolvePortalSite, getPortalRole } from '@/lib/portal-client';
import { resolvePortalFromCurrentRequest, hasScope } from '@/lib/mcp-auth';
import { requiredScopeFor } from '@/lib/oauth/required-scope';
import { FlagKey, hasFlag } from '@/lib/feature-flags';
import { NextResponse } from 'next/server';

// OAuth scope enforcement (AUTH79-011): bearer tokens (sd_oauth_/sd_mcp_) carry
// the consented `scopes`; session logins don't (the user IS the user). Scope is
// enforced ONLY on the bearer path. The required scope is derived from the
// (requireService, action) each route already declares — see
// lib/oauth/required-scope.ts.

export type PortalAction = 'read' | 'write' | 'admin' | 'owner';

export type PortalRole = 'owner' | 'admin' | 'member' | 'viewer';

// Exported so the MCP surface enforces the SAME ladder as the REST routes rather
// than growing a second, drifting copy — see lib/mcp/client-scope.ts#roleDenial.
export const ROLE_LEVELS: Record<PortalRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export const ACTION_REQUIRED_LEVEL: Record<PortalAction, number> = {
  read: 0,    // viewer+
  write: 1,   // member+
  admin: 2,   // admin+
  owner: 3,   // owner only
};

interface AuthorizeResult {
  client: typeof clients.$inferSelect;
  userId: number;
  role: PortalRole;
}

interface AuthorizeError {
  response: NextResponse;
}

/**
 * Role/action gate shared by authorizePortal and authorizePortalSite. Returns an
 * AuthorizeError when the role is insufficient, or null when allowed.
 *
 * When `observe` is set (the AUTH79-020 rollout on newly-guarded routes) an
 * insufficient role is LOGGED but ALLOWED until AUTH_ROLE_ENFORCE=1 — so we can
 * watch real multi-member traffic before turning enforcement on for routes that
 * never had a role gate. Routes that already enforced roles (the original
 * authorizePortal callers) pass observe=false and keep hard-enforcing.
 */
function roleGate(
  role: PortalRole,
  action: PortalAction,
  observe: boolean,
  ctx: { clientId: number; userId: number },
): AuthorizeError | null {
  if (ROLE_LEVELS[role] >= ACTION_REQUIRED_LEVEL[action]) return null;
  if (observe && process.env.AUTH_ROLE_ENFORCE !== '1') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'portal.role.insufficient',
        role,
        action,
        clientId: ctx.clientId,
        userId: ctx.userId,
        enforced: false,
      }),
    );
    return null;
  }
  const actionLabels: Record<PortalAction, string> = {
    read: 'view this resource',
    write: 'create or edit content',
    admin: 'manage team or billing settings',
    owner: 'perform this action (owner only)',
  };
  return {
    response: NextResponse.json(
      {
        success: false,
        message: `Permission denied. Your role (${role}) cannot ${actionLabels[action]}.`,
      },
      { status: 403 },
    ),
  };
}

/**
 * Centralized portal authorization.
 *
 * @param opts.action - Required permission level (default: 'read')
 * @param opts.requireService - Service category that must be subscribed (or bundle)
 * @param opts.scope - Explicit OAuth scope this route requires (for routes with no
 *   requireService). When omitted, the scope is derived from requireService+action.
 * @param opts.observeRole - Log-only role enforcement (AUTH79-020 rollout): when
 *   true, an insufficient role is logged but allowed until AUTH_ROLE_ENFORCE=1.
 *   Set on newly-guarded routes; omit on routes that already enforced roles.
 * @param opts.requireFlag - Per-client beta gate (lib/feature-flags.ts). `client`
 *   is already the full clients row here, so this is a sync check with no
 *   extra query. Denied with a 403 `feature_not_enabled` envelope.
 */
export async function authorizePortal(opts?: {
  action?: PortalAction;
  requireService?: string;
  scope?: string;
  observeRole?: boolean;
  requireFlag?: FlagKey;
}): Promise<AuthorizeResult | AuthorizeError> {
  // ── Bearer-token path (mobile / API clients) ────────────────────────────
  // The mobile client sends `Authorization: Bearer sd_mcp_…` after a
  // successful /api/portal/auth/mobile-sign-in. Bearer tokens are bound to a
  // specific client at issuance time, so we skip the multi-tenant
  // `getPortalClient(userId)` lookup and use whichever client the key was
  // minted against — same shape the legacy session path returns.
  const bearer = await resolvePortalFromCurrentRequest();
  let userId: number;
  let client: typeof clients.$inferSelect;
  if (bearer) {
    userId = bearer.userId;
    client = bearer.client;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return { response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
    }
    userId = parseInt(session.user.id, 10);
    const resolved = await getPortalClient(userId);
    if (!resolved) {
      return { response: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
    }
    client = resolved;
  }

  // OAuth scope enforcement (AUTH79-011) — bearer tokens only. A session user has
  // no consented-scope restriction. Rollout is LOG-ONLY: we record would-be
  // denials against real sd_oauth_ traffic and only 403 once AUTH_SCOPE_ENFORCE=1.
  // Existing sd_mcp_ keys are minted with ['*'] so hasScope is always true for them.
  if (bearer) {
    const requiredScope = requiredScopeFor(opts);
    if (requiredScope && !hasScope(bearer.scopes, requiredScope)) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'oauth.scope.insufficient',
          keyId: bearer.keyId,
          required_scope: requiredScope,
          granted_scopes: bearer.scopes,
          clientId: client.id,
          userId,
          enforced: process.env.AUTH_SCOPE_ENFORCE === '1',
        }),
      );
      if (process.env.AUTH_SCOPE_ENFORCE === '1') {
        return {
          response: NextResponse.json(
            { success: false, error: 'insufficient_scope', required_scope: requiredScope },
            { status: 403 },
          ),
        };
      }
    }
  }

  // Resolve role + gate the action (log-only when observeRole is set).
  const role = await resolveRole(userId, client);
  const gate = roleGate(role, opts?.action ?? 'read', opts?.observeRole ?? false, {
    clientId: client.id,
    userId,
  });
  if (gate) return gate;

  // Per-client beta gate (PUX-135) — sync, `client` is already the full row.
  if (opts?.requireFlag && !hasFlag(client, opts.requireFlag)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: 'feature_not_enabled',
          message: 'This feature is not enabled for your account.',
          flag: opts.requireFlag,
        },
        { status: 403 },
      ),
    };
  }

  // Check service subscription
  if (opts?.requireService) {
    const hasAccess = await hasServiceAccess(client.id, opts.requireService);
    if (!hasAccess) {
      return {
        response: NextResponse.json({
          success: false,
          message: `This feature requires an active ${opts.requireService} subscription.`,
          requiresService: opts.requireService,
          upsellUrl: '/portal/services',
        }, { status: 403 }),
      };
    }
  }

  return { client, userId, role };
}

/**
 * Type guard to check if authorizePortal returned an error.
 */
export function isAuthError<T extends object>(result: T | AuthorizeError): result is AuthorizeError {
  return 'response' in result;
}

interface AuthorizeSiteResult {
  site: typeof clientWebsites.$inferSelect;
  userId: number;
  role: PortalRole;
}

/**
 * Site-scoped authorization for `app/api/portal/websites/[siteId]/**` routes.
 * Resolves the `[siteId]` with ownership (existing behavior, via resolveClientSite)
 * AND gates the caller's role (new — AUTH79-020). Session-only: these routes don't
 * accept bearer tokens. Role enforcement defaults to LOG-ONLY (observeRole) since
 * every caller is a newly-guarded route — flip AUTH_ROLE_ENFORCE=1 to enforce.
 * `requireFlag` (PUX-135) is a sync check against the owning client's row,
 * which `resolvePortalSite` already loads — no extra query.
 */
export async function authorizePortalSite(opts: {
  siteId: number;
  action?: PortalAction;
  observeRole?: boolean;
  requireFlag?: FlagKey;
}): Promise<AuthorizeSiteResult | AuthorizeError> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  const userId = parseInt(session.user.id, 10);

  // resolvePortalSite resolves the site across ALL of the user's clients (not just
  // the active one), so a cross-client deep-link still works. Role is checked
  // against the OWNING client, not the active one.
  const resolved = await resolvePortalSite(userId, opts.siteId);
  if (!resolved) {
    return { response: NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 }) };
  }
  const { site, client } = resolved;

  const role = await getPortalRole(userId, client.id);
  if (!role) {
    return { response: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
  }

  const gate = roleGate(role, opts.action ?? 'read', opts.observeRole ?? true, {
    clientId: client.id,
    userId,
  });
  if (gate) return gate;

  // Per-client beta gate (PUX-135) — `client` is already the full row.
  if (opts.requireFlag && !hasFlag(client, opts.requireFlag)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: 'feature_not_enabled',
          message: 'This feature is not enabled for your account.',
          flag: opts.requireFlag,
        },
        { status: 403 },
      ),
    };
  }

  return { site, userId, role };
}

/**
 * Resolve a user's site like `resolveClientSite`, but ALSO require the owning
 * client to have an active `store` subscription (bundle-aware via
 * `hasServiceAccess`). Returns null if the site isn't the user's OR the client
 * isn't store-entitled — so store sub-resource routes that swap
 * `resolveClientSite` → `resolveStoreSite` get a billing gate for free: an
 * unsubscribed client falls through the route's existing not-found path.
 * Closes the broad store-REST entitlement gap (distill finding #1, part 3).
 */
export async function resolveStoreSite(userId: number, siteId: number, preferredClientId?: number) {
  const site = await resolveClientSite(userId, siteId, preferredClientId);
  if (!site) return null;
  if (!(await hasServiceAccess(site.clientId, 'store'))) return null;
  return site;
}

/**
 * Resolve the user's role for a given client.
 */
async function resolveRole(userId: number, client: typeof clients.$inferSelect): Promise<PortalRole> {
  // Direct owner check
  if (client.userId === userId) return 'owner';

  // Team membership check
  const [membership] = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, userId)))
    .limit(1);

  return (membership?.role as PortalRole) ?? 'viewer';
}

/**
 * Check if a client has access to a service category.
 * Returns true if they have a direct subscription OR an all-in-one bundle.
 */
export async function hasServiceAccess(clientId: number, category: string): Promise<boolean> {
  const subscriptions = await db
    .select({ category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.clientId, clientId),
      eq(clientServices.status, 'active'),
    ));

  return subscriptions.some(s => serviceCategoryMatches(s.category, category));
}

/**
 * OBQA-021: 'booking' (the gate literal at every booking/gift-certificate
 * route and MCP tool) and 'bookings' (the billed catalog row from
 * seed-domain-modules) name the same module — a paying 'bookings' subscriber
 * must clear a `requireService: 'booking'` gate. Alias the pair here, where
 * every gate routes through, rather than flipping 42 call-site literals
 * (legacy dev seeds still mint the singular row).
 */
export function serviceCategoryMatches(subscribed: string, wanted: string): boolean {
  if (subscribed === 'bundle') return true;
  const norm = (c: string) => (c === 'booking' ? 'bookings' : c);
  return norm(subscribed) === norm(wanted);
}
