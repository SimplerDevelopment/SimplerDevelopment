import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createCrmNotification } from '@/lib/crm/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: hourly scan for support-ticket SLA breaches.
 *
 * Two breach kinds are detected:
 *   - first_response — `first_response_due_at` is in the past AND
 *                      `first_response_at IS NULL` AND status not terminal.
 *   - resolution     — `resolution_due_at` is in the past AND the ticket has
 *                      not reached a terminal status (`resolved`/`closed`).
 *
 * For each breach we issue an in-app `crm_notifications` row to the assignee
 * if set, otherwise to the tenant's primary user (`clients.user_id`) — the
 * same fallback pattern `stale-crm-deals` uses for CRM deals with no owner.
 *
 * De-dupe: skip any ticket that already has a same-type breach notification
 * on the same `entityId` issued in the last 24 hours. The cron runs hourly,
 * so without the window we'd re-notify every tick for as long as the breach
 * stayed open.
 *
 * Tenancy: this cron operates across all tenants by design — every notification
 * is tagged with the source ticket's `client_id`, so per-tenant scoping is
 * preserved by the notification panel's own filter.
 *
 * Schema impact: NONE. We deliberately do not add an `sla_breached` flag
 * column — the dev DB has known schema drift, so all breach state derives
 * from the existing due-at / response-at / status columns at read time.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}` (matches
 * the other crons in this directory).
 */
async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  type BreachRow = {
    ticketId: number;
    clientId: number;
    number: number;
    subject: string;
    status: string;
    priority: string;
    assignedTo: number | null;
    fallbackOwnerId: number;
    firstResponseDueAt: Date | null;
    resolutionDueAt: Date | null;
    breachKind: 'first_response' | 'resolution';
    recentDupId: number | null;
  };

  // Single round trip: union of first-response and resolution breach
  // candidates, each with assignee + tenant-owner fallback + a dedupe probe.
  // The dedupe lateral matches on `type` so the two kinds dedupe
  // independently — a ticket that has only had a first-response breach
  // notified can still raise a resolution-breach later.
  const rows = (await db.execute(sql`
    SELECT * FROM (
      SELECT
        t.id AS "ticketId",
        t.client_id AS "clientId",
        t.number AS "number",
        t.subject AS "subject",
        t.status AS "status",
        t.priority AS "priority",
        t.assigned_to AS "assignedTo",
        c.user_id AS "fallbackOwnerId",
        t.first_response_due_at AS "firstResponseDueAt",
        t.resolution_due_at AS "resolutionDueAt",
        'first_response'::text AS "breachKind",
        dup.id AS "recentDupId"
      FROM support_tickets t
      INNER JOIN clients c ON c.id = t.client_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM crm_notifications n
        WHERE n.type = 'ticket_sla_first_response_breach'
          AND n.entity_type = 'ticket'
          AND n.entity_id = t.id
          AND n.created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      ) dup ON TRUE
      WHERE t.first_response_due_at IS NOT NULL
        AND t.first_response_due_at < NOW()
        AND t.first_response_at IS NULL
        AND t.status NOT IN ('resolved', 'closed')

      UNION ALL

      SELECT
        t.id AS "ticketId",
        t.client_id AS "clientId",
        t.number AS "number",
        t.subject AS "subject",
        t.status AS "status",
        t.priority AS "priority",
        t.assigned_to AS "assignedTo",
        c.user_id AS "fallbackOwnerId",
        t.first_response_due_at AS "firstResponseDueAt",
        t.resolution_due_at AS "resolutionDueAt",
        'resolution'::text AS "breachKind",
        dup.id AS "recentDupId"
      FROM support_tickets t
      INNER JOIN clients c ON c.id = t.client_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM crm_notifications n
        WHERE n.type = 'ticket_sla_resolution_breach'
          AND n.entity_type = 'ticket'
          AND n.entity_id = t.id
          AND n.created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      ) dup ON TRUE
      WHERE t.resolution_due_at IS NOT NULL
        AND t.resolution_due_at < NOW()
        AND t.status NOT IN ('resolved', 'closed')
    ) breaches
  `)) as unknown as { rows: BreachRow[] } | BreachRow[];

  // drizzle's neon/pg drivers differ on whether .execute() returns the array
  // directly or wrapped in { rows }. Normalise.
  const candidates: BreachRow[] = Array.isArray(rows)
    ? rows
    : (rows as { rows: BreachRow[] }).rows ?? [];

  const scanned = candidates.length;
  let notified = 0;
  let skippedDup = 0;
  const breaches: Array<{
    ticketId: number;
    number: number;
    clientId: number;
    breachKind: BreachRow['breachKind'];
    notifiedUserId: number | null;
  }> = [];

  for (const row of candidates) {
    if (row.recentDupId !== null) {
      skippedDup += 1;
      breaches.push({
        ticketId: row.ticketId,
        number: row.number,
        clientId: row.clientId,
        breachKind: row.breachKind,
        notifiedUserId: null,
      });
      continue;
    }

    const recipientId = row.assignedTo ?? row.fallbackOwnerId;
    if (!recipientId) {
      breaches.push({
        ticketId: row.ticketId,
        number: row.number,
        clientId: row.clientId,
        breachKind: row.breachKind,
        notifiedUserId: null,
      });
      continue;
    }

    const dueAt =
      row.breachKind === 'first_response' ? row.firstResponseDueAt : row.resolutionDueAt;
    const dueLine = dueAt ? `Due: ${new Date(dueAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
    const priorityLine = `Priority: ${row.priority}`;
    const title =
      row.breachKind === 'first_response'
        ? `Ticket #${row.number} breached first-response SLA`
        : `Ticket #${row.number} breached resolution SLA`;
    const notifType =
      row.breachKind === 'first_response'
        ? 'ticket_sla_first_response_breach'
        : 'ticket_sla_resolution_breach';

    await createCrmNotification({
      clientId: row.clientId,
      userId: recipientId,
      type: notifType,
      title,
      body: [row.subject, priorityLine, dueLine].filter(Boolean).join('\n'),
      entityType: 'ticket',
      entityId: row.ticketId,
    });
    notified += 1;
    breaches.push({
      ticketId: row.ticketId,
      number: row.number,
      clientId: row.clientId,
      breachKind: row.breachKind,
      notifiedUserId: recipientId,
    });
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: { scanned, notified, skippedDup, durationMs, breaches },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:ticket-sla-breaches', area: 'api-cron' },
  _GET,
);
