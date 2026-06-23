import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serviceRequests, services, clients, users } from '@/lib/db/schema';
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
    .update(serviceRequests)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(serviceRequests.id, requestId))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Return enriched row
  const [enriched] = await db
    .select({
      id: serviceRequests.id,
      status: serviceRequests.status,
      answers: serviceRequests.answers,
      message: serviceRequests.message,
      adminNotes: serviceRequests.adminNotes,
      createdAt: serviceRequests.createdAt,
      updatedAt: serviceRequests.updatedAt,
      serviceId: services.id,
      serviceName: services.name,
      serviceCategory: services.category,
      clientId: clients.id,
      clientCompany: clients.company,
      clientUserId: users.id,
      clientUserName: users.name,
      clientUserEmail: users.email,
    })
    .from(serviceRequests)
    .innerJoin(services, eq(services.id, serviceRequests.serviceId))
    .innerJoin(clients, eq(clients.id, serviceRequests.clientId))
    .innerJoin(users, eq(users.id, clients.userId))
    .where(eq(serviceRequests.id, requestId))
    .limit(1);

  return NextResponse.json({ success: true, data: enriched });
}
