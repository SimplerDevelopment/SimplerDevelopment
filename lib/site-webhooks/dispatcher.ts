/**
 * Site (tenant-level) outbound webhook dispatcher.
 *
 * Registered as an automation event-bus handler (see lib/automation/engine.ts).
 * For every emitted AutomationEvent it finds the client's enabled site_webhooks
 * subscribed to that event and delivers an HMAC-signed POST, with a 3-attempt
 * linear retry (1s/4s/16s) and one delivery-log row per attempt.
 *
 * Mirrors lib/survey-webhooks/dispatcher.ts. Kept independent on purpose so the
 * two webhook surfaces can evolve separately. Fire-and-forget: errors are
 * captured into delivery rows + console.error and never bubble to the emitter.
 */

import { createHmac } from 'crypto';
import { db } from '@/lib/db';
import { siteWebhooks, siteWebhookDeliveries } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import type { AutomationEvent } from '@/lib/automation/event-bus';

export const RETRY_BACKOFF_MS = [1_000, 4_000, 16_000] as const;
export const REQUEST_TIMEOUT_MS = 8_000;
export const MAX_RESPONSE_BODY_LEN = 2_000;

export interface SiteWebhookEventPayload {
  event: string;
  clientId: number;
  userId: number | null;
  payload: Record<string, unknown>;
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

async function attemptDelivery(
  webhookId: number,
  url: string,
  secret: string | null,
  event: string,
  body: string,
): Promise<AttemptResult> {
  try {
    // SSRF-checked at dispatch time (guards DNS rebinding between registration
    // and send); redirects disabled so a safe URL can't 302 to a private host.
    await assertSafeUrl(url);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-SD-Event': event,
      'X-SimplerDev-Event': event,
      'X-SimplerDev-Webhook-Id': String(webhookId),
    };
    if (secret) {
      const signature = signPayload(secret, body);
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
      redirect: 'manual',
    });
    clearTimeout(timer);

    let respBody: string | undefined;
    try {
      const txt = await res.text();
      respBody = txt.length > MAX_RESPONSE_BODY_LEN ? txt.slice(0, MAX_RESPONSE_BODY_LEN) : txt;
    } catch {
      // body read failed — status code is what we record.
    }

    const ok = res.status >= 200 && res.status < 300;
    return {
      status: ok ? 'success' : 'failed',
      statusCode: res.status,
      responseBody: respBody,
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverWithRetry(
  webhook: typeof siteWebhooks.$inferSelect,
  event: string,
  payload: SiteWebhookEventPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  let last: AttemptResult = { status: 'failed', error: 'no attempts run' };

  for (let attempt = 1; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    last = await attemptDelivery(webhook.id, webhook.url, webhook.secret, event, body);

    try {
      await db.insert(siteWebhookDeliveries).values({
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
      console.error('[site-webhooks] failed to persist delivery row', err);
    }

    if (last.status === 'success') break;
    if (attempt < RETRY_BACKOFF_MS.length) await sleep(RETRY_BACKOFF_MS[attempt - 1]);
  }

  const success = last.status === 'success';
  try {
    await db.update(siteWebhooks).set({
      lastFiredAt: new Date(),
      lastStatus: last.statusCode ?? null,
      failureCount: success ? 0 : sql`${siteWebhooks.failureCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(siteWebhooks.id, webhook.id));
  } catch (err) {
    console.error('[site-webhooks] failed to update webhook tracking', err);
  }
}

/** True if a webhook's `events` array subscribes to `event` ('*' = wildcard). */
function isSubscribed(events: string[] | null, event: string): boolean {
  const list = events ?? [];
  return list.length === 0 || list.includes(event) || list.includes('*');
}

/**
 * Automation event-bus handler. Registered once at startup. Fire-and-forget —
 * the event bus already invokes handlers without awaiting and swallows rejections.
 */
export async function dispatchSiteWebhooksForEvent(automationEvent: AutomationEvent): Promise<void> {
  const { event, clientId, userId, payload } = automationEvent;

  const hooks = await db.select().from(siteWebhooks)
    .where(and(eq(siteWebhooks.clientId, clientId), eq(siteWebhooks.enabled, true)));
  if (hooks.length === 0) return;

  const subscribed = hooks.filter((h) => isSubscribed(h.events, event));
  if (subscribed.length === 0) return;

  const body: SiteWebhookEventPayload = {
    event,
    clientId,
    userId: userId ?? null,
    payload: payload ?? {},
    deliveredAt: new Date().toISOString(),
  };

  await Promise.all(
    subscribed.map((h) =>
      deliverWithRetry(h, event, body).catch((err) =>
        console.error('[site-webhooks] deliverWithRetry threw', err),
      ),
    ),
  );
}

/** Generate a 64-char hex signing secret. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
