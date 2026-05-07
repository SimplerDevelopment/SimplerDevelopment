/**
 * POST /api/realtime/token
 *
 * Issues a short-lived JWT used by the browser realtime client to connect
 * to the Yjs WebSocket server. The realtime-server validates this token in
 * `packages/realtime-server/src/auth.ts`.
 *
 * Body: { entityType: 'post' | 'deck' | 'email', entityId: string }
 * Returns: { success: true, data: { token, wsUrl, expiresAt } }
 */

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  posts,
  pitchDecks,
  emailCampaigns,
  clientWebsites,
  users,
} from '@/lib/db/schema';
import { getPortalClient, getPortalClients, getPortalRole } from '@/lib/portal-client';
import { docKey, type EntityType } from '@/lib/realtime/doc-model';

/**
 * Map a portal role to the realtime collab scope. `viewer` is the only
 * read-only role today; everyone else (member / admin / owner) edits.
 * The realtime-server enforces the scope on /internal/apply and on
 * peer-to-peer Y.update broadcasts.
 */
function scopeForRole(role: 'owner' | 'admin' | 'member' | 'viewer' | null): 'read' | 'write' {
  return role === 'viewer' ? 'read' : 'write';
}

const TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes
const DEFAULT_WS_URL = 'ws://localhost:3030';

/**
 * Deterministic hex color for a userId — gives every user a stable cursor
 * color across sessions without an extra DB column.
 */
function colorFromUserId(userId: number | string): string {
  const palette = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e',
  ];
  const n = typeof userId === 'string' ? parseInt(userId, 10) : userId;
  if (Number.isNaN(n)) return palette[0];
  return palette[Math.abs(n) % palette.length];
}

interface TokenRequestBody {
  entityType?: string;
  entityId?: string | number;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        message: 'Realtime not configured (REALTIME_JWT_SECRET missing)',
      },
      { status: 500 }
    );
  }

  let body: TokenRequestBody;
  try {
    body = (await req.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const entityType = body.entityType;
  const entityIdRaw = body.entityId;

  if (
    entityType !== 'post' &&
    entityType !== 'deck' &&
    entityType !== 'email'
  ) {
    return NextResponse.json(
      { success: false, message: 'Invalid entityType' },
      { status: 400 }
    );
  }

  if (entityIdRaw === undefined || entityIdRaw === null || entityIdRaw === '') {
    return NextResponse.json(
      { success: false, message: 'Missing entityId' },
      { status: 400 }
    );
  }

  const entityId = String(entityIdRaw);
  const userId = parseInt(session.user.id, 10);

  // Resolve clientId by checking the user's access to the underlying entity.
  // Posts: posts.websiteId → clientWebsites.clientId, then verify user has access.
  // Decks: pitchDecks.clientId, verify user has access.
  // Emails: emailCampaigns.clientId, verify user has access.
  const clientId = await resolveEntityClient(
    entityType as EntityType,
    entityId,
    userId
  );

  if (clientId === null) {
    return NextResponse.json(
      { success: false, message: 'Not found or access denied' },
      { status: 404 }
    );
  }

  // Pull display name for awareness payload. Avatar comes from the session
  // (NextAuth) since the users table has no image column.
  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const role = await getPortalRole(userId, clientId);
  const scope = scopeForRole(role);

  const dk = docKey(entityType as EntityType, entityId);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;

  const token = jwt.sign(
    {
      sub: String(userId),
      name: user?.name ?? session.user.name ?? 'User',
      avatar: (session.user as { image?: string | null }).image ?? null,
      color: colorFromUserId(userId),
      clientId,
      docKey: dk,
      scope,
      iat: now,
      exp,
    },
    secret
  );

  const wsUrl = process.env.NEXT_PUBLIC_REALTIME_URL || DEFAULT_WS_URL;

  return NextResponse.json({
    success: true,
    data: {
      token,
      wsUrl,
      expiresAt: exp * 1000,
      docKey: dk,
      scope,
    },
  });
}

/**
 * Returns the `clientId` for the given entity if the calling user has access,
 * or `null` if the entity is missing / the user has no access.
 */
async function resolveEntityClient(
  entityType: EntityType,
  entityId: string,
  userId: number
): Promise<number | null> {
  const numericId = parseInt(entityId, 10);
  if (Number.isNaN(numericId)) return null;

  if (entityType === 'post') {
    // posts.websiteId → clientWebsites.clientId
    const [row] = await db
      .select({
        postId: posts.id,
        websiteId: posts.websiteId,
        clientId: clientWebsites.clientId,
      })
      .from(posts)
      .leftJoin(clientWebsites, eq(clientWebsites.id, posts.websiteId))
      .where(eq(posts.id, numericId))
      .limit(1);

    if (!row || row.clientId === null) return null;
    if (!(await userHasClientAccess(userId, row.clientId))) return null;
    return row.clientId;
  }

  if (entityType === 'deck') {
    const [deck] = await db
      .select({ clientId: pitchDecks.clientId })
      .from(pitchDecks)
      .where(eq(pitchDecks.id, numericId))
      .limit(1);
    if (!deck) return null;
    if (!(await userHasClientAccess(userId, deck.clientId))) return null;
    return deck.clientId;
  }

  if (entityType === 'email') {
    const [campaign] = await db
      .select({ clientId: emailCampaigns.clientId })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, numericId))
      .limit(1);
    if (!campaign || campaign.clientId === null) return null;
    if (!(await userHasClientAccess(userId, campaign.clientId))) return null;
    return campaign.clientId;
  }

  return null;
}

async function userHasClientAccess(
  userId: number,
  clientId: number
): Promise<boolean> {
  // Cheap path: active client matches.
  const active = await getPortalClient(userId, clientId);
  if (active && active.id === clientId) return true;
  // Fallback: list all clients for this user.
  const all = await getPortalClients(userId);
  return all.some((c) => c.id === clientId);
}

// Silence unused-import warning when we have the helper above; the `and`
// import is reserved for future predicate composition.
void and;
