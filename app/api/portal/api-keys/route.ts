import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { portalApiKeys } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient, getPortalClientForCredentials, getPortalClientsWithRoles } from '@/lib/portal-client';
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
      requireCmsApproval: portalApiKeys.requireCmsApproval,
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
  // Impersonation-free: a key is a durable USER credential, and the implicit
  // default tenant must obey the same membership rule the explicit
  // `body.clientIds` path enforces below — before this, an impersonating staff
  // user minted a full-scope key against the impersonated tenant.
  const client = await getPortalClientForCredentials(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name: string = (body.name ?? '').trim();
  const scopes: string[] = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : DEFAULT_SCOPES;
  const expiresAt: Date | null = body.expiresAt ? new Date(body.expiresAt) : null;
  // Default to requiring approval; caller must explicitly pass false to opt out.
  const requireCmsApproval = body.requireCmsApproval !== false;

  if (!name) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  // A key belongs to the USER and may cover several of their companies; each MCP
  // call then names the one it acts on. Verify every id against real access —
  // the request body is not evidence of membership. Omitted = this company only.
  let clientIds: number[] = [client.id];
  if (Array.isArray(body.clientIds) && body.clientIds.length > 0) {
    const requested = [...new Set(body.clientIds.map((v: unknown) => parseInt(String(v), 10)))] as number[];
    if (requested.some((n) => !Number.isFinite(n))) {
      return NextResponse.json({ success: false, message: 'clientIds must be numbers' }, { status: 400 });
    }
    const accessible = new Set((await getPortalClientsWithRoles(userId)).map((c) => c.id));
    const forbidden = requested.filter((n) => !accessible.has(n));
    if (forbidden.length > 0) {
      return NextResponse.json(
        { success: false, message: `No access to client(s): ${forbidden.join(', ')}` },
        { status: 403 },
      );
    }
    clientIds = requested;
  }
  // The default must live inside the granted set, or a call that omits clientId
  // would resolve to a company the key was never granted.
  const defaultClientId = clientIds.includes(client.id) ? client.id : clientIds[0];

  const { key, hash, preview } = generatePortalApiKey();

  const [record] = await db.insert(portalApiKeys).values({
    clientId: defaultClientId,
    clientIds,
    userId,
    name,
    keyHash: hash,
    keyPreview: preview,
    scopes,
    requireCmsApproval,
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
