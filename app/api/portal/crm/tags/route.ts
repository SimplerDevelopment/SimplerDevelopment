import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmTags } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const tags = await db
    .select()
    .from(crmTags)
    .where(eq(crmTags.clientId, client.id))
    .orderBy(asc(crmTags.name));

  return NextResponse.json({ success: true, data: tags });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Tag name is required' },
      { status: 400 }
    );
  }

  const [tag] = await db
    .insert(crmTags)
    .values({
      clientId: client.id,
      name: body.name.trim(),
      color: body.color || '#6366f1',
    })
    .returning();

  return NextResponse.json({ success: true, data: tag }, { status: 201 });
}
