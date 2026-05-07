#!/usr/bin/env bun
/**
 * Brain pgvector embeddings backlog monitor.
 *
 * Observes the `brain_embedding_jobs` queue (see lib/db/schema/brain.ts)
 * which the Vercel cron at app/api/cron/process-embeddings/route.ts drains
 * every minute via drainQueue() in lib/brain/embedding-queue.ts.
 *
 * This routine runs hourly (independently from the worker) and reports
 * whether the worker is keeping up. If pending jobs are piling up or the
 * oldest pending job has been waiting too long, we treat that as a signal
 * the worker is stuck (OpenAI outage, deploy failure, schema drift, etc.).
 *
 * Thresholds (chosen empirically — the worker drains up to 25 jobs/minute,
 * so 1500 pending should clear within an hour under normal conditions):
 *   WARN     pending > 500   OR  oldest pending > 30 min
 *   CRITICAL pending > 2000  OR  oldest pending > 2 hours
 *
 * Exit codes:
 *   0  healthy or WARN   (still emails on WARN, but does not page)
 *   1  CRITICAL          (so paging integrations have a clear signal)
 *   2  configuration error (missing env, schema drift, etc.)
 *
 * Used by .github/workflows/sd2026-embeddings-backlog.yml (hourly).
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL_READONLY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_TO_EMAIL = process.env.DIGEST_TO_EMAIL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL_READONLY not set.');
  process.exit(2);
}
if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set.');
  process.exit(2);
}
if (!DIGEST_TO_EMAIL) {
  console.error('DIGEST_TO_EMAIL not set.');
  process.exit(2);
}

// Match the worker's view of "still owed work": pending, plus failed rows
// that drainQueue will retry (attempts < MAX_ATTEMPTS = 3). Rows past the
// retry budget are stuck waiting on a human and should not register as
// active backlog — but we surface them in the summary so we notice if they
// pile up.
const WARN_PENDING = 500;
const WARN_OLDEST_MIN = 30;
const CRIT_PENDING = 2000;
const CRIT_OLDEST_MIN = 120;

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 5 });

type Severity = 'OK' | 'WARN' | 'CRITICAL';

try {
  // One round-trip: pending count, retryable-failed count, dead-letter count,
  // and oldest pending enqueued_at. Coalesce so an empty queue returns 0/null
  // cleanly. `enqueued_at` is the column on brain_embedding_jobs.
  const [row] = await sql<
    {
      pending: string;
      retry_failed: string;
      dead_letter: string;
      oldest_pending_at: Date | null;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')                               AS pending,
      COUNT(*) FILTER (WHERE status = 'failed' AND attempts < 3)               AS retry_failed,
      COUNT(*) FILTER (WHERE status = 'failed' AND attempts >= 3)              AS dead_letter,
      MIN(enqueued_at) FILTER (WHERE status = 'pending')                       AS oldest_pending_at
    FROM brain_embedding_jobs
  `;

  const pending = Number(row.pending);
  const retryFailed = Number(row.retry_failed);
  const deadLetter = Number(row.dead_letter);
  const oldestPendingAt = row.oldest_pending_at;
  const oldestPendingMin =
    oldestPendingAt == null
      ? 0
      : Math.round((Date.now() - new Date(oldestPendingAt).getTime()) / 60_000);

  // Active backlog = work the worker is currently expected to drain.
  const activeBacklog = pending + retryFailed;

  let severity: Severity = 'OK';
  const reasons: string[] = [];
  if (activeBacklog > CRIT_PENDING || oldestPendingMin > CRIT_OLDEST_MIN) {
    severity = 'CRITICAL';
    if (activeBacklog > CRIT_PENDING)
      reasons.push(`backlog=${activeBacklog} > ${CRIT_PENDING}`);
    if (oldestPendingMin > CRIT_OLDEST_MIN)
      reasons.push(`oldest_pending=${oldestPendingMin}m > ${CRIT_OLDEST_MIN}m`);
  } else if (activeBacklog > WARN_PENDING || oldestPendingMin > WARN_OLDEST_MIN) {
    severity = 'WARN';
    if (activeBacklog > WARN_PENDING)
      reasons.push(`backlog=${activeBacklog} > ${WARN_PENDING}`);
    if (oldestPendingMin > WARN_OLDEST_MIN)
      reasons.push(`oldest_pending=${oldestPendingMin}m > ${WARN_OLDEST_MIN}m`);
  }

  // Structured one-line summary for log scrapers / GH Actions output.
  console.log(
    JSON.stringify({
      routine: 'embeddings-backlog',
      severity,
      pending,
      retry_failed: retryFailed,
      dead_letter: deadLetter,
      active_backlog: activeBacklog,
      oldest_pending_min: oldestPendingMin,
      oldest_pending_at: oldestPendingAt?.toISOString() ?? null,
      reasons,
    }),
  );

  if (severity !== 'OK') {
    const subject = `[sd2026 ${severity}] brain embeddings backlog — ${activeBacklog} pending, oldest ${oldestPendingMin}m`;
    const lines = [
      `<p><strong>Severity:</strong> ${severity}</p>`,
      `<p><strong>Why:</strong> ${reasons.join('; ')}</p>`,
      `<ul>`,
      `  <li>pending: ${pending}</li>`,
      `  <li>retryable failed (attempts &lt; 3): ${retryFailed}</li>`,
      `  <li>dead-letter (attempts &ge; 3, needs human): ${deadLetter}</li>`,
      `  <li>active backlog (pending + retryable): ${activeBacklog}</li>`,
      `  <li>oldest pending: ${oldestPendingMin} min (enqueued ${oldestPendingAt?.toISOString() ?? 'n/a'})</li>`,
      `</ul>`,
      `<p>Worker: <code>simplerdevelopment2026/app/api/cron/process-embeddings/route.ts</code> (Vercel cron, every minute).</p>`,
      `<p>Likely causes: OpenAI outage, expired <code>OPENAI_API_KEY</code>, Vercel cron disabled, or a poison job repeatedly throwing in <code>embedById()</code>.</p>`,
    ];
    const html = lines.join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'sd2026-routines@simplerdevelopment.com',
        to: DIGEST_TO_EMAIL,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`::error::Resend send failed: ${res.status} ${body}`);
      // Still exit per severity below — the alert tried, but we don't want
      // a Resend outage to silently mask a CRITICAL DB signal.
    } else {
      console.log(`Alert email sent to ${DIGEST_TO_EMAIL} (severity=${severity}).`);
    }
  }

  if (severity === 'CRITICAL') {
    console.log('::error::Embeddings backlog at CRITICAL.');
    process.exit(1);
  }

  // healthy or WARN both exit 0 (WARN is informational, not paging).
  process.exit(0);
} finally {
  await sql.end({ timeout: 5 });
}
