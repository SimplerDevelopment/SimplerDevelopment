import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientMembers, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const members = await db
    .select({ id: users.id, name: users.name })
    .from(clientMembers)
    .innerJoin(users, eq(clientMembers.userId, users.id))
    .where(eq(clientMembers.clientId, client.id));

  return NextResponse.json({ success: true, data: members });
}
