/**
 * Integration test for the project-webhook delivery pipeline.
 *
 * Exercises:
 *   - HMAC signing (signature matches body)
 *   - Delivery headers (X-SimplerDev-Event / -Signature / -Webhook-Id)
 *   - last_status / failure_count bookkeeping
 *   - Auto-disable after 10 consecutive failures
 *   - project_webhook_deliveries persistence
 *
 * The SSRF runtime check is mocked — the sink runs on 127.0.0.1 and the real
 * guard (correctly) rejects loopback. Unit tests cover the guard itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('@/lib/ssrf-guard', async () => ({
  validateWebhookUrl: (url: string) => ({ ok: true as const, hostname: new URL(url).hostname }),
  assertSafeUrl: vi.fn().mockResolvedValue(undefined),
}));

import { fireProjectEvent } from '@/lib/pm-webhooks';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';
import { startWebhookSink, waitUntil, type WebhookSink } from '../../helpers/webhook-sink';

async function createProject(clientId: number, userId: number): Promise<number> {
  const sql = getTestSql();
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Webhook test project', ${clientId}, 'active', ${userId}) RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${p.id}, ${userId}, 'owner')
  `;
  return p.id;
}

async function createWebhook(projectId: number, url: string, secret: string, events: string[] = []): Promise<number> {
  const sql = getTestSql();
  const [h] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_webhooks (project_id, url, secret, events, active)
    VALUES (${projectId}, ${url}, ${secret}, ${JSON.stringify(events)}::jsonb, true)
    RETURNING id
  `;
  return h.id;
}

describe('Webhook delivery @webhooks @integration', () => {
  let sink: WebhookSink;
  beforeEach(async () => { sink = await startWebhookSink(); });
  afterEach(async () => { await sink.close(); });

  it('signs the payload with HMAC-SHA256 and delivers all three custom headers', async () => {
    const ctx = await sessionForNewClientUser('wh-sign');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    const secret = 'a'.repeat(64);
    const hookId = await createWebhook(projectId, sink.url, secret);

    fireProjectEvent(projectId, 'card.created', { cardId: 42 });

    await waitUntil(() => sink.deliveries.length === 1 ? sink.deliveries[0] : null);
    const d = sink.deliveries[0];

    expect(d.method).toBe('POST');
    expect(d.headers['content-type']).toContain('application/json');
    expect(d.headers['x-simplerdev-event']).toBe('card.created');
    expect(d.headers['x-simplerdev-webhook-id']).toBe(String(hookId));

    const expected = 'sha256=' + createHmac('sha256', secret).update(d.rawBody).digest('hex');
    expect(d.headers['x-simplerdev-signature']).toBe(expected);

    // Body shape check
    const body = d.bodyJson as { event: string; data: { cardId: number } };
    expect(body.event).toBe('card.created');
    expect(body.data.cardId).toBe(42);
  });

  it('resets failure_count to 0 and records last_status=200 on success', async () => {
    const ctx = await sessionForNewClientUser('wh-ok');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    const hookId = await createWebhook(projectId, sink.url, 'sec');

    // Pre-set failure_count to prove it resets
    const sql = getTestSql();
    await sql`UPDATE ${sql(TEST_SCHEMA)}.project_webhooks SET failure_count = 5 WHERE id = ${hookId}`;

    fireProjectEvent(projectId, 'card.created', { cardId: 1 });

    await waitUntil(async () => {
      const [r] = await sql<{ last_status: number | null; failure_count: number }[]>`
        SELECT last_status, failure_count FROM ${sql(TEST_SCHEMA)}.project_webhooks WHERE id = ${hookId}
      `;
      return r?.last_status === 200 && r.failure_count === 0 ? r : null;
    });
  });

  it('increments failure_count when the sink returns 500', async () => {
    const ctx = await sessionForNewClientUser('wh-fail');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    const hookId = await createWebhook(projectId, sink.url, 'sec');

    sink.setNextResponse(500);
    fireProjectEvent(projectId, 'card.created', { cardId: 1 });

    const sql = getTestSql();
    await waitUntil(async () => {
      const [r] = await sql<{ last_status: number | null; failure_count: number }[]>`
        SELECT last_status, failure_count FROM ${sql(TEST_SCHEMA)}.project_webhooks WHERE id = ${hookId}
      `;
      return r?.last_status === 500 && r.failure_count === 1 ? r : null;
    });
  });

  it('auto-disables the webhook on the 10th consecutive failure', async () => {
    const ctx = await sessionForNewClientUser('wh-autodisable');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    const hookId = await createWebhook(projectId, sink.url, 'sec');

    const sql = getTestSql();
    // Pre-seed 9 failures → the next failure is the 10th → auto-disable threshold
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.project_webhooks
      SET failure_count = 9, last_status = 500 WHERE id = ${hookId}
    `;

    sink.setNextResponse(500);
    fireProjectEvent(projectId, 'card.created', { cardId: 1 });

    await waitUntil(async () => {
      const [r] = await sql<{ failure_count: number; active: boolean }[]>`
        SELECT failure_count, active FROM ${sql(TEST_SCHEMA)}.project_webhooks WHERE id = ${hookId}
      `;
      return r?.failure_count === 10 && r.active === false ? r : null;
    });
  });

  it('persists a row in project_webhook_deliveries per delivery (success case)', async () => {
    const ctx = await sessionForNewClientUser('wh-deliv-row');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    const hookId = await createWebhook(projectId, sink.url, 'sec');

    fireProjectEvent(projectId, 'card.created', { cardId: 7 });

    const sql = getTestSql();
    const row = await waitUntil(async () => {
      const rows = await sql<{ status: number | null; error: string | null; event: string }[]>`
        SELECT status, error, event FROM ${sql(TEST_SCHEMA)}.project_webhook_deliveries
        WHERE webhook_id = ${hookId}
      `;
      return rows.length === 1 ? rows[0] : null;
    });

    expect(row.event).toBe('card.created');
    expect(row.status).toBe(200);
    expect(row.error).toBe(null);
  });

  it('does not deliver when the subscribed events list excludes the event', async () => {
    const ctx = await sessionForNewClientUser('wh-unsub');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    await createWebhook(projectId, sink.url, 'sec', ['card.deleted']);

    fireProjectEvent(projectId, 'card.created', { cardId: 1 });

    // No delivery should arrive; wait a short while to be sure
    await new Promise(r => setTimeout(r, 500));
    expect(sink.deliveries.length).toBe(0);
  });

  it('delivers to "*" wildcard subscriptions', async () => {
    const ctx = await sessionForNewClientUser('wh-wildcard');
    const projectId = await createProject(ctx.client.id, ctx.user.id);
    await createWebhook(projectId, sink.url, 'sec', ['*']);

    fireProjectEvent(projectId, 'card.whatever', { foo: 'bar' });
    await waitUntil(() => sink.deliveries.length === 1 ? true : null);
    expect(sink.deliveries[0].headers['x-simplerdev-event']).toBe('card.whatever');
  });
});
