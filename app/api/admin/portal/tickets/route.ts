import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { supportTickets, clients, users } from '@/lib/db/schema';
import { eq, desc, lt, and, or } from 'drizzle-orm';
import { revalidateAdminDashboard } from '@/lib/admin/dashboard-cache';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

// E2 perf — admin/tickets previously returned every ticket in one shot,
// ordered globally by updatedAt. With the new `support_tickets_updated_idx`
// the orderBy + limit is an index-only walk. Pagination via keyset cursor
// keeps later pages flat as the table grows.
const PAGE_SIZE = 100;

export async function GET(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const cursorUpdatedAt = url.searchParams.get('cursorUpdatedAt');
  const cursorId = url.searchParams.get('cursorId');
  const rawLimit = Number(url.searchParams.get('limit') ?? String(PAGE_SIZE));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : PAGE_SIZE, 1), 200);

  const whereExpr = cursorUpdatedAt && cursorId
    ? or(
        lt(supportTickets.updatedAt, new Date(cursorUpdatedAt)),
        and(eq(supportTickets.updatedAt, new Date(cursorUpdatedAt)), lt(supportTickets.id, Number(cursorId))),
      )
    : undefined;

  const rows = await db
    .select({
      id: supportTickets.id,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      company: clients.company,
      clientName: users.name,
    })
    .from(supportTickets)
    .innerJoin(clients, eq(supportTickets.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(whereExpr)
    .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const last = data[data.length - 1];
  const nextCursor = hasMore && last
    ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
    : null;

  return NextResponse.json({ success: true, data, nextCursor });
}

export async function PATCH(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id, status, assignedTo, priority } = body;

  const [ticket] = await db.update(supportTickets).set({
    ...(status && { status }),
    ...(assignedTo !== undefined && { assignedTo }),
    ...(priority && { priority }),
    ...(status === 'resolved' && { resolvedAt: new Date() }),
    updatedAt: new Date(),
  }).where(eq(supportTickets.id, id)).returning();

  // E2 — open-ticket count + recent-tickets list on the admin dashboard
  // both depend on status; invalidate the cached fan-out.
  if (status) revalidateAdminDashboard();

  return NextResponse.json({ success: true, data: ticket });
}
