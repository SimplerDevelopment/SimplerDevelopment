import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serviceRequests, services, clients, users } from '@/lib/db/schema';
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
    .orderBy(desc(serviceRequests.createdAt));

  return NextResponse.json({ success: true, data: rows });
}
