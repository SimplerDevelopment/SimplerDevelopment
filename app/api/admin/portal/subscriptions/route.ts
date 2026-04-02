import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, services, clients, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await db
    .select({
      id: clientServices.id,
      clientName: users.name,
      company: clients.company,
      serviceName: services.name,
      serviceCategory: services.category,
      price: services.price,
      billingCycle: services.billingCycle,
      status: clientServices.status,
      renewalDate: clientServices.renewalDate,
      createdAt: clientServices.createdAt,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .innerJoin(services, eq(clientServices.serviceId, services.id))
    .orderBy(desc(clientServices.createdAt));

  return NextResponse.json({ success: true, data });
}
