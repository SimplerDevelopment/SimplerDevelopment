import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationLogs, automationRules, clients, users } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');

  const conditions = statusFilter && statusFilter !== 'all'
    ? [eq(automationLogs.status, statusFilter)]
    : [];

  const logs = await db
    .select({
      id: automationLogs.id,
      triggerEvent: automationLogs.triggerEvent,
      status: automationLogs.status,
      duration: automationLogs.duration,
      errorMessage: automationLogs.errorMessage,
      createdAt: automationLogs.createdAt,
      ruleName: automationRules.name,
      company: clients.company,
      clientName: users.name,
    })
    .from(automationLogs)
    .innerJoin(automationRules, eq(automationLogs.ruleId, automationRules.id))
    .innerJoin(clients, eq(automationLogs.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(automationLogs.createdAt))
    .limit(50);

  return NextResponse.json({ success: true, data: logs });
}
