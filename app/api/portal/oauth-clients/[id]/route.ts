import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthClients } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { generateClientSecret } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolve the authenticated portal user's active tenant. Mutations below are
 *  double-scoped: by row `id` AND by `ownerClientId = tenant`, so a user can
 *  never rotate or delete an OAuth client another tenant (or admin) owns. */
async function requirePortalTenant() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  if (!Number.isFinite(userId)) return null;
  const client = await getPortalClient(userId);
  if (!client) return null;
  return { userId, clientId: client.id };
}

/** PATCH /api/portal/oauth-clients/[id] — `action: "rotate_secret"` mints a new
 *  secret (invalidating the old one immediately) for a confidential client the
 *  caller's tenant owns. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requirePortalTenant();
  if (!tenant) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';

  if (action !== 'rotate_secret') {
    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  }

  // Tenant-scoped fetch: only a row this tenant owns can be found at all.
  const [existing] = await db
    .select()
    .from(oauthClients)
    .where(and(eq(oauthClients.id, id), eq(oauthClients.ownerClientId, tenant.clientId)))
    .limit(1);
  if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (existing.tokenEndpointAuthMethod === 'none') {
    return NextResponse.json(
      { success: false, message: 'Cannot rotate a secret on a public/PKCE client' },
      { status: 400 },
    );
  }

  const { secret, hash, preview } = generateClientSecret();
  const [updated] = await db
    .update(oauthClients)
    .set({
      clientSecretHash: hash,
      clientSecretPreview: preview,
      clientSecretRotatedAt: new Date(),
    })
    .where(and(eq(oauthClients.id, id), eq(oauthClients.ownerClientId, tenant.clientId)))
    .returning();

  return NextResponse.json({
    success: true,
    data: {
      client_id: updated.clientId,
      client_secret: secret, // shown exactly once
      client_secret_preview: updated.clientSecretPreview,
      client_secret_rotated_at: updated.clientSecretRotatedAt,
    },
  });
}

/** DELETE /api/portal/oauth-clients/[id] — removes a confidential client the
 *  caller's tenant owns. Cascades to its authorization codes and access tokens
 *  via the FK `on delete cascade`. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requirePortalTenant();
  if (!tenant) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const deleted = await db
    .delete(oauthClients)
    .where(and(eq(oauthClients.id, id), eq(oauthClients.ownerClientId, tenant.clientId)))
    .returning({ id: oauthClients.id });
  if (deleted.length === 0) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
