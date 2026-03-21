import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, clients, users, kanbanColumns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      startDate: projects.startDate,
      dueDate: projects.dueDate,
      createdAt: projects.createdAt,
      clientId: clients.id,
      company: clients.company,
      clientName: users.name,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(projects.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name || !body.clientId) {
    return NextResponse.json({ success: false, message: 'name and clientId are required' }, { status: 400 });
  }

  const userId = parseInt(session.user!.id!, 10);
  const [project] = await db.insert(projects).values({
    name: body.name,
    description: body.description ?? null,
    clientId: body.clientId,
    status: body.status ?? 'active',
    startDate: body.startDate ? new Date(body.startDate) : null,
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    createdBy: userId,
  }).returning();

  // Create default Kanban columns
  const defaultColumns = ['To Do', 'In Progress', 'Review', 'Done'];
  await Promise.all(
    defaultColumns.map((name, order) =>
      db.insert(kanbanColumns).values({ projectId: project.id, name, order })
    )
  );

  return NextResponse.json({ success: true, data: project });
}
