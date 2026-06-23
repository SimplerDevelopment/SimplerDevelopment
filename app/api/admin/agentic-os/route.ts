import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agenticOsRuns } from '@/lib/db/schema';
import { SKILLS, skillsByDomain } from '@/lib/agentic-os/registry';
import { RULES } from '@/lib/agentic-os/rules';
import { DOMAIN_LABELS } from '@/lib/agentic-os/types';
import { desc, sql } from 'drizzle-orm';
import { isLocalDev } from '@/lib/agentic-os/local-only';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!isLocalDev()) return new NextResponse(null, { status: 404 });
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const recentRuns = await db
    .select({
      id: agenticOsRuns.id,
      skillId: agenticOsRuns.skillId,
      status: agenticOsRuns.status,
      exitCode: agenticOsRuns.exitCode,
      durationMs: agenticOsRuns.durationMs,
      errorMessage: agenticOsRuns.errorMessage,
      createdAt: agenticOsRuns.createdAt,
      completedAt: agenticOsRuns.completedAt,
    })
    .from(agenticOsRuns)
    .orderBy(desc(agenticOsRuns.createdAt))
    .limit(25);

  const counts = await db
    .select({
      status: agenticOsRuns.status,
      n: sql<number>`count(*)::int`,
    })
    .from(agenticOsRuns)
    .groupBy(agenticOsRuns.status);

  const executorAvailable = process.env.AGENTIC_OS_EXECUTOR_ENABLED === '1';

  return NextResponse.json({
    success: true,
    data: {
      skills: SKILLS,
      domains: Object.keys(skillsByDomain()),
      domainLabels: DOMAIN_LABELS,
      rules: RULES,
      recentRuns,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      executorAvailable,
      executorHostHint: executorAvailable
        ? null
        : 'Set AGENTIC_OS_EXECUTOR_ENABLED=1 on a host with `claude` CLI installed to enable in-browser execution. Otherwise use the "Copy prompt" button and run from your terminal.',
    },
  });
}
