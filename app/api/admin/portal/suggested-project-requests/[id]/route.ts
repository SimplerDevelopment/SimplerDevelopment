import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { suggestedProjectRequests, suggestedProjects, clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const requestId = parseInt(id, 10);
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) allowed.status = body.status;
  if (body.adminNotes !== undefined) allowed.adminNotes = body.adminNotes;

  const [row] = await db
    .update(suggestedProjectRequests)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(suggestedProjectRequests.id, requestId))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [enriched] = await db
    .select({
      id: suggestedProjectRequests.id,
      status: suggestedProjectRequests.status,
      answers: suggestedProjectRequests.answers,
      message: suggestedProjectRequests.message,
      adminNotes: suggestedProjectRequests.adminNotes,
      createdAt: suggestedProjectRequests.createdAt,
      updatedAt: suggestedProjectRequests.updatedAt,
      projectId: suggestedProjects.id,
      projectTitle: suggestedProjects.title,
      projectCategory: suggestedProjects.category,
      clientId: clients.id,
      clientCompany: clients.company,
      clientUserId: users.id,
      clientUserName: users.name,
      clientUserEmail: users.email,
    })
    .from(suggestedProjectRequests)
    .innerJoin(suggestedProjects, eq(suggestedProjects.id, suggestedProjectRequests.suggestedProjectId))
    .innerJoin(clients, eq(clients.id, suggestedProjectRequests.clientId))
    .innerJoin(users, eq(users.id, clients.userId))
    .where(eq(suggestedProjectRequests.id, requestId))
    .limit(1);

  return NextResponse.json({ success: true, data: enriched });
}
