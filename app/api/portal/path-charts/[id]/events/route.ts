// GET /api/portal/path-charts/:id/events?since=<eventId>&limit=<n>
//
// Events with id > since, ordered ascending, capped at 500 (default 200).
// Powers both cold-start replay (a client that already has a snapshot's
// lastEventId just wants what happened after it) and SSE reconnect catch-up
// — the stream route's own replay path issues the same query shape.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pathChartEvents } from '@/lib/db/schema';
import { eq, and, gt, asc } from 'drizzle-orm';
import { getAuthedPathChart } from '../../_lib';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export function parseSince(raw: string | null): number {
  const n = raw != null ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function parseLimit(raw: string | null): number {
  const n = raw != null ? parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chartId = parseInt(id, 10);
  if (!Number.isFinite(chartId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedPathChart(chartId);
  if ('error' in result) return result.error;

  const url = new URL(req.url);
  const since = parseSince(url.searchParams.get('since'));
  const limit = parseLimit(url.searchParams.get('limit'));

  const events = await db
    .select({
      id: pathChartEvents.id,
      eventType: pathChartEvents.eventType,
      payload: pathChartEvents.payload,
      agentLabel: pathChartEvents.agentLabel,
      createdAt: pathChartEvents.createdAt,
    })
    .from(pathChartEvents)
    .where(and(eq(pathChartEvents.chartId, chartId), gt(pathChartEvents.id, since)))
    .orderBy(asc(pathChartEvents.id))
    .limit(limit);

  return NextResponse.json({ success: true, data: events });
}
