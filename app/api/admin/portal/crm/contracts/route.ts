import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigners, clients } from '@/lib/db/schema';
import { eq, desc, sql, count } from 'drizzle-orm';

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

  try {
  // Get contracts with client info
  let query = db
    .select({
      id: crmContracts.id,
      title: crmContracts.title,
      status: crmContracts.status,
      sentAt: crmContracts.sentAt,
      fullyExecutedAt: crmContracts.fullyExecutedAt,
      createdAt: crmContracts.createdAt,
      clientCompany: clients.company,
      clientId: crmContracts.clientId,
    })
    .from(crmContracts)
    .innerJoin(clients, eq(crmContracts.clientId, clients.id))
    .orderBy(desc(crmContracts.createdAt))
    .$dynamic();

  if (status && status !== 'all') {
    query = query.where(eq(crmContracts.status, status));
  }

  const contracts = await query;

  // Get signer counts per contract
  const signerCounts = await db
    .select({
      contractId: crmContractSigners.contractId,
      total: count(),
      signed: sql<number>`count(case when ${crmContractSigners.signedAt} is not null then 1 end)`.as('signed'),
    })
    .from(crmContractSigners)
    .groupBy(crmContractSigners.contractId);

  const signerMap = new Map(signerCounts.map(s => [s.contractId, { total: Number(s.total), signed: Number(s.signed) }]));

  const data = contracts.map(c => ({
    ...c,
    signerTotal: signerMap.get(c.id)?.total ?? 0,
    signerSigned: signerMap.get(c.id)?.signed ?? 0,
  }));

  return NextResponse.json({ success: true, data });
  } catch {
    // Table may not exist yet
    return NextResponse.json({ success: true, data: [] });
  }
}
