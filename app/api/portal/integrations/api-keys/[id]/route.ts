/**
 * BYOK provider key — patch (label) + delete (rotate).
 *
 * Rotation is implemented as DELETE + POST on the parent collection — this
 * route does not accept a new ciphertext via PATCH because raw keys should
 * only travel the create endpoint (which validates shape).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientApiKeys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const label: string | null | undefined =
    body.label === null
      ? null
      : typeof body.label === 'string'
        ? body.label.trim().slice(0, 100) || null
        : undefined;

  if (label === undefined) {
    return NextResponse.json({ success: false, message: 'Nothing to update.' }, { status: 400 });
  }

  const [updated] = await db
    .update(clientApiKeys)
    .set({ label, updatedAt: new Date() })
    .where(and(eq(clientApiKeys.id, id), eq(clientApiKeys.clientId, client.id)))
    .returning({
      id: clientApiKeys.id,
      provider: clientApiKeys.provider,
      label: clientApiKeys.label,
    });

  if (!updated) return NextResponse.json({ success: false, message: 'Key not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const result = await db
    .delete(clientApiKeys)
    .where(and(eq(clientApiKeys.id, id), eq(clientApiKeys.clientId, client.id)))
    .returning({ id: clientApiKeys.id });

  if (result.length === 0) return NextResponse.json({ success: false, message: 'Key not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
