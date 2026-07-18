import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hostedSites, clients, users } from '@/lib/db/schema';
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
      id: hostedSites.id,
      clientId: hostedSites.clientId,
      name: hostedSites.name,
      customDomain: hostedSites.customDomain,
      railwayProjectId: hostedSites.railwayProjectId,
      railwayServiceId: hostedSites.railwayServiceId,
      railwayEnvironmentId: hostedSites.railwayEnvironmentId,
      railwayDomain: hostedSites.railwayDomain,
      status: hostedSites.status,
      plan: hostedSites.plan,
      renewalDate: hostedSites.renewalDate,
      notes: hostedSites.notes,
      dnsInstructions: hostedSites.dnsInstructions,
      createdAt: hostedSites.createdAt,
      updatedAt: hostedSites.updatedAt,
      clientCompany: clients.company,
      clientUserName: users.name,
      clientUserEmail: users.email,
    })
    .from(hostedSites)
    .innerJoin(clients, eq(hostedSites.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(hostedSites.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    clientId, name, customDomain, railwayProjectId, railwayServiceId,
    railwayEnvironmentId, railwayDomain, status, plan, renewalDate, notes, dnsInstructions,
  } = body;

  if (!clientId || !name) {
    return NextResponse.json({ success: false, message: 'clientId and name are required' }, { status: 400 });
  }

  const userId = parseInt(session.user!.id!, 10);
  const [site] = await db.insert(hostedSites).values({
    clientId: parseInt(clientId),
    name,
    customDomain: customDomain || null,
    railwayProjectId: railwayProjectId || null,
    railwayServiceId: railwayServiceId || null,
    railwayEnvironmentId: railwayEnvironmentId || null,
    railwayDomain: railwayDomain || null,
    status: status || 'provisioning',
    plan: plan || 'starter',
    renewalDate: renewalDate ? new Date(renewalDate) : null,
    notes: notes || null,
    dnsInstructions: dnsInstructions || [],
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: site });
}
