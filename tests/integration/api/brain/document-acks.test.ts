/**
 * Brain documents — required-reads + acknowledgments + compliance-report
 * round-trip with full tenancy isolation.
 *
 * Contract:
 *   - 401 unauth on every route
 *   - 400 invalid body (zod) / 400 invalid id / 400 invalid targetType
 *   - 404 cross-tenant on every route
 *   - POST /required-reads creates a row; idempotent on (doc, target) re-POST
 *   - POST /required-reads with expandOrgUnit=true fans out to each active
 *     member; each member sees the required-read in their listForPerson
 *   - POST /acknowledge is idempotent
 *   - GET /compliance-report partitions ack'd / pending / overdue correctly
 *   - DELETE /required-reads/[id] refuses 409 when acks exist; force=true
 *     succeeds and the acks survive (FK set-null)
 *
 * Tagged @brain @documents.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

// ─── seed helpers ───────────────────────────────────────────────────────────

async function seedDocument(
  ctx: TenantCtx,
  overrides: { title?: string; slug?: string; status?: 'draft' | 'published' | 'archived' } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const title = overrides.title ?? `doc-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const slug = overrides.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_documents
      (client_id, title, slug, category, status, default_topic_ids)
    VALUES (
      ${ctx.client.id}, ${title}, ${slug}, 'reference',
      ${overrides.status ?? 'draft'}, '[]'::jsonb
    )
    RETURNING id
  `;
  return row;
}

async function seedVersion(
  ctx: TenantCtx,
  documentId: number,
  versionNumber: number,
  opts: { publish?: boolean; title?: string; body?: string } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const title = opts.title ?? `v${versionNumber}`;
  const isDraft = !opts.publish;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_document_versions
      (client_id, document_id, version_number, body, title, is_draft, published_at)
    VALUES (
      ${ctx.client.id}, ${documentId}, ${versionNumber},
      ${opts.body ?? 'body content'}, ${title}, ${isDraft},
      ${opts.publish ? new Date() : null}
    )
    RETURNING id
  `;
  if (opts.publish) {
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.brain_documents
      SET current_published_version_id = ${row.id}, status = 'published', published_at = now()
      WHERE id = ${documentId}
    `;
  }
  return row;
}

async function seedPerson(
  ctx: TenantCtx,
  overrides: { fullName?: string; userId?: number | null; status?: 'active' | 'inactive' | 'departed' } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_people
      (client_id, full_name, user_id, status, profile_urls, source)
    VALUES (
      ${ctx.client.id},
      ${overrides.fullName ?? `person-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.userId ?? null},
      ${overrides.status ?? 'active'},
      '[]'::jsonb,
      'manual'
    )
    RETURNING id
  `;
  return row;
}

async function seedOrgUnit(ctx: TenantCtx, name?: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const finalName = name ?? `unit-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const slug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_org_units (client_id, name, slug, path, sort_order)
    VALUES (${ctx.client.id}, ${finalName}, ${slug}, ${slug}, 0)
    RETURNING id
  `;
  return row;
}

async function attachPersonToUnit(ctx: TenantCtx, personId: number, orgUnitId: number): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_person_org_units
      (client_id, person_id, org_unit_id, "primary", role_in_unit)
    VALUES (${ctx.client.id}, ${personId}, ${orgUnitId}, false, null)
  `;
}

// ─── POST /required-reads ───────────────────────────────────────────────────

describe('Brain document-acks — POST /required-reads @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-rr-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const doc = await seedDocument(A);
    const route = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { targetType: 'person', targetId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const route = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { targetType: 'nonsense', targetId: -1 } },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant on the document', async () => {
    const B = await sessionForNewClientUser('brain-doc-rr-b');
    const docB = await seedDocument(B);
    const personA = await seedPerson(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(docB.id) }, body: { targetType: 'person', targetId: personA.id } },
    );
    expect(res.status).toBe(404);
  });

  it('creates a person-target required-read; re-POST updates dueAt and reports alreadyAssigned=1', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const person = await seedPerson(A);
    const route = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');

    const dueAt1 = new Date(Date.now() + 7 * 86400_000).toISOString();
    const first = await callHandler<{ success: boolean; data: { assigned: number; alreadyAssigned: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { targetType: 'person', targetId: person.id, dueAt: dueAt1 } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.assigned).toBe(1);
    expect(first.data?.data.alreadyAssigned).toBe(0);

    const dueAt2 = new Date(Date.now() + 14 * 86400_000).toISOString();
    const second = await callHandler<{ success: boolean; data: { assigned: number; alreadyAssigned: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { targetType: 'person', targetId: person.id, dueAt: dueAt2 } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.assigned).toBe(0);
    expect(second.data?.data.alreadyAssigned).toBe(1);

    // Confirm the dueAt was updated in place (not a duplicate row).
    const sql = getTestSql();
    const rows = await sql<{ id: number; due_at: string | null }[]>`
      SELECT id, due_at FROM ${sql(TEST_SCHEMA)}.brain_document_required_reads
      WHERE document_id = ${doc.id} AND target_type = 'person' AND target_id = ${person.id}
    `;
    expect(rows.length).toBe(1);
    expect(new Date(rows[0].due_at!).getTime()).toBeCloseTo(new Date(dueAt2).getTime(), -2);
  });

  it('org_unit fan-out: each active member sees the required-read in listForPerson', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const v1 = await seedVersion(A, doc.id, 1, { publish: true });
    const unit = await seedOrgUnit(A, 'Engineering');
    const p1 = await seedPerson(A, { fullName: 'Alice' });
    const p2 = await seedPerson(A, { fullName: 'Bob' });
    const p3 = await seedPerson(A, { fullName: 'Carol', status: 'inactive' }); // should be skipped
    await attachPersonToUnit(A, p1.id, unit.id);
    await attachPersonToUnit(A, p2.id, unit.id);
    await attachPersonToUnit(A, p3.id, unit.id);

    const route = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    const res = await callHandler<{
      success: boolean;
      data: { assigned: number; alreadyAssigned: number; expandedTo: number[] };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) },
      body: { targetType: 'org_unit', targetId: unit.id, expandOrgUnit: true },
    });
    expect(res.status).toBe(200);
    expect(res.data!.data.assigned).toBe(2);
    expect(new Set(res.data!.data.expandedTo)).toEqual(new Set([p1.id, p2.id]));

    // Each person should see this doc in their cross-document feed.
    const acksRoute = await import('@/app/api/portal/brain/document-acks/route');
    const aliceQueue = await callHandler<{
      success: boolean;
      data: { items: Array<{ documentId: number; currentVersionToReadId: number | null; acknowledged: boolean }> };
    }>(acksRoute as unknown as Record<string, unknown>, 'GET', { query: { personId: String(p1.id) } });
    expect(aliceQueue.status).toBe(200);
    const aliceItems = aliceQueue.data!.data.items;
    expect(aliceItems.find((i) => i.documentId === doc.id)).toBeDefined();
    expect(aliceItems.find((i) => i.documentId === doc.id)!.currentVersionToReadId).toBe(v1.id);
    expect(aliceItems.find((i) => i.documentId === doc.id)!.acknowledged).toBe(false);
  });
});

// ─── GET /required-reads ────────────────────────────────────────────────────

describe('Brain document-acks — GET /required-reads @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-rr-list'); });

  it('returns only this tenant\'s required-reads with resolved targetName', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const person = await seedPerson(A, { fullName: 'Resolved Name' });

    const createRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    await callHandler(createRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) },
      body: { targetType: 'person', targetId: person.id },
    });

    const res = await callHandler<{
      success: boolean;
      data: { items: Array<{ id: number; targetType: string; targetId: number; targetName: string | null }> };
    }>(createRoute as unknown as Record<string, unknown>, 'GET', { params: { id: String(doc.id) } });

    expect(res.status).toBe(200);
    const items = res.data!.data.items;
    expect(items.length).toBe(1);
    expect(items[0].targetType).toBe('person');
    expect(items[0].targetId).toBe(person.id);
    expect(items[0].targetName).toBe('Resolved Name');
  });
});

// ─── POST /acknowledge ──────────────────────────────────────────────────────

describe('Brain document-acks — POST /acknowledge @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-ack'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: '1' }, body: { versionId: 1, personId: 1 },
    });
    expect(res.status).toBe(401);
  });

  it('404 when the document is cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-ack-b');
    const docB = await seedDocument(B);
    const versionB = await seedVersion(B, docB.id, 1, { publish: true });
    const personA = await seedPerson(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(docB.id) },
      body: { versionId: versionB.id, personId: personA.id },
    });
    expect(res.status).toBe(404);
  });

  it('records an ack; re-acknowledging the same tuple is idempotent', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const v1 = await seedVersion(A, doc.id, 1, { publish: true });
    const person = await seedPerson(A);

    const route = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    const first = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { versionId: v1.id, personId: person.id, acknowledgmentNote: 'read' } },
    );
    expect(first.status).toBe(200);
    const ackId = first.data!.data.id;
    expect(typeof ackId).toBe('number');

    const second = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { versionId: v1.id, personId: person.id } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.id).toBe(ackId);

    // Only one row in the DB.
    const sql = getTestSql();
    const rows = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM ${sql(TEST_SCHEMA)}.brain_document_acknowledgments
      WHERE document_id = ${doc.id} AND version_id = ${v1.id} AND person_id = ${person.id}
    `;
    expect(rows[0].c).toBe(1);
  });

  it('auto-links to a matching person-target required-read when requiredReadId is omitted', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const v1 = await seedVersion(A, doc.id, 1, { publish: true });
    const person = await seedPerson(A);

    // Assign first.
    const rrRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) },
      body: { targetType: 'person', targetId: person.id },
    });

    // Now ack with no explicit requiredReadId.
    const ackRoute = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    const res = await callHandler<{ success: boolean; data: { id: number; requiredReadId: number | null } }>(
      ackRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(doc.id) }, body: { versionId: v1.id, personId: person.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.requiredReadId).not.toBeNull();
  });
});

// ─── GET /compliance-report ─────────────────────────────────────────────────

describe('Brain document-acks — GET /compliance-report @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-compliance'); });

  it('partitions assigned into ack\'d / pending / overdue', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const v1 = await seedVersion(A, doc.id, 1, { publish: true });
    const aliceP = await seedPerson(A, { fullName: 'Alice' });
    const bobP = await seedPerson(A, { fullName: 'Bob' });
    const carolP = await seedPerson(A, { fullName: 'Carol' });

    // Assign Alice (overdue), Bob (future), Carol (no due).
    const rrRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    const past = new Date(Date.now() - 86400_000).toISOString();
    const future = new Date(Date.now() + 86400_000).toISOString();
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) }, body: { targetType: 'person', targetId: aliceP.id, dueAt: past },
    });
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) }, body: { targetType: 'person', targetId: bobP.id, dueAt: future },
    });
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) }, body: { targetType: 'person', targetId: carolP.id },
    });

    // Bob ack'd.
    const ackRoute = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    await callHandler(ackRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) }, body: { versionId: v1.id, personId: bobP.id },
    });

    const route = await import('@/app/api/portal/brain/documents/[id]/compliance-report/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        summary: { totalAssigned: number; acknowledged: number; pending: number; overdue: number };
        acknowledgedPersonIds: number[];
        pendingPersonIds: number[];
        overduePersonIds: number[];
      };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(doc.id) } });
    expect(res.status).toBe(200);
    expect(res.data!.data.summary.totalAssigned).toBe(3);
    expect(res.data!.data.summary.acknowledged).toBe(1);
    expect(res.data!.data.summary.pending).toBe(2);
    expect(res.data!.data.summary.overdue).toBe(1);
    expect(res.data!.data.acknowledgedPersonIds).toEqual([bobP.id]);
    expect(res.data!.data.overduePersonIds).toEqual([aliceP.id]);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-compliance-b');
    const docB = await seedDocument(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/[id]/compliance-report/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(docB.id) },
    });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /required-reads/[id] ────────────────────────────────────────────

describe('Brain document-acks — DELETE /required-reads/[id] @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-rr-del'); });

  it('refuses 409 when acks reference this required-read; force=true deletes and preserves the acks (FK set-null)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc = await seedDocument(A);
    const v1 = await seedVersion(A, doc.id, 1, { publish: true });
    const person = await seedPerson(A);

    // Assign + ack so the required-read row has a referencing ack.
    const rrRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    const created = await callHandler<{ success: boolean; data: { assigned: number } }>(
      rrRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(doc.id) }, body: { targetType: 'person', targetId: person.id } },
    );
    expect(created.data?.data.assigned).toBe(1);
    const sql = getTestSql();
    const [rr] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_document_required_reads
      WHERE document_id = ${doc.id} AND target_type = 'person' AND target_id = ${person.id}
    `;
    const ackRoute = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    await callHandler(ackRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc.id) },
      body: { versionId: v1.id, personId: person.id, requiredReadId: rr.id },
    });

    // 409 without force.
    const delRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/[requiredReadId]/route');
    const denied = await callHandler<{ success: boolean; code?: string }>(
      delRoute as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(doc.id), requiredReadId: String(rr.id) } },
    );
    expect(denied.status).toBe(409);
    expect(denied.data?.code).toBe('HAS_ACKS');

    // Force.
    const forced = await callHandler<{ success: boolean }>(
      delRoute as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(doc.id), requiredReadId: String(rr.id) }, query: { force: 'true' } },
    );
    expect(forced.status).toBe(200);

    // The required-read row is gone.
    const rrCount = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM ${sql(TEST_SCHEMA)}.brain_document_required_reads WHERE id = ${rr.id}
    `;
    expect(rrCount[0].c).toBe(0);

    // The ack survives — required_read_id is now null.
    const acks = await sql<{ id: number; required_read_id: number | null }[]>`
      SELECT id, required_read_id FROM ${sql(TEST_SCHEMA)}.brain_document_acknowledgments
      WHERE document_id = ${doc.id} AND person_id = ${person.id}
    `;
    expect(acks.length).toBe(1);
    expect(acks[0].required_read_id).toBeNull();
  });

  it('404 when the required-read does not belong to this tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-rr-del-b');
    const docB = await seedDocument(B);
    const personB = await seedPerson(B);
    const rrRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    mockedAuth.mockResolvedValue(B.session);
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(docB.id) }, body: { targetType: 'person', targetId: personB.id },
    });
    const sql = getTestSql();
    const [rrB] = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_document_required_reads
      WHERE document_id = ${docB.id}
    `;
    // Now caller A tries to delete B's required-read.
    mockedAuth.mockResolvedValue(A.session);
    const delRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/[requiredReadId]/route');
    const res = await callHandler(delRoute as unknown as Record<string, unknown>, 'DELETE', {
      params: { id: String(docB.id), requiredReadId: String(rrB.id) },
    });
    expect(res.status).toBe(404);
  });
});

// ─── GET /document-acks (cross-document feed) ───────────────────────────────

describe('Brain document-acks — GET /document-acks @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-feed'); });

  it('returns empty + hint when authenticated user has no linked brain_people row', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/document-acks/route');
    const res = await callHandler<{
      success: boolean;
      data: { items: unknown[]; personId: number | null; hint?: string };
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    expect(res.data!.data.items).toEqual([]);
    expect(res.data!.data.personId).toBeNull();
    expect(res.data!.data.hint).toMatch(/brain_people/);
  });

  it('returns the person\'s reading queue + ack history when ?personId is supplied', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const doc1 = await seedDocument(A, { title: 'Doc 1' });
    await seedVersion(A, doc1.id, 1, { publish: true });
    const doc2 = await seedDocument(A, { title: 'Doc 2' });
    const v2 = await seedVersion(A, doc2.id, 1, { publish: true });
    const person = await seedPerson(A);

    // Assign + ack doc2.
    const rrRoute = await import('@/app/api/portal/brain/documents/[id]/required-reads/route');
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc1.id) }, body: { targetType: 'person', targetId: person.id },
    });
    await callHandler(rrRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc2.id) }, body: { targetType: 'person', targetId: person.id },
    });
    const ackRoute = await import('@/app/api/portal/brain/documents/[id]/acknowledge/route');
    await callHandler(ackRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(doc2.id) }, body: { versionId: v2.id, personId: person.id },
    });

    const route = await import('@/app/api/portal/brain/document-acks/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        items: Array<{ documentId: number; acknowledged: boolean }>;
        acknowledgments: Array<{ documentId: number }>;
        personId: number;
      };
    }>(route as unknown as Record<string, unknown>, 'GET', { query: { personId: String(person.id) } });
    expect(res.status).toBe(200);
    expect(res.data!.data.personId).toBe(person.id);
    const items = res.data!.data.items;
    expect(items.length).toBe(2);
    const d1 = items.find((i) => i.documentId === doc1.id);
    const d2 = items.find((i) => i.documentId === doc2.id);
    expect(d1?.acknowledged).toBe(false);
    expect(d2?.acknowledged).toBe(true);

    const acks = res.data!.data.acknowledgments;
    expect(acks.length).toBe(1);
    expect(acks[0].documentId).toBe(doc2.id);
  });
});
