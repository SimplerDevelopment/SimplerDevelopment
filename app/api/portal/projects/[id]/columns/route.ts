import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, projects, kanbanColumns } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';
  const projectId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);

  if (!isStaff) {
    const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    if (!client) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.clientId, client.id))).limit(1);
    if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const data = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, projectId)).orderBy(kanbanColumns.order);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const body = await req.json();

  const existing = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, projectId));
  const [col] = await db.insert(kanbanColumns).values({
    projectId,
    name: body.name,
    color: body.color ?? null,
    order: existing.length,
  }).returning();

  return NextResponse.json({ success: true, data: col });
}
