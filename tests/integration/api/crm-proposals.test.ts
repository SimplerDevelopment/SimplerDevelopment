/**
 * CRM proposals — public token flow.
 *
 * /api/proposals/[token] is the client-facing proposal viewer/signer. Token is
 * 64 hex chars. Flow:
 *   - GET: public view. Draft proposals are hidden. First GET after "sent" flips
 *          status to "viewed" and records firstViewedAt.
 *   - POST action=accept: signature required, flips status to "accepted"
 *   - POST action=decline: optional reason, flips status to "declined"
 *   - Expiry: if validUntil < now, POST flips to "expired" and refuses action
 *   - Once accepted/declined/expired, further POSTs are refused
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

async function createProposal(opts: {
  clientId: number;
  status?: string;
  validUntil?: Date | null;
  title?: string;
} = { clientId: 0 }): Promise<{ id: number; token: string }> {
  const sql = getTestSql();
  const token = crypto.randomBytes(32).toString('hex'); // 64 hex
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_proposals (
      client_id, title, status, client_token, valid_until
    ) VALUES (
      ${opts.clientId}, ${opts.title ?? 'Test Proposal'}, ${opts.status ?? 'sent'},
      ${token}, ${opts.validUntil ?? null}
    ) RETURNING id
  `;
  return { id: p.id, token };
}

describe('GET /api/proposals/[token] @crm @public', () => {
  it('rejects token of wrong length with 400', async () => {
    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token: 'short' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown (but well-formed) token', async () => {
    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token: 'a'.repeat(64) } },
    );
    expect(res.status).toBe(404);
  });

  it('hides draft proposals from the public endpoint (404)', async () => {
    const ctx = await sessionForNewClientUser('draft-proposal');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'draft' });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token } },
    );
    expect(res.status).toBe(404);
  });

  it('returns a sent proposal and flips status to viewed + stamps firstViewedAt on first view', async () => {
    const ctx = await sessionForNewClientUser('view-proposal');
    const { id, token } = await createProposal({ clientId: ctx.client.id, status: 'sent' });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; data: { id: number; status: string } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { token } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [after] = await sql<{ status: string; first_viewed_at: Date | null; view_count: number }[]>`
      SELECT status, first_viewed_at, view_count FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    expect(after.status).toBe('viewed');
    expect(after.first_viewed_at).not.toBeNull();
    expect(after.view_count).toBe(1);
  });

  it('increments view_count on subsequent views without re-setting firstViewedAt', async () => {
    const ctx = await sessionForNewClientUser('reviews');
    const { id, token } = await createProposal({ clientId: ctx.client.id, status: 'sent' });
    const route = await import('@/app/api/proposals/[token]/route');

    await callHandler(route as unknown as Record<string, unknown>, 'GET', { params: { token } });

    const sql = getTestSql();
    const [first] = await sql<{ first_viewed_at: Date }[]>`
      SELECT first_viewed_at FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    const firstStamp = first.first_viewed_at.toISOString();

    await callHandler(route as unknown as Record<string, unknown>, 'GET', { params: { token } });
    await callHandler(route as unknown as Record<string, unknown>, 'GET', { params: { token } });

    const [third] = await sql<{ first_viewed_at: Date; view_count: number }[]>`
      SELECT first_viewed_at, view_count FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    expect(third.first_viewed_at.toISOString()).toBe(firstStamp);
    expect(third.view_count).toBe(3);
  });
});

describe('POST /api/proposals/[token] accept @crm @public', () => {
  it('accepts a valid proposal with signature', async () => {
    const ctx = await sessionForNewClientUser('accept');
    const { id, token } = await createProposal({ clientId: ctx.client.id, status: 'viewed' });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { token },
        body: {
          action: 'accept',
          signatureName: 'Acme Inc.',
          signatureData: 'data:image/png;base64,iVBOR…',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('accepted');

    const sql = getTestSql();
    const [after] = await sql<{ status: string; signature_name: string | null; signed_at: Date | null; accepted_at: Date | null }[]>`
      SELECT status, signature_name, signed_at, accepted_at
      FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    expect(after.status).toBe('accepted');
    expect(after.signature_name).toBe('Acme Inc.');
    expect(after.signed_at).not.toBeNull();
    expect(after.accepted_at).not.toBeNull();
  });

  it('rejects acceptance without signatureName', async () => {
    const ctx = await sessionForNewClientUser('no-sig-name');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'viewed' });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'accept', signatureData: 'data:…' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/signature name/i);
  });

  it('rejects acceptance without signatureData', async () => {
    const ctx = await sessionForNewClientUser('no-sig-data');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'viewed' });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'accept', signatureName: 'Someone' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/signature data/i);
  });
});

describe('POST /api/proposals/[token] decline @crm @public', () => {
  it('declines a proposal and records the reason', async () => {
    const ctx = await sessionForNewClientUser('decline');
    const { id, token } = await createProposal({ clientId: ctx.client.id, status: 'viewed' });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'decline', reason: 'Price too high' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('declined');

    const sql = getTestSql();
    const [after] = await sql<{ status: string; decline_reason: string | null; declined_at: Date | null }[]>`
      SELECT status, decline_reason, declined_at FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    expect(after.status).toBe('declined');
    expect(after.decline_reason).toBe('Price too high');
    expect(after.declined_at).not.toBeNull();
  });

  it('decline without a reason is allowed (optional field)', async () => {
    const ctx = await sessionForNewClientUser('decline-noreason');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'viewed' });
    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'decline' } },
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/proposals/[token] lifecycle guards @crm @public', () => {
  it('refuses to act on a draft proposal (404)', async () => {
    const ctx = await sessionForNewClientUser('draft-action');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'draft' });
    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'decline' } },
    );
    expect(res.status).toBe(404);
  });

  it('refuses to re-accept a proposal that is already accepted', async () => {
    const ctx = await sessionForNewClientUser('double-accept');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'accepted' });
    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'accept', signatureName: 'X', signatureData: 'Y' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/already been accepted/i);
  });

  it('flips status to expired and refuses action when validUntil is in the past', async () => {
    const ctx = await sessionForNewClientUser('expired');
    const { id, token } = await createProposal({
      clientId: ctx.client.id,
      status: 'viewed',
      validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'accept', signatureName: 'X', signatureData: 'Y' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/expired/i);

    const sql = getTestSql();
    const [after] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    expect(after.status).toBe('expired');
  });

  it('rejects an unknown action with 400', async () => {
    const ctx = await sessionForNewClientUser('bad-action');
    const { token } = await createProposal({ clientId: ctx.client.id, status: 'viewed' });
    const route = await import('@/app/api/proposals/[token]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { token }, body: { action: 'steal' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid action/i);
  });
});
