import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationRules, automationLogs, clients, users } from '@/lib/db/schema';
import { eq, desc, count, sum, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const rules = await db
    .select({
      id: automationRules.id,
      name: automationRules.name,
      description: automationRules.description,
      enabled: automationRules.enabled,
      executionCount: automationRules.executionCount,
      lastExecutedAt: automationRules.lastExecutedAt,
      source: automationRules.source,
      productScope: automationRules.productScope,
      createdAt: automationRules.createdAt,
      company: clients.company,
      clientName: users.name,
    })
    .from(automationRules)
    .innerJoin(clients, eq(automationRules.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .orderBy(desc(automationRules.createdAt));

  const totalRules = rules.length;
  const enabledRules = rules.filter(r => r.enabled).length;
  const totalExecutions = rules.reduce((acc, r) => acc + r.executionCount, 0);

  const [failedResult] = await db
    .select({ count: count() })
    .from(automationLogs)
    .where(eq(automationLogs.status, 'failed'));

  const failedCount = failedResult?.count ?? 0;

  return NextResponse.json({
    success: true,
    data: rules,
    stats: { totalRules, enabledRules, totalExecutions, failedCount },
  });
}

export async function PATCH(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, enabled } = body;

  if (typeof id !== 'number' || typeof enabled !== 'boolean') {
    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
  }

  const [rule] = await db
    .update(automationRules)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automationRules.id, id))
    .returning();

  return NextResponse.json({ success: true, data: rule });
}
