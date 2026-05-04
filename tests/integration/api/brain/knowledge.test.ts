/**
 * Brain knowledge (notes) — POST/PATCH/DELETE on /knowledge + /knowledge/[id],
 * GET on /knowledge/[id]/backlinks, PATCH on /knowledge/[id]/fields/[fieldId].
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant
 *   - POST: title required (400 otherwise)
 *   - PATCH: returns updated row, 404 when missing
 *   - DELETE: 200 on owned row, 404 on missing
 *   - Backlinks: tenant-scoped + only links from same client
 *   - Fields PATCH: 404 when note or definition belongs to another tenant
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedNote(ctx: TenantCtx, overrides: { title?: string; body?: string } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_notes (client_id, title, body, tags)
    VALUES (
      ${ctx.client.id},
      ${overrides.title ?? `note-${Date.now()}`},
      ${overrides.body ?? ''},
      '[]'::jsonb
    )
    RETURNING id
  `;
  return row;
}

describe('Brain knowledge — POST /knowledge @brain @knowledge', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-know-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/knowledge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when title is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { body: 'no title' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/title/i);
  });

  it('creates a note scoped to the caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');
    const res = await callHandler<{ success: boolean; data: { id: number; title: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'Hello', body: 'world', tags: ['t1'] } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.title).toBe('Hello');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; title: string }[]>`
      SELECT client_id, title FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
  });
});

describe('Brain knowledge — PATCH /knowledge/[id] @brain @knowledge', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-know-patch'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const note = await seedNote(A);
    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(note.id) }, body: { title: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: 'not-a-number' }, body: { title: 'x' } },
    );
    expect(res.status).toBe(400);
  });

  it('updates own note + 200', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A, { title: 'before' });
    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string; pinned: boolean } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(note.id) }, body: { title: 'after', pinned: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('after');
    expect(res.data?.data.pinned).toBe(true);
  });

  it('404 when patching another tenant\'s note', async () => {
    const B = await sessionForNewClientUser('brain-know-patch-b');
    const noteB = await seedNote(B, { title: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(noteB.id) }, body: { title: 'hijack' } },
    );
    expect(res.status).toBe(404);

    // DB should be untouched
    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE id = ${noteB.id}
    `;
    expect(row.title).toBe('foreign');
  });
});

describe('Brain knowledge — DELETE /knowledge/[id] @brain @knowledge', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-know-del'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const note = await seedNote(A);
    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(note.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('deletes own note', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(note.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE id = ${note.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 on missing id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 when deleting another tenant\'s note (cross-tenant)', async () => {
    const B = await sessionForNewClientUser('brain-know-del-b');
    const noteB = await seedNote(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(noteB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE id = ${noteB.id}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('Brain knowledge — GET /knowledge/[id]/backlinks @brain @knowledge', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-know-back'); });

  it('returns backlinks for own note (tenant-scoped)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const target = await seedNote(A, { title: 'target' });
    const source = await seedNote(A, { title: 'source', body: 'see [[target]] here' });

    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_kb_links
        (client_id, from_note_id, to_note_id, raw_target, display_text, link_type)
      VALUES
        (${A.client.id}, ${source.id}, ${target.id}, 'target', 'target', 'wikilink')
    `;

    const route = await import('@/app/api/portal/brain/knowledge/[id]/backlinks/route');
    const res = await callHandler<{ success: boolean; data: { items: { id: number; title: string }[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(target.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items.map(i => i.id)).toContain(source.id);
  });

  it('404 cross-tenant — never leaks foreign backlinks', async () => {
    const B = await sessionForNewClientUser('brain-know-back-b');
    const targetB = await seedNote(B, { title: 'forbidden' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/backlinks/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(targetB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain knowledge — PATCH /knowledge/[id]/fields/[fieldId] @brain @knowledge', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-know-fields'); });

  async function seedFieldDef(ctx: TenantCtx, fieldName = 'topic'): Promise<{ id: number }> {
    const sql = getTestSql();
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_custom_fields (client_id, entity_type, field_name, field_type)
      VALUES (${ctx.client.id}, 'note', ${fieldName}, 'text')
      RETURNING id
    `;
    return row;
  }

  it('upserts a value for a note + own field', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A);
    const def = await seedFieldDef(A);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/fields/[fieldId]/route');
    const res = await callHandler<{ success: boolean; data: { value: string | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(note.id), fieldId: String(def.id) }, body: { value: 'pricing' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.value).toBe('pricing');
  });

  it('clears the value when null is sent', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A);
    const def = await seedFieldDef(A, 'urgency');

    const route = await import('@/app/api/portal/brain/knowledge/[id]/fields/[fieldId]/route');
    // First set a value
    await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(note.id), fieldId: String(def.id) }, body: { value: 'high' } },
    );
    // Then clear
    const res = await callHandler<{ success: boolean; data: { value: string | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(note.id), fieldId: String(def.id) }, body: { value: null } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.value).toBe(null);
  });

  it('404 cross-tenant note id', async () => {
    const B = await sessionForNewClientUser('brain-know-fields-b');
    const noteB = await seedNote(B);
    const defA = await seedFieldDef(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/fields/[fieldId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(noteB.id), fieldId: String(defA.id) }, body: { value: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant field definition id', async () => {
    const B = await sessionForNewClientUser('brain-know-fields-b2');
    const noteA = await seedNote(A);
    const defB = await seedFieldDef(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/fields/[fieldId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(noteA.id), fieldId: String(defB.id) }, body: { value: 'leak' } },
    );
    expect(res.status).toBe(404);
  });
});
