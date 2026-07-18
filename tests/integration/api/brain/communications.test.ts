/**
 * Brain communications (meetings) — POST on /communications, PUT/DELETE on
 * /communications/[id], GET on /communications/[id]/attachments/[idx],
 * GET on /communications/[id]/review.
 *
 * Contract:
 *   - 401 unauth
 *   - POST: refuses when brain profile is not enabled (400)
 *   - POST: rejects unknown adapter, missing input, both companyId+dealId
 *   - PUT (link): 404 cross-tenant; 400 when both companyId+dealId
 *   - DELETE: 404 missing; 404 cross-tenant; 200 own
 *   - Attachments[idx]: 404 cross-tenant meeting; 404 unknown attachment
 *   - Review GET: returns review items scoped to the caller's meeting only
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function ensureBrainEnabled(ctx: TenantCtx): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_profiles (
      client_id, name, industry_template, enabled, default_confidentiality,
      ai_provider, enabled_modules, service_lines, email_ingest_token, auto_process_email, auto_link_crm
    ) VALUES (
      ${ctx.client.id}, ${`Brain-${ctx.client.id}`}, 'generic', true, 'standard',
      'anthropic',
      ${JSON.stringify({ meetings: true, tasks: true, prospects: false, knowledge: true, ask: false, automations: true, calendar: true })}::jsonb,
      '[]'::jsonb,
      ${'tok-' + Date.now() + '-' + Math.floor(Math.random() * 9999)},
      false, false
    )
    ON CONFLICT (client_id) DO UPDATE SET enabled = true
  `;
}

async function seedMeeting(ctx: TenantCtx, overrides: { sourceMetadata?: Record<string, unknown> } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const sourceRef = `paste:${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const meta = overrides.sourceMetadata ?? {};
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_meetings (
      client_id, title, status, confidentiality_level, source, source_ref, source_metadata
    ) VALUES (
      ${ctx.client.id}, ${`meeting-${Date.now()}`}, 'draft', 'standard', 'paste', ${sourceRef}, ${JSON.stringify(meta)}::jsonb
    )
    RETURNING id
  `;
  return row;
}

describe('Brain communications — POST /communications @brain @communications', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-comm-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/communications/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('400 when brain profile is not enabled', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { adapterId: 'paste', input: { transcript: 'hi' } } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/not enabled/i);
  });

  it('400 unknown adapter', async () => {
    await ensureBrainEnabled(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { adapterId: 'definitely-not-an-adapter', input: { transcript: 'x' } } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/not available/i);
  });

  it('400 missing adapter input', async () => {
    await ensureBrainEnabled(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { adapterId: 'paste' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when both companyId and dealId provided', async () => {
    await ensureBrainEnabled(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { adapterId: 'paste', input: { transcript: 'x' }, companyId: 1, dealId: 1 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/company OR a deal/);
  });

  it('creates a meeting scoped to the caller tenant', async () => {
    await ensureBrainEnabled(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          adapterId: 'paste',
          input: { transcript: 'Alice: hello.\nBob: hi.', title: 'Test Meeting' },
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; title: string; source: string }[]>`
      SELECT client_id, title, source FROM ${sql(TEST_SCHEMA)}.brain_meetings WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.title).toBe('Test Meeting');
    expect(row.source).toBe('paste');
  });
});

describe('Brain communications — PUT /communications/[id] @brain @communications', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-comm-put'); });

  it('400 invalid id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: 'abc' }, body: { companyId: null } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when both companyId and dealId given', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const m = await seedMeeting(A);
    const route = await import('@/app/api/portal/brain/communications/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: String(m.id) }, body: { companyId: 1, dealId: 1 } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/company OR a deal/);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-comm-put-b');
    const meetingB = await seedMeeting(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/communications/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { params: { id: String(meetingB.id) }, body: { companyId: null } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain communications — DELETE /communications/[id] @brain @communications', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-comm-del'); });

  it('deletes own meeting', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const m = await seedMeeting(A);
    const route = await import('@/app/api/portal/brain/communications/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(m.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_meetings WHERE id = ${m.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 missing id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-comm-del-b');
    const meetingB = await seedMeeting(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/communications/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(meetingB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_meetings WHERE id = ${meetingB.id}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('Brain communications — GET /communications/[id]/attachments/[idx] @brain @communications', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-comm-att'); });

  it('404 cross-tenant meeting', async () => {
    const B = await sessionForNewClientUser('brain-comm-att-b');
    const meetingB = await seedMeeting(B, {
      sourceMetadata: { attachments: [{ key: 'media/foo.png', filename: 'foo.png', contentType: 'image/png', size: 1 }] },
    });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/communications/[id]/attachments/[idx]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(meetingB.id), idx: '0' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 when attachment index is out of range', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const m = await seedMeeting(A, { sourceMetadata: { attachments: [] } });
    const route = await import('@/app/api/portal/brain/communications/[id]/attachments/[idx]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(m.id), idx: '5' } },
    );
    expect(res.status).toBe(404);
  });

  it('400 on invalid ids', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/[id]/attachments/[idx]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: 'abc', idx: 'def' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('Brain communications — GET /communications/[id]/review @brain @communications', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-comm-rev'); });

  it('returns review items only for the caller\'s meeting (cross-tenant safety)', async () => {
    const B = await sessionForNewClientUser('brain-comm-rev-b');
    const meetingA = await seedMeeting(A);
    const meetingB = await seedMeeting(B);

    const sql = getTestSql();
    // Tenant B has a review item attached to their own meeting.
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_ai_review_items (
        client_id, source_type, source_id, proposed_type, proposed_payload, status
      ) VALUES (
        ${B.client.id}, 'meeting', ${meetingB.id}, 'task', ${'{"title":"B-secret"}'}::jsonb, 'pending'
      )
    `;
    // And another item for A's meeting that should be visible.
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_ai_review_items (
        client_id, source_type, source_id, proposed_type, proposed_payload, status
      ) VALUES (
        ${A.client.id}, 'meeting', ${meetingA.id}, 'task', ${'{"title":"A-own"}'}::jsonb, 'pending'
      )
    `;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/communications/[id]/review/route');

    // Caller A asks for items on their own meeting → returns A's own item.
    const ownRes = await callHandler<{ success: boolean; data: Array<{ proposedPayload: { title: string } }> }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(meetingA.id) } },
    );
    expect(ownRes.status).toBe(200);
    const titles = ownRes.data!.data.map(i => i.proposedPayload?.title);
    expect(titles).toContain('A-own');
    expect(titles).not.toContain('B-secret');

    // Caller A asks for items on B's meeting id → empty array
    // (clientId filter on listReviewItems prevents leak).
    const crossRes = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(meetingB.id) } },
    );
    expect(crossRes.status).toBe(200);
    expect(crossRes.data?.data).toEqual([]);
  });
});
