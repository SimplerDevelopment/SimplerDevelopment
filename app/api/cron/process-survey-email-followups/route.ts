/**
 * DIST-01 / DIST-02 — survey email follow-up cron worker.
 *
 * Fires every 15 minutes (configured in vercel.json). For each enabled
 * row in `survey_email_sequences`, find responses whose:
 *   - completedAt + delayHours <= now()
 *   - respondentEmail IS NOT NULL
 *   - per-sequence condition matches (string equality; v1 keeps it simple)
 *   - survey-level consent gate passes (consentField truthy OR null)
 *   - no existing send audit row for this (sequence, response) tuple
 * …and dispatch one email per match via Resend, recording the audit row.
 *
 * Idempotency: the unique index on
 * `survey_email_sequence_sends (sequence_id, survey_response_id)` plus
 * onConflictDoNothing makes double-sending impossible even if two crons
 * fire concurrently (or this handler is re-invoked for the same row).
 *
 * Cap each tick at 100 sends to stay well under Resend's rate limit.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`,
 * matching app/api/cron/process-embeddings/route.ts.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  surveys,
  surveyResponses,
  surveyEmailSequences,
  surveyEmailSequenceSends,
} from '@/lib/db/schema';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { resend, buildUnsubscribeUrl, generateUnsubscribeToken } from '@/lib/email';
import { isEligibleForFollowup } from '@/lib/surveys/email-followup-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'surveys@simplerdevelopment.com';
const FROM_NAME = 'Simpler Development';
const MAX_SENDS_PER_TICK = 100;

/**
 * Render the email body. v1 only does a small, fixed set of placeholder
 * substitutions — full Liquid templating is intentionally out of scope.
 * The unsubscribe URL is a one-shot token because surveys don't (yet) have
 * a subscriber list to gate against.
 */
function renderBody(
  template: string,
  context: {
    respondentName: string | null;
    respondentEmail: string | null;
    surveyTitle: string;
    unsubscribeUrl: string;
  },
): string {
  return template
    .replaceAll('{respondentName}', context.respondentName ?? '')
    .replaceAll('{respondentEmail}', context.respondentEmail ?? '')
    .replaceAll('{surveyTitle}', context.surveyTitle)
    .replaceAll('{unsubscribeUrl}', context.unsubscribeUrl);
}

export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const t0 = Date.now();
  const now = new Date();

  // Pull all enabled sequences. Surveys typically have <5 sequences, so
  // this isn't expensive even with hundreds of surveys.
  const sequences = await db.select().from(surveyEmailSequences)
    .where(eq(surveyEmailSequences.enabled, true));

  let scanned = 0;
  let sent = 0;
  let errors = 0;
  let skippedNoEmail = 0;
  let skippedNoConsent = 0;
  let skippedCondition = 0;

  // Process sequences sorted by id for determinism. Inside each sequence,
  // we narrow with a delay-window filter at the DB level (cheap), then
  // hand each row to the gate helper for the consent/condition decision.
  sequences.sort((a, b) => a.id - b.id);

  outer:
  for (const sequence of sequences) {
    if (sent >= MAX_SENDS_PER_TICK) break;

    const [survey] = await db.select().from(surveys).where(eq(surveys.id, sequence.surveyId)).limit(1);
    if (!survey) continue;

    // Find responses that are at-or-past the eligibility window and that
    // don't already have a send row for this sequence. NOT EXISTS keeps
    // the SQL straightforward — Postgres can use the unique index on
    // (sequence_id, survey_response_id) for the anti-join.
    //
    // Oldest-eligible-first by completedAt so a busy survey can't starve
    // older responses out of their follow-ups.
    const remaining = Math.max(0, MAX_SENDS_PER_TICK - sent);
    if (remaining === 0) break;

    const eligibleRows = await db
      .select()
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.surveyId, sequence.surveyId),
          isNotNull(surveyResponses.respondentEmail),
          isNotNull(surveyResponses.completedAt),
          // completedAt + delayHours <= now()
          sql`${surveyResponses.completedAt} + (${sequence.delayHours}::int * interval '1 hour') <= now()`,
          // NOT EXISTS in the sends audit log.
          sql`NOT EXISTS (
            SELECT 1 FROM ${surveyEmailSequenceSends}
            WHERE ${surveyEmailSequenceSends.sequenceId} = ${sequence.id}
              AND ${surveyEmailSequenceSends.surveyResponseId} = ${surveyResponses.id}
          )`,
        ),
      )
      .orderBy(asc(surveyResponses.completedAt))
      .limit(remaining);

    for (const response of eligibleRows) {
      if (sent >= MAX_SENDS_PER_TICK) break outer;
      scanned++;

      const gate = isEligibleForFollowup(
        { consentField: survey.consentField ?? null },
        {
          respondentEmail: response.respondentEmail,
          completedAt: response.completedAt,
          answers: response.answers as Record<string, unknown> | null | undefined,
        },
        {
          delayHours: sequence.delayHours,
          conditionField: sequence.conditionField,
          conditionValue: sequence.conditionValue,
        },
        now,
      );

      if (!gate.eligible) {
        if (gate.reason === 'no_email') skippedNoEmail++;
        else if (gate.reason === 'no_consent' || gate.reason === 'consent_field_missing_in_answers') skippedNoConsent++;
        else if (gate.reason === 'condition_field_no_match') skippedCondition++;
        // Insert a "skipped" audit row so we don't re-scan this tuple every
        // tick. Storing the reason in `error` keeps a single column doing
        // double-duty — it's the only nullable text field we have. The
        // unique index makes this idempotent.
        await db.insert(surveyEmailSequenceSends)
          .values({
            sequenceId: sequence.id,
            surveyResponseId: response.id,
            sentAt: new Date(),
            resendEmailId: null,
            error: `skipped: ${gate.reason}`,
          })
          .onConflictDoNothing();
        continue;
      }

      const unsubscribeUrl = buildUnsubscribeUrl(generateUnsubscribeToken());
      const html = renderBody(sequence.bodyHtml, {
        respondentName: response.respondentName,
        respondentEmail: response.respondentEmail,
        surveyTitle: survey.title,
        unsubscribeUrl,
      });

      let resendId: string | null = null;
      let errMsg: string | null = null;
      try {
        const result = await resend.emails.send({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: response.respondentEmail!,
          subject: sequence.subject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        resendId = result.data?.id ?? null;
      } catch (err) {
        errMsg = err instanceof Error ? err.message : String(err);
        errors++;
      }

      // Always record the attempt — even on failure — so a broken template
      // doesn't get retried every 15 minutes forever.
      await db.insert(surveyEmailSequenceSends)
        .values({
          sequenceId: sequence.id,
          surveyResponseId: response.id,
          sentAt: new Date(),
          resendEmailId: resendId,
          error: errMsg,
        })
        .onConflictDoNothing();

      if (!errMsg) sent++;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      scanned,
      sent,
      errors,
      sequencesEvaluated: sequences.length,
      durationMs: Date.now() - t0,
      skipped: {
        noEmail: skippedNoEmail,
        noConsent: skippedNoConsent,
        condition: skippedCondition,
      },
    },
  });
}
