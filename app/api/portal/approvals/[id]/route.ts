import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mcpPendingChanges, portalApiKeys, users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Bearer-aware (mobile) + NextAuth (web). Read access = any member.
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

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
