import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiCreditBalances, aiCreditLedger, aiCreditPackages, clients, users } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Summary stats
  const [summary] = await db
    .select({
      totalBalance: sql<number>`coalesce(sum(${aiCreditBalances.balance}), 0)`,
      totalMonthlyGrants: sql<number>`coalesce(sum(${aiCreditBalances.monthlyGrant}), 0)`,
      payAsYouGoClients: sql<number>`count(*) filter (where ${aiCreditBalances.payAsYouGo} = true)`,
    })
    .from(aiCreditBalances);

  // Per-client balances
  const balances = await db
    .select({
      clientId: aiCreditBalances.clientId,
      company: clients.company,
      clientName: users.name,
      balance: aiCreditBalances.balance,
      monthlyGrant: aiCreditBalances.monthlyGrant,
      payAsYouGo: aiCreditBalances.payAsYouGo,
    })
    .from(aiCreditBalances)
    .innerJoin(clients, eq(aiCreditBalances.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(aiCreditBalances.balance));

  // Recent ledger entries (last 20)
  const ledger = await db
    .select({
      id: aiCreditLedger.id,
      clientId: aiCreditLedger.clientId,
      company: clients.company,
      clientName: users.name,
      type: aiCreditLedger.type,
      amount: aiCreditLedger.amount,
      balanceAfter: aiCreditLedger.balanceAfter,
      description: aiCreditLedger.description,
      createdAt: aiCreditLedger.createdAt,
    })
    .from(aiCreditLedger)
    .innerJoin(clients, eq(aiCreditLedger.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(aiCreditLedger.createdAt))
    .limit(20);

  // Available packages
  const packages = await db
    .select()
    .from(aiCreditPackages)
    .orderBy(aiCreditPackages.price);

  return NextResponse.json({
    success: true,
    data: { summary, balances, ledger, packages },
  });
}
