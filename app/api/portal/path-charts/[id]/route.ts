// GET /api/portal/path-charts/:id
//
// Full snapshot of one Path Visualizations chart: the chart row, all nodes,
// all edges, currently-active claims, and the id of the newest event (so a
// client can immediately open the SSE stream at ?since=<lastEventId> without
// a separate lookup).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pathChartNodes, pathChartEdges, pathChartClaims, pathChartEvents } from '@/lib/db/schema';
import { eq, and, isNull, gt, desc } from 'drizzle-orm';
import { getAuthedPathChart } from '../_lib';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chartId = parseInt(id, 10);
  if (!Number.isFinite(chartId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedPathChart(chartId);
  if ('error' in result) return result.error;

  const [nodes, edges, activeClaims, lastEventRows] = await Promise.all([
    db.select().from(pathChartNodes).where(eq(pathChartNodes.chartId, chartId)),
    db.select().from(pathChartEdges).where(eq(pathChartEdges.chartId, chartId)),
    // Active claim = releasedAt IS NULL AND expiresAt > now().
    db
      .select()
      .from(pathChartClaims)
      .where(
        and(
          eq(pathChartClaims.chartId, chartId),
          isNull(pathChartClaims.releasedAt),
          gt(pathChartClaims.expiresAt, new Date()),
        ),
      ),
    db
      .select({ id: pathChartEvents.id })
      .from(pathChartEvents)
      .where(eq(pathChartEvents.chartId, chartId))
      .orderBy(desc(pathChartEvents.id))
      .limit(1),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      chart: result.chart,
      nodes,
      edges,
      activeClaims,
      lastEventId: lastEventRows[0]?.id ?? null,
    },
  });
}
