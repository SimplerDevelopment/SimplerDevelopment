/**
 * CRM email-sequence cron worker. Phase 2 of [[Spec - CRM Email Sync + Sequences]].
 *
 * For each ACTIVE enrollment whose next step's delay has elapsed (since
 * lastSentAt, or enrolledAt for the first step), send that step via Resend,
 * record an idempotent send row, and advance the enrollment. Completes the
 * enrollment when its steps run out.
 *
 * Idempotency: unique (enrollment_id, step_id) on crm_sequence_sends +
 * onConflictDoNothing — a step can't double-send even on concurrent ticks.
 * Cap per tick to stay under Resend's rate limit.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import {
  crmSequences,
  crmSequenceSteps,
  crmSequenceEnrollments,
  crmSequenceSends,
  crmContacts,
} from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { resend } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'crm@simplerdevelopment.com';
const FROM_NAME = 'Simpler Development';
const MAX_SENDS_PER_TICK = 100;

async function _GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let sent = 0;
  let advanced = 0;
  let completed = 0;
  let halted = 0;

  // Active enrollments whose sequence is enabled. Oldest enrollments first.
  const enrollments = await db
    .select({
      e: crmSequenceEnrollments,
    })
    .from(crmSequenceEnrollments)
    .innerJoin(crmSequences, eq(crmSequences.id, crmSequenceEnrollments.sequenceId))
    .where(and(eq(crmSequenceEnrollments.status, 'active'), eq(crmSequences.enabled, true)))
    .orderBy(asc(crmSequenceEnrollments.enrolledAt))
    .limit(500);

  for (const { e: enrollment } of enrollments) {
    if (sent >= MAX_SENDS_PER_TICK) break;

    const steps = await db
      .select()
      .from(crmSequenceSteps)
      .where(eq(crmSequenceSteps.sequenceId, enrollment.sequenceId))
      .orderBy(asc(crmSequenceSteps.stepOrder));

    if (enrollment.currentStep >= steps.length) {
      await db.update(crmSequenceEnrollments)
        .set({ status: 'completed' })
        .where(eq(crmSequenceEnrollments.id, enrollment.id));
      completed++;
      continue;
    }

    const step = steps[enrollment.currentStep];
    const since = enrollment.lastSentAt ?? enrollment.enrolledAt;
    const dueAt = new Date(since.getTime() + step.delayHours * 3_600_000);
    if (dueAt > now) continue; // not due yet

    const [contact] = await db
      .select({ id: crmContacts.id, email: crmContacts.email })
      .from(crmContacts)
      .where(eq(crmContacts.id, enrollment.contactId))
      .limit(1);

    if (!contact?.email) {
      await db.update(crmSequenceEnrollments)
        .set({ status: 'halted', haltedReason: 'no_email' })
        .where(eq(crmSequenceEnrollments.id, enrollment.id));
      halted++;
      continue;
    }

    // Send via Resend. A failure is recorded on the send row (so we don't
    // retry the same step forever) and the enrollment still advances.
    let resendEmailId: string | null = null;
    let error: string | null = null;
    try {
      const result = await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: contact.email,
        subject: step.subject,
        html: step.bodyHtml,
      });
      if (result.error) error = result.error.message || 'resend error';
      else resendEmailId = result.data?.id ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    // Idempotent audit row — the unique (enrollment, step) index is the guard.
    await db.insert(crmSequenceSends)
      .values({ enrollmentId: enrollment.id, stepId: step.id, resendEmailId, error })
      .onConflictDoNothing();

    const nextStep = enrollment.currentStep + 1;
    const isDone = nextStep >= steps.length;
    await db.update(crmSequenceEnrollments)
      .set({ currentStep: nextStep, lastSentAt: now, status: isDone ? 'completed' : 'active' })
      .where(eq(crmSequenceEnrollments.id, enrollment.id));

    sent++;
    advanced++;
    if (isDone) completed++;
  }

  return NextResponse.json({ success: true, data: { sent, advanced, completed, halted } });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-crm-sequences', area: 'api-cron' },
  _GET,
);
