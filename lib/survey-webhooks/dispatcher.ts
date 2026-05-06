/**
 * Survey webhook dispatcher.
 *
 * Today: inline `fetch` with 3-attempt linear retry (1s, 4s, 16s).
 * Tomorrow (Phase 4 / HOOK-02): BullMQ queue, gated on Upstash Redis provisioning.
 * The interface boundary is intentionally narrow — `enqueueDelivery` is the only
 * call site that needs to swap once a queue exists.
 *
 * TODO(HOOK-02 / Phase 4): replace `enqueueDelivery` with a BullMQ producer that
 * pushes a job onto the `survey-webhooks` queue. The worker can reuse
 * `attemptDelivery` verbatim and persist into `survey_webhook_deliveries` on
 * each pickup. The `dispatchSurveyResponseWebhooks` entry-point stays unchanged.
 */

import { createHmac } from 'crypto';
import { db } from '@/lib/db';
import {
  surveyWebhooks,
  surveyWebhookDeliveries,
  surveyResponses,
} from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { assertSafeUrl } from '@/lib/ssrf-guard';

export const RETRY_BACKOFF_MS = [1_000, 4_000, 16_000] as const;
export const REQUEST_TIMEOUT_MS = 8_000;
export const MAX_RESPONSE_BODY_LEN = 2_000;

export type SurveyResponseRow = typeof surveyResponses.$inferSelect;

export interface SurveyResponseEventPayload {
  event: 'response.submitted';
  surveyId: number;
  surveyTitle: string;
  surveySlug: string;
  responseId: number;
  formName: string;
  source: string | null;
  sourceId: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
  answers: Record<string, unknown>;
  completedAt: string | null;
  deliveredAt: string;
}

export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

interface AttemptResult {
  status: 'success' | 'failed';
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

/**
 * Single HTTP attempt. SSRF-checked at dispatch time (guards DNS rebinding
 * between registration and send) and bounded by REQUEST_TIMEOUT_MS.
 */
async function attemptDelivery(
  webhookId: number,
  url: string,
  secret: string | null,
  event: string,
  body: string,
): Promise<AttemptResult> {
  try {
    await assertSafeUrl(url);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-SD-Event': event,
      'X-SimplerDev-Event': event,
      'X-SimplerDev-Webhook-Id': String(webhookId),
    };
    if (secret) {
      const signature = signPayload(secret, body);
      // Spec says X-SD-Signature; mirror the project-webhook X-SimplerDev-* set
      // so existing tooling that consumes either prefix keeps working.
      headers['X-SD-Signature'] = `sha256=${signature}`;
      headers['X-SimplerDev-Signature'] = `sha256=${signature}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: ctrl.signal,
      // An attacker could register a safe URL that 302s to a private address.
      // Disable redirects; let the dispatcher record the 3xx as a failure.
      redirect: 'manual',
    });
    clearTimeout(timer);

    let respBody: string | undefined;
    try {
      const txt = await res.text();
      respBody = txt.length > MAX_RESPONSE_BODY_LEN ? txt.slice(0, MAX_RESPONSE_BODY_LEN) : txt;
    } catch {
      // body read failed — non-fatal, status code is what we record.
    }

    const ok = res.status >= 200 && res.status < 300;
    return {
      status: ok ? 'success' : 'failed',
      statusCode: res.status,
      responseBody: respBody,
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Fixed sleep helper — used between attempts. Resolves regardless of caller awaiting. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the retry loop for one webhook. Persists one delivery row per attempt and
 * updates the `survey_webhooks` tracking columns at the end. Returns nothing —
 * errors are swallowed to delivery rows + console.error so the caller (a
 * fire-and-forget dispatch) can't crash the surrounding request.
 */
async function deliverWithRetry(
  webhook: typeof surveyWebhooks.$inferSelect,
  event: string,
  payload: SurveyResponseEventPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  let last: AttemptResult = { status: 'failed', error: 'no attempts run' };

  for (let attempt = 1; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    last = await attemptDelivery(webhook.id, webhook.url, webhook.secret, event, body);

    try {
      await db.insert(surveyWebhookDeliveries).values({
        webhookId: webhook.id,
        event,
        attempt,
        status: last.status,
        statusCode: last.statusCode ?? null,
        requestBody: payload as unknown as Record<string, unknown>,
        responseBody: last.responseBody ?? null,
        error: last.error ?? null,
      });
    } catch (err) {
      console.error('[survey-webhooks] failed to persist delivery row', err);
    }

    if (last.status === 'success') break;

    // Backoff before the next attempt — but only if there is one.
    if (attempt < RETRY_BACKOFF_MS.length) {
      await sleep(RETRY_BACKOFF_MS[attempt - 1]);
    }
  }

  const success = last.status === 'success';
  try {
    await db.update(surveyWebhooks).set({
      lastFiredAt: new Date(),
      lastStatus: last.statusCode ?? null,
      failureCount: success ? 0 : sql`${surveyWebhooks.failureCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(surveyWebhooks.id, webhook.id));
  } catch (err) {
    console.error('[survey-webhooks] failed to update webhook tracking', err);
  }
}

/**
 * Public entry-point — fire-and-forget. Caller must NOT await this. Wrap in
 * `setImmediate` (or call inline followed by `.catch(console.error)`) so the
 * response submission isn't blocked by webhook latency.
 *
 * TODO(HOOK-02 / Phase 4): swap this body for `await enqueueDelivery(...)`
 * once BullMQ + Upstash Redis are wired up. The signature stays.
 */
export async function dispatchSurveyResponseWebhooks(
  response: SurveyResponseRow & { surveyTitle: string; surveySlug: string },
): Promise<void> {
  const event = 'response.submitted';

  const hooks = await db.select().from(surveyWebhooks)
    .where(and(
      eq(surveyWebhooks.surveyId, response.surveyId),
      eq(surveyWebhooks.enabled, true),
    ));

  if (hooks.length === 0) return;

  const payload: SurveyResponseEventPayload = {
    event,
    surveyId: response.surveyId,
    surveyTitle: response.surveyTitle,
    surveySlug: response.surveySlug,
    responseId: response.id,
    formName: response.formName,
    source: response.source,
    sourceId: response.sourceId,
    respondentName: response.respondentName,
    respondentEmail: response.respondentEmail,
    answers: response.answers,
    completedAt: response.completedAt ? response.completedAt.toISOString() : null,
    deliveredAt: new Date().toISOString(),
  };

  // Filter to webhooks subscribed to this event. An empty events array (or
  // missing event in the array) means "not subscribed". '*' is a wildcard.
  const subscribed = hooks.filter((h) => {
    const events = h.events ?? [];
    return events.length === 0 || events.includes(event) || events.includes('*');
  });

  // Run deliveries in parallel — each owns its own retry loop, errors are
  // captured into delivery rows so a hang in one webhook can't starve another.
  await Promise.all(subscribed.map((h) => deliverWithRetry(h, event, payload).catch((err) => {
    console.error('[survey-webhooks] deliverWithRetry threw', err);
  })));
}

/**
 * Generate a 64-char hex secret. Mirrors `lib/pm-webhooks.generateWebhookSecret`
 * — kept local to avoid coupling survey webhooks to project webhooks.
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
