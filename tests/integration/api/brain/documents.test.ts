/**
 * Brain documents — REST round-trip + tenancy + full lifecycle + links.
 *
 * Routes:
 *   GET    /api/portal/brain/documents
 *   POST   /api/portal/brain/documents
 *   GET    /api/portal/brain/documents/[id]
 *   PATCH  /api/portal/brain/documents/[id]
 *   DELETE /api/portal/brain/documents/[id]
 *   GET    /api/portal/brain/documents/[id]/versions
 *   POST   /api/portal/brain/documents/[id]/versions
 *   GET    /api/portal/brain/documents/[id]/versions/[versionId]
 *   POST   /api/portal/brain/documents/[id]/publish
 *   POST   /api/portal/brain/documents/[id]/archive
 *   POST   /api/portal/brain/documents/[id]/unarchive
 *   POST   /api/portal/brain/documents/promote-from-note
 *   GET    /api/portal/brain/documents/[id]/links
 *   POST   /api/portal/brain/documents/[id]/links
 *   DELETE /api/portal/brain/documents/[id]/links
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

async function seedNote(ctx: TenantCtx, title = 'a note', body = ''): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_notes (client_id, title, body, tags)
    VALUES (${ctx.client.id}, ${title}, ${body}, '[]'::jsonb)
    RETURNING id
  `;
  return row;
}

async function seedTopic(ctx: TenantCtx, name = 'general'): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_topics (client_id, name, slug, path)
    VALUES (${ctx.client.id}, ${name}, ${slug}, ${'/' + slug})
    RETURNING id
  `;
  return row;
}

async function seedPerson(ctx: TenantCtx, fullName = 'Alex Doe'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_people (client_id, full_name)
    VALUES (${ctx.client.id}, ${fullName})
    RETURNING id
  `;
  return row;
}

// ─── POST /documents ────────────────────────────────────────────────────────

describe('Brain documents — POST /documents @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/documents/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'x' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when title is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { category: 'sop' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates a document + v1 draft (empty body), scoped to caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/route');
    const res = await callHandler<{
      success: boolean;
      data: { document: { id: number; slug: string; status: string; currentDraftVersionId: number }; version: { versionNumber: number; isDraft: boolean; body: string } };
    }>(route as unknown as Record<string, unknown>, 'POST', { body: { title: 'Hiring SOP', category: 'sop' } });
    expect(res.status).toBe(200);
    expect(res.data?.data.document.slug).toBe('hiring-sop');
    expect(res.data?.data.document.status).toBe('draft');
    expect(res.data?.data.version.versionNumber).toBe(1);
    expect(res.data?.data.version.isDraft).toBe(true);
    expect(res.data?.data.version.body).toBe('');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; current_draft_version_id: number | null }[]>`
      SELECT client_id, current_draft_version_id FROM ${sql(TEST_SCHEMA)}.brain_documents
      WHERE id = ${res.data!.data.document.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.current_draft_version_id).toBe(res.data!.data.version.versionNumber === 1 ? res.data!.data.document.currentDraftVersionId : null);
  });

  it('auto-suffixes the slug on per-tenant collision', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/route');
    const first = await callHandler<{ data: { document: { slug: string } } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'Pricing Policy' } },
    );
    expect(first.status).toBe(200);
    const second = await callHandler<{ data: { document: { slug: string } } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'Pricing Policy' } },
    );
    expect(second.status).toBe(200);
    expect(first.data?.data.document.slug).toBe('pricing-policy');
    expect(second.data?.data.document.slug).toBe('pricing-policy-2');
  });
});

// ─── GET /documents (list) ──────────────────────────────────────────────────

describe('Brain documents — GET /documents @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-list'); });

  it("returns only this tenant's documents", async () => {
    const B = await sessionForNewClientUser('brain-doc-list-b');

    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    await callHandler(create as unknown as Record<string, unknown>, 'POST', { body: { title: 'mine' } });

    mockedAuth.mockResolvedValue(B.session);
    await callHandler(create as unknown as Record<string, unknown>, 'POST', { body: { title: 'theirs' } });

    mockedAuth.mockResolvedValue(A.session);
    const list = await callHandler<{
      data: { items: Array<{ id: number; title: string; versionCount: number; ackCount: number; requiredReadCount: number }> };
    }>(create as unknown as Record<string, unknown>, 'GET');
    expect(list.status).toBe(200);
    const titles = list.data!.data.items.map((i) => i.title);
    expect(titles).toContain('mine');
    expect(titles).not.toContain('theirs');
    // Every row carries the three count fields.
    for (const r of list.data!.data.items) {
      expect(typeof r.versionCount).toBe('number');
      expect(typeof r.ackCount).toBe('number');
      expect(typeof r.requiredReadCount).toBe('number');
    }
  });

  it('versionCount reflects actual rows (correlated-subquery sanity)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/route');
    const create = await callHandler<{ data: { document: { id: number } } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'has-versions' } },
    );
    const docId = create.data!.data.document.id;
    // Insert a couple extra version rows directly so versionCount > 1.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_document_versions
        (client_id, document_id, version_number, body, title, is_draft)
      VALUES
        (${A.client.id}, ${docId}, 2, 'b', 'has-versions', false),
        (${A.client.id}, ${docId}, 3, 'c', 'has-versions', true)
    `;

    const list = await callHandler<{ data: { items: Array<{ id: number; versionCount: number }> } }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    const hit = list.data!.data.items.find((i) => i.id === docId);
    expect(hit).toBeDefined();
    expect(hit!.versionCount).toBe(3);
  });

  it('search filter matches against document title', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    await callHandler(create as unknown as Record<string, unknown>, 'POST', { body: { title: 'Onboarding Engineering' } });
    await callHandler(create as unknown as Record<string, unknown>, 'POST', { body: { title: 'Sales Playbook' } });

    const list = await callHandler<{ data: { items: Array<{ title: string }> } }>(
      create as unknown as Record<string, unknown>, 'GET', { query: { search: 'Onboarding' } },
    );
    expect(list.data!.data.items.map((i) => i.title)).toContain('Onboarding Engineering');
    expect(list.data!.data.items.map((i) => i.title)).not.toContain('Sales Playbook');
  });
});

// ─── GET / PATCH / DELETE /documents/[id] ──────────────────────────────────

describe('Brain documents — GET /documents/[id] @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-get'); });

  it('returns the document + slim versions + links (no body by default)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'Get Test' } },
    );
    const docId = c.data!.data.document.id;

    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{
      data: {
        document: { id: number; title: string };
        versions: Array<{ id: number; versionNumber: number; isDraft: boolean }>;
        currentDraftVersion?: { body: string };
        links: unknown[];
      };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(docId) } });
    expect(res.status).toBe(200);
    expect(res.data?.data.document.id).toBe(docId);
    expect(res.data?.data.versions.length).toBe(1);
    expect(res.data?.data.versions[0].versionNumber).toBe(1);
    expect(res.data?.data.versions[0].isDraft).toBe(true);
    expect(res.data?.data.currentDraftVersion).toBeUndefined(); // body not included
    expect(res.data?.data.links).toEqual([]);
  });

  it('includes the draft body when includeBody=true', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'Body Test' } },
    );
    const docId = c.data!.data.document.id;

    // Write some content into the draft
    const verRoute = await import('@/app/api/portal/brain/documents/[id]/versions/route');
    await callHandler(verRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(docId) },
      body: { body: 'some markdown here' },
    });

    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{
      data: { currentDraftVersion?: { body: string } };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(docId) },
      query: { includeBody: 'true' },
    });
    expect(res.data?.data.currentDraftVersion?.body).toBe('some markdown here');
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-get-b');
    mockedAuth.mockResolvedValue(B.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: "B's doc" } },
    );
    const docB = c.data!.data.document.id;

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET', { params: { id: String(docB) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain documents — PATCH /documents/[id] @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-patch'); });

  it('updates title + category', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'before' } },
    );
    const docId = c.data!.data.document.id;

    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{ data: { title: string; category: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(docId) }, body: { title: 'after', category: 'policy' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('after');
    expect(res.data?.data.category).toBe('policy');
  });

  it('400 when patch contains a status field', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'x' } },
    );
    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(c.data!.data.document.id) }, body: { status: 'archived' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/publish|archive|unarchive/);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-patch-b');
    mockedAuth.mockResolvedValue(B.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'B doc' } },
    );
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(c.data!.data.document.id) }, body: { title: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain documents — DELETE /documents/[id] @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-del'); });

  it('hard-deletes when no acks exist', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'doomed' } },
    );
    const docId = c.data!.data.document.id;

    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{ data: { deleted: boolean; ackCount: number } }>(
      route as unknown as Record<string, unknown>, 'DELETE', { params: { id: String(docId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.deleted).toBe(true);
    expect(res.data?.data.ackCount).toBe(0);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_documents WHERE id = ${docId}
    `;
    expect(rows.length).toBe(0);
  });

  it('409 when acks exist and force is not set', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number }; version: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'with-ack' } },
    );
    const docId = c.data!.data.document.id;
    const verId = c.data!.data.version.id;

    // Seed a person + ack directly so the count subquery sees > 0.
    const person = await seedPerson(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_document_acknowledgments
        (client_id, document_id, version_id, person_id)
      VALUES (${A.client.id}, ${docId}, ${verId}, ${person.id})
    `;

    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{ code: string; ackCount: number }>(
      route as unknown as Record<string, unknown>, 'DELETE', { params: { id: String(docId) } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.code).toBe('DOCUMENT_HAS_ACKS');
    expect(res.data?.ackCount).toBe(1);
  });

  it('deletes with force=true even when acks exist', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number }; version: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'force-del' } },
    );
    const docId = c.data!.data.document.id;
    const verId = c.data!.data.version.id;

    const person = await seedPerson(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_document_acknowledgments
        (client_id, document_id, version_id, person_id)
      VALUES (${A.client.id}, ${docId}, ${verId}, ${person.id})
    `;

    const route = await import('@/app/api/portal/brain/documents/[id]/route');
    const res = await callHandler<{ data: { deleted: boolean } }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(docId) }, query: { force: 'true' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.deleted).toBe(true);

    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_documents WHERE id = ${docId}
    `;
    expect(rows.length).toBe(0);
  });
});

// ─── full lifecycle: create → edit draft → publish → edit again → publish v2 → archive → unarchive

describe('Brain documents — full lifecycle @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-lifecycle'); });

  it('walks create → edit draft → publish v1 → edit draft → publish v2 → archive → unarchive', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // 1. Create
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number; currentDraftVersionId: number }; version: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'Lifecycle Doc' } },
    );
    const docId = c.data!.data.document.id;
    const v1Id = c.data!.data.version.id;

    // 2. Edit the v1 draft to set a body.
    const versionsRoute = await import('@/app/api/portal/brain/documents/[id]/versions/route');
    const edit1 = await callHandler<{ data: { version: { body: string; versionNumber: number; isDraft: boolean } } }>(
      versionsRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { body: 'v1 content', changeNotes: 'first cut' } },
    );
    expect(edit1.status).toBe(200);
    expect(edit1.data?.data.version.body).toBe('v1 content');
    expect(edit1.data?.data.version.versionNumber).toBe(1);
    expect(edit1.data?.data.version.isDraft).toBe(true);

    // 3. Publish v1.
    const pubRoute = await import('@/app/api/portal/brain/documents/[id]/publish/route');
    const pub1 = await callHandler<{ data: { document: { status: string; currentPublishedVersionId: number; currentDraftVersionId: number | null }; version: { versionNumber: number; isDraft: boolean } } }>(
      pubRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(docId) } },
    );
    expect(pub1.status).toBe(200);
    expect(pub1.data?.data.document.status).toBe('published');
    expect(pub1.data?.data.document.currentPublishedVersionId).toBe(v1Id);
    expect(pub1.data?.data.document.currentDraftVersionId).toBeNull();
    expect(pub1.data?.data.version.isDraft).toBe(false);

    // 4. Edit again — should mint a v2 draft seeded from v1.
    const edit2 = await callHandler<{ data: { version: { id: number; versionNumber: number; isDraft: boolean; body: string } } }>(
      versionsRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { body: 'v2 content', changeNotes: 'rev 2' } },
    );
    expect(edit2.status).toBe(200);
    expect(edit2.data?.data.version.versionNumber).toBe(2);
    expect(edit2.data?.data.version.isDraft).toBe(true);
    expect(edit2.data?.data.version.body).toBe('v2 content');

    // 5. Publish v2.
    const pub2 = await callHandler<{ data: { document: { currentPublishedVersionId: number }; version: { versionNumber: number } } }>(
      pubRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(docId) } },
    );
    expect(pub2.status).toBe(200);
    expect(pub2.data?.data.version.versionNumber).toBe(2);
    expect(pub2.data?.data.document.currentPublishedVersionId).toBe(edit2.data!.data.version.id);

    // First-publish timestamp survives across v2 publish (sanity check)
    const sql = getTestSql();
    const [docRow] = await sql<{ published_at: string | null; status: string }[]>`
      SELECT published_at, status FROM ${sql(TEST_SCHEMA)}.brain_documents WHERE id = ${docId}
    `;
    expect(docRow.published_at).not.toBeNull();
    expect(docRow.status).toBe('published');

    // 6. Archive.
    const archiveRoute = await import('@/app/api/portal/brain/documents/[id]/archive/route');
    const arc = await callHandler<{ data: { status: string; archivedAt: string | null; archiveReason: string | null } }>(
      archiveRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { reason: 'superseded' } },
    );
    expect(arc.status).toBe(200);
    expect(arc.data?.data.status).toBe('archived');
    expect(arc.data?.data.archivedAt).not.toBeNull();
    expect(arc.data?.data.archiveReason).toBe('superseded');

    // 7. Editing a draft while archived is refused.
    const editArchived = await callHandler<{ message: string }>(
      versionsRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { body: 'should fail' } },
    );
    expect(editArchived.status).toBe(400);
    expect(editArchived.data?.message).toMatch(/archiv/i);

    // 8. Unarchive → status returns to 'published' because we have a published version.
    const unarcRoute = await import('@/app/api/portal/brain/documents/[id]/unarchive/route');
    const unarc = await callHandler<{ data: { status: string; archivedAt: string | null; archiveReason: string | null } }>(
      unarcRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(docId) } },
    );
    expect(unarc.status).toBe(200);
    expect(unarc.data?.data.status).toBe('published');
    expect(unarc.data?.data.archivedAt).toBeNull();
    expect(unarc.data?.data.archiveReason).toBeNull();
  });

  it('publish refuses with empty body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'empty' } },
    );
    const docId = c.data!.data.document.id;
    const pubRoute = await import('@/app/api/portal/brain/documents/[id]/publish/route');
    const res = await callHandler<{ message: string }>(
      pubRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(docId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/empty/i);
  });
});

// ─── single-version GET ─────────────────────────────────────────────────────

describe('Brain documents — GET /documents/[id]/versions/[versionId] @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-ver-get'); });

  it('returns the full body of a single version', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number }; version: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'ver get' } },
    );
    const docId = c.data!.data.document.id;
    const verId = c.data!.data.version.id;

    const versionsRoute = await import('@/app/api/portal/brain/documents/[id]/versions/route');
    await callHandler(versionsRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(docId) }, body: { body: 'rich body' },
    });

    const verRoute = await import('@/app/api/portal/brain/documents/[id]/versions/[versionId]/route');
    const res = await callHandler<{ data: { body: string; versionNumber: number } }>(
      verRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(docId), versionId: String(verId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.body).toBe('rich body');
    expect(res.data?.data.versionNumber).toBe(1);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-ver-get-b');
    mockedAuth.mockResolvedValue(B.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number }; version: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'B doc' } },
    );
    mockedAuth.mockResolvedValue(A.session);
    const verRoute = await import('@/app/api/portal/brain/documents/[id]/versions/[versionId]/route');
    const res = await callHandler(
      verRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(c.data!.data.document.id), versionId: String(c.data!.data.version.id) } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── promote-from-note ──────────────────────────────────────────────────────

describe('Brain documents — POST /documents/promote-from-note @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-promote'); });

  it('creates a new document seeded from a brain_note (happy path)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const note = await seedNote(A, 'My SOP Idea', 'Here is the body of the SOP.\nSecond line.');

    const route = await import('@/app/api/portal/brain/documents/promote-from-note/route');
    const res = await callHandler<{
      data: { document: { id: number; title: string; sourceNoteId: number }; version: { body: string; versionNumber: number } };
    }>(route as unknown as Record<string, unknown>, 'POST', { body: { noteId: note.id, category: 'sop' } });
    expect(res.status).toBe(200);
    expect(res.data?.data.document.title).toBe('My SOP Idea');
    expect(res.data?.data.document.sourceNoteId).toBe(note.id);
    expect(res.data?.data.version.body).toContain('Here is the body of the SOP.');
    expect(res.data?.data.version.versionNumber).toBe(1);
  });

  it('404 when note does not exist for this tenant', async () => {
    const B = await sessionForNewClientUser('brain-doc-promote-b');
    const noteB = await seedNote(B, 'theirs', 'x');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/documents/promote-from-note/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST', { body: { noteId: noteB.id } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── links polymorphism ─────────────────────────────────────────────────────

describe('Brain documents — /documents/[id]/links @brain @documents', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-doc-links'); });

  it('link → list (resolves topic name) → unlink round-trip; idempotent insert', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'links doc' } },
    );
    const docId = c.data!.data.document.id;
    const topic = await seedTopic(A, 'hiring');

    const route = await import('@/app/api/portal/brain/documents/[id]/links/route');

    // attach
    const first = await callHandler<{ data: { linkId: number | null; alreadyLinked: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { entityType: 'topic', entityId: topic.id } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.alreadyLinked).toBe(false);
    expect(typeof first.data?.data.linkId).toBe('number');

    // idempotent
    const second = await callHandler<{ data: { alreadyLinked: boolean } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { entityType: 'topic', entityId: topic.id } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.alreadyLinked).toBe(true);

    // list resolves title via brain_topics.name
    const list = await callHandler<{
      data: { items: Array<{ entityType: string; entityId: number; title: string | null }> };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(docId) } });
    expect(list.status).toBe(200);
    const hit = list.data!.data.items.find((i) => i.entityType === 'topic' && i.entityId === topic.id);
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('hiring');

    // unlink
    const del = await callHandler<{ data: { removed: boolean } }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(docId) }, body: { entityType: 'topic', entityId: topic.id } },
    );
    expect(del.status).toBe(200);
    expect(del.data?.data.removed).toBe(true);

    // unlink again → 404
    const delAgain = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(docId) }, body: { entityType: 'topic', entityId: topic.id } },
    );
    expect(delAgain.status).toBe(404);
  });

  it('resolves person.fullName for entityType=person', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'pers doc' } },
    );
    const docId = c.data!.data.document.id;
    const person = await seedPerson(A, 'Casey Kim');

    const route = await import('@/app/api/portal/brain/documents/[id]/links/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docId) }, body: { entityType: 'person', entityId: person.id } },
    );

    const list = await callHandler<{ data: { items: Array<{ entityType: string; title: string | null }> } }>(
      route as unknown as Record<string, unknown>, 'GET', { params: { id: String(docId) } },
    );
    const hit = list.data!.data.items.find((i) => i.entityType === 'person');
    expect(hit).toBeDefined();
    expect(hit!.title).toBe('Casey Kim');
  });

  it('rejects an unknown entityType outright', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'bad et' } },
    );
    const route = await import('@/app/api/portal/brain/documents/[id]/links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c.data!.data.document.id) }, body: { entityType: 'spaceship', entityId: 1 } },
    );
    expect(res.status).toBe(400);
  });

  it("404 when attaching to another tenant's document", async () => {
    const B = await sessionForNewClientUser('brain-doc-links-b');
    mockedAuth.mockResolvedValue(B.session);
    const create = await import('@/app/api/portal/brain/documents/route');
    const c = await callHandler<{ data: { document: { id: number } } }>(
      create as unknown as Record<string, unknown>, 'POST', { body: { title: 'B doc' } },
    );
    const docB = c.data!.data.document.id;

    mockedAuth.mockResolvedValue(A.session);
    const topic = await seedTopic(A, 'mine');
    const route = await import('@/app/api/portal/brain/documents/[id]/links/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(docB) }, body: { entityType: 'topic', entityId: topic.id } },
    );
    expect(res.status).toBe(404);
  });
});
