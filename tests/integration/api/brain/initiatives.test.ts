/**
 * Brain initiatives — REST round-trip + close-flow + link/unlink polymorphism.
 *
 * Contract:
 *   - 401 unauth on every route
 *   - 400 invalid body (zod) / 400 attempted status change via PATCH
 *   - 404 cross-tenant on GET/PATCH/DELETE/close/reopen/links
 *   - POST creates with auto-slug + tenant scope
 *   - Listing returns goalCount via correlated subquery (catches the
 *     ${table.col} Drizzle bug — listed under known pitfalls)
 *   - close+lessonsLearned creates a brain_note + back-link atomically
 *   - DELETE soft-cancels (status='cancelled', closeReason='deleted')
 *   - reopen refuses from non-terminal status
 *   - link/unlink polymorphism: same initiative + (type, id) is idempotent
 *
 * Tagged @brain @initiatives.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedInitiative(
  ctx: TenantCtx,
  overrides: { name?: string; slug?: string; status?: string } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const name = overrides.name ?? `init-${Date.now()}-${Math.floor(Math.random() * 999)}`;
  const slug = overrides.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_initiatives (client_id, name, slug, status, priority)
    VALUES (${ctx.client.id}, ${name}, ${slug}, ${overrides.status ?? 'planned'}, 'medium')
    RETURNING id
  `;
  return row;
}

async function seedGoal(
  ctx: TenantCtx,
  initiativeId: number,
  status: string = 'open',
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_goals (client_id, initiative_id, title, status)
    VALUES (${ctx.client.id}, ${initiativeId}, ${`g-${Date.now()}`}, ${status})
    RETURNING id
  `;
  return row;
}

async function seedNote(ctx: TenantCtx, title = 'a note'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_notes (client_id, title, body, tags)
    VALUES (${ctx.client.id}, ${title}, '', '[]'::jsonb)
    RETURNING id
  `;
  return row;
}

// ─── GET / POST /initiatives ────────────────────────────────────────────────

describe('Brain initiatives — POST /initiatives @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'no name' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates an initiative with auto-slug, scoped to caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler<{ success: boolean; data: { id: number; slug: string; name: string; status: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Q3 Product Launch', priority: 'high' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('q3-product-launch');
    expect(res.data?.data.status).toBe('planned');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; slug: string; priority: string }[]>`
      SELECT client_id, slug, priority FROM ${sql(TEST_SCHEMA)}.brain_initiatives WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.priority).toBe('high');
  });

  it('auto-suffixes the slug on collision per tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedInitiative(A, { name: 'Pricing Refresh', slug: 'pricing-refresh' });

    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler<{ success: boolean; data: { slug: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Pricing Refresh' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('pricing-refresh-2');
  });
});

describe('Brain initiatives — GET /initiatives @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-list'); });

  it('returns only this tenant\'s initiatives', async () => {
    const B = await sessionForNewClientUser('brain-init-list-b');
    await seedInitiative(A, { name: 'mine' });
    await seedInitiative(B, { name: 'theirs' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; clientId: number; name: string; goalCount: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    const items = res.data!.data.items;
    expect(items.every((i) => i.clientId === A.client.id)).toBe(true);
    expect(items.map((i) => i.name)).toContain('mine');
    expect(items.map((i) => i.name)).not.toContain('theirs');
  });

  it('goalCount comes back as a positive number when goals exist (correlated-subquery sanity)', async () => {
    // Catches the Drizzle ${table.col} pitfall — if the outer-table ref were
    // emitted unqualified, this would silently return 0.
    const init = await seedInitiative(A, { name: 'has-goals' });
    await seedGoal(A, init.id);
    await seedGoal(A, init.id);
    await seedGoal(A, init.id);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; goalCount: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET');
    const hit = res.data!.data.items.find((i) => i.id === init.id);
    expect(hit).toBeDefined();
    expect(hit!.goalCount).toBe(3);
  });

  it('hasOpenGoals filter excludes initiatives whose goals are all achieved/missed', async () => {
    const open = await seedInitiative(A, { name: 'open-ones' });
    const done = await seedInitiative(A, { name: 'done-ones' });
    await seedGoal(A, open.id, 'on_track');
    await seedGoal(A, done.id, 'achieved');
    await seedGoal(A, done.id, 'missed');

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number }> };
    }>(route as unknown as Record<string, unknown>, 'GET', { query: { hasOpenGoals: 'true' } });
    const ids = res.data!.data.items.map((i) => i.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(done.id);
  });
});

// ─── GET / PATCH / DELETE /initiatives/[id] ─────────────────────────────────

describe('Brain initiatives — GET /initiatives/[id] @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-get'); });

  it('returns own initiative + optional goals + links', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { name: 'detail-test' });
    await seedGoal(A, init.id, 'on_track');

    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { initiative: { id: number; name: string }; goals?: Array<{ id: number }>; links?: { byType: Record<string, number> } };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(init.id) },
      query: { includeGoals: 'true', includeLinks: 'true' },
    });
    expect(res.status).toBe(200);
    expect(res.data?.data.initiative.id).toBe(init.id);
    expect(res.data?.data.goals?.length).toBe(1);
    expect(res.data?.data.links).toBeDefined();
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-init-get-b');
    const initB = await seedInitiative(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(initB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain initiatives — PATCH /initiatives/[id] @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-patch'); });

  it('updates own initiative', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { name: 'before' });
    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; priority: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(init.id) }, body: { name: 'after', priority: 'critical' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('after');
    expect(res.data?.data.priority).toBe('critical');
  });

  it('400 when patch includes a status field', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(init.id) }, body: { status: 'completed' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/close|reopen/);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-init-patch-b');
    const initB = await seedInitiative(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(initB.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain initiatives — DELETE /initiatives/[id] (soft-cancel) @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-del'); });

  it('flips status to cancelled with closeReason="deleted"', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { name: 'will-die' });

    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler<{ success: boolean; data: { id: number; status: string } }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(init.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('cancelled');

    const sql = getTestSql();
    const [row] = await sql<{ status: string; close_reason: string | null; closed_at: string | null }[]>`
      SELECT status, close_reason, closed_at FROM ${sql(TEST_SCHEMA)}.brain_initiatives WHERE id = ${init.id}
    `;
    expect(row.status).toBe('cancelled');
    expect(row.close_reason).toBe('deleted');
    expect(row.closed_at).not.toBeNull();
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-init-del-b');
    const initB = await seedInitiative(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(initB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── close / reopen ─────────────────────────────────────────────────────────

describe('Brain initiatives — POST /initiatives/[id]/close @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-close'); });

  it('400 when neither reason nor lessonsLearned is provided', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/close/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) }, body: { outcome: 'completed' } },
    );
    expect(res.status).toBe(400);
  });

  it('close + lessonsLearned creates a brain_note + back-link atomically', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { name: 'Big Bet', status: 'active' });

    const route = await import('@/app/api/portal/brain/initiatives/[id]/close/route');
    const res = await callHandler<{
      success: boolean;
      data: { initiative: { status: string; closedAt: string }; lessonsLearnedNoteId: number };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(init.id) },
      body: {
        outcome: 'completed',
        reason: 'Shipped Q3',
        lessonsLearned: 'Estimate by 1.5x; pair earlier; cut scope at week 6.',
      },
    });
    expect(res.status).toBe(200);
    expect(res.data?.data.initiative.status).toBe('completed');
    const noteId = res.data!.data.lessonsLearnedNoteId;
    expect(typeof noteId).toBe('number');

    const sql = getTestSql();
    // Note exists with the expected tags + body + tenant
    const [noteRow] = await sql<{ client_id: number; title: string; body: string; tags: string[] }[]>`
      SELECT client_id, title, body, tags FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE id = ${noteId}
    `;
    expect(noteRow.client_id).toBe(A.client.id);
    expect(noteRow.title).toMatch(/Big Bet/);
    expect(noteRow.body).toMatch(/Estimate by 1\.5x/);
    expect(noteRow.tags).toEqual(expect.arrayContaining(['initiative-close', 'completed']));

    // Back-link exists and is pinned
    const linkRows = await sql<{ entity_type: string; entity_id: number; pinned: boolean }[]>`
      SELECT entity_type, entity_id, pinned FROM ${sql(TEST_SCHEMA)}.brain_initiative_links
      WHERE initiative_id = ${init.id} AND entity_type = 'note' AND entity_id = ${noteId}
    `;
    expect(linkRows.length).toBe(1);
    expect(linkRows[0].pinned).toBe(true);
  });

  it('close with reason only (no lessons) does NOT create a note', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const sql = getTestSql();
    const beforeCount = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE client_id = ${A.client.id}`;

    const route = await import('@/app/api/portal/brain/initiatives/[id]/close/route');
    const res = await callHandler<{ success: boolean; data: { lessonsLearnedNoteId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) }, body: { outcome: 'cancelled', reason: 'priorities shifted' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.lessonsLearnedNoteId).toBeNull();

    const afterCount = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM ${sql(TEST_SCHEMA)}.brain_notes WHERE client_id = ${A.client.id}`;
    expect(afterCount[0].c).toBe(beforeCount[0].c);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-init-close-b');
    const initB = await seedInitiative(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/close/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(initB.id) }, body: { outcome: 'completed', reason: 'x' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain initiatives — POST /initiatives/[id]/reopen @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-reopen'); });

  it('400 when current status is non-terminal', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { status: 'active' });
    const route = await import('@/app/api/portal/brain/initiatives/[id]/reopen/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) } },
    );
    expect(res.status).toBe(400);
  });

  it('flips a completed initiative back to active and clears closedAt', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A, { status: 'completed' });
    // Pre-stamp closedAt so we can verify the clear.
    const sql = getTestSql();
    await sql`UPDATE ${sql(TEST_SCHEMA)}.brain_initiatives SET closed_at = now() WHERE id = ${init.id}`;

    const route = await import('@/app/api/portal/brain/initiatives/[id]/reopen/route');
    const res = await callHandler<{ success: boolean; data: { status: string; closedAt: string | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('active');

    const [row] = await sql<{ status: string; closed_at: string | null }[]>`
      SELECT status, closed_at FROM ${sql(TEST_SCHEMA)}.brain_initiatives WHERE id = ${init.id}
    `;
    expect(row.status).toBe('active');
    expect(row.closed_at).toBeNull();
  });
});

// ─── links polymorphism ─────────────────────────────────────────────────────

describe('Brain initiatives — /initiatives/[id]/links @brain @initiatives', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-init-links'); });

  it('link → list → unlink round-trip; idempotent insert', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const note = await seedNote(A, 'linkable');

    const route = await import('@/app/api/portal/brain/initiatives/[id]/links/route');

    // attach
    const first = await callHandler<{ success: boolean; data: { linkId: number | null; alreadyLinked: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) }, body: { entityType: 'note', entityId: note.id, pinned: true } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.alreadyLinked).toBe(false);
    expect(typeof first.data?.data.linkId).toBe('number');

    // idempotent — second attach returns alreadyLinked
    const second = await callHandler<{ success: boolean; data: { alreadyLinked: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) }, body: { entityType: 'note', entityId: note.id } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.alreadyLinked).toBe(true);

    // list — resolves note title
    const list = await callHandler<{
      success: boolean;
      data: { items: Array<{ entityType: string; entityId: number; title: string | null; pinned: boolean }> };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(init.id) } });
    expect(list.status).toBe(200);
    const hit = list.data!.data.items.find((i) => i.entityType === 'note' && i.entityId === note.id);
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('linkable');
    expect(hit!.pinned).toBe(true);

    // unlink
    const del = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(init.id) }, body: { entityType: 'note', entityId: note.id } },
    );
    expect(del.status).toBe(200);

    // unlink again → 404 (no row)
    const delAgain = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(init.id) }, body: { entityType: 'note', entityId: note.id } },
    );
    expect(delAgain.status).toBe(404);
  });

  it('accepts unknown-in-this-branch entity types (decision/topic) without joining', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/links/route');
    const res = await callHandler<{ success: boolean; data: { linkId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) }, body: { entityType: 'decision', entityId: 12345 } },
    );
    expect(res.status).toBe(200);
    expect(typeof res.data?.data.linkId).toBe('number');

    const list = await callHandler<{ success: boolean; data: { items: Array<{ title: string | null; entityType: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(init.id) } },
    );
    const hit = list.data!.data.items.find((i) => i.entityType === 'decision');
    // brain_decisions table doesn't exist in this branch — title is null,
    // but the row resolves cleanly.
    expect(hit).toBeDefined();
    expect(hit!.title).toBeNull();
  });

  it('rejects an unknown entityType outright', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const init = await seedInitiative(A);
    const route = await import('@/app/api/portal/brain/initiatives/[id]/links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(init.id) }, body: { entityType: 'spaceship', entityId: 1 } },
    );
    expect(res.status).toBe(400);
  });

  it('404 when attaching to another tenant\'s initiative', async () => {
    const B = await sessionForNewClientUser('brain-init-links-b');
    const initB = await seedInitiative(B);
    mockedAuth.mockResolvedValue(A.session);
    const noteA = await seedNote(A);

    const route = await import('@/app/api/portal/brain/initiatives/[id]/links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(initB.id) }, body: { entityType: 'note', entityId: noteA.id } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_initiative_links WHERE initiative_id = ${initB.id}
    `;
    expect(rows.length).toBe(0);
  });
});
