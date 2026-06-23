import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  crmDeals,
  crmContacts,
  crmCompanies,
  crmPipelines,
  crmPipelineStages,
  clients,
} from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireStaff()))
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = db
    .select({
      id: crmDeals.id,
      title: crmDeals.title,
      value: crmDeals.value,
      currency: crmDeals.currency,
      status: crmDeals.status,
      priority: crmDeals.priority,
      expectedCloseDate: crmDeals.expectedCloseDate,
      createdAt: crmDeals.createdAt,
      contactFirstName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      companyName: crmCompanies.name,
      stageName: crmPipelineStages.name,
      stageColor: crmPipelineStages.color,
      pipelineName: crmPipelines.name,
      clientCompany: clients.company,
      clientId: crmDeals.clientId,
    })
    .from(crmDeals)
    .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
    .innerJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .innerJoin(crmPipelines, eq(crmDeals.pipelineId, crmPipelines.id))
    .innerJoin(clients, eq(crmDeals.clientId, clients.id))
    .orderBy(desc(crmDeals.createdAt))
    .$dynamic();

  if (status && status !== 'all') {
    query = query.where(eq(crmDeals.status, status));
  }

  const data = await query;
  return NextResponse.json({ success: true, data });
}
