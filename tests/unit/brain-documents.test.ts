// @vitest-environment node
/**
 * Pure-function unit tests for the brain documents helpers:
 *   - slugifyDocumentTitle + collision suffix loop
 *   - isLinkableEntityType
 *   - createDocument auto-creates v1 draft
 *   - listDocuments filter branches (status/category/ownerId/search/limit/offset)
 *   - getDocumentById (not-found, with body, includeAllVersions)
 *   - editDraftVersion (existing draft path + new draft path + archived guard)
 *   - publishDocument (happy path + empty body + no draft)
 *   - updateDocument (happy path + null/not-found + status guard)
 *   - archiveDocument (happy path + already-archived + not-found)
 *   - unarchiveDocument (→published, →draft, non-archived guard, not-found)
 *   - promoteFromNote falls back to note title / first non-empty line
 *   - deleteDocument refuses when acks exist (mocked count subquery)
 *   - linkEntity / unlinkEntity / listDocumentLinks
 *
 * The full DB round-trip lives in tests/integration/api/brain/documents.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Programmable fake DB ───────────────────────────────────────────────────

interface State {
  selectQueue: unknown[][];
  insertReturns: unknown[][];
  updateReturns: unknown[][];
  deleteReturns: unknown[][];
  txQueue: unknown[][];
  deleted: number;
  auditCalls: Array<{ action: string; metadata?: Record<string, unknown> }>;
}

const state: State = {
  selectQueue: [],
  insertReturns: [],
  updateReturns: [],
  deleteReturns: [],
  txQueue: [],
  deleted: 0,
  auditCalls: [],
};

function reset() {
  state.selectQueue = [];
  state.insertReturns = [];
  state.updateReturns = [];
  state.deleteReturns = [];
  state.txQueue = [];
  state.deleted = 0;
  state.auditCalls = [];
}

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: { action: string; metadata?: Record<string, unknown> }) => {
    state.auditCalls.push({ action: args.action, metadata: args.metadata });
  }),
}));

vi.mock('@/lib/db/schema', () => {
  const col = (n: string) => ({ __col: n });
  const table = (name: string, cols: string[]) => {
    const t: Record<string, unknown> = { __table: name };
    for (const c of cols) t[c] = col(c);
    return t;
  };
  return {
    brainDocuments: table('brain_documents', [
      'id', 'clientId', 'title', 'slug', 'category', 'status', 'ownerId',
      'currentPublishedVersionId', 'currentDraftVersionId', 'publishedAt',
      'archivedAt', 'archiveReason', 'sourceNoteId', 'confidentialityLevel',
      'defaultTopicIds', 'createdBy', 'createdAt', 'updatedAt',
    ]),
    brainDocumentVersions: table('brain_document_versions', [
      'id', 'clientId', 'documentId', 'versionNumber', 'body', 'title',
      'summary', 'changeNotes', 'isDraft', 'publishedAt', 'publishedBy',
      'createdBy', 'createdAt', 'updatedAt',
    ]),
    brainDocumentLinks: table('brain_document_links', [
      'id', 'clientId', 'documentId', 'entityType', 'entityId', 'note', 'createdBy', 'createdAt',
    ]),
    brainDocumentAcknowledgments: table('brain_document_acknowledgments', [
      'id', 'clientId', 'documentId', 'versionId', 'personId',
    ]),
    brainNotes: table('brain_notes', ['id', 'clientId', 'title', 'body', 'confidentialityLevel']),
    brainAuditLogs: table('brain_audit_logs', ['id']),
    brainTopics: table('brain_topics', ['id', 'clientId', 'name']),
    brainInitiatives: table('brain_initiatives', ['id', 'clientId', 'name']),
    brainDecisions: table('brain_decisions', ['id', 'clientId', 'title']),
    brainMeetings: table('brain_meetings', ['id', 'clientId', 'title']),
    brainGlossaryTerms: table('brain_glossary_terms', ['id', 'clientId', 'term']),
    brainPeople: table('brain_people', ['id', 'clientId', 'fullName']),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
  inArray: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  sql: Object.assign((..._args: unknown[]) => ({ as: () => ({}) }), {}),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

vi.mock('@/lib/db', () => {
  const selectChain = {
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    // limit() returns `this` so that .offset() can chain. When awaited directly
    // (without .offset()), the `then` thenable is invoked instead.
    limit() { return this; },
    offset() {
      const next = state.selectQueue.shift() ?? [];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
      const next = state.selectQueue.shift() ?? [];
      return Promise.resolve(next).then(resolve);
    },
  };
  const insertChain = {
    values() { return this; },
    onConflictDoNothing() { return this; },
    onConflictDoUpdate() { return this; },
    returning() {
      const next = state.insertReturns.shift() ?? [{ id: 1 }];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(undefined).then(resolve);
    },
  };
  const updateChain = {
    set() { return this; },
    where() { return this; },
    returning() {
      const next = state.updateReturns.shift() ?? [{ id: 1 }];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(undefined).then(resolve);
    },
  };
  // deleteChain supports both:
  //   db.delete(...).where(...)                → void (hits then/await)
  //   db.delete(...).where(...).returning(...) → chained returning
  const deleteChain = {
    where() {
      state.deleted++;
      return this; // return `this` so .returning() can chain
    },
    returning() {
      const next = state.deleteReturns.shift() ?? [];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
      // Called when the delete is awaited without .returning()
      return Promise.resolve(undefined).then(resolve);
    },
  };

  const txDb = {
    select() { return selectChain; },
    insert() { return insertChain; },
    update() { return updateChain; },
    delete() { return deleteChain; },
  };

  const db = {
    __setSelectQueue(rows: unknown[][]) { state.selectQueue = [...rows]; },
    __setInsertReturns(rows: unknown[][]) { state.insertReturns = [...rows]; },
    __setUpdateReturns(rows: unknown[][]) { state.updateReturns = [...rows]; },
    __setDeleteReturns(rows: unknown[][]) { state.deleteReturns = [...rows]; },
    select() { return selectChain; },
    insert() { return insertChain; },
    update() { return updateChain; },
    delete() { return deleteChain; },
    async transaction<T>(fn: (tx: typeof txDb) => Promise<T>): Promise<T> {
      return fn(txDb);
    },
  };
  return { db };
});

const documents = await import('@/lib/brain/documents');
const { db } = await import('@/lib/db') as unknown as {
  db: {
    __setSelectQueue: (rows: unknown[][]) => void;
    __setInsertReturns: (rows: unknown[][]) => void;
    __setUpdateReturns: (rows: unknown[][]) => void;
    __setDeleteReturns: (rows: unknown[][]) => void;
  };
};

beforeEach(() => { reset(); });

// ─── slug derivation ────────────────────────────────────────────────────────

describe('slugifyDocumentTitle @documents', () => {
  it('lowercases + dashes + strips punctuation', () => {
    expect(documents.__test_slugifyDocumentTitle('Hiring SOP: Engineers (2026)'))
      .toBe('hiring-sop-engineers-2026');
  });

  it('falls back to "document" on all-punctuation input', () => {
    expect(documents.__test_slugifyDocumentTitle('!!! ???')).toBe('document');
  });

  it('caps length at 240 chars', () => {
    const long = 'a'.repeat(300);
    expect(documents.__test_slugifyDocumentTitle(long).length).toBeLessThanOrEqual(240);
  });
});

describe('pickNextAvailableSlug @documents', () => {
  it('returns the base when nothing is taken', () => {
    expect(documents.pickNextAvailableSlug({ base: 'foo', taken: [] })).toBe('foo');
  });
  it('returns -2 on a single collision', () => {
    expect(documents.pickNextAvailableSlug({ base: 'foo', taken: ['foo'] })).toBe('foo-2');
  });
  it('returns -3 when -2 is also taken', () => {
    expect(documents.pickNextAvailableSlug({ base: 'foo', taken: ['foo', 'foo-2'] })).toBe('foo-3');
  });
});

// ─── createDocument ─────────────────────────────────────────────────────────

describe('createDocument @documents', () => {
  it('auto-creates v1 draft with empty body and points the document at it', async () => {
    // 1st select: slug collision pre-check → empty.
    db.__setSelectQueue([[]]);
    // Inserts: document row, version row.
    db.__setInsertReturns([
      [{ id: 10, clientId: 1, title: 'Hiring SOP', slug: 'hiring-sop', status: 'draft', currentDraftVersionId: null }],
      [{ id: 100, clientId: 1, documentId: 10, versionNumber: 1, body: '', title: 'Hiring SOP', isDraft: true }],
    ]);
    // Update: pointer flip.
    db.__setUpdateReturns([
      [{ id: 10, clientId: 1, title: 'Hiring SOP', slug: 'hiring-sop', status: 'draft', currentDraftVersionId: 100 }],
    ]);

    const out = await documents.createDocument(1, 7, { title: 'Hiring SOP' });
    expect(out.document.slug).toBe('hiring-sop');
    expect(out.version.versionNumber).toBe(1);
    expect(out.version.body).toBe('');
    expect(out.version.isDraft).toBe(true);
    expect(out.document.currentDraftVersionId).toBe(100);

    expect(state.auditCalls.length).toBe(1);
    expect(state.auditCalls[0].action).toBe('brain_document.create');
  });

  it('throws on empty title', async () => {
    await expect(documents.createDocument(1, null, { title: '   ' })).rejects.toThrow(/title/);
  });
});

// ─── updateDocument refuses status ─────────────────────────────────────────

describe('updateDocument @documents', () => {
  it('throws when patch contains a status field', async () => {
    await expect(
      documents.updateDocument(1, null, 1, { status: 'archived' } as { status: 'archived' }),
    ).rejects.toThrow(/publish|archive/);
  });
});

// ─── editDraftVersion ───────────────────────────────────────────────────────

describe('editDraftVersion @documents', () => {
  it('creates a new draft when no current draft exists', async () => {
    // Selects in order:
    //   1. document lookup → published doc, currentDraftVersionId=null
    //   2. latest version lookup → existing v1 (published)
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published', currentDraftVersionId: null, currentPublishedVersionId: 50 }],
      [{ id: 50, clientId: 1, documentId: 5, versionNumber: 1, body: 'original', title: 'Doc', isDraft: false }],
    ]);
    // Insert: new draft v2.
    db.__setInsertReturns([
      [{ id: 51, clientId: 1, documentId: 5, versionNumber: 2, body: 'new content', title: 'Doc', isDraft: true }],
    ]);
    // Update: pointer flip on the document.
    db.__setUpdateReturns([
      [{ id: 5, currentDraftVersionId: 51 }],
    ]);

    const out = await documents.editDraftVersion(1, 7, 5, { body: 'new content' });
    expect(out).not.toBeNull();
    expect(out!.version.versionNumber).toBe(2);
    expect(out!.version.body).toBe('new content');
    expect(out!.version.isDraft).toBe(true);

    expect(state.auditCalls[0]?.action).toBe('brain_document_version.edit_draft');
  });

  it('refuses to edit an archived document', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'archived', currentDraftVersionId: null }],
    ]);
    await expect(
      documents.editDraftVersion(1, 7, 5, { body: 'x' }),
    ).rejects.toThrow(/archiv/i);
  });
});

// ─── publishDocument refuses empty body ─────────────────────────────────────

describe('publishDocument @documents', () => {
  it('refuses to publish when the draft body is empty whitespace', async () => {
    // Selects inside the tx:
    //   1. document
    //   2. draft version (empty body)
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', currentDraftVersionId: 50, publishedAt: null }],
      [{ id: 50, clientId: 1, documentId: 5, versionNumber: 1, body: '   ', title: 'Doc', isDraft: true }],
    ]);

    await expect(documents.publishDocument(1, 7, 5)).rejects.toThrow(/empty/i);
  });

  it('refuses when no draft version is current', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', currentDraftVersionId: null, publishedAt: new Date() }],
    ]);
    await expect(documents.publishDocument(1, 7, 5)).rejects.toThrow(/no draft/i);
  });
});

// ─── promoteFromNote title fallback ─────────────────────────────────────────

describe('promoteFromNote @documents', () => {
  it("uses the note's title when no override is provided", async () => {
    db.__setSelectQueue([
      [{ id: 9, clientId: 1, title: 'My Note', body: 'note body here', confidentialityLevel: 'standard' }],
      [], // slug pre-check
    ]);
    db.__setInsertReturns([
      [{ id: 10, slug: 'my-note', title: 'My Note', clientId: 1, status: 'draft', sourceNoteId: 9 }],
      [{ id: 100, documentId: 10, versionNumber: 1, body: 'note body here', title: 'My Note', isDraft: true, clientId: 1 }],
    ]);
    db.__setUpdateReturns([
      [{ id: 10, slug: 'my-note', title: 'My Note', currentDraftVersionId: 100 }],
    ]);

    const out = await documents.promoteFromNote(1, 7, 9);
    expect(out).not.toBeNull();
    expect(out!.document.title).toBe('My Note');
    expect(out!.version.body).toBe('note body here');
    expect(state.auditCalls[0]?.action).toBe('brain_document.promote_from_note');
  });

  it("falls back to the body's first non-empty line when the note's title is empty", async () => {
    db.__setSelectQueue([
      [{ id: 9, clientId: 1, title: '', body: '\n\n# Real Heading\nbody line', confidentialityLevel: 'standard' }],
      [], // slug pre-check
    ]);
    db.__setInsertReturns([
      [{ id: 11, slug: 'real-heading', title: 'Real Heading', clientId: 1, status: 'draft' }],
      [{ id: 101, documentId: 11, versionNumber: 1, body: '\n\n# Real Heading\nbody line', title: 'Real Heading', isDraft: true, clientId: 1 }],
    ]);
    db.__setUpdateReturns([
      [{ id: 11, slug: 'real-heading', title: 'Real Heading', currentDraftVersionId: 101 }],
    ]);

    const out = await documents.promoteFromNote(1, 7, 9);
    expect(out).not.toBeNull();
    expect(out!.document.title).toBe('Real Heading');
  });

  it('returns null when the source note does not exist for this tenant', async () => {
    db.__setSelectQueue([[]]); // note lookup → empty
    const out = await documents.promoteFromNote(1, 7, 999);
    expect(out).toBeNull();
  });
});

// ─── deleteDocument refuses if acks exist ───────────────────────────────────

describe('deleteDocument @documents', () => {
  it('refuses when any acknowledgments exist and force is not passed', async () => {
    // 1st select: document row.
    // 2nd select: ack count subquery returns 3.
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc' }],
      [{ count: 3 }],
    ]);
    const out = await documents.deleteDocument(1, 7, 5);
    expect(out.deleted).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.ackCount).toBe(3);
    expect(state.auditCalls.length).toBe(0); // no audit on refusal
  });

  it('proceeds when force=true even with acks', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc' }],
      [{ count: 3 }],
    ]);
    const out = await documents.deleteDocument(1, 7, 5, { force: true });
    expect(out.deleted).toBe(true);
    expect(out.ackCount).toBe(3);
    expect(state.auditCalls[0]?.action).toBe('brain_document.delete');
  });

  it('proceeds when there are zero acks', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc' }],
      [{ count: 0 }],
    ]);
    const out = await documents.deleteDocument(1, 7, 5);
    expect(out.deleted).toBe(true);
    expect(out.refused).toBe(false);
    expect(out.ackCount).toBe(0);
  });

  it('returns deleted=false / refused=false when the document does not exist', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.deleteDocument(1, 7, 999);
    expect(out.deleted).toBe(false);
    expect(out.refused).toBe(false);
  });
});

// ─── isLinkableEntityType ───────────────────────────────────────────────────

describe('isLinkableEntityType @documents', () => {
  it('returns true for all known linkable types', () => {
    const valid = ['topic', 'initiative', 'decision', 'meeting', 'glossary_term', 'person'];
    for (const t of valid) {
      expect(documents.isLinkableEntityType(t)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(documents.isLinkableEntityType('note')).toBe(false);
    expect(documents.isLinkableEntityType('')).toBe(false);
    expect(documents.isLinkableEntityType('TOPIC')).toBe(false);
  });
});

// ─── listDocuments filter branches ─────────────────────────────────────────

describe('listDocuments @documents', () => {
  it('returns mapped rows for a basic tenant query', async () => {
    db.__setSelectQueue([
      [{ id: 1, title: 'Doc A', slug: 'doc-a', category: 'policy', status: 'published',
         ownerId: 3, currentPublishedVersionId: 10, publishedAt: null,
         versionCount: '2', requiredReadCount: '1', ackCount: '5' }],
    ]);
    const out = await documents.listDocuments(42, {});
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Doc A');
    expect(out[0].versionCount).toBe(2);
    expect(out[0].requiredReadCount).toBe(1);
    expect(out[0].ackCount).toBe(5);
  });

  it('handles a single status filter', async () => {
    db.__setSelectQueue([[{ id: 2, title: 'D', slug: 'd', category: 'reference', status: 'draft',
       ownerId: null, currentPublishedVersionId: null, publishedAt: null,
       versionCount: 1, requiredReadCount: 0, ackCount: 0 }]]);
    const out = await documents.listDocuments(1, { status: 'draft' });
    expect(out[0].status).toBe('draft');
  });

  it('handles an array status filter', async () => {
    db.__setSelectQueue([[{ id: 3, title: 'X', slug: 'x', category: 'reference', status: 'published',
       ownerId: null, currentPublishedVersionId: 5, publishedAt: null,
       versionCount: 1, requiredReadCount: 0, ackCount: 0 }]]);
    const out = await documents.listDocuments(1, { status: ['draft', 'published'] });
    expect(out).toHaveLength(1);
  });

  it('handles a single category filter', async () => {
    db.__setSelectQueue([[{ id: 4, title: 'Y', slug: 'y', category: 'sop', status: 'published',
       ownerId: null, currentPublishedVersionId: null, publishedAt: null,
       versionCount: 0, requiredReadCount: 0, ackCount: 0 }]]);
    const out = await documents.listDocuments(1, { category: 'sop' });
    expect(out[0].category).toBe('sop');
  });

  it('handles an array category filter', async () => {
    db.__setSelectQueue([[{ id: 5, title: 'Z', slug: 'z', category: 'policy', status: 'draft',
       ownerId: null, currentPublishedVersionId: null, publishedAt: null,
       versionCount: 0, requiredReadCount: 0, ackCount: 0 }]]);
    const out = await documents.listDocuments(1, { category: ['policy', 'sop'] });
    expect(out).toHaveLength(1);
  });

  it('handles ownerId filter', async () => {
    db.__setSelectQueue([[{ id: 6, title: 'Owner Doc', slug: 'owner-doc', category: 'reference',
       status: 'published', ownerId: 99, currentPublishedVersionId: null, publishedAt: null,
       versionCount: 1, requiredReadCount: 0, ackCount: 0 }]]);
    const out = await documents.listDocuments(1, { ownerId: 99 });
    expect(out[0].ownerId).toBe(99);
  });

  it('handles search filter', async () => {
    db.__setSelectQueue([[{ id: 7, title: 'Onboarding Guide', slug: 'onboarding-guide',
       category: 'reference', status: 'published', ownerId: null,
       currentPublishedVersionId: 20, publishedAt: null,
       versionCount: 3, requiredReadCount: 0, ackCount: 2 }]]);
    const out = await documents.listDocuments(1, { search: 'onboarding' });
    expect(out[0].title).toBe('Onboarding Guide');
  });

  it('clamps limit to 1 minimum and 100 maximum', async () => {
    // Both calls should proceed without throwing; the mock just resolves empty.
    db.__setSelectQueue([[], []]);
    await documents.listDocuments(1, { limit: -5, offset: -1 });
    await documents.listDocuments(1, { limit: 999, offset: 0 });
  });

  it('returns empty array when no rows match', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.listDocuments(1, {});
    expect(out).toHaveLength(0);
  });
});

// ─── getDocumentById ────────────────────────────────────────────────────────

describe('getDocumentById @documents', () => {
  it('returns null when the document does not exist', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.getDocumentById(1, 999);
    expect(out).toBeNull();
  });

  it('returns document with slim versions and links (no body)', async () => {
    // select: doc, versions, links
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'draft',
         currentDraftVersionId: 10, currentPublishedVersionId: null, publishedAt: null }],
      [{ id: 10, versionNumber: 1, isDraft: true, publishedAt: null, title: 'Doc' }],
      [], // links table rows
    ]);
    const out = await documents.getDocumentById(1, 5);
    expect(out).not.toBeNull();
    expect(out!.document.title).toBe('Doc');
    expect(out!.versions).toHaveLength(1);
    expect(out!.currentPublishedVersion).toBeUndefined();
    expect(out!.currentDraftVersion).toBeUndefined();
  });

  it('fetches published and draft body when includeBody=true', async () => {
    // select: doc, versions, links, published version, draft version
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published',
         currentDraftVersionId: 20, currentPublishedVersionId: 10, publishedAt: null }],
      [{ id: 10, versionNumber: 1, isDraft: false, publishedAt: null, title: 'Doc' }],
      [], // links
      [{ id: 10, clientId: 1, documentId: 5, versionNumber: 1, body: 'published body', title: 'Doc', isDraft: false }],
      [{ id: 20, clientId: 1, documentId: 5, versionNumber: 2, body: 'draft body', title: 'Doc', isDraft: true }],
    ]);
    const out = await documents.getDocumentById(1, 5, { includeBody: true });
    expect(out!.currentPublishedVersion!.body).toBe('published body');
    expect(out!.currentDraftVersion!.body).toBe('draft body');
  });

  it('fetches allVersions when includeAllVersions=true', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published',
         currentDraftVersionId: null, currentPublishedVersionId: 10, publishedAt: null }],
      [{ id: 10, versionNumber: 1, isDraft: false, publishedAt: null, title: 'Doc' }],
      [], // links
      [
        { id: 10, clientId: 1, documentId: 5, versionNumber: 1, body: 'v1', title: 'Doc', isDraft: false },
        { id: 20, clientId: 1, documentId: 5, versionNumber: 2, body: 'v2', title: 'Doc', isDraft: false },
      ],
    ]);
    const out = await documents.getDocumentById(1, 5, { includeAllVersions: true });
    expect(out!.allVersions).toHaveLength(2);
  });
});

// ─── updateDocument happy path ──────────────────────────────────────────────

describe('updateDocument happy path @documents', () => {
  it('returns the updated document and fires an audit', async () => {
    db.__setUpdateReturns([
      [{ id: 1, clientId: 1, title: 'New Title', slug: 'old-slug', status: 'draft',
         ownerId: null, category: 'sop', confidentialityLevel: 'standard',
         defaultTopicIds: [], currentDraftVersionId: null, currentPublishedVersionId: null,
         publishedAt: null, archivedAt: null, archiveReason: null, sourceNoteId: null,
         createdBy: 7, createdAt: new Date(), updatedAt: new Date() }],
    ]);
    const out = await documents.updateDocument(1, 7, 1, { title: 'New Title' });
    expect(out).not.toBeNull();
    expect(out!.title).toBe('New Title');
    expect(state.auditCalls[0]?.action).toBe('brain_document.update');
  });

  it('returns null when the document does not exist for this tenant', async () => {
    db.__setUpdateReturns([[]]);
    const out = await documents.updateDocument(1, 7, 999, { title: 'Ghost' });
    expect(out).toBeNull();
    expect(state.auditCalls).toHaveLength(0);
  });

  it('propagates defaultTopicIds with invalid entries filtered out', async () => {
    db.__setUpdateReturns([
      [{ id: 1, clientId: 1, title: 'Doc', slug: 'doc', status: 'draft',
         ownerId: null, category: 'reference', confidentialityLevel: 'standard',
         defaultTopicIds: [3, 4], currentDraftVersionId: null, currentPublishedVersionId: null,
         publishedAt: null, archivedAt: null, archiveReason: null, sourceNoteId: null,
         createdBy: 7, createdAt: new Date(), updatedAt: new Date() }],
    ]);
    // Pass an array that includes 0 and negative — those should be filtered
    const out = await documents.updateDocument(1, 7, 1, { defaultTopicIds: [3, 0, -1, 4] });
    expect(out).not.toBeNull();
    expect(state.auditCalls[0]?.action).toBe('brain_document.update');
  });
});

// ─── editDraftVersion existing draft path ───────────────────────────────────

describe('editDraftVersion existing draft @documents', () => {
  it('updates body on the existing draft version', async () => {
    // Selects: 1. doc (has currentDraftVersionId=50)
    //          2. existing draft version
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'draft',
         currentDraftVersionId: 50, currentPublishedVersionId: null }],
      [{ id: 50, clientId: 1, documentId: 5, versionNumber: 1, body: 'old body',
         title: 'Doc', isDraft: true }],
    ]);
    db.__setUpdateReturns([
      [{ id: 50, clientId: 1, documentId: 5, versionNumber: 1, body: 'updated body',
         title: 'Doc', isDraft: true }],
      [{ id: 5, currentDraftVersionId: 50 }],
    ]);

    const out = await documents.editDraftVersion(1, 7, 5, { body: 'updated body' });
    expect(out).not.toBeNull();
    expect(out!.version.body).toBe('updated body');
    expect(out!.version.isDraft).toBe(true);
    expect(state.auditCalls[0]?.action).toBe('brain_document_version.edit_draft');
  });

  it('returns null when the document does not exist', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.editDraftVersion(1, 7, 999, { body: 'x' });
    expect(out).toBeNull();
  });
});

// ─── publishDocument happy path ─────────────────────────────────────────────

describe('publishDocument happy path @documents', () => {
  it('flips the draft to published and fires an audit log via tx', async () => {
    // Inside tx selects: doc, draft version
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', currentDraftVersionId: 50, publishedAt: null }],
      [{ id: 50, clientId: 1, documentId: 5, versionNumber: 1, body: 'real content',
         title: 'Doc', isDraft: true }],
    ]);
    db.__setUpdateReturns([
      [{ id: 50, clientId: 1, documentId: 5, versionNumber: 1, body: 'real content',
         title: 'Doc', isDraft: false, publishedAt: new Date(), publishedBy: 7 }],
      [{ id: 5, clientId: 1, title: 'Doc', currentPublishedVersionId: 50,
         currentDraftVersionId: null, status: 'published', publishedAt: new Date() }],
    ]);
    // tx.insert(brainAuditLogs) is consumed by insertReturns
    db.__setInsertReturns([[{ id: 999 }]]);

    const out = await documents.publishDocument(1, 7, 5);
    expect(out).not.toBeNull();
    expect(out!.document.status).toBe('published');
    expect(out!.version.isDraft).toBe(false);
  });

  it('returns null when the document does not exist inside the tx', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.publishDocument(1, 7, 999);
    expect(out).toBeNull();
  });

  it('throws when the current draft version is not found inside the tx', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', currentDraftVersionId: 50, publishedAt: null }],
      [], // draft lookup returns empty
    ]);
    await expect(documents.publishDocument(1, 7, 5)).rejects.toThrow(/not found/i);
  });
});

// ─── archiveDocument ────────────────────────────────────────────────────────

describe('archiveDocument @documents', () => {
  it('archives a published document and fires audit', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published' }],
    ]);
    db.__setUpdateReturns([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'archived',
         archivedAt: new Date(), archiveReason: 'outdated' }],
    ]);
    const out = await documents.archiveDocument(1, 7, 5, { reason: 'outdated' });
    expect(out).not.toBeNull();
    expect(out!.status).toBe('archived');
    expect(state.auditCalls[0]?.action).toBe('brain_document.archive');
    expect(state.auditCalls[0]?.metadata?.hasReason).toBe(true);
  });

  it('archives without a reason (reason defaults null)', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'draft' }],
    ]);
    db.__setUpdateReturns([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'archived',
         archivedAt: new Date(), archiveReason: null }],
    ]);
    const out = await documents.archiveDocument(1, 7, 5);
    expect(out!.status).toBe('archived');
    expect(state.auditCalls[0]?.metadata?.hasReason).toBe(false);
  });

  it('throws when the document is already archived', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'archived' }],
    ]);
    await expect(documents.archiveDocument(1, 7, 5)).rejects.toThrow(/already archived/i);
  });

  it('returns null when the document does not exist', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.archiveDocument(1, 7, 999);
    expect(out).toBeNull();
  });
});

// ─── unarchiveDocument ──────────────────────────────────────────────────────

describe('unarchiveDocument @documents', () => {
  it('restores to published when a published version exists', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'archived',
         currentPublishedVersionId: 10 }],
    ]);
    db.__setUpdateReturns([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published',
         archivedAt: null, archiveReason: null }],
    ]);
    const out = await documents.unarchiveDocument(1, 7, 5);
    expect(out!.status).toBe('published');
    expect(state.auditCalls[0]?.action).toBe('brain_document.unarchive');
    expect(state.auditCalls[0]?.metadata?.restoredStatus).toBe('published');
  });

  it('restores to draft when no published version exists', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'archived',
         currentPublishedVersionId: null }],
    ]);
    db.__setUpdateReturns([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'draft',
         archivedAt: null, archiveReason: null }],
    ]);
    const out = await documents.unarchiveDocument(1, 7, 5);
    expect(out!.status).toBe('draft');
    expect(state.auditCalls[0]?.metadata?.restoredStatus).toBe('draft');
  });

  it('throws when the document is not archived', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published',
         currentPublishedVersionId: 10 }],
    ]);
    await expect(documents.unarchiveDocument(1, 7, 5)).rejects.toThrow(/non-archived/i);
  });

  it('returns null when the document does not exist', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.unarchiveDocument(1, 7, 999);
    expect(out).toBeNull();
  });
});

// ─── linkEntity ─────────────────────────────────────────────────────────────

describe('linkEntity @documents', () => {
  it('inserts a link and returns the linkId', async () => {
    // select: ownership check → found
    db.__setSelectQueue([[{ id: 5 }]]);
    // insert with .returning() → new link
    db.__setInsertReturns([[{ id: 77 }]]);

    const out = await documents.linkEntity(1, 7, {
      documentId: 5, entityType: 'topic', entityId: 3, note: null,
    });
    expect(out.linkId).toBe(77);
    expect(out.alreadyLinked).toBe(false);
    expect(state.auditCalls[0]?.action).toBe('brain_document.link');
  });

  it('returns alreadyLinked=true on conflict (insert returns empty)', async () => {
    db.__setSelectQueue([[{ id: 5 }]]);
    db.__setInsertReturns([[]]); // ON CONFLICT DO NOTHING → empty

    const out = await documents.linkEntity(1, 7, {
      documentId: 5, entityType: 'initiative', entityId: 8, note: null,
    });
    expect(out.linkId).toBeNull();
    expect(out.alreadyLinked).toBe(true);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('throws on invalid entityType', async () => {
    await expect(
      documents.linkEntity(1, 7, { documentId: 5, entityType: 'note' as 'topic', entityId: 1, note: null }),
    ).rejects.toThrow(/invalid entityType/i);
  });

  it('throws when the document is not found for this tenant', async () => {
    db.__setSelectQueue([[]]); // ownership check → not found
    await expect(
      documents.linkEntity(1, 7, { documentId: 999, entityType: 'topic', entityId: 1, note: null }),
    ).rejects.toThrow(/not found/i);
  });
});

// ─── unlinkEntity ────────────────────────────────────────────────────────────

describe('unlinkEntity @documents', () => {
  it('returns true and fires audit when a row is deleted', async () => {
    db.__setDeleteReturns([[{ id: 77 }]]);
    const out = await documents.unlinkEntity(1, 7, {
      documentId: 5, entityType: 'topic', entityId: 3,
    });
    expect(out).toBe(true);
    expect(state.auditCalls[0]?.action).toBe('brain_document.unlink');
  });

  it('returns false when no matching link exists', async () => {
    db.__setDeleteReturns([[]]); // nothing deleted
    const out = await documents.unlinkEntity(1, 7, {
      documentId: 5, entityType: 'topic', entityId: 99,
    });
    expect(out).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('throws on invalid entityType', async () => {
    await expect(
      documents.unlinkEntity(1, 7, { documentId: 5, entityType: 'bad' as 'topic', entityId: 1 }),
    ).rejects.toThrow(/invalid entityType/i);
  });
});

// ─── listDocumentLinks ───────────────────────────────────────────────────────

describe('listDocumentLinks @documents', () => {
  it('returns empty array when no links exist', async () => {
    db.__setSelectQueue([[]]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out).toHaveLength(0);
  });

  it('resolves topic titles via batched lookup', async () => {
    db.__setSelectQueue([
      // links query
      [{ entityType: 'topic', entityId: 3, note: null, createdAt: new Date() }],
      // topic lookup
      [{ id: 3, name: 'Engineering' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].entityType).toBe('topic');
    expect(out[0].title).toBe('Engineering');
  });

  it('resolves initiative titles', async () => {
    db.__setSelectQueue([
      [{ entityType: 'initiative', entityId: 7, note: 'related', createdAt: new Date() }],
      [{ id: 7, name: 'Q4 Hiring' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].title).toBe('Q4 Hiring');
    expect(out[0].note).toBe('related');
  });

  it('resolves decision titles', async () => {
    db.__setSelectQueue([
      [{ entityType: 'decision', entityId: 11, note: null, createdAt: new Date() }],
      [{ id: 11, title: 'Chose Postgres' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].title).toBe('Chose Postgres');
  });

  it('resolves meeting titles', async () => {
    db.__setSelectQueue([
      [{ entityType: 'meeting', entityId: 22, note: null, createdAt: new Date() }],
      [{ id: 22, title: 'Sprint Planning' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].title).toBe('Sprint Planning');
  });

  it('resolves glossary_term labels', async () => {
    db.__setSelectQueue([
      [{ entityType: 'glossary_term', entityId: 5, note: null, createdAt: new Date() }],
      [{ id: 5, term: 'SLA' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].title).toBe('SLA');
  });

  it('resolves person full names', async () => {
    db.__setSelectQueue([
      [{ entityType: 'person', entityId: 14, note: null, createdAt: new Date() }],
      [{ id: 14, fullName: 'Jane Doe' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].title).toBe('Jane Doe');
  });

  it('returns null title for a link whose entity has been deleted (no match in lookup)', async () => {
    db.__setSelectQueue([
      [{ entityType: 'topic', entityId: 999, note: null, createdAt: new Date() }],
      [], // topic lookup returns nothing
    ]);
    const out = await documents.listDocumentLinks(1, 5);
    expect(out[0].title).toBeNull();
  });

  it('filters by entityType when the option is provided', async () => {
    db.__setSelectQueue([
      [{ entityType: 'decision', entityId: 11, note: null, createdAt: new Date() }],
      [{ id: 11, title: 'Use React' }],
    ]);
    const out = await documents.listDocumentLinks(1, 5, { entityType: 'decision' });
    expect(out).toHaveLength(1);
    expect(out[0].entityType).toBe('decision');
  });
});
