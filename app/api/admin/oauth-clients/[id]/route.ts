import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthClients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateClientSecret } from '@/lib/oauth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/** PATCH /api/admin/oauth-clients/[id] — currently the only mutation is
 *  `action: "rotate_secret"`, which mints a new secret (invalidating the old
 *  one immediately) for confidential clients. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'rotate_secret') {
    const [existing] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
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
      .where(eq(oauthClients.id, id))
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

  return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
}

/** DELETE /api/admin/oauth-clients/[id] — removes the client. Cascades to its
 *  authorization codes and access tokens via the FK `on delete cascade`. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const deleted = await db.delete(oauthClients).where(eq(oauthClients.id, id)).returning({ id: oauthClients.id });
  if (deleted.length === 0) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
