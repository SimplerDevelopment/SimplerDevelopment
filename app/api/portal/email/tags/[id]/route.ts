import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSubscriberTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  await db.delete(emailSubscriberTags)
    .where(and(eq(emailSubscriberTags.id, parseInt(id, 10)), eq(emailSubscriberTags.clientId, client.id)));

  return NextResponse.json({ success: true });
}
