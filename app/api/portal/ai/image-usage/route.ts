import { NextResponse } from 'next/server';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { usageMeterEvents } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';

// Mirrors the defaults in `lib/designer/aiRateLimit.ts`. Kept local so the
// portal can show the active caps without importing storefront code, and so
// future ops can override via env without touching this file.
function readNumericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

const DEFAULT_DAILY_CAP = 200;
const DEFAULT_PER_DESIGN_CAP = 30;

/**
 * Surfaces this merchant's AI-image usage in a shape the portal usage card
 * can render directly:
 *
 *   {
 *     todayCount,           // images generated since 00:00 UTC today
 *     monthCount,           // images generated in the current YYYY-MM bucket
 *     dailyCap,             // active per-client daily ceiling
 *     perDesignCap,         // active per-design ceiling
 *     recentEvents: [...]   // last 20 events for a "Recent activity" strip
 *   }
 *
 * Pulls exclusively from `usage_meter_events` where resource='ai_images' —
 * no joins, indexed by (client_id, resource, recorded_at).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ error: 'No client' }, { status: 404 });
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [today, month, recent] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageMeterEvents)
      .where(
        and(
          eq(usageMeterEvents.clientId, client.id),
          eq(usageMeterEvents.resource, 'ai_images'),
          gte(usageMeterEvents.recordedAt, startOfDay),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageMeterEvents)
      .where(
        and(
          eq(usageMeterEvents.clientId, client.id),
          eq(usageMeterEvents.resource, 'ai_images'),
          gte(usageMeterEvents.recordedAt, startOfMonth),
        ),
      ),
    db
      .select({
        id: usageMeterEvents.id,
        recordedAt: usageMeterEvents.recordedAt,
        amount: usageMeterEvents.amount,
        source: usageMeterEvents.source,
        period: usageMeterEvents.period,
      })
      .from(usageMeterEvents)
      .where(
        and(
          eq(usageMeterEvents.clientId, client.id),
          eq(usageMeterEvents.resource, 'ai_images'),
        ),
      )
      .orderBy(desc(usageMeterEvents.recordedAt))
      .limit(20),
  ]);

  return NextResponse.json({
    todayCount: Number(today[0]?.count ?? 0),
    monthCount: Number(month[0]?.count ?? 0),
    dailyCap: readNumericEnv('AI_IMAGE_DAILY_CAP_PER_CLIENT', DEFAULT_DAILY_CAP),
    perDesignCap: readNumericEnv(
      'AI_IMAGE_PER_DESIGN_CAP',
      DEFAULT_PER_DESIGN_CAP,
    ),
    recentEvents: recent.map((r) => ({
      id: r.id,
      recordedAt: r.recordedAt,
      // numeric → string from drizzle; coerce so the client can format.
      amount: Number(r.amount ?? 0),
      source: r.source ?? 'platform',
      period: r.period,
    })),
  });
}
