/**
 * Email alerts for MCP pending-change approvals.
 *
 * Sent to owners/admins when an AI agent stages a CMS write. Includes a direct
 * link to /portal/approvals?id={id}. Per-recipient cooldown: if the user has
 * received another mcp_pending_change notification in the previous 10 minutes,
 * the email is skipped to avoid flooding during bursts of agent activity.
 */

import { db } from '@/lib/db';
import { crmNotifications, users, clients } from '@/lib/db/schema';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { resend } from './index';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'portal@simplerdevelopment.com';
const COOLDOWN_MINUTES = 10;
const EMAILS_ENABLED = process.env.MCP_APPROVAL_EMAILS_ENABLED !== 'false';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmail(params: {
  summary: string;
  clientName: string;
  entityType: string;
  operation: string;
  approvalUrl: string;
}) {
  const { summary, clientName, entityType, operation, approvalUrl } = params;
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="padding:40px 32px;background:#fef3c7;border-bottom:1px solid #fcd34d;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#92400e;font-weight:600;margin-bottom:8px;">
          Review requested
        </div>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#78350f;">MCP change awaiting approval</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#92400e;">${escapeHtml(clientName)}</p>
      </div>
      <div style="padding:32px;">
        <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px;">
          An AI agent proposed a change that requires your approval before it applies:
        </p>
        <div style="background:#f8fafc;border-left:3px solid #f59e0b;padding:16px 20px;border-radius:4px;margin:20px 0;">
          <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;font-weight:600;margin-bottom:4px;">
            ${escapeHtml(entityType)} &middot; ${escapeHtml(operation)}
          </div>
          <div style="font-size:15px;color:#0f172a;font-weight:500;line-height:1.5;">
            ${escapeHtml(summary)}
          </div>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="${approvalUrl}" style="display:inline-block;padding:14px 32px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
            Review &amp; Approve
          </a>
        </div>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin:0;">
          You'll see a field-level diff of what the agent proposed versus the current state, with Approve and Reject options.
        </p>
      </div>
      <div style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">
          You're receiving this because you're an owner or admin on this account.
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          Simpler Development &middot; Set <code>MCP_APPROVAL_EMAILS_ENABLED=false</code> to disable
        </p>
      </div>
    </div>
  `;
}

export interface SendApprovalEmailsParams {
  clientId: number;
  userIds: number[];
  pendingId: number;
  summary: string;
  entityType: string;
  operation: string;
}

/**
 * Send approval-request emails to the given user IDs, honoring per-user cooldowns.
 * Safe to fire-and-forget — errors are logged, never thrown.
 */
export async function sendApprovalEmails(params: SendApprovalEmailsParams): Promise<void> {
  if (!EMAILS_ENABLED) return;
  if (params.userIds.length === 0) return;
  if (!process.env.RESEND_API_KEY) return;

  try {
    const [client] = await db
      .select({ company: clients.company })
      .from(clients)
      .where(eq(clients.id, params.clientId))
      .limit(1);
    const clientName = client?.company ?? `Client #${params.clientId}`;

    const recipientUsers = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(inArray(users.id, params.userIds), eq(users.active, true)));

    // Cooldown: count prior mcp_pending_change notifications per user in the
    // last N minutes. The notification we just created is already in the table,
    // so a count of 1 = this is the only recent one → send.
    const cutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000);
    const recentCounts = await db
      .select({
        userId: crmNotifications.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(crmNotifications)
      .where(
        and(
          eq(crmNotifications.clientId, params.clientId),
          eq(crmNotifications.type, 'mcp_pending_change'),
          gt(crmNotifications.createdAt, cutoff),
          inArray(crmNotifications.userId, params.userIds),
        ),
      )
      .groupBy(crmNotifications.userId);

    const countByUser = new Map(recentCounts.map(r => [r.userId, r.count]));

    const approvalUrl = `${BASE_URL}/portal/approvals?id=${params.pendingId}`;
    const subject = `[${clientName}] Review: ${params.summary.slice(0, 80)}${params.summary.length > 80 ? '…' : ''}`;
    const html = renderEmail({
      summary: params.summary,
      clientName,
      entityType: params.entityType,
      operation: params.operation,
      approvalUrl,
    });

    await Promise.allSettled(
      recipientUsers.map(async (u) => {
        const recentCount = countByUser.get(u.id) ?? 0;
        if (recentCount > 1) return; // flurry cooldown; another email was sent recently
        try {
          await resend.emails.send({
            from: `Simpler Development <${FROM_EMAIL}>`,
            to: u.email,
            subject,
            html,
          });
        } catch (err) {
          console.warn(`[mcp-approval-email] failed for user ${u.id}:`, err);
        }
      }),
    );
  } catch (err) {
    console.warn('[mcp-approval-email] dispatch failed:', err);
  }
}
