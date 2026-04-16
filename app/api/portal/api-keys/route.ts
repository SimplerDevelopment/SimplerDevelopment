import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { portalApiKeys } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { generatePortalApiKey } from '@/lib/mcp-auth';

const DEFAULT_SCOPES = ['*'];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const keys = await db
    .select({
      id: portalApiKeys.id,
      name: portalApiKeys.name,
      keyPreview: portalApiKeys.keyPreview,
      scopes: portalApiKeys.scopes,
      active: portalApiKeys.active,
      lastUsedAt: portalApiKeys.lastUsedAt,
      expiresAt: portalApiKeys.expiresAt,
      revokedAt: portalApiKeys.revokedAt,
      createdAt: portalApiKeys.createdAt,
    })
    .from(portalApiKeys)
    .where(eq(portalApiKeys.clientId, client.id))
    .orderBy(desc(portalApiKeys.createdAt));

  return NextResponse.json({ success: true, data: keys });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name: string = (body.name ?? '').trim();
  const scopes: string[] = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : DEFAULT_SCOPES;
  const expiresAt: Date | null = body.expiresAt ? new Date(body.expiresAt) : null;

  if (!name) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const { key, hash, preview } = generatePortalApiKey();

  const [record] = await db.insert(portalApiKeys).values({
    clientId: client.id,
    userId,
    name,
    keyHash: hash,
    keyPreview: preview,
    scopes,
    expiresAt: expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt : null,
  }).returning();

  return NextResponse.json({
    success: true,
    // `key` is only returned once — the caller must save it.
    data: {
      id: record.id,
      name: record.name,
      key,
      keyPreview: record.keyPreview,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    },
  }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get('id') ?? '', 10);
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });

  await db.update(portalApiKeys)
    .set({ active: false, revokedAt: new Date() })
    .where(and(eq(portalApiKeys.id, id), eq(portalApiKeys.clientId, client.id)));

  return NextResponse.json({ success: true });
}
