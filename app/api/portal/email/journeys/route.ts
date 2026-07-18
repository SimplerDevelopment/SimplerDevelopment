import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailJourneys } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function GET() {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const journeys = await db
    .select()
    .from(emailJourneys)
    .where(eq(emailJourneys.clientId, client.id))
    .orderBy(sql`${emailJourneys.createdAt} desc`);

  return NextResponse.json({ success: true, data: journeys });
}

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const session = await auth();
  const userId = session?.user?.id ? parseInt(session.user.id, 10) : null;

  const body = await req.json();
  const { name, description, status, triggerType, triggerConfig } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const [journey] = await db
    .insert(emailJourneys)
    .values({
      clientId: client.id,
      name: name.trim(),
      description: description ?? null,
      status: status ?? 'draft',
      triggerType: triggerType ?? 'manual',
      triggerConfig: triggerConfig ?? null,
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: journey }, { status: 201 });
}
