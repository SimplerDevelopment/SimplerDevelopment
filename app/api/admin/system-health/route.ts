import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cronHealth } from '@/lib/db/schema/cronHealth';
import { asc } from 'drizzle-orm';
import { listKnownJobs } from '@/lib/system-health';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * Read-only health snapshot for /admin/system-health. Joins the static
 * registry of "jobs we know about" against the live `cron_health` table so
 * jobs that have never run still surface as rows (with "never tracked"
 * status).
 */
export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const rows = await db
    .select()
    .from(cronHealth)
    .orderBy(asc(cronHealth.name));
  const byName = new Map(rows.map((r) => [r.name, r]));

  const known = listKnownJobs();
  const data = known.map((job) => {
    const row = byName.get(job.name);
    return {
      name: job.name,
      area: job.area,
      label: job.label,
      schedule: job.schedule,
      purpose: job.purpose,
      tracked: job.tracked,
      lastRunAt: row?.lastRunAt ?? null,
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastError: row?.lastError ?? null,
      lastErrorAt: row?.lastErrorAt ?? null,
      runCount: row?.runCount ?? 0,
    };
  });

  return NextResponse.json({ success: true, data });
}
