import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { emitEvent } from '@/lib/automation';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const all = await db.select().from(projects).where(eq(projects.clientId, client.id)).orderBy(projects.createdAt);

  return NextResponse.json({
    success: true,
    data: {
      agency: all.filter(p => !p.isPrivate),
      private: all.filter(p => p.isPrivate),
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const { name, description } = body;

  if (!name) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const [project] = await db.insert(projects).values({
    name,
    description: description || null,
    clientId: client.id,
    status: 'active',
    isPrivate: true,
    createdBy: parseInt(session.user.id, 10),
  }).returning();

  emitEvent('project.created', client.id, userId, { id: project.id, name: project.name, status: project.status });

  return NextResponse.json({ success: true, data: project }, { status: 201 });
}
