import { createHmac } from 'crypto';
import { db } from '@/lib/db';
import { projectWebhooks, projectWebhookDeliveries } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { assertSafeUrl } from '@/lib/ssrf-guard';

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function deliver(webhookId: number, url: string, secret: string, event: string, payload: Record<string, unknown>): Promise<{ status?: number; error?: string }> {
  const body = JSON.stringify({ event, data: payload, deliveredAt: new Date().toISOString() });
  const signature = signPayload(secret, body);
  try {
    // Re-check at dispatch time (guards against DNS rebinding between registration and send)
    await assertSafeUrl(url);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SimplerDev-Event': event,
        'X-SimplerDev-Signature': `sha256=${signature}`,
        'X-SimplerDev-Webhook-Id': String(webhookId),
      },
      body,
      signal: ctrl.signal,
      // Don't follow redirects — an attacker could register a safe URL that
      // 302s to a private address. fetch() in Node defaults to follow; we
      // handle redirects manually here by disabling them.
      redirect: 'manual',
    });
    clearTimeout(timer);
    return { status: res.status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fire project webhooks for an event. Fire-and-forget — never awaited by the caller.
 * Swallows errors; delivery outcome is persisted for debugging.
 */
export function fireProjectEvent(projectId: number, event: string, payload: Record<string, unknown>): void {
  (async () => {
    try {
      const hooks = await db.select().from(projectWebhooks)
        .where(and(eq(projectWebhooks.projectId, projectId), eq(projectWebhooks.active, true)));

      for (const hook of hooks) {
        const subscribed = !hook.events || hook.events.length === 0 || hook.events.includes(event) || hook.events.includes('*');
        if (!subscribed) continue;

        const result = await deliver(hook.id, hook.url, hook.secret, event, payload);
        const ok = result.status !== undefined && result.status >= 200 && result.status < 300;

        await db.update(projectWebhooks).set({
          lastFiredAt: new Date(),
          lastStatus: result.status ?? null,
          failureCount: ok ? 0 : sql`${projectWebhooks.failureCount} + 1`,
          // Auto-disable after 10 consecutive failures
          active: ok ? true : sql`CASE WHEN ${projectWebhooks.failureCount} + 1 >= 10 THEN false ELSE ${projectWebhooks.active} END`,
        }).where(eq(projectWebhooks.id, hook.id));

        await db.insert(projectWebhookDeliveries).values({
          webhookId: hook.id,
          event,
          status: result.status ?? null,
          error: result.error ?? null,
          payload: { event, data: payload },
        });
      }
    } catch (err) {
      console.error('[fireProjectEvent]', err);
    }
  })();
}

export function generateWebhookSecret(): string {
  // 32 bytes → 64 hex chars
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
