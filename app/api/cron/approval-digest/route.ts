import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmNotifications, mcpPendingChanges, users, clients } from '@/lib/db/schema';
import { escapeHtml } from '@/lib/utils/html';
import { resend } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: BAR-003 daily digest for `mcp_pending_change` bell notifications
 * created under a `digest_daily` notification preference.
 *
 * `notifyApprovers` (lib/crm/notifications.ts) already stamps
 * `metadata.digest = true` on the crm_notifications row when the recipient's
 * preference is `digest_daily`, and `sendApprovalEmails`
 * (lib/email/mcp-approval-email.ts) skips the instant email for those rows
 * (unless the staged operation is high-risk, which still pages instantly).
 * Nothing has ever batched the digest-marked rows into an email until now.
 *
 * Linkage: `crmNotifications.entityId` for `type = 'mcp_pending_change'` rows
 * is the `mcp_pending_changes.id` the notification was raised for (see
 * `lib/mcp/pending-changes.ts` `stageOrApply` — `notifyApprovers({ ...,
 * entityType: 'mcp_approval', entityId: row.id })`). We inner-join on that id
 * so a change that has since been approved/rejected/expired (status no
 * longer 'pending') is silently excluded from the digest — no point emailing
 * about a change that's already resolved.
 *
 * Selection: `type = 'mcp_pending_change' AND metadata->>'digest' = 'true'
 * AND metadata->>'digestedAt' IS NULL`, joined to a still-pending
 * mcp_pending_changes row. Grouped by (clientId, userId) — one email per
 * user per run listing every change awaiting their review.
 *
 * After sending a user's digest, each included notification row is
 * read-modify-written to add `metadata.digestedAt` (ISO timestamp) so the
 * next run excludes it — mirrors the select-then-update jsonb pattern used
 * elsewhere in the codebase (e.g. `lib/brain/meetings.ts`), since
 * `crm_notifications.metadata` is an application-serialized `json` column,
 * not `jsonb`, so a Postgres `||` merge operator isn't reliably applicable.
 *
 * Best-effort: emails are sent via `Promise.allSettled` and the route never
 * throws — a broken digest run must not take down the cron scheduler.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}` (mirrors
 * `app/api/cron/failing-automations-notify/route.ts`).
 */

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'portal@simplerdevelopment.com';
const EMAILS_ENABLED = process.env.MCP_APPROVAL_EMAILS_ENABLED !== 'false';

type DigestRow = {
  notificationId: number;
  clientId: number;
  userId: number;
  pendingId: number;
  summary: string | null;
  title: string;
};

function renderDigestEmail(params: {
  clientName: string;
  items: DigestRow[];
  reviewUrl: string;
}): string {
  const { clientName, items, reviewUrl } = params;
  const rows = items
    .map(
      (item) => `
        <div style="background:#f8fafc;border-left:3px solid #f59e0b;padding:14px 18px;border-radius:4px;margin:0 0 12px;">
          <div style="font-size:14px;color:#0f172a;font-weight:500;line-height:1.5;">
            ${escapeHtml(item.summary || item.title)}
          </div>
        </div>`,
    )
    .join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="padding:40px 32px;background:#fef3c7;border-bottom:1px solid #fcd34d;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#92400e;font-weight:600;margin-bottom:8px;">
          Daily digest
        </div>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#78350f;">${items.length} change${items.length === 1 ? '' : 's'} awaiting your review</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#92400e;">${escapeHtml(clientName)}</p>
      </div>
      <div style="padding:32px;">
        <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px;">
          The following AI-agent-proposed changes are still pending your approval:
        </p>
        ${rows}
        <div style="text-align:center;margin:32px 0;">
          <a href="${reviewUrl}" style="display:inline-block;padding:14px 32px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
            Review pending changes
          </a>
        </div>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0;">
          You're receiving one daily digest instead of an email per change because your notification preference for this type is set to "Daily digest".
        </p>
      </div>
      <div style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          Simpler Development &middot; Set <code>MCP_APPROVAL_EMAILS_ENABLED=false</code> to disable
        </p>
      </div>
    </div>
  `;
}

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  if (!EMAILS_ENABLED || !process.env.RESEND_API_KEY) {
    return NextResponse.json({
      success: true,
      data: { usersNotified: 0, notificationsDigested: 0, durationMs: Date.now() - t0, skipped: 'emails disabled' },
    });
  }

  // Pull every undigested digest-marked mcp_pending_change notification whose
  // underlying change is still pending. Inner-join to mcp_pending_changes so
  // resolved/expired changes drop out silently.
  const rows = (await db
    .select({
      notificationId: crmNotifications.id,
      clientId: crmNotifications.clientId,
      userId: crmNotifications.userId,
      pendingId: mcpPendingChanges.id,
      summary: mcpPendingChanges.summary,
      title: crmNotifications.title,
    })
    .from(crmNotifications)
    .innerJoin(mcpPendingChanges, eq(crmNotifications.entityId, mcpPendingChanges.id))
    .where(
      and(
        eq(crmNotifications.type, 'mcp_pending_change'),
        sql`${crmNotifications.metadata}->>'digest' = 'true'`,
        sql`${crmNotifications.metadata}->>'digestedAt' IS NULL`,
        eq(mcpPendingChanges.status, 'pending'),
      ),
    )) as DigestRow[];

  let usersNotified = 0;
  let notificationsDigested = 0;

  if (rows.length === 0) {
    return NextResponse.json({
      success: true,
      data: { usersNotified, notificationsDigested, durationMs: Date.now() - t0 },
    });
  }

  // Group by (clientId, userId).
  const groups = new Map<string, DigestRow[]>();
  for (const row of rows) {
    const key = `${row.clientId}:${row.userId}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];

  const [clientRows, userRows] = await Promise.all([
    db.select({ id: clients.id, company: clients.company }).from(clients).where(inArray(clients.id, clientIds)),
    db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, userIds)),
  ]);
  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const results = await Promise.allSettled(
    [...groups.entries()].map(async ([key, items]) => {
      const [clientIdStr, userIdStr] = key.split(':');
      const clientId = Number(clientIdStr);
      const userId = Number(userIdStr);
      const user = userById.get(userId);
      if (!user?.email) return { sent: false, items };

      const clientName = clientById.get(clientId)?.company ?? `Client #${clientId}`;
      const reviewUrl = `${BASE_URL}/portal/approvals?status=pending`;
      const subject = `[${clientName}] ${items.length} change${items.length === 1 ? '' : 's'} awaiting your review`;
      const html = renderDigestEmail({ clientName, items, reviewUrl });

      await resend.emails.send({
        from: `Simpler Development <${FROM_EMAIL}>`,
        to: user.email,
        subject,
        html,
      });

      return { sent: true, items };
    }),
  );

  const digestedAt = new Date().toISOString();

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value.sent) {
      if (result.status === 'rejected') {
        console.warn('[approval-digest] failed to send digest email:', result.reason);
      }
      continue;
    }
    usersNotified += 1;

    // Mark each digested notification so the next run excludes it.
    // crm_notifications.metadata is an application-serialized json column, so
    // read-modify-write rather than a Postgres jsonb `||` merge.
    await Promise.allSettled(
      result.value.items.map(async (item) => {
        try {
          const [existing] = await db
            .select({ metadata: crmNotifications.metadata })
            .from(crmNotifications)
            .where(eq(crmNotifications.id, item.notificationId))
            .limit(1);
          await db
            .update(crmNotifications)
            .set({ metadata: { ...(existing?.metadata ?? {}), digestedAt } })
            .where(eq(crmNotifications.id, item.notificationId));
          notificationsDigested += 1;
        } catch (err) {
          console.warn(`[approval-digest] failed to mark notification ${item.notificationId} digested:`, err);
        }
      }),
    );
  }

  return NextResponse.json({
    success: true,
    data: { usersNotified, notificationsDigested, durationMs: Date.now() - t0 },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:approval-digest', area: 'api-cron' },
  _GET,
);
