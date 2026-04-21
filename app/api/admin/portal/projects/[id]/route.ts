import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, kanbanColumns, kanbanCards, kanbanCardAssignees, kanbanCardWatchers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const columns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, projectId)).orderBy(kanbanColumns.order);
  const cards = await db.select().from(kanbanCards).where(eq(kanbanCards.projectId, projectId)).orderBy(kanbanCards.order);

  return NextResponse.json({ success: true, data: { project, columns, cards } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const body = await req.json();

  const [project] = await db.update(projects).set({
    name: body.name,
    description: body.description,
    status: body.status,
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId)).returning();

  return NextResponse.json({ success: true, data: project });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Create a Kanban card
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const body = await req.json();
  if (!body.columnId || !body.title) {
    return NextResponse.json({ success: false, message: 'columnId and title required' }, { status: 400 });
  }

  const existing = await db.select().from(kanbanCards).where(eq(kanbanCards.columnId, body.columnId));
  const [card] = await db.insert(kanbanCards).values({
    columnId: body.columnId,
    projectId,
    title: body.title,
    description: body.description ?? null,
    priority: body.priority ?? 'medium',
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    order: existing.length,
  }).returning();

  if (typeof body.assignedTo === 'number') {
    await db.insert(kanbanCardAssignees).values({ cardId: card.id, userId: body.assignedTo }).onConflictDoNothing();
    await db.insert(kanbanCardWatchers).values({ cardId: card.id, userId: body.assignedTo }).onConflictDoNothing();
  }

  return NextResponse.json({ success: true, data: card });
}
