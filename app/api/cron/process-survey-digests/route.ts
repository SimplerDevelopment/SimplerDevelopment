/**
 * Survey response digests (PUX-084).
 *
 * Sends one batched email per survey whose `notify_digest` is 'daily' or 'weekly',
 * listing the responses completed since that survey's `last_digest_sent_at`.
 *
 * WHY THIS EXISTS
 *   Before PUX-084, choosing a digest silently switched a survey's notifications
 *   off: lib/automation/survey-notifications.ts returned early on digest mode
 *   without sending and without queueing, and the `survey_notification_queue` its
 *   TODO pointed at was never built. This route is the missing half.
 *
 * NO QUEUE TABLE
 *   Modelled on app/api/cron/approval-digest, which digests straight off its source
 *   rows. `survey_responses` already records `completed_at`, so a per-survey
 *   watermark is enough to define "what's new" — a queue would be a second copy of
 *   data we already have, with its own drift and cleanup problems.
 *
 * THE WATERMARK IS ADVANCED ONLY AFTER A SUCCESSFUL SEND
 *   so a failed run retries the same window on the next pass instead of skipping
 *   it. The cost of that choice is a possible duplicate digest if the send
 *   succeeds but the UPDATE then fails; a duplicate email is a far better failure
 *   than a permanently lost one, which is the bug this route exists to fix.
 *
 * FIRST RUN
 *   `last_digest_sent_at IS NULL` means the survey has never been digested. The
 *   window is then bounded by the digest period rather than running back to the
 *   beginning of time, so switching a long-lived survey to digest mode doesn't
 *   dump its entire response history into one email.
 *
 * Runs daily; weekly surveys are filtered by their own watermark age, so a single
 * schedule serves both cadences and there is only one cron entry to keep alive.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}` — mirrors
 * app/api/cron/approval-digest/route.ts.
 */

import { NextResponse } from 'next/server';
import { and, eq, gt, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { escapeHtml } from '@/lib/utils/html';
import { resend } from '@/lib/email';
import { resolveSurveyRecipients } from '@/lib/automation/survey-notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BASE_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS: Record<string, number> = { daily: DAY_MS, weekly: 7 * DAY_MS };

interface DigestResponseRow {
  id: number;
  respondentEmail: string | null;
  source: string | null;
  completedAt: Date | null;
}

function renderDigestEmail(params: {
  surveyTitle: string;
  cadence: string;
  items: DigestResponseRow[];
  portalUrl: string;
}): string {
  const { surveyTitle, cadence, items, portalUrl } = params;
  const rows = items
    .map(
      (item) => `
        <div style="background:#f8fafc;border-left:3px solid #2563eb;padding:14px 18px;border-radius:4px;margin:0 0 12px;">
          <div style="font-size:14px;color:#0f172a;font-weight:500;line-height:1.5;">
            ${escapeHtml(item.respondentEmail || 'Anonymous')}${item.source ? escapeHtml(` (via ${item.source})`) : ''}
          </div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">Response #${item.id}</div>
        </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
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
              <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">${escapeHtml(cadence)} survey digest</p>
              <h1 style="margin:0 0 20px 0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${escapeHtml(surveyTitle)}</h1>
              <p style="margin:0 0 20px 0;font-size:14px;color:#475569;">
                <strong style="color:#0f172a;">${items.length}</strong> new response${items.length === 1 ? '' : 's'} since the last digest.
              </p>
              ${rows}
              <a href="${portalUrl}" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                View in portal
              </a>
              <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                You're receiving this because you're listed as a notification recipient on this survey.
                Change that in <a href="${portalUrl}" style="color:#6b7280;text-decoration:underline;">survey settings</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      success: true,
      data: { surveysDigested: 0, responsesIncluded: 0, durationMs: Date.now() - t0, skipped: 'emails disabled' },
    });
  }

  const now = new Date();

  // Candidates: digest enabled, notifications not switched off, and either never
  // digested or last digested at least one full period ago. Doing the cadence
  // arithmetic in SQL keeps a survey that was digested 20 hours ago from being
  // re-sent by an early run.
  const candidates = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      clientId: surveys.clientId,
      notifyDigest: surveys.notifyDigest,
      notifyUserIds: surveys.notifyUserIds,
      lastDigestSentAt: surveys.lastDigestSentAt,
    })
    .from(surveys)
    .where(and(
      eq(surveys.notifyOnResponse, true),
      ne(surveys.notifyDigest, 'off'),
      sql`(${surveys.lastDigestSentAt} IS NULL OR ${surveys.lastDigestSentAt} <= now() - (CASE ${surveys.notifyDigest} WHEN 'weekly' THEN interval '7 days' ELSE interval '1 day' END))`,
    ));

  let surveysDigested = 0;
  let responsesIncluded = 0;

  for (const survey of candidates) {
    try {
      const periodMs = PERIOD_MS[survey.notifyDigest] ?? DAY_MS;
      // Never digested => bound by one period rather than all of history.
      const since = survey.lastDigestSentAt ?? new Date(now.getTime() - periodMs);

      const items = await db
        .select({
          id: surveyResponses.id,
          respondentEmail: surveyResponses.respondentEmail,
          source: surveyResponses.source,
          completedAt: surveyResponses.completedAt,
        })
        .from(surveyResponses)
        .where(and(
          eq(surveyResponses.surveyId, survey.id),
          isNotNull(surveyResponses.completedAt),
          gt(surveyResponses.completedAt, since),
          lte(surveyResponses.completedAt, now),
        ))
        .orderBy(surveyResponses.completedAt);

      if (items.length === 0) continue;

      const recipients = await resolveSurveyRecipients(survey.clientId, survey.notifyUserIds);
      if (recipients.length === 0) {
        console.warn(`[survey-digests] no resolvable recipient for survey ${survey.id}; leaving watermark untouched`);
        continue;
      }

      const portalUrl = `${BASE_URL}/portal/surveys/${survey.id}`;
      await resend.emails.send({
        from: FROM_EMAIL,
        to: recipients,
        subject: `${items.length} new response${items.length === 1 ? '' : 's'}: ${survey.title}`,
        html: renderDigestEmail({
          surveyTitle: survey.title,
          cadence: survey.notifyDigest === 'weekly' ? 'Weekly' : 'Daily',
          items,
          portalUrl,
        }),
      });

      // Only after the send succeeds. `now`, not the newest completedAt, so a
      // response that lands mid-run is picked up next time rather than skipped.
      await db.update(surveys).set({ lastDigestSentAt: now }).where(eq(surveys.id, survey.id));

      surveysDigested += 1;
      responsesIncluded += items.length;
    } catch (err) {
      // One broken survey must not stop the rest, and must not advance its own
      // watermark — the next run retries the same window.
      console.error(`[survey-digests] survey ${survey.id} failed:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    data: { surveysDigested, responsesIncluded, durationMs: Date.now() - t0 },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-survey-digests', area: 'api-cron' },
  _GET,
);
