import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipelineId');
  const period = searchParams.get('period') ?? '12m';

  // Determine interval for period-scoped queries
  const intervalMap: Record<string, string> = {
    '30d': '30 days',
    '90d': '90 days',
    '12m': '12 months',
    all: '100 years',
  };
  const interval = intervalMap[period] ?? '12 months';

  try {
    // Win/Loss rate
    const winLossResult = await db.execute(
      sql`SELECT
            COUNT(*) FILTER (WHERE status = 'won') AS won,
            COUNT(*) FILTER (WHERE status = 'lost') AS lost,
            COUNT(*) FILTER (WHERE status = 'open') AS open
          FROM crm_deals
          WHERE client_id = ${client.id}`
    );
    const winLoss = winLossResult[0] ?? { won: 0, lost: 0, open: 0 };

    // Revenue by month
    const revenueByMonth = await db.execute(
      sql`SELECT
            TO_CHAR(DATE_TRUNC('month', closed_at), 'YYYY-MM') AS month,
            COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0) AS won_value,
            COUNT(*) FILTER (WHERE status = 'won') AS won_count
          FROM crm_deals
          WHERE client_id = ${client.id}
            AND closed_at IS NOT NULL
            AND closed_at > NOW() - CAST(${interval} AS INTERVAL)
          GROUP BY DATE_TRUNC('month', closed_at)
          ORDER BY DATE_TRUNC('month', closed_at)`
    );

    // Pipeline funnel - need a pipeline id
    let pipelineFunnel: unknown[] = [];
    let resolvedPipelineId = pipelineId ? parseInt(pipelineId, 10) : null;

    if (!resolvedPipelineId) {
      // Get the default pipeline for this client
      const defaultPipeline = await db.execute(
        sql`SELECT id FROM crm_pipelines
            WHERE client_id = ${client.id}
            ORDER BY is_default DESC, id ASC
            LIMIT 1`
      );
      if (defaultPipeline.length > 0) {
        resolvedPipelineId = defaultPipeline[0].id as number;
      }
    }

    if (resolvedPipelineId) {
      pipelineFunnel = await db.execute(
        sql`SELECT
              s.name AS stage_name,
              s.color,
              s.sort_order,
              COUNT(d.id) AS deal_count,
              COALESCE(SUM(d.value), 0) AS total_value
            FROM crm_pipeline_stages s
            LEFT JOIN crm_deals d ON d.stage_id = s.id AND d.status = 'open'
            WHERE s.pipeline_id = ${resolvedPipelineId}
            GROUP BY s.id, s.name, s.color, s.sort_order
            ORDER BY s.sort_order`
      );
    }

    // Deal velocity
    const velocityResult = await db.execute(
      sql`SELECT
            AVG(EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - created_at)) / 86400) AS avg_days_to_close
          FROM crm_deals
          WHERE client_id = ${client.id} AND status = 'won'`
    );
    const avgDaysToClose = velocityResult[0]?.avg_days_to_close
      ? Math.round(Number(velocityResult[0].avg_days_to_close))
      : null;

    // Activity summary (last 30 days)
    const activitySummary = await db.execute(
      sql`SELECT type, COUNT(*) AS count
          FROM crm_activities
          WHERE client_id = ${client.id}
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY type`
    );

    // MRR from won deals with recurring value
    const mrrResult = await db.execute(
      sql`SELECT
            COALESCE(SUM(
              CASE billing_cycle
                WHEN 'monthly' THEN recurring_value
                WHEN 'quarterly' THEN recurring_value / 3
                WHEN 'annual' THEN recurring_value / 12
                ELSE 0
              END
            ), 0) AS mrr
          FROM crm_deals
          WHERE client_id = ${client.id}
            AND status = 'won'
            AND recurring_value IS NOT NULL
            AND recurring_value > 0`
    );
    const mrr = Number(mrrResult[0]?.mrr ?? 0);
    const arr = mrr * 12;

    // Top deals by value
    const topDeals = await db.execute(
      sql`SELECT id, title, value, status
          FROM crm_deals
          WHERE client_id = ${client.id} AND status = 'open'
          ORDER BY value DESC NULLS LAST
          LIMIT 5`
    );

    return NextResponse.json({
      success: true,
      data: {
        winLoss,
        revenueByMonth,
        pipelineFunnel,
        avgDaysToClose,
        activitySummary,
        topDeals,
        mrr,
        arr,
        pipelineId: resolvedPipelineId,
      },
    });
  } catch (error) {
    console.error('CRM analytics error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load analytics' },
      { status: 500 }
    );
  }
}
