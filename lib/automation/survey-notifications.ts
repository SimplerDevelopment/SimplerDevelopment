/**
 * Survey Response Notifications
 *
 * Listens for `survey.response_submitted` events and sends a notification
 * email to the survey owner (the client's primary portal user) when the
 * survey has `notifyOnResponse = true` and `notifyDigest = 'off'`.
 *
 * Registers its own handler with the event bus — runs in parallel with
 * the user-facing automation rule engine, which processes custom rules.
 *
 * Digest modes (`daily` / `weekly`) mean "do NOT send immediately" — the batched
 * send belongs to app/api/cron/process-survey-digests, which reads straight off
 * `survey_responses.completed_at` against the `surveys.last_digest_sent_at`
 * watermark. So the early return below hands the response to that job; it does
 * not drop it.
 *
 * It used to drop it. Until PUX-084 this handler returned on digest mode without
 * sending AND without queueing, and the queue it pointed at
 * (`survey_notification_queue`) was never built — so choosing a digest silently
 * switched a survey's notifications off entirely. The justification recorded here
 * was "no cron mechanism exists in the current stack", which had gone stale: there
 * are 47 cron routes registered in vercel.json.
 */

import { escapeHtml } from '@/lib/utils/html';
import { db } from '@/lib/db';
import { surveys, clients, users, clientMembers } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { onEvent, type AutomationEvent } from './event-bus';
import { resend } from '@/lib/email';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';
const BASE_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';

interface SurveyResponsePayload {
  surveyId: number;
  responseId: number;
  surveyTitle: string;
  respondentEmail: string | null;
  source: string | null;
}

/**
 * Resolve which addresses receive notifications for one survey.
 *
 * Recipients are stored as portal user ids (`surveys.notify_user_ids`), never as
 * addresses — see the column comment in lib/db/schema/surveys.ts for why. This is
 * the only place ids become addresses, and it re-joins `client_members` on every
 * send rather than trusting the stored list: an id that was valid when it was
 * saved but whose membership has since been revoked resolves to nothing, so
 * removing someone from the account stops their notifications immediately with no
 * cleanup pass over every survey.
 *
 * The clientId filter is the tenancy boundary, and it is applied HERE as well as
 * at write time deliberately. A stored id belonging to another tenant — from a bad
 * backfill, a restored row, or direct SQL — must not be able to receive another
 * client's survey responses, and enforcing it on the read is what makes that true
 * regardless of how the row came to exist.
 *
 * Falls back to the client owner when the list is empty, which is exactly who every
 * survey notified before this column existed (so the migration needs no backfill).
 * It also falls back when every listed id fails to resolve: a notification reaching
 * the owner unexpectedly is a smaller failure than one silently reaching nobody.
 */
export async function resolveSurveyRecipients(
  surveyClientId: number,
  notifyUserIds: number[] | null,
): Promise<string[]> {
  const ids = Array.isArray(notifyUserIds) ? notifyUserIds.filter(Number.isInteger) : [];

  if (ids.length > 0) {
    const rows = await db
      .select({ email: users.email })
      .from(clientMembers)
      .innerJoin(users, eq(users.id, clientMembers.userId))
      .where(and(
        eq(clientMembers.clientId, surveyClientId),
        inArray(clientMembers.userId, ids),
      ));
    const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
    if (emails.length > 0) return emails;
  }

  const [owner] = await db
    .select({ email: users.email })
    .from(clients)
    .innerJoin(users, eq(users.id, clients.userId))
    .where(eq(clients.id, surveyClientId))
    .limit(1);

  return owner?.email ? [owner.email] : [];
}

async function handleSurveyResponseSubmitted(event: AutomationEvent): Promise<void> {
  if (event.event !== 'survey.response_submitted') return;

  const payload = event.payload as unknown as SurveyResponsePayload;
  if (!payload?.surveyId) return;

  // Load the survey to read notification preferences.
  // The POST handler already validated clientId, so we trust event.clientId.
  const [survey] = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      notifyOnResponse: surveys.notifyOnResponse,
      notifyDigest: surveys.notifyDigest,
      notifyUserIds: surveys.notifyUserIds,
      clientId: surveys.clientId,
    })
    .from(surveys)
    .where(eq(surveys.id, payload.surveyId))
    .limit(1);

  if (!survey) return;
  if (!survey.notifyOnResponse) return;

  // Digest mode means "don't send immediate emails" — batched send is a
  // future feature gated on a scheduler. Silently no-op here.
  if (survey.notifyDigest && survey.notifyDigest !== 'off') {
    // TODO(survey-digest): enqueue into survey_notification_queue and
    // flush via a cron-driven /api/cron/process-survey-digests endpoint.
    return;
  }

  const recipients = await resolveSurveyRecipients(survey.clientId, survey.notifyUserIds);

  if (recipients.length === 0) {
    console.warn(`[survey-notifications] No resolvable recipient for clientId=${survey.clientId}; skipping notification`);
    return;
  }

  const portalUrl = `${BASE_URL}/portal/surveys/${survey.id}`;
  const subject = `New response: ${survey.title}`;
  const respondent = payload.respondentEmail || 'Anonymous';
  const source = payload.source ? ` (via ${payload.source})` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">New survey response</p>
              <h1 style="margin:0 0 20px 0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${escapeHtml(survey.title)}</h1>
              <p style="margin:0 0 8px 0;font-size:14px;color:#475569;">
                <strong style="color:#0f172a;">From:</strong> ${escapeHtml(respondent)}${escapeHtml(source)}
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;color:#475569;">
                <strong style="color:#0f172a;">Response #:</strong> ${payload.responseId}
              </p>
              <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                View in portal
              </a>
              <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                You're receiving this because notifications are enabled on this survey.
                Turn them off in <a href="${portalUrl}" style="color:#6b7280;text-decoration:underline;">survey settings</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
    });
  } catch (err) {
    console.error('[survey-notifications] Failed to send notification email:', err);
  }
}

/** Basic HTML escape to avoid injection in the email body. */

let initialized = false;

/**
 * Register the survey notification handler with the event bus.
 * Safe to call multiple times — only registers once.
 */
export function initSurveyNotifications(): void {
  if (initialized) return;
  initialized = true;
  onEvent(handleSurveyResponseSubmitted);
  console.log('[survey-notifications] Handler initialized');
}
