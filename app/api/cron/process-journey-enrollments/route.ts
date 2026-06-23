import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import {
  emailJourneyEnrollments,
  emailJourneySteps,
  emailJourneyStepSends,
  emailSubscribers,
  emailJourneys,
} from '@/lib/db/schema';
import { and, eq, lte, asc } from 'drizzle-orm';
import { resolveResendKey } from '@/lib/email/resolve-resend';
import { Resend } from 'resend';
import { buildUnsubscribeUrl } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: advance all active email journey enrollments whose nextRunAt is now or
 * past. Runs every minute. Uses a CAS-claim (bump nextRunAt before processing)
 * to prevent double-firing under concurrent workers — same pattern as
 * process-scheduled-automations.
 *
 * Step execution:
 *  - email     → send via Resend; insert emailJourneyStepSends; advance to next step
 *  - wait      → set nextRunAt = now() + delayHours
 *  - condition → inspect prior email step-send for open/click; branch to
 *                yesStepOrder or noStepOrder
 *  - exit      → status = 'completed'
 *
 * Per-enrollment errors are caught individually so one bad enrollment does not
 * abort the whole tick.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
async function _GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();

  // Claim up to 200 due enrollments. nextRunAt is timestamptz so lte(now) is
  // TZ-correct. We re-assert nextRunAt <= now in the CAS UPDATE predicate to
  // safely handle concurrent workers.
  const due = await db
    .select()
    .from(emailJourneyEnrollments)
    .where(
      and(
        eq(emailJourneyEnrollments.status, 'active'),
        lte(emailJourneyEnrollments.nextRunAt, now),
      ),
    )
    .orderBy(asc(emailJourneyEnrollments.nextRunAt))
    .limit(200);

  let advanced = 0;
  let completed = 0;
  const errors: { enrollmentId: number; message: string }[] = [];

  for (const enrollment of due) {
    // CAS-claim: bump nextRunAt 10 min into the future before processing.
    // If another worker already claimed this row, the UPDATE matches 0 rows
    // and we skip.
    const claimTime = new Date(now.getTime() + 10 * 60 * 1000);
    const claimed = await db
      .update(emailJourneyEnrollments)
      .set({ nextRunAt: claimTime })
      .where(
        and(
          eq(emailJourneyEnrollments.id, enrollment.id),
          lte(emailJourneyEnrollments.nextRunAt, now),
        ),
      )
      .returning({ id: emailJourneyEnrollments.id });

    if (claimed.length === 0) continue;

    try {
      await processEnrollment(enrollment, now);
      // Re-fetch status to count completed
      const [updated] = await db
        .select({ status: emailJourneyEnrollments.status })
        .from(emailJourneyEnrollments)
        .where(eq(emailJourneyEnrollments.id, enrollment.id))
        .limit(1);
      if (updated?.status === 'completed') {
        completed++;
      } else {
        advanced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ enrollmentId: enrollment.id, message });
      // Mark enrollment as errored so it doesn't spin forever
      await db
        .update(emailJourneyEnrollments)
        .set({ status: 'error' })
        .where(eq(emailJourneyEnrollments.id, enrollment.id));
    }
  }

  return NextResponse.json({
    success: true,
    data: { advanced, completed },
    errors,
  });
}

async function processEnrollment(
  enrollment: typeof emailJourneyEnrollments.$inferSelect,
  now: Date,
): Promise<void> {
  // Load the current step
  const [step] = await db
    .select()
    .from(emailJourneySteps)
    .where(
      and(
        eq(emailJourneySteps.journeyId, enrollment.journeyId),
        eq(emailJourneySteps.stepOrder, enrollment.currentStepOrder),
      ),
    )
    .limit(1);

  if (!step) {
    // No more steps — complete the enrollment
    await db
      .update(emailJourneyEnrollments)
      .set({ status: 'completed', completedAt: now, nextRunAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) })
      .where(eq(emailJourneyEnrollments.id, enrollment.id));
    return;
  }

  const cfg = step.config as Record<string, unknown> | null;

  switch (step.stepType) {
    case 'email': {
      await executeEmailStep(enrollment, step, cfg, now);
      // Advance to next step immediately (nextRunAt = now so cron picks it up)
      await advanceToNextStep(enrollment, step.stepOrder, now);
      break;
    }

    case 'wait': {
      const delayHours = typeof cfg?.delayHours === 'number' ? cfg.delayHours : 0;
      const nextRun = new Date(now.getTime() + delayHours * 60 * 60 * 1000);
      await db
        .update(emailJourneyEnrollments)
        .set({
          currentStepOrder: step.stepOrder + 1,
          nextRunAt: nextRun,
        })
        .where(eq(emailJourneyEnrollments.id, enrollment.id));
      break;
    }

    case 'condition': {
      const metric = cfg?.metric as string | undefined;
      const windowHours = typeof cfg?.windowHours === 'number' ? cfg.windowHours : 24;
      const yesStepOrder = typeof cfg?.yesStepOrder === 'number' ? cfg.yesStepOrder : step.stepOrder + 1;
      const noStepOrder = typeof cfg?.noStepOrder === 'number' ? cfg.noStepOrder : step.stepOrder + 1;

      // Find the most recent email step-send for this enrollment
      const sends = await db
        .select()
        .from(emailJourneyStepSends)
        .where(eq(emailJourneyStepSends.enrollmentId, enrollment.id))
        .orderBy(asc(emailJourneyStepSends.sentAt));

      const lastSend = sends.at(-1);
      const windowCutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

      let conditionMet = false;
      if (lastSend) {
        if (metric === 'opened' && lastSend.openedAt && lastSend.openedAt >= windowCutoff) {
          conditionMet = true;
        } else if (metric === 'clicked' && lastSend.clickedAt && lastSend.clickedAt >= windowCutoff) {
          conditionMet = true;
        } else if (metric === 'no_engage') {
          // no_engage = neither opened nor clicked within the window
          const opened = lastSend.openedAt && lastSend.openedAt >= windowCutoff;
          const clicked = lastSend.clickedAt && lastSend.clickedAt >= windowCutoff;
          conditionMet = !opened && !clicked;
        }
      }

      const targetStep = conditionMet ? yesStepOrder : noStepOrder;
      await db
        .update(emailJourneyEnrollments)
        .set({ currentStepOrder: targetStep, nextRunAt: now })
        .where(eq(emailJourneyEnrollments.id, enrollment.id));
      break;
    }

    case 'exit': {
      await db
        .update(emailJourneyEnrollments)
        .set({ status: 'completed', completedAt: now, nextRunAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) })
        .where(eq(emailJourneyEnrollments.id, enrollment.id));
      break;
    }

    default: {
      // Unknown step type — advance past it
      await advanceToNextStep(enrollment, step.stepOrder, now);
      break;
    }
  }
}

async function advanceToNextStep(
  enrollment: typeof emailJourneyEnrollments.$inferSelect,
  currentStepOrder: number,
  now: Date,
): Promise<void> {
  // Check if there is a next step; if not, complete.
  const [nextStep] = await db
    .select({ id: emailJourneySteps.id })
    .from(emailJourneySteps)
    .where(
      and(
        eq(emailJourneySteps.journeyId, enrollment.journeyId),
        eq(emailJourneySteps.stepOrder, currentStepOrder + 1),
      ),
    )
    .limit(1);

  if (!nextStep) {
    await db
      .update(emailJourneyEnrollments)
      .set({ status: 'completed', completedAt: now, nextRunAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) })
      .where(eq(emailJourneyEnrollments.id, enrollment.id));
  } else {
    await db
      .update(emailJourneyEnrollments)
      .set({ currentStepOrder: currentStepOrder + 1, nextRunAt: now })
      .where(eq(emailJourneyEnrollments.id, enrollment.id));
  }
}

async function executeEmailStep(
  enrollment: typeof emailJourneyEnrollments.$inferSelect,
  step: typeof emailJourneySteps.$inferSelect,
  cfg: Record<string, unknown> | null,
  now: Date,
): Promise<void> {
  // Idempotency: skip if already sent for this enrollment+step
  const [existing] = await db
    .select({ id: emailJourneyStepSends.id })
    .from(emailJourneyStepSends)
    .where(
      and(
        eq(emailJourneyStepSends.enrollmentId, enrollment.id),
        eq(emailJourneyStepSends.stepId, step.id),
      ),
    )
    .limit(1);
  if (existing) return;

  // Load the subscriber
  const [subscriber] = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.id, enrollment.subscriberId))
    .limit(1);
  if (!subscriber || subscriber.status !== 'active') return;

  // Load journey for fromName/fromEmail defaults
  const [journey] = await db
    .select({ name: emailJourneys.name })
    .from(emailJourneys)
    .where(eq(emailJourneys.id, enrollment.journeyId))
    .limit(1);

  const subject = (cfg?.subject as string | undefined) ?? `Message from ${journey?.name ?? 'us'}`;
  const htmlContent = (cfg?.htmlContent as string | undefined) ?? '<p>This is an automated email.</p>';
  const fromName = (cfg?.fromName as string | undefined) ?? 'SimplerDevelopment';
  const fromEmail = (cfg?.fromEmail as string | undefined) ?? (process.env.DEFAULT_FROM_EMAIL ?? 'noreply@simplerdevelopment.com');

  const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
  const html = htmlContent.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);

  let resendEmailId: string | null = null;
  try {
    const { key } = await resolveResendKey(enrollment.clientId);
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: subscriber.email,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    resendEmailId = result.data?.id ?? null;
  } catch {
    // Best-effort send — still record the step-send row so the journey advances
    // and the idempotency guard prevents retrying indefinitely.
  }

  // Record the send row (idempotency guard via unique index)
  await db
    .insert(emailJourneyStepSends)
    .values({
      enrollmentId: enrollment.id,
      stepId: step.id,
      subscriberId: enrollment.subscriberId,
      resendEmailId,
      sentAt: now,
    })
    .onConflictDoNothing();
}

export const GET = withCronHealth(
  { name: 'api-cron:process-journey-enrollments', area: 'api-cron' },
  _GET,
);
