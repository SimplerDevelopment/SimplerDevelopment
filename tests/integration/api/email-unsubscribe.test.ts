/**
 * Email unsubscribe token flow.
 *
 * /api/email/unsubscribe is the legal-compliance endpoint that CAN-SPAM and
 * RFC 8058 require. Two verbs:
 *   - GET  ?token=... → mark subscriber unsubscribed + redirect to /unsubscribed
 *   - POST ?token=... → one-click unsubscribe (RFC 8058), 200 + no body
 *
 * Correctness bar: token must uniquely identify a subscriber; unknown tokens
 * never leak existence; calling twice is idempotent.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function createSubscriber(opts: { clientId?: number | null; status?: string } = {}): Promise<{ subscriberId: number; token: string; listId: number }> {
  const sql = getTestSql();
  const [list] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_lists (name, client_id)
    VALUES ('test-list', ${opts.clientId ?? null}) RETURNING id
  `;
  const token = crypto.randomBytes(32).toString('hex');
  const email = `sub-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
  const [sub] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.email_subscribers (list_id, email, status, unsubscribe_token)
    VALUES (${list.id}, ${email}, ${opts.status ?? 'active'}, ${token}) RETURNING id
  `;
  return { subscriberId: sub.id, token, listId: list.id };
}

describe('GET /api/email/unsubscribe @email', () => {
  it('rejects missing token with 400', async () => {
    const route = await import('@/app/api/email/unsubscribe/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { url: 'http://localhost:3000/api/email/unsubscribe' },
    );
    expect(res.status).toBe(400);
  });

  it('rejects an unknown token with 404', async () => {
    const route = await import('@/app/api/email/unsubscribe/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { token: 'totally-fake-token' } },
    );
    expect(res.status).toBe(404);
  });

  it('marks the subscriber unsubscribed, stamps unsubscribedAt, and 302-redirects', async () => {
    const ctx = await sessionForNewClientUser('unsub');
    const { subscriberId, token } = await createSubscriber({ clientId: ctx.client.id });

    const route = await import('@/app/api/email/unsubscribe/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { token } },
    );

    expect([301, 302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/\/unsubscribed$/);

    const sql = getTestSql();
    const [after] = await sql<{ status: string; unsubscribed_at: Date | null }[]>`
      SELECT status, unsubscribed_at FROM ${sql(TEST_SCHEMA)}.email_subscribers WHERE id = ${subscriberId}
    `;
    expect(after.status).toBe('unsubscribed');
    expect(after.unsubscribed_at).not.toBeNull();
  });

  it('is idempotent — second call does not re-stamp unsubscribedAt', async () => {
    const ctx = await sessionForNewClientUser('unsub-idem');
    const { subscriberId, token } = await createSubscriber({ clientId: ctx.client.id });

    const route = await import('@/app/api/email/unsubscribe/route');
    await callHandler(route as unknown as Record<string, unknown>, 'GET', { query: { token } });

    const sql = getTestSql();
    const [first] = await sql<{ unsubscribed_at: Date | null }[]>`
      SELECT unsubscribed_at FROM ${sql(TEST_SCHEMA)}.email_subscribers WHERE id = ${subscriberId}
    `;
    const firstStamp = first.unsubscribed_at?.toISOString();

    // Second call — should still succeed, should NOT update the timestamp
    await new Promise(r => setTimeout(r, 10));
    const res2 = await callHandler(route as unknown as Record<string, unknown>, 'GET', { query: { token } });
    expect([301, 302, 303, 307, 308]).toContain(res2.status);

    const [second] = await sql<{ unsubscribed_at: Date | null }[]>`
      SELECT unsubscribed_at FROM ${sql(TEST_SCHEMA)}.email_subscribers WHERE id = ${subscriberId}
    `;
    expect(second.unsubscribed_at?.toISOString()).toBe(firstStamp);
  });

  it('does not re-run the campaign counter increment on a replayed click', async () => {
    const ctx = await sessionForNewClientUser('unsub-counter');
    const { subscriberId, token, listId } = await createSubscriber({ clientId: ctx.client.id });

    const sql = getTestSql();
    // Seed a campaign that sent to this subscriber — starting unsubscribed count = 0
    const [campaign] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.email_campaigns
        (client_id, list_id, name, subject, from_name, from_email, html_content, status, total_unsubscribed)
      VALUES
        (${ctx.client.id}, ${listId}, 'T', 'Hi', 'From', 'from@test.local', '<p></p>', 'sent', 0)
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.email_campaign_sends (campaign_id, subscriber_id, sent_at)
      VALUES (${campaign.id}, ${subscriberId}, now())
    `;

    const route = await import('@/app/api/email/unsubscribe/route');
    await callHandler(route as unknown as Record<string, unknown>, 'GET', { query: { token } });
    const [afterFirst] = await sql<{ total_unsubscribed: number }[]>`
      SELECT total_unsubscribed FROM ${sql(TEST_SCHEMA)}.email_campaigns WHERE id = ${campaign.id}
    `;
    expect(afterFirst.total_unsubscribed).toBe(1);

    // Second click: no re-increment
    await callHandler(route as unknown as Record<string, unknown>, 'GET', { query: { token } });
    const [afterSecond] = await sql<{ total_unsubscribed: number }[]>`
      SELECT total_unsubscribed FROM ${sql(TEST_SCHEMA)}.email_campaigns WHERE id = ${campaign.id}
    `;
    expect(afterSecond.total_unsubscribed).toBe(1);
  });
});

describe('POST /api/email/unsubscribe (RFC 8058 one-click) @email', () => {
  it('rejects missing token with 400', async () => {
    const route = await import('@/app/api/email/unsubscribe/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { url: 'http://localhost:3000/api/email/unsubscribe' },
    );
    expect(res.status).toBe(400);
  });

  it('rejects an unknown token with 404', async () => {
    const route = await import('@/app/api/email/unsubscribe/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { query: { token: 'bogus' } },
    );
    expect(res.status).toBe(404);
  });

  it('accepts a valid token and marks the subscriber unsubscribed', async () => {
    const ctx = await sessionForNewClientUser('oneclick');
    const { subscriberId, token } = await createSubscriber({ clientId: ctx.client.id });

    const route = await import('@/app/api/email/unsubscribe/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { query: { token } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [after] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.email_subscribers WHERE id = ${subscriberId}
    `;
    expect(after.status).toBe('unsubscribed');
  });

  it('is idempotent — POST twice returns 200 both times', async () => {
    const ctx = await sessionForNewClientUser('oneclick-idem');
    const { token } = await createSubscriber({ clientId: ctx.client.id });
    const route = await import('@/app/api/email/unsubscribe/route');
    const first = await callHandler(route as unknown as Record<string, unknown>, 'POST', { query: { token } });
    const second = await callHandler(route as unknown as Record<string, unknown>, 'POST', { query: { token } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
