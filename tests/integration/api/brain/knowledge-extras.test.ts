/**
 * Brain knowledge — coverage for the post-overhaul endpoints not exercised by
 * knowledge.test.ts:
 *   - POST /knowledge/bulk          (soft_delete, restore, hard_delete, add/remove tags, replace_tag_prefix)
 *   - POST /knowledge/[id]/restore
 *   - GET  /knowledge/[id]/history
 *   - CRUD /templates + /templates/[id]
 *   - POST /knowledge/from-template/[id]
 *   - GET  /knowledge with new ?trashed / ?sort / ?order params
 *
 * Multi-tenant correctness is the load-bearing thing here — every endpoint
 * has at least one cross-tenant assertion that would catch a missing
 * `clientId` predicate.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeedNoteOpts {
  title?: string;
  body?: string;
  tags?: string[];
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

async function seedNote(ctx: TenantCtx, overrides: SeedNoteOpts = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_notes (
      client_id, title, body, tags, deleted_at, created_at, updated_at
    ) VALUES (
      ${ctx.client.id},
      ${overrides.title ?? `note-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.body ?? ''},
      ${JSON.stringify(overrides.tags ?? [])}::jsonb,
      ${overrides.deletedAt ?? null},
      ${overrides.createdAt ?? new Date()},
      ${overrides.updatedAt ?? new Date()}
    )
    RETURNING id
  `;
  return row;
}

async function seedTemplate(
  ctx: TenantCtx,
  overrides: { name?: string; body?: string; trigger?: string; enabled?: boolean; defaultTags?: string[] } = {},
): Promise<{ id: number; name: string }> {
  const sql = getTestSql();
  const name = overrides.name ?? `tmpl-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const defaultTagsJson = overrides.defaultTags ? JSON.stringify(overrides.defaultTags) : null;
  const [row] = await sql<{ id: number; name: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_note_templates (
      client_id, name, body, trigger, enabled, default_tags
    ) VALUES (
      ${ctx.client.id},
      ${name},
      ${overrides.body ?? 'hello {{userName}}'},
      ${overrides.trigger ?? 'manual'},
      ${overrides.enabled ?? true},
      ${defaultTagsJson}::jsonb
    )
    RETURNING id, name
  `;
  return row;
}

async function getNoteRow(id: number): Promise<{ id: number; title: string; tags: string[]; deleted_at: Date | null; client_id: number } | undefined> {
  const sql = getTestSql();
  // The `tags` column is `json` (not `jsonb`), and postgres.js doesn't auto-
  // parse the json typeoid by default — it returns the raw text. Read tags
  // from the row but parse to a JS array ourselves so assertions can `toEqual`
  // a normal `string[]`.
  const [row] = await sql<{ id: number; title: string; tags: string | string[]; deleted_at: Date | null; client_id: number }[]>`
    SELECT id, title, tags, deleted_at, client_id
    FROM ${sql(TEST_SCHEMA)}.brain_notes
    WHERE id = ${id}
  `;
  if (!row) return undefined;
  const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) as string[] : row.tags;
  return { ...row, tags };
}

describe('Brain knowledge — POST /knowledge/bulk @brain @knowledge-extras', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('brain-bulk-a');
    B = await sessionForNewClientUser('brain-bulk-b');
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [1, 2], op: { kind: 'soft_delete' } } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when ids is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { op: { kind: 'soft_delete' } } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when ids is empty', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [], op: { kind: 'soft_delete' } } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when ids is not an array', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: 'nope', op: { kind: 'soft_delete' } } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when ids exceeds the bulk cap (501)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids, op: { kind: 'soft_delete' } } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/cap|500/i);
  });

  it('400 on unknown op kind', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A);
    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [note.id], op: { kind: 'lol_no' } } },
    );
    expect(res.status).toBe(400);
  });

  it('add_tags: merges new tags onto every selected note', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const n1 = await seedNote(A, { tags: ['existing'] });
    const n2 = await seedNote(A, { tags: [] });
    const n3 = await seedNote(A, { tags: ['existing', 'priority'] });

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler<{ data: { updated: number; failed: number[] } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [n1.id, n2.id, n3.id], op: { kind: 'add_tags', tags: ['alpha', 'beta'] } } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.updated).toBe(3);

    for (const id of [n1.id, n2.id, n3.id]) {
      const row = await getNoteRow(id);
      expect(row?.tags).toEqual(expect.arrayContaining(['alpha', 'beta']));
    }
    const r1 = await getNoteRow(n1.id);
    expect(r1?.tags).toContain('existing');
    const r3 = await getNoteRow(n3.id);
    expect(r3?.tags).toContain('priority');
  });

  it('remove_tags: removes only requested tags, others remain', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A, { tags: ['keep', 'drop', 'also-keep'] });

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [note.id], op: { kind: 'remove_tags', tags: ['drop'] } } },
    );
    expect(res.status).toBe(200);

    const row = await getNoteRow(note.id);
    expect(row?.tags).toEqual(expect.arrayContaining(['keep', 'also-keep']));
    expect(row?.tags).not.toContain('drop');
  });

  it('replace_tag_prefix: rewrites matching tags, leaves disjoint tags alone', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A, {
      tags: ['projects', 'projects/alpha', 'unrelated', 'archive'],
    });

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [note.id], op: { kind: 'replace_tag_prefix', from: 'projects', to: 'work' } } },
    );
    expect(res.status).toBe(200);

    const row = await getNoteRow(note.id);
    expect(row?.tags).toEqual(expect.arrayContaining(['work', 'work/alpha', 'unrelated', 'archive']));
    expect(row?.tags).not.toContain('projects');
    expect(row?.tags).not.toContain('projects/alpha');
  });

  it('soft_delete: sets deleted_at, rows still present', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const n1 = await seedNote(A);
    const n2 = await seedNote(A);

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler<{ data: { updated: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [n1.id, n2.id], op: { kind: 'soft_delete' } } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.updated).toBe(2);

    for (const id of [n1.id, n2.id]) {
      const row = await getNoteRow(id);
      expect(row).toBeDefined();
      expect(row?.deleted_at).not.toBeNull();
    }
  });

  it('restore: clears deleted_at', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const n1 = await seedNote(A, { deletedAt: new Date() });
    const n2 = await seedNote(A, { deletedAt: new Date() });

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [n1.id, n2.id], op: { kind: 'restore' } } },
    );
    expect(res.status).toBe(200);

    for (const id of [n1.id, n2.id]) {
      const row = await getNoteRow(id);
      expect(row?.deleted_at).toBeNull();
    }
  });

  it('hard_delete: removes rows', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const n1 = await seedNote(A);
    const n2 = await seedNote(A);

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler<{ data: { updated: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [n1.id, n2.id], op: { kind: 'hard_delete' } } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.updated).toBe(2);

    for (const id of [n1.id, n2.id]) {
      const row = await getNoteRow(id);
      expect(row).toBeUndefined();
    }
  });

  it('cross-tenant ids land in failed[], tenant B note untouched', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const ownNote = await seedNote(A, { tags: ['mine'] });
    const foreign = await seedNote(B, { title: 'foreign', tags: ['theirs'] });

    const route = await import('@/app/api/portal/brain/knowledge/bulk/route');
    const res = await callHandler<{ data: { updated: number; failed: number[] } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { ids: [ownNote.id, foreign.id], op: { kind: 'add_tags', tags: ['leaked'] } } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.updated).toBe(1);
    expect(res.data?.data.failed).toContain(foreign.id);

    const ownRow = await getNoteRow(ownNote.id);
    expect(ownRow?.tags).toContain('leaked');

    const foreignRow = await getNoteRow(foreign.id);
    expect(foreignRow?.title).toBe('foreign');
    expect(foreignRow?.tags).toEqual(['theirs']);
    expect(foreignRow?.client_id).toBe(B.client.id);
  });
});

describe('Brain knowledge — POST /knowledge/[id]/restore @brain @knowledge-extras', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-restore-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const note = await seedNote(A, { deletedAt: new Date() });
    const route = await import('@/app/api/portal/brain/knowledge/[id]/restore/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(note.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('200 + clears deleted_at on a soft-deleted owned note', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A, { deletedAt: new Date() });

    const route = await import('@/app/api/portal/brain/knowledge/[id]/restore/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(note.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const row = await getNoteRow(note.id);
    expect(row?.deleted_at).toBeNull();
  });

  it('404 when note does not exist', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/[id]/restore/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-restore-b');
    const foreign = await seedNote(B, { deletedAt: new Date() });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/restore/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);

    const row = await getNoteRow(foreign.id);
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe('Brain knowledge — GET /knowledge/[id]/history @brain @knowledge-extras', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-history-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const note = await seedNote(A);
    const route = await import('@/app/api/portal/brain/knowledge/[id]/history/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(note.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('returns audit-log rows for the note (create + update writes 2 entries)', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // Drive a real create then a real update through the public routes so the
    // audit logger writes its expected rows. Bypassing with raw inserts wouldn't
    // exercise the contract.
    const createRoute = await import('@/app/api/portal/brain/knowledge/route');
    const created = await callHandler<{ data: { id: number } }>(
      createRoute as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'historical', body: 'v1' } },
    );
    expect(created.status).toBe(200);
    const noteId = created.data!.data.id;

    const patchRoute = await import('@/app/api/portal/brain/knowledge/[id]/route');
    const patched = await callHandler(
      patchRoute as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(noteId) }, body: { title: 'historical v2' } },
    );
    expect(patched.status).toBe(200);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/history/route');
    const res = await callHandler<{ data: { items: Array<{ action: string; entity_id?: number; entityId?: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(noteId) } },
    );
    expect(res.status).toBe(200);
    const items = res.data?.data.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(2);
    const actions = items.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['note.created', 'note.updated']));
  });

  it('404 cross-tenant — never reveals foreign history', async () => {
    const B = await sessionForNewClientUser('brain-history-b');
    const foreign = await seedNote(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/[id]/history/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain knowledge — POST /templates @brain @knowledge-extras', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tmpl-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/templates/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'x', body: 'hi' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { body: 'hi' } },
    );
    expect(res.status).toBe(400);
  });

  it('200 on valid create', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Daily standup', body: '## Today\n{{userName}}', trigger: 'manual' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Daily standup');
  });

  it('409 on duplicate name within the same tenant; same name allowed in another tenant', async () => {
    const B = await sessionForNewClientUser('brain-tmpl-dup-b');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/route');
    const first = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Shared name', body: 'one' } },
    );
    expect(first.status).toBe(200);

    const second = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Shared name', body: 'two' } },
    );
    expect(second.status).toBe(409);

    mockedAuth.mockResolvedValue(B.session);
    const otherTenant = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Shared name', body: 'b-version' } },
    );
    expect(otherTenant.status).toBe(200);
  });
});

describe('Brain knowledge — GET /templates @brain @knowledge-extras', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('brain-tmpl-list-a');
    B = await sessionForNewClientUser('brain-tmpl-list-b');
  });

  it('lists templates scoped to the tenant only', async () => {
    await seedTemplate(A, { name: 'A1' });
    await seedTemplate(A, { name: 'A2' });
    await seedTemplate(B, { name: 'B1' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/route');
    const res = await callHandler<{ data: { items: Array<{ id: number; name: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const names = (res.data?.data.items ?? []).map((t) => t.name).sort();
    expect(names).toEqual(['A1', 'A2']);
  });

  it('filters by ?enabled=true and ?trigger=manual', async () => {
    await seedTemplate(A, { name: 'manual-on', trigger: 'manual', enabled: true });
    await seedTemplate(A, { name: 'manual-off', trigger: 'manual', enabled: false });
    await seedTemplate(A, { name: 'daily-on', trigger: 'daily', enabled: true });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/route');

    const enabledRes = await callHandler<{ data: { items: Array<{ name: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { enabled: 'true' } },
    );
    expect(enabledRes.status).toBe(200);
    const enabledNames = (enabledRes.data?.data.items ?? []).map((t) => t.name).sort();
    expect(enabledNames).toEqual(['daily-on', 'manual-on']);

    const triggerRes = await callHandler<{ data: { items: Array<{ name: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { trigger: 'manual' } },
    );
    expect(triggerRes.status).toBe(200);
    const triggerNames = (triggerRes.data?.data.items ?? []).map((t) => t.name).sort();
    expect(triggerNames).toEqual(['manual-off', 'manual-on']);
  });
});

describe('Brain knowledge — GET/PATCH/DELETE /templates/[id] @brain @knowledge-extras', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('brain-tmpl-byid-a');
    B = await sessionForNewClientUser('brain-tmpl-byid-b');
  });

  it('GET 200 own', async () => {
    const t = await seedTemplate(A, { name: 'gettable' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler<{ data: { name: string } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(t.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('gettable');
  });

  it('GET 404 cross-tenant', async () => {
    const foreign = await seedTemplate(B, { name: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('PATCH 200 own', async () => {
    const t = await seedTemplate(A, { name: 'before' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler<{ data: { name: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(t.id) }, body: { name: 'after' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('after');
  });

  it('PATCH 404 cross-tenant', async () => {
    const foreign = await seedTemplate(B, { name: 'cant-touch' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(foreign.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);

    // Verify the foreign row stayed put.
    const sql = getTestSql();
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.brain_note_templates WHERE id = ${foreign.id}
    `;
    expect(row.name).toBe('cant-touch');
  });

  it('PATCH 409 on duplicate name within tenant', async () => {
    const t1 = await seedTemplate(A, { name: 'taken' });
    const t2 = await seedTemplate(A, { name: 'rename-me' });
    expect(t1.id).not.toBe(t2.id);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(t2.id) }, body: { name: 'taken' } },
    );
    expect(res.status).toBe(409);
  });

  it('DELETE 200 own', async () => {
    const t = await seedTemplate(A, { name: 'doomed' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(t.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_note_templates WHERE id = ${t.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('DELETE 404 cross-tenant', async () => {
    const foreign = await seedTemplate(B, { name: 'foreign-del' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/templates/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_note_templates WHERE id = ${foreign.id}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('Brain knowledge — POST /knowledge/from-template/[id] @brain @knowledge-extras', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-from-tmpl-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const t = await seedTemplate(A);
    const route = await import('@/app/api/portal/brain/knowledge/from-template/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(t.id) }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('200 — creates a note with tracker tag, default tags, and {{userName}} substituted', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTemplate(A, {
      name: 'Onboarding',
      body: 'Welcome {{userName}}!',
      defaultTags: ['onboarding', 'auto'],
    });

    const route = await import('@/app/api/portal/brain/knowledge/from-template/[id]/route');
    const res = await callHandler<{ data: { id: number; title: string; body: string; tags: string[] } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(t.id) }, body: {} },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Onboarding');
    // {{userName}} substituted (from-template route looks up users.name/.email).
    expect(res.data?.data.body).not.toContain('{{userName}}');
    expect(res.data?.data.body).toContain('Welcome ');
    const tags = res.data?.data.tags ?? [];
    expect(tags).toEqual(expect.arrayContaining(['onboarding', 'auto', `from_template:${t.id}`]));
  });

  it('200 with titleOverride sets the new note title', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTemplate(A, { name: 'default-title' });

    const route = await import('@/app/api/portal/brain/knowledge/from-template/[id]/route');
    const res = await callHandler<{ data: { title: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(t.id) }, body: { titleOverride: 'My override title' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('My override title');
  });

  it('404 when template belongs to another tenant', async () => {
    const B = await sessionForNewClientUser('brain-from-tmpl-b');
    const foreign = await seedTemplate(B, { name: 'foreign-tmpl' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/knowledge/from-template/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(foreign.id) }, body: {} },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain knowledge — GET /knowledge ?trashed/?sort/?order @brain @knowledge-extras', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-list-extras-a'); });

  it('?trashed=true returns only soft-deleted notes; default excludes them', async () => {
    const live = await seedNote(A, { title: 'live-note' });
    const dead = await seedNote(A, { title: 'dead-note', deletedAt: new Date() });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');

    const def = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(def.status).toBe(200);
    const defIds = (def.data?.data.items ?? []).map((n) => n.id);
    expect(defIds).toContain(live.id);
    expect(defIds).not.toContain(dead.id);

    const trash = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { trashed: 'true' } },
    );
    expect(trash.status).toBe(200);
    const trashIds = (trash.data?.data.items ?? []).map((n) => n.id);
    expect(trashIds).toContain(dead.id);
    expect(trashIds).not.toContain(live.id);
  });

  it('?sort=title&order=asc returns alphabetical', async () => {
    // Use a unique search marker so we filter to just our seeded set, regardless
    // of pinned-first ordering and other notes the worker may have around.
    const marker = `extrasort-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const z = await seedNote(A, { title: `Zzz ${marker}` });
    const m = await seedNote(A, { title: `Mmm ${marker}` });
    const a = await seedNote(A, { title: `Aaa ${marker}` });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');

    const ascRes = await callHandler<{ data: { items: Array<{ id: number; title: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { search: marker, sort: 'title', order: 'asc' } },
    );
    expect(ascRes.status).toBe(200);
    const ascIds = (ascRes.data?.data.items ?? []).map((n) => n.id);
    expect(ascIds).toEqual([a.id, m.id, z.id]);

    const descRes = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { search: marker, sort: 'title', order: 'desc' } },
    );
    expect(descRes.status).toBe(200);
    const descIds = (descRes.data?.data.items ?? []).map((n) => n.id);
    expect(descIds).toEqual([z.id, m.id, a.id]);
  });

  it('?sort=created&order=desc returns most-recently-created first', async () => {
    const marker = `extracre-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const t0 = new Date(Date.now() - 3 * 86_400_000);
    const t1 = new Date(Date.now() - 2 * 86_400_000);
    const t2 = new Date(Date.now() - 1 * 86_400_000);
    const oldest = await seedNote(A, { title: `${marker} oldest`, createdAt: t0, updatedAt: t0 });
    const middle = await seedNote(A, { title: `${marker} middle`, createdAt: t1, updatedAt: t1 });
    const newest = await seedNote(A, { title: `${marker} newest`, createdAt: t2, updatedAt: t2 });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');
    const res = await callHandler<{ data: { items: Array<{ id: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { search: marker, sort: 'created', order: 'desc' } },
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data.items ?? []).map((n) => n.id);
    expect(ids).toEqual([newest.id, middle.id, oldest.id]);
  });

  it('400 on unknown sort value', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { sort: 'banana' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 on unknown order value', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/knowledge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { order: 'sideways' } },
    );
    expect(res.status).toBe(400);
  });
});
