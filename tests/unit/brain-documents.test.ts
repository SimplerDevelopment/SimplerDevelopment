// @vitest-environment node
/**
 * Pure-function unit tests for the brain documents helpers:
 *   - slugifyDocumentTitle + collision suffix loop
 *   - createDocument auto-creates v1 draft
 *   - editDraftVersion creates a draft when none exists
 *   - publishDocument refuses an empty-body draft
 *   - updateDocument refuses status changes
 *   - promoteFromNote falls back to note title / first non-empty line
 *   - deleteDocument refuses when acks exist (mocked count subquery)
 *
 * The full DB round-trip lives in tests/integration/api/brain/documents.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Programmable fake DB ───────────────────────────────────────────────────

interface State {
  selectQueue: unknown[][];
  insertReturns: unknown[][];
  updateReturns: unknown[][];
  txQueue: unknown[][];
  deleted: number;
  auditCalls: Array<{ action: string; metadata?: Record<string, unknown> }>;
}

const state: State = {
  selectQueue: [],
  insertReturns: [],
  updateReturns: [],
  txQueue: [],
  deleted: 0,
  auditCalls: [],
};

function reset() {
  state.selectQueue = [];
  state.insertReturns = [];
  state.updateReturns = [];
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
}));

vi.mock('@/lib/db', () => {
  const selectChain = {
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() {
      const next = state.selectQueue.shift() ?? [];
      return Promise.resolve(next);
    },
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
  const deleteChain = {
    where() {
      state.deleted++;
      const next = state.updateReturns.shift();
      if (next !== undefined) return Promise.resolve(next);
      return Promise.resolve(undefined);
    },
    returning() {
      const next = state.updateReturns.shift() ?? [{ id: 1 }];
      return Promise.resolve(next);
    },
    then(resolve: (v: unknown) => unknown) {
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
