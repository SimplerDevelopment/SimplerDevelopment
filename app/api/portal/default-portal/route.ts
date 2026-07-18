import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClients } from '@/lib/portal-client';

/**
 * GET: returns the user's default client ID.
 * POST: sets the user's default portal (client ID).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const [user] = await db
    .select({ defaultClientId: users.defaultClientId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return NextResponse.json({ defaultClientId: user?.defaultClientId || null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { clientId } = await req.json();
  if (!clientId || typeof clientId !== 'number') {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const userId = parseInt(session.user.id, 10);

  // Verify the user has access to this client
  const allClients = await getPortalClients(userId);
  if (!allClients.find(c => c.id === clientId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  await db.update(users).set({
    defaultClientId: clientId,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  return NextResponse.json({ success: true, defaultClientId: clientId });
}
