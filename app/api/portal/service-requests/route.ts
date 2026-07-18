import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services, serviceRequests } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export const runtime = 'nodejs';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function GET() {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({
      id: serviceRequests.id,
      serviceId: serviceRequests.serviceId,
      serviceName: services.name,
      status: serviceRequests.status,
      answers: serviceRequests.answers,
      message: serviceRequests.message,
      createdAt: serviceRequests.createdAt,
    })
    .from(serviceRequests)
    .innerJoin(services, eq(services.id, serviceRequests.serviceId))
    .where(eq(serviceRequests.clientId, client.id))
    .orderBy(desc(serviceRequests.createdAt));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { serviceId, answers, message } = body;

  if (!serviceId) return NextResponse.json({ success: false, message: 'serviceId is required' }, { status: 400 });

  const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!svc || !svc.active) return NextResponse.json({ success: false, message: 'Service not available' }, { status: 404 });

  const [request] = await db.insert(serviceRequests).values({
    serviceId,
    clientId: client.id,
    status: 'pending',
    answers: answers ?? null,
    message: message ?? null,
  }).returning();

  return NextResponse.json({ success: true, data: request });
}
