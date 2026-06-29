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
 * Digest modes (`daily` / `weekly`) are honored as "do NOT send immediately"
 * but the actual batched send is gated on a future scheduled-job runner
 * (no cron mechanism exists in the current stack). When digest mode is set,
 * this handler no-ops so responses don't get lost in the floor between
 * "skip immediate" and "no one's flushing the queue yet".
 */

import { escapeHtml } from '@/lib/utils/html';
import { db } from '@/lib/db';
import { surveys, clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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

  // Resolve the client's primary owner email.
  const [owner] = await db
    .select({ email: users.email, name: users.name })
    .from(clients)
    .innerJoin(users, eq(users.id, clients.userId))
    .where(eq(clients.id, survey.clientId))
    .limit(1);

  if (!owner?.email) {
    console.warn(`[survey-notifications] No owner email for clientId=${survey.clientId}; skipping notification`);
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
      to: owner.email,
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
