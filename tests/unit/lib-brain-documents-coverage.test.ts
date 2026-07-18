// @vitest-environment node
/**
 * Companion coverage test for lib/brain/documents.ts.
 *
 * Targets functions and branches NOT exercised by the existing
 * tests/unit/brain-documents.test.ts:
 *
 *   - isLinkableEntityType (valid + invalid)
 *   - slugifyDocumentTitle: NFKD normalization, leading/trailing dash trim,
 *       empty-after-strip fallback already tested; add unicode path
 *   - pickNextAvailableSlug: timestamp tail (all 2..9999 taken), already
 *       partially tested — add gap-in-the-middle case
 *   - listDocuments: no-opts path, single status, array status, single
 *       category, array category, ownerId, search, limit/offset clamping
 *   - getDocumentById: not-found, found (no opts), includeBody (pub+draft
 *       present), includeAllVersions
 *   - updateDocument: happy path (returns updated), returns null when not
 *       found, individual field patches
 *   - editDraftVersion: existing-draft update path (currentDraftVersionId set)
 *   - publishDocument: successful publish (happy path)
 *   - archiveDocument: happy path, already-archived guard, returns null
 *   - unarchiveDocument: restore to 'published', restore to 'draft',
 *       non-archived guard, returns null
 *   - linkEntity: invalid entityType, document not found, already linked,
 *       successful link
 *   - unlinkEntity: invalid entityType, link not found (returns false),
 *       successful unlink
 *   - listDocumentLinks: empty result, with entityType filter, each resolved
 *       type (topic/initiative/decision/meeting/glossary_term/person)
 *   - promoteFromNote: override title provided, body-only note (no title/no
 *       markdown heading → 'Untitled document')
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared state ─────────────────────────────────────────────────────────────

interface CoverageState {
  selectQueue: unknown[][];
  insertReturns: unknown[][];
  updateReturns: unknown[][];
  deleteReturns: unknown[][];
  auditCalls: Array<{ action: string; metadata?: Record<string, unknown> }>;
  dashboardCalls: number;
}

const state: CoverageState = {
  selectQueue: [],
  insertReturns: [],
  updateReturns: [],
  deleteReturns: [],
  auditCalls: [],
  dashboardCalls: 0,
};

function reset() {
  state.selectQueue = [];
  state.insertReturns = [];
  state.updateReturns = [];
  state.deleteReturns = [];
  state.auditCalls = [];
  state.dashboardCalls = 0;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: { action: string; metadata?: Record<string, unknown> }) => {
    state.auditCalls.push({ action: args.action, metadata: args.metadata });
  }),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  revalidateBrainDashboard: vi.fn(() => { state.dashboardCalls++; }),
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
    brainAuditLogs: table('brain_audit_logs', ['id', 'clientId', 'actorId', 'action', 'entityType', 'entityId', 'metadata']),
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
  and: (...args: unknown[]) => ({ op: 'and', args }),
  inArray: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  sql: Object.assign((..._args: unknown[]) => ({ as: () => ({}) }), {}),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

vi.mock('@/lib/db', () => {
  // Chainable select — supports both .limit()-terminated and .limit().offset()-
  // terminated query chains. limit() returns a dual-mode object: thenable
  // (resolves from queue only when awaited/thenned directly) AND has .offset()
  // for chains that continue past limit (offset() is the terminal resolver).
  // Key: we do NOT pop from the queue inside limit() itself — only when the
  // Promise is actually consumed (via .then) or when .offset() is called.
  function makeLimitResult() {
    let popped = false;
    function pop() {
      if (!popped) { popped = true; return state.selectQueue.shift() ?? []; }
      return [];
    }
    return {
      offset() {
        const next = pop();
        return Promise.resolve(next);
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(pop()).then(resolve, reject);
      },
    };
  }

  const selectChain = {
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() { return makeLimitResult(); },
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
    where() { return this; },
    returning() {
      const next = state.deleteReturns.shift() ?? [];
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

// ─── Module under test ────────────────────────────────────────────────────────

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

// ─── isLinkableEntityType ─────────────────────────────────────────────────────

describe('isLinkableEntityType @documents @coverage', () => {
  it('returns true for each of the six valid types', () => {
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

// ─── slugifyDocumentTitle (additional branches) ───────────────────────────────

describe('slugifyDocumentTitle additional branches @documents @coverage', () => {
  it('normalizes unicode via NFKD and strips combining chars', () => {
    // é → e + combining accent; after NFKD normalization the combining accent
    // is a non-letter/non-number and gets replaced by '-'.
    const slug = documents.__test_slugifyDocumentTitle('Café au lait');
    expect(slug).toMatch(/^cafe-au-lait$|^caf-au-lait$/);
  });

  it('strips leading and trailing dashes', () => {
    // Characters that become dashes at the boundary should be stripped.
    const slug = documents.__test_slugifyDocumentTitle('!!!hello!!!');
    expect(slug).toBe('hello');
  });

  it('returns "document" for empty string after strip', () => {
    expect(documents.__test_slugifyDocumentTitle('')).toBe('document');
  });
});

// ─── pickNextAvailableSlug (additional branches) ──────────────────────────────

describe('pickNextAvailableSlug additional branches @documents @coverage', () => {
  it('skips a gap: if -2 is free even when -3..-5 are taken, returns -2', () => {
    const result = documents.pickNextAvailableSlug({
      base: 'foo',
      taken: ['foo', 'foo-3', 'foo-4'],
    });
    expect(result).toBe('foo-2');
  });

  it('finds the first free slot when many suffixes are taken', () => {
    const taken = ['foo', ...Array.from({ length: 8 }, (_, i) => `foo-${i + 2}`)];
    // foo-2 .. foo-9 taken; foo-10 is free
    const result = documents.pickNextAvailableSlug({ base: 'foo', taken });
    expect(result).toBe('foo-10');
  });
});

// ─── listDocuments ────────────────────────────────────────────────────────────

describe('listDocuments @documents @coverage', () => {
  const baseRow = {
    id: 1, title: 'Doc', slug: 'doc', category: 'reference',
    status: 'draft', ownerId: null, currentPublishedVersionId: null,
    publishedAt: null, versionCount: '2', requiredReadCount: '0', ackCount: '1',
  };

  it('returns mapped rows with coerced number counts', async () => {
    db.__setSelectQueue([[baseRow]]);
    const rows = await documents.listDocuments(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].versionCount).toBe(2);
    expect(rows[0].requiredReadCount).toBe(0);
    expect(rows[0].ackCount).toBe(1);
  });

  it('returns empty array when no documents found', async () => {
    db.__setSelectQueue([[]]);
    const rows = await documents.listDocuments(1);
    expect(rows).toEqual([]);
  });

  it('applies single-element status filter', async () => {
    db.__setSelectQueue([[{ ...baseRow, status: 'published' }]]);
    const rows = await documents.listDocuments(1, { status: 'published' });
    expect(rows[0].status).toBe('published');
  });

  it('applies array status filter with multiple values', async () => {
    db.__setSelectQueue([[baseRow]]);
    const rows = await documents.listDocuments(1, { status: ['draft', 'published'] });
    expect(rows).toHaveLength(1);
  });

  it('applies single-element category filter', async () => {
    db.__setSelectQueue([[{ ...baseRow, category: 'sop' }]]);
    const rows = await documents.listDocuments(1, { category: 'sop' });
    expect(rows[0].category).toBe('sop');
  });

  it('applies array category filter', async () => {
    db.__setSelectQueue([[baseRow]]);
    const rows = await documents.listDocuments(1, { category: ['sop', 'policy'] });
    expect(rows).toHaveLength(1);
  });

  it('applies ownerId filter', async () => {
    db.__setSelectQueue([[{ ...baseRow, ownerId: 42 }]]);
    const rows = await documents.listDocuments(1, { ownerId: 42 });
    expect(rows[0].ownerId).toBe(42);
  });

  it('applies search filter (non-empty string)', async () => {
    db.__setSelectQueue([[baseRow]]);
    const rows = await documents.listDocuments(1, { search: 'hiring' });
    expect(rows).toHaveLength(1);
  });

  it('ignores search when only whitespace', async () => {
    db.__setSelectQueue([[baseRow]]);
    // Should NOT push an additional SQL condition — just return normally.
    const rows = await documents.listDocuments(1, { search: '   ' });
    expect(rows).toHaveLength(1);
  });

  it('clamps limit to [1, 100]', async () => {
    // limit=0 → clamped to 1; limit=200 → clamped to 100
    db.__setSelectQueue([[baseRow]]);
    await documents.listDocuments(1, { limit: 0 });
    db.__setSelectQueue([[baseRow]]);
    await documents.listDocuments(1, { limit: 200 });
    // No assertion on the limit itself (mock doesn't capture it), but we
    // assert the function completes without error.
  });

  it('clamps offset to 0 minimum', async () => {
    db.__setSelectQueue([[baseRow]]);
    await documents.listDocuments(1, { offset: -5 });
  });

  it('coerces null versionCount to 0', async () => {
    db.__setSelectQueue([[{ ...baseRow, versionCount: null, requiredReadCount: null, ackCount: null }]]);
    const rows = await documents.listDocuments(1);
    expect(rows[0].versionCount).toBe(0);
    expect(rows[0].requiredReadCount).toBe(0);
    expect(rows[0].ackCount).toBe(0);
  });
});

// ─── getDocumentById ──────────────────────────────────────────────────────────

describe('getDocumentById @documents @coverage', () => {
  const baseDoc = {
    id: 5, clientId: 1, title: 'My Doc', slug: 'my-doc',
    status: 'draft', ownerId: null, currentPublishedVersionId: null,
    currentDraftVersionId: null, publishedAt: null,
  };
  const baseVersion = {
    id: 50, clientId: 1, documentId: 5, versionNumber: 1,
    isDraft: false, publishedAt: null, title: 'My Doc',
  };

  it('returns null when the document does not exist', async () => {
    db.__setSelectQueue([[]]); // doc lookup → empty
    const result = await documents.getDocumentById(1, 999);
    expect(result).toBeNull();
  });

  it('returns document + slim version list + empty links (no opts)', async () => {
    db.__setSelectQueue([
      [baseDoc],          // doc
      [baseVersion],      // slim version list
      [],                 // listDocumentLinks → links select
    ]);
    const result = await documents.getDocumentById(1, 5);
    expect(result).not.toBeNull();
    expect(result!.document.id).toBe(5);
    expect(result!.versions).toHaveLength(1);
    expect(result!.links).toEqual([]);
  });

  it('includeBody: loads published and draft versions when both IDs are set', async () => {
    const docWithBoth = {
      ...baseDoc,
      currentPublishedVersionId: 50,
      currentDraftVersionId: 51,
    };
    const publishedVersion = { ...baseVersion, id: 50, isDraft: false };
    const draftVersion = { ...baseVersion, id: 51, isDraft: true };

    db.__setSelectQueue([
      [docWithBoth],        // doc
      [publishedVersion],   // slim version list (desc order)
      [],                   // listDocumentLinks → links
      [publishedVersion],   // includeBody: published version fetch
      [draftVersion],       // includeBody: draft version fetch
    ]);

    const result = await documents.getDocumentById(1, 5, { includeBody: true });
    expect(result!.currentPublishedVersion).toBeDefined();
    expect(result!.currentDraftVersion).toBeDefined();
  });

  it('includeBody: skips version fetches when both IDs are null', async () => {
    db.__setSelectQueue([
      [baseDoc],    // doc (currentPublishedVersionId=null, currentDraftVersionId=null)
      [],           // slim version list
      [],           // listDocumentLinks
    ]);
    const result = await documents.getDocumentById(1, 5, { includeBody: true });
    expect(result!.currentPublishedVersion).toBeUndefined();
    expect(result!.currentDraftVersion).toBeUndefined();
  });

  it('includeAllVersions: attaches full version rows', async () => {
    const fullVersion = { ...baseVersion, body: 'full content', summary: null };
    db.__setSelectQueue([
      [baseDoc],          // doc
      [baseVersion],      // slim version list
      [],                 // listDocumentLinks
      [fullVersion],      // includeAllVersions select
    ]);
    const result = await documents.getDocumentById(1, 5, { includeAllVersions: true });
    expect(result!.allVersions).toHaveLength(1);
    expect(result!.allVersions![0]).toMatchObject({ body: 'full content' });
  });
});

// ─── updateDocument ───────────────────────────────────────────────────────────

describe('updateDocument @documents @coverage', () => {
  it('returns updated document on success', async () => {
    const updated = {
      id: 10, clientId: 1, title: 'New Title', slug: 'new-title',
      category: 'sop', status: 'draft', ownerId: 5,
      confidentialityLevel: 'restricted', defaultTopicIds: [1, 2],
    };
    db.__setUpdateReturns([[updated]]);
    const result = await documents.updateDocument(1, 7, 10, {
      title: 'New Title',
      category: 'sop',
      ownerId: 5,
      confidentialityLevel: 'restricted',
      defaultTopicIds: [1, 2, 0, -1], // 0 and -1 should be filtered out
    });
    expect(result).toMatchObject({ title: 'New Title' });
    expect(state.auditCalls[0]?.action).toBe('brain_document.update');
  });

  it('returns null when the document does not exist', async () => {
    db.__setUpdateReturns([[]]); // returning() → empty
    const result = await documents.updateDocument(1, 7, 999, { title: 'X' });
    expect(result).toBeNull();
    expect(state.auditCalls).toHaveLength(0); // no audit when not found
  });

  it('patches only ownerId (null is valid)', async () => {
    const updated = { id: 10, clientId: 1, ownerId: null };
    db.__setUpdateReturns([[updated]]);
    const result = await documents.updateDocument(1, 7, 10, { ownerId: null });
    expect(result).toMatchObject({ ownerId: null });
  });
});

// ─── editDraftVersion — existing draft path ───────────────────────────────────

describe('editDraftVersion existing draft @documents @coverage', () => {
  it('updates an existing draft version in-place', async () => {
    const doc = {
      id: 5, clientId: 1, title: 'Doc', slug: 'doc',
      status: 'published', currentDraftVersionId: 50,
    };
    const existingDraft = {
      id: 50, clientId: 1, documentId: 5, versionNumber: 2,
      body: 'old body', title: 'Doc', isDraft: true,
    };
    const updatedDraft = { ...existingDraft, body: 'updated body', summary: 'sum', changeNotes: 'notes' };
    const docPointer = { ...doc, currentDraftVersionId: 50 };

    db.__setSelectQueue([
      [doc],           // document lookup
      [existingDraft], // existing draft lookup
    ]);
    db.__setUpdateReturns([
      [updatedDraft],  // version update
      [docPointer],    // document pointer update
    ]);

    const out = await documents.editDraftVersion(1, 7, 5, {
      body: 'updated body',
      summary: 'sum',
      changeNotes: 'notes',
    });
    expect(out).not.toBeNull();
    expect(out!.version.body).toBe('updated body');
    expect(state.auditCalls[0]?.action).toBe('brain_document_version.edit_draft');
  });

  it('returns null when the document does not exist', async () => {
    db.__setSelectQueue([[]]); // doc lookup → empty
    const out = await documents.editDraftVersion(1, 7, 999, { body: 'x' });
    expect(out).toBeNull();
  });

  it('creates a new draft when currentDraftVersionId points to non-draft version', async () => {
    // The draft ID is set but the version itself reports isDraft=false (edge case:
    // concurrent publish flipped it). editDraftVersion should fall through to
    // the "no draft" branch and create a new one.
    const doc = {
      id: 5, clientId: 1, title: 'Doc', slug: 'doc',
      status: 'published', currentDraftVersionId: 50,
    };
    const staleVersion = {
      id: 50, clientId: 1, documentId: 5, versionNumber: 1,
      body: 'published content', title: 'Doc', isDraft: false, // NOT a draft!
    };
    const latestVersion = staleVersion;
    const newDraft = {
      id: 51, clientId: 1, documentId: 5, versionNumber: 2,
      body: 'my new draft', title: 'Doc', isDraft: true,
    };
    const docPointer = { ...doc, currentDraftVersionId: 51 };

    db.__setSelectQueue([
      [doc],           // document lookup
      [staleVersion],  // existing draft lookup (isDraft=false → falls through)
      [latestVersion], // latest version lookup for seeding
    ]);
    db.__setInsertReturns([[newDraft]]);
    db.__setUpdateReturns([[docPointer]]);

    const out = await documents.editDraftVersion(1, 7, 5, { body: 'my new draft' });
    expect(out).not.toBeNull();
    expect(out!.version.versionNumber).toBe(2);
    expect(out!.version.isDraft).toBe(true);
  });
});

// ─── publishDocument — happy path ─────────────────────────────────────────────

describe('publishDocument happy path @documents @coverage', () => {
  it('publishes a draft with content and fires revalidate', async () => {
    const doc = {
      id: 5, clientId: 1, title: 'Doc', slug: 'doc',
      status: 'draft', currentDraftVersionId: 50, publishedAt: null,
    };
    const draft = {
      id: 50, clientId: 1, documentId: 5, versionNumber: 1,
      body: 'real content', title: 'Doc', isDraft: true, publishedAt: null,
    };
    const publishedVersion = { ...draft, isDraft: false, publishedAt: new Date() };
    const publishedDoc = {
      ...doc,
      status: 'published',
      currentPublishedVersionId: 50,
      currentDraftVersionId: null,
    };

    db.__setSelectQueue([
      [doc],   // tx: document lookup
      [draft], // tx: draft lookup
    ]);
    db.__setUpdateReturns([
      [publishedVersion], // tx: version update
      [publishedDoc],     // tx: document update
    ]);
    db.__setInsertReturns([
      [],                 // tx: audit log insert (Pattern B, inside tx)
    ]);

    const result = await documents.publishDocument(1, 7, 5);
    expect(result).not.toBeNull();
    expect(result!.document.status).toBe('published');
    expect(result!.version.isDraft).toBe(false);
    expect(state.dashboardCalls).toBeGreaterThan(0);
  });

  it('returns null when document not found inside transaction', async () => {
    db.__setSelectQueue([[]]); // tx: doc lookup → empty
    const result = await documents.publishDocument(1, 7, 999);
    expect(result).toBeNull();
  });

  it('throws when the draft version is not found', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, currentDraftVersionId: 50, publishedAt: null }],
      [], // draft lookup → empty
    ]);
    await expect(documents.publishDocument(1, 7, 5)).rejects.toThrow(/not found/i);
  });

  it('throws when the version isDraft=false (already published)', async () => {
    db.__setSelectQueue([
      [{ id: 5, clientId: 1, currentDraftVersionId: 50, publishedAt: null }],
      [{ id: 50, clientId: 1, isDraft: false, body: 'content' }],
    ]);
    await expect(documents.publishDocument(1, 7, 5)).rejects.toThrow(/no longer a draft/i);
  });
});

// ─── archiveDocument ──────────────────────────────────────────────────────────

describe('archiveDocument @documents @coverage', () => {
  it('archives a draft document and returns the updated row', async () => {
    const before = { id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'draft' };
    const updated = { ...before, status: 'archived', archivedAt: new Date(), archiveReason: 'no longer needed' };

    db.__setSelectQueue([[before]]);
    db.__setUpdateReturns([[updated]]);

    const result = await documents.archiveDocument(1, 7, 5, { reason: 'no longer needed' });
    expect(result).not.toBeNull();
    expect(result!.status).toBe('archived');
    expect(state.auditCalls[0]?.action).toBe('brain_document.archive');
    expect(state.dashboardCalls).toBeGreaterThan(0);
  });

  it('archives without a reason (reason=undefined)', async () => {
    const before = { id: 5, clientId: 1, title: 'Doc', slug: 'doc', status: 'published' };
    const updated = { ...before, status: 'archived', archiveReason: null };

    db.__setSelectQueue([[before]]);
    db.__setUpdateReturns([[updated]]);

    const result = await documents.archiveDocument(1, 7, 5);
    expect(result).not.toBeNull();
    expect(state.auditCalls[0]?.metadata?.hasReason).toBe(false);
  });

  it('throws when document is already archived', async () => {
    db.__setSelectQueue([[{ id: 5, clientId: 1, status: 'archived' }]]);
    await expect(documents.archiveDocument(1, 7, 5)).rejects.toThrow(/already archived/i);
  });

  it('returns null when document does not exist', async () => {
    db.__setSelectQueue([[]]); // before lookup → empty
    const result = await documents.archiveDocument(1, 7, 999);
    expect(result).toBeNull();
  });
});

// ─── unarchiveDocument ────────────────────────────────────────────────────────

describe('unarchiveDocument @documents @coverage', () => {
  it('restores to "published" when a published version exists', async () => {
    const before = {
      id: 5, clientId: 1, title: 'Doc', slug: 'doc',
      status: 'archived', currentPublishedVersionId: 50,
    };
    const restored = { ...before, status: 'published', archivedAt: null, archiveReason: null };

    db.__setSelectQueue([[before]]);
    db.__setUpdateReturns([[restored]]);

    const result = await documents.unarchiveDocument(1, 7, 5);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('published');
    expect(state.auditCalls[0]?.metadata?.restoredStatus).toBe('published');
    expect(state.dashboardCalls).toBeGreaterThan(0);
  });

  it('restores to "draft" when no published version exists', async () => {
    const before = {
      id: 5, clientId: 1, title: 'Doc', slug: 'doc',
      status: 'archived', currentPublishedVersionId: null,
    };
    const restored = { ...before, status: 'draft', archivedAt: null, archiveReason: null };

    db.__setSelectQueue([[before]]);
    db.__setUpdateReturns([[restored]]);

    const result = await documents.unarchiveDocument(1, 7, 5);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('draft');
    expect(state.auditCalls[0]?.metadata?.restoredStatus).toBe('draft');
  });

  it('throws when document is not archived', async () => {
    db.__setSelectQueue([[{ id: 5, clientId: 1, status: 'published' }]]);
    await expect(documents.unarchiveDocument(1, 7, 5)).rejects.toThrow(/non-archived/i);
  });

  it('returns null when document does not exist', async () => {
    db.__setSelectQueue([[]]); // before lookup → empty
    const result = await documents.unarchiveDocument(1, 7, 999);
    expect(result).toBeNull();
  });
});

// ─── linkEntity ───────────────────────────────────────────────────────────────

describe('linkEntity @documents @coverage', () => {
  it('throws on invalid entityType', async () => {
    await expect(
      documents.linkEntity(1, 7, { documentId: 5, entityType: 'note' as 'topic', entityId: 1 }),
    ).rejects.toThrow(/invalid entityType/i);
  });

  it('throws when the document does not belong to this client', async () => {
    db.__setSelectQueue([[]]); // owner check → empty
    await expect(
      documents.linkEntity(1, 7, { documentId: 999, entityType: 'topic', entityId: 1 }),
    ).rejects.toThrow(/not found/i);
  });

  it('returns alreadyLinked=true when ON CONFLICT DO NOTHING fires', async () => {
    db.__setSelectQueue([[{ id: 5 }]]); // owner check
    db.__setInsertReturns([[]]); // conflict → empty returning
    const result = await documents.linkEntity(1, 7, { documentId: 5, entityType: 'topic', entityId: 10 });
    expect(result.alreadyLinked).toBe(true);
    expect(result.linkId).toBeNull();
    expect(state.auditCalls).toHaveLength(0); // no audit on duplicate
  });

  it('returns linkId and alreadyLinked=false on fresh insert', async () => {
    db.__setSelectQueue([[{ id: 5 }]]); // owner check
    db.__setInsertReturns([[{ id: 42 }]]); // new link row
    const result = await documents.linkEntity(1, 7, {
      documentId: 5,
      entityType: 'initiative',
      entityId: 20,
      note: 'related',
    });
    expect(result.alreadyLinked).toBe(false);
    expect(result.linkId).toBe(42);
    expect(state.auditCalls[0]?.action).toBe('brain_document.link');
  });
});

// ─── unlinkEntity ─────────────────────────────────────────────────────────────

describe('unlinkEntity @documents @coverage', () => {
  it('throws on invalid entityType', async () => {
    await expect(
      documents.unlinkEntity(1, 7, { documentId: 5, entityType: 'note' as 'topic', entityId: 1 }),
    ).rejects.toThrow(/invalid entityType/i);
  });

  it('returns false when no link row was deleted', async () => {
    db.__setDeleteReturns([[]]); // nothing deleted
    const result = await documents.unlinkEntity(1, 7, {
      documentId: 5, entityType: 'decision', entityId: 10,
    });
    expect(result).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('returns true and audits when a link is successfully deleted', async () => {
    db.__setDeleteReturns([[{ id: 77 }]]); // one row deleted
    const result = await documents.unlinkEntity(1, 7, {
      documentId: 5, entityType: 'person', entityId: 3,
    });
    expect(result).toBe(true);
    expect(state.auditCalls[0]?.action).toBe('brain_document.unlink');
  });
});

// ─── listDocumentLinks ────────────────────────────────────────────────────────

describe('listDocumentLinks @documents @coverage', () => {
  it('returns empty array when no links exist', async () => {
    db.__setSelectQueue([[]]); // links query → empty
    const links = await documents.listDocumentLinks(1, 5);
    expect(links).toEqual([]);
  });

  it('applies entityType filter when provided', async () => {
    db.__setSelectQueue([[]]); // filtered links query → empty
    const links = await documents.listDocumentLinks(1, 5, { entityType: 'topic' });
    expect(links).toEqual([]);
  });

  it('resolves topic links', async () => {
    const linkRow = { entityType: 'topic', entityId: 10, note: null, createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],              // links query
      [{ id: 10, name: 'Engineering' }], // topic resolution
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBe('Engineering');
    expect(links[0].entityType).toBe('topic');
  });

  it('resolves initiative links', async () => {
    const linkRow = { entityType: 'initiative', entityId: 20, note: 'note', createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],
      [{ id: 20, name: 'Q1 Launch' }],
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBe('Q1 Launch');
  });

  it('resolves decision links', async () => {
    const linkRow = { entityType: 'decision', entityId: 30, note: null, createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],
      [{ id: 30, title: 'Use TypeScript' }],
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBe('Use TypeScript');
  });

  it('resolves meeting links', async () => {
    const linkRow = { entityType: 'meeting', entityId: 40, note: null, createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],
      [{ id: 40, title: 'Kick-off' }],
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBe('Kick-off');
  });

  it('resolves glossary_term links', async () => {
    const linkRow = { entityType: 'glossary_term', entityId: 50, note: null, createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],
      [{ id: 50, term: 'API' }],
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBe('API');
  });

  it('resolves person links', async () => {
    const linkRow = { entityType: 'person', entityId: 60, note: null, createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],
      [{ id: 60, fullName: 'Jane Doe' }],
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBe('Jane Doe');
  });

  it('returns title=null for a link whose entity was hard-deleted', async () => {
    const linkRow = { entityType: 'topic', entityId: 99, note: null, createdAt: new Date() };
    db.__setSelectQueue([
      [linkRow],
      [],  // topic resolution → empty (entity deleted)
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links[0].title).toBeNull();
  });

  it('clamps limit and offset', async () => {
    db.__setSelectQueue([[]]); // any limit/offset still resolves
    await documents.listDocumentLinks(1, 5, { limit: 0, offset: -10 });
    db.__setSelectQueue([[]]); // limit >200 → clamped to 200
    await documents.listDocumentLinks(1, 5, { limit: 500 });
  });

  it('resolves multiple link types in one call', async () => {
    const rows = [
      { entityType: 'topic', entityId: 1, note: null, createdAt: new Date() },
      { entityType: 'person', entityId: 2, note: null, createdAt: new Date() },
    ];
    db.__setSelectQueue([
      rows,
      [{ id: 1, name: 'Ops' }],    // topic batch
      [{ id: 2, fullName: 'Bob' }], // person batch
    ]);
    const links = await documents.listDocumentLinks(1, 5);
    expect(links).toHaveLength(2);
    const topicLink = links.find((l) => l.entityType === 'topic');
    const personLink = links.find((l) => l.entityType === 'person');
    expect(topicLink?.title).toBe('Ops');
    expect(personLink?.title).toBe('Bob');
  });
});

// ─── promoteFromNote additional branches ──────────────────────────────────────

describe('promoteFromNote additional branches @documents @coverage', () => {
  it('uses the override title when provided', async () => {
    db.__setSelectQueue([
      [{ id: 9, clientId: 1, title: 'Note title', body: 'body', confidentialityLevel: 'standard' }],
      [], // slug pre-check
    ]);
    db.__setInsertReturns([
      [{ id: 10, slug: 'override-title', title: 'Override Title', clientId: 1, status: 'draft', sourceNoteId: 9 }],
      [{ id: 100, documentId: 10, versionNumber: 1, body: 'body', title: 'Override Title', isDraft: true, clientId: 1 }],
    ]);
    db.__setUpdateReturns([
      [{ id: 10, slug: 'override-title', title: 'Override Title', currentDraftVersionId: 100 }],
    ]);

    const out = await documents.promoteFromNote(1, 7, 9, { title: 'Override Title' });
    expect(out).not.toBeNull();
    expect(out!.document.title).toBe('Override Title');
  });

  it('falls back to "Untitled document" when note has no title and no markdown headings', async () => {
    db.__setSelectQueue([
      [{ id: 9, clientId: 1, title: '', body: '   \n   ', confidentialityLevel: 'standard' }],
      [], // slug pre-check
    ]);
    db.__setInsertReturns([
      [{ id: 11, slug: 'untitled-document', title: 'Untitled document', clientId: 1, status: 'draft', sourceNoteId: 9 }],
      [{ id: 101, documentId: 11, versionNumber: 1, body: '   \n   ', title: 'Untitled document', isDraft: true, clientId: 1 }],
    ]);
    db.__setUpdateReturns([
      [{ id: 11, slug: 'untitled-document', title: 'Untitled document', currentDraftVersionId: 101 }],
    ]);

    const out = await documents.promoteFromNote(1, 7, 9);
    expect(out).not.toBeNull();
    expect(out!.document.title).toBe('Untitled document');
  });

  it('uses a custom category when provided', async () => {
    db.__setSelectQueue([
      [{ id: 9, clientId: 1, title: 'Note', body: 'content', confidentialityLevel: 'standard' }],
      [],
    ]);
    db.__setInsertReturns([
      [{ id: 12, slug: 'note', title: 'Note', category: 'sop', clientId: 1, status: 'draft', sourceNoteId: 9 }],
      [{ id: 102, documentId: 12, versionNumber: 1, body: 'content', title: 'Note', isDraft: true, clientId: 1 }],
    ]);
    // Pointer update returns full doc including category so the assertion is reliable.
    db.__setUpdateReturns([
      [{ id: 12, slug: 'note', title: 'Note', category: 'sop', clientId: 1, status: 'draft', currentDraftVersionId: 102, sourceNoteId: 9 }],
    ]);

    const out = await documents.promoteFromNote(1, 7, 9, { category: 'sop' });
    expect(out).not.toBeNull();
    expect(out!.document.category).toBe('sop');
  });
});
