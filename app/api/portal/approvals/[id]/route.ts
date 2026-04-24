import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mcpPendingChanges, portalApiKeys, users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const { id } = await params;
  const changeId = parseInt(id, 10);

  const [row] = await db
    .select({
      change: mcpPendingChanges,
      keyName: portalApiKeys.name,
      submitterName: users.name,
      submitterEmail: users.email,
    })
    .from(mcpPendingChanges)
    .leftJoin(portalApiKeys, eq(portalApiKeys.id, mcpPendingChanges.keyId))
    .leftJoin(users, eq(users.id, mcpPendingChanges.userId))
    .where(and(eq(mcpPendingChanges.id, changeId), eq(mcpPendingChanges.clientId, client.id)))
    .limit(1);

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}
