import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { suggestedProjectRequests, suggestedProjects, clients, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const rows = await db
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
    .orderBy(desc(suggestedProjectRequests.createdAt));

  return NextResponse.json({ success: true, data: rows });
}
