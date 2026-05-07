#!/usr/bin/env bun
/**
 * Stripe webhook health check.
 *
 * Fetches the last 60 minutes of Stripe events and compares them against
 * what our webhook handler persisted to the database.
 *
 * Context: the webhook handler at app/api/stripe/webhook/route.ts has NO
 * dedicated processed-events table. It handles checkout.session.completed
 * and writes to three DB locations depending on the event subtype:
 *
 *   - Credit purchase  →  ai_credit_ledger (reference_id = Stripe session ID)
 *   - Invoice payment  →  invoices.stripe_checkout_session_id
 *   - Service purchase →  client_services (no stripe ID stored) + ai_credit_ledger
 *
 * We treat the union of session IDs across those tables as "events we
 * processed". For non-checkout event types (payment_intent.*,
 * customer.*, etc.) there is currently no DB record — those are noted
 * as unhandled-type drift rather than missing.
 *
 * Drift conditions reported:
 *   1. checkout.session.completed events Stripe fired but our DB has no
 *      corresponding record for (missed / dropped).
 *   2. Stripe reports zero checkout events this hour but our DB has
 *      checkout-session rows from the previous hour (suggests webhook
 *      delivery has stopped).
 *   3. Stripe fired other event types in the window that our handler does
 *      not process (informational — not an exit-1 condition unless we
 *      choose to escalate later).
 *
 * Exit codes:
 *   0  healthy (no drift)
 *   1  drift detected
 *   2  configuration error
 *
 * Used by .github/workflows/sd2026-stripe-webhook-health.yml (hourly).
 */

import Stripe from 'stripe';
import postgres from 'postgres';

// ─── Env validation ────────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_TO_EMAIL = process.env.DIGEST_TO_EMAIL;

const missing: string[] = [];
if (!STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
if (!DATABASE_URL) missing.push('DATABASE_URL');
if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');
if (!DIGEST_TO_EMAIL) missing.push('DIGEST_TO_EMAIL');

if (missing.length > 0) {
  console.error(`[stripe-webhook-health] Missing required env vars: ${missing.join(', ')}`);
  process.exit(2);
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_SECONDS = 60 * 60;            // 1 hour
const PRIOR_WINDOW_SECONDS = 2 * 60 * 60; // 2 hours back (for the inverse check)
const NOW_UNIX = Math.floor(Date.now() / 1000);
const WINDOW_START = NOW_UNIX - WINDOW_SECONDS;
const PRIOR_WINDOW_START = NOW_UNIX - PRIOR_WINDOW_SECONDS;

// Event types the webhook handler actually responds to.
const HANDLED_EVENT_TYPES = new Set(['checkout.session.completed']);

// ─── Stripe ────────────────────────────────────────────────────────────────────

const stripe = new Stripe(STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30' });

async function fetchStripeEvents(): Promise<Stripe.Event[]> {
  const events: Stripe.Event[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.events.list({
      created: { gte: WINDOW_START },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    events.push(...page.data);
    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return events;
}

// ─── Database ──────────────────────────────────────────────────────────────────

async function fetchDbCheckoutSessionIds(sql: postgres.Sql, since: number): Promise<Set<string>> {
  const sinceDate = new Date(since * 1000);

  // invoices table: stripe_checkout_session_id, paid_at (when webhook processed it)
  const invoiceRows = await sql<{ stripe_checkout_session_id: string }[]>`
    SELECT stripe_checkout_session_id
    FROM invoices
    WHERE stripe_checkout_session_id IS NOT NULL
      AND paid_at >= ${sinceDate}
  `;

  // ai_credit_ledger: reference_id holds the Stripe session ID for credit purchases
  // type = 'purchase' means it was a Stripe checkout, not a manual grant
  const creditRows = await sql<{ reference_id: string }[]>`
    SELECT reference_id
    FROM ai_credit_ledger
    WHERE type = 'purchase'
      AND reference_id IS NOT NULL
      AND reference_id LIKE 'cs_%'
      AND created_at >= ${sinceDate}
  `;

  const ids = new Set<string>();
  for (const row of invoiceRows) ids.add(row.stripe_checkout_session_id);
  for (const row of creditRows) ids.add(row.reference_id);
  return ids;
}

// Fetch the count of checkout-related DB records from the prior hour window
// (to detect the "webhook stopped firing" scenario).
async function fetchPriorWindowDbCount(sql: postgres.Sql): Promise<number> {
  const priorStart = new Date(PRIOR_WINDOW_START * 1000);
  const windowStart = new Date(WINDOW_START * 1000);

  const [invoiceCount] = await sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM invoices
    WHERE stripe_checkout_session_id IS NOT NULL
      AND paid_at >= ${priorStart}
      AND paid_at < ${windowStart}
  `;

  const [creditCount] = await sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM ai_credit_ledger
    WHERE type = 'purchase'
      AND reference_id IS NOT NULL
      AND reference_id LIKE 'cs_%'
      AND created_at >= ${priorStart}
      AND created_at < ${windowStart}
  `;

  return parseInt(invoiceCount.count, 10) + parseInt(creditCount.count, 10);
}

// ─── Resend alert ──────────────────────────────────────────────────────────────

async function sendAlert(subject: string, body: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'alerts@simplerdevelopment.com',
      to: [DIGEST_TO_EMAIL],
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[stripe-webhook-health] Resend error ${res.status}: ${text}`);
  } else {
    console.log('[stripe-webhook-health] Alert email sent.');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL!, { max: 1, idle_timeout: 5 });

try {
  console.log(`[stripe-webhook-health] Window: ${new Date(WINDOW_START * 1000).toISOString()} → ${new Date(NOW_UNIX * 1000).toISOString()}`);

  // Fetch in parallel
  const [stripeEvents, dbSessionIds, priorWindowDbCount] = await Promise.all([
    fetchStripeEvents(),
    fetchDbCheckoutSessionIds(sql, WINDOW_START),
    fetchPriorWindowDbCount(sql),
  ]);

  // Partition Stripe events by type
  const checkoutEvents = stripeEvents.filter(e => e.type === 'checkout.session.completed');
  const unhandledEvents = stripeEvents.filter(e => !HANDLED_EVENT_TYPES.has(e.type));

  // Build set of Stripe checkout session IDs from current window
  const stripeCheckoutSessionIds = new Set(
    checkoutEvents.map(e => (e.data.object as { id: string }).id),
  );

  // Drift: Stripe fired checkout events our DB has no record of
  const missedByDb: string[] = [];
  for (const sessionId of stripeCheckoutSessionIds) {
    if (!dbSessionIds.has(sessionId)) {
      missedByDb.push(sessionId);
    }
  }

  // Inverse: prior window had DB activity but current Stripe window is empty
  const silentWebhook = checkoutEvents.length === 0 && priorWindowDbCount > 0;

  // Summary to stdout
  console.log('');
  console.log(`Stripe events in window:        ${stripeEvents.length}`);
  console.log(`  checkout.session.completed:   ${checkoutEvents.length}`);
  console.log(`  other (unhandled) types:      ${unhandledEvents.length}`);
  console.log(`DB checkout records in window:  ${dbSessionIds.size}`);
  console.log(`DB records in prior hour:       ${priorWindowDbCount}`);
  console.log('');

  const driftLines: string[] = [];

  if (missedByDb.length > 0) {
    driftLines.push(`Missed checkout events (${missedByDb.length} — Stripe fired, DB has no record):`);
    for (const id of missedByDb) driftLines.push(`  - ${id}`);
  }

  if (silentWebhook) {
    driftLines.push(
      `Silent webhook detected: Stripe shows 0 checkout events this hour, ` +
      `but the prior hour had ${priorWindowDbCount} DB record(s). ` +
      `Webhook may have stopped delivering.`,
    );
  }

  if (unhandledEvents.length > 0) {
    const typeCounts = new Map<string, number>();
    for (const e of unhandledEvents) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    const typeList = [...typeCounts.entries()].map(([t, n]) => `  - ${t} (${n})`).join('\n');
    console.log(`Unhandled event types in window (informational):\n${typeList}`);
  }

  if (driftLines.length === 0) {
    console.log('Healthy — no drift detected.');
    process.exit(0);
  }

  // Drift detected
  const driftReport = driftLines.join('\n');
  console.log('::error::Stripe webhook drift detected.');
  console.log(driftReport);

  const emailSubject = `[sd2026] Stripe webhook drift detected — ${new Date().toISOString()}`;
  const emailBody = [
    'Stripe webhook health check detected drift in the last 60 minutes.',
    '',
    driftReport,
    '',
    `Window: ${new Date(WINDOW_START * 1000).toISOString()} → ${new Date(NOW_UNIX * 1000).toISOString()}`,
    '',
    'Tables checked:',
    '  invoices.stripe_checkout_session_id (paid_at in window)',
    '  ai_credit_ledger.reference_id where type = purchase (created_at in window)',
    '',
    'Investigate:',
    '  - Stripe Dashboard > Webhooks > Recent deliveries',
    '  - app/api/stripe/webhook/route.ts',
    '  - Vercel function logs for the webhook endpoint',
  ].join('\n');

  await sendAlert(emailSubject, emailBody);

  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
