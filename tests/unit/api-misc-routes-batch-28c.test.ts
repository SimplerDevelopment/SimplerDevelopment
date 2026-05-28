// @vitest-environment node
/**
 * Unit tests for four brain/knowledge API routes (batch 28c):
 *   - GET    /api/portal/brain/knowledge/[id]/backlinks
 *   - DELETE /api/portal/brain/knowledge/[id]/attachment
 *   - POST   /api/portal/brain/knowledge/from-template/[id]
 *   - POST   /api/portal/brain/knowledge/upload
 *
 * Everything external (entitlement, db, notes lib, templates lib, applyTemplate
 * helper, S3 uploader) is mocked. No DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Schema + drizzle mocks (must be defined before any route imports below).
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    brainNotes: wrap('brainNotes'),
    brainKbLinks: wrap('brainKbLinks'),
    users: wrap('users'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
}));

// ---------------------------------------------------------------------------
// External lib mocks
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const clearAttachmentMock = vi.fn();
const createNoteMock = vi.fn();
vi.mock('@/lib/brain/notes', () => ({
  clearAttachment: (...args: unknown[]) => clearAttachmentMock(...args),
  createNote: (...args: unknown[]) => createNoteMock(...args),
}));

const getTemplateMock = vi.fn();
vi.mock('@/lib/brain/templates', () => ({
  getTemplate: (...args: unknown[]) => getTemplateMock(...args),
}));

const applyTemplateMock = vi.fn();
vi.mock('@/lib/brain/template', () => ({
  applyTemplate: (...args: unknown[]) => applyTemplateMock(...args),
}));

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

// ---------------------------------------------------------------------------
// DB select mock — queued results consumed in FIFO order.
// All select queries in these routes terminate by awaiting the chain
// (after `.limit(n)` / `.orderBy(...)` / `.where(...)`), so we expose a
// thenable terminal chain that pops the next queued array.
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function buildSelectChain() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(selectQueue.shift() ?? []);
      }
      return materializedPromise;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'rightJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    const term: Record<string, unknown> = {
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return materialize().then(onF, onR);
      },
      limit() { return term; },
      offset() { return term; },
      orderBy() { return term; },
    };
    chain.limit = () => term;
    chain.offset = () => term;
    chain.orderBy = () => term;
    return chain;
  }
  return {
    db: {
      select() {
        return buildSelectChain();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const backlinksRoute = await import(
  '@/app/api/portal/brain/knowledge/[id]/backlinks/route'
);
const BACKLINKS_GET = backlinksRoute.GET;

const attachmentRoute = await import(
  '@/app/api/portal/brain/knowledge/[id]/attachment/route'
);
const ATTACHMENT_DELETE = attachmentRoute.DELETE;

const fromTemplateRoute = await import(
  '@/app/api/portal/brain/knowledge/from-template/[id]/route'
);
const FROM_TEMPLATE_POST = fromTemplateRoute.POST;

const uploadRoute = await import(
  '@/app/api/portal/brain/knowledge/upload/route'
);
const UPLOAD_POST = uploadRoute.POST;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function idParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function entitlementOk(): Record<string, unknown> {
  return { userId: 7, client: { id: 10 } };
}

function deniedResponse(status = 402): Record<string, unknown> {
  return {
    response: new Response(
      JSON.stringify({ success: false, message: 'denied' }),
      { status },
    ),
  };
}

beforeEach(() => {
  selectQueue = [];
  requireBrainEntitlementMock.mockReset();
  clearAttachmentMock.mockReset();
  createNoteMock.mockReset();
  getTemplateMock.mockReset();
  applyTemplateMock.mockReset();
  uploadToS3Mock.mockReset();
});

// ===========================================================================
// GET /api/portal/brain/knowledge/[id]/backlinks
// ===========================================================================

describe('GET /api/portal/brain/knowledge/[id]/backlinks', () => {
  function makeReq(): Request {
    return new Request('http://x/api/portal/brain/knowledge/5/backlinks', { method: 'GET' });
  }

  it('short-circuits with entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(deniedResponse(402));
    const res = await BACKLINKS_GET(makeReq(), idParams('5'));
    expect(res.status).toBe(402);
  });

  it('returns 400 when id is not a number', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const res = await BACKLINKS_GET(makeReq(), idParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid note id/i);
  });

  it('returns 404 when target note does not belong to client', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    // first select (target lookup) returns []
    selectQueue.push([]);
    const res = await BACKLINKS_GET(makeReq(), idParams('5'));
    expect(res.status).toBe(404);
  });

  it('returns deduped backlink items with snippet centered on anchor', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const updated = new Date('2026-01-15T00:00:00Z');
    // 1) target lookup
    selectQueue.push([{ id: 5 }]);
    // 2) backlink rows — two rows from same source note (id=11), one from 12
    const longBody = 'A'.repeat(120) + ' look at the FooBar reference here ' + 'B'.repeat(120);
    selectQueue.push([
      {
        id: 11,
        title: 'Eleven',
        body: longBody,
        updatedAt: updated,
        linkId: 100,
        displayText: 'FooBar',
        rawTarget: 'foobar',
      },
      // duplicate same source id — should be dropped
      {
        id: 11,
        title: 'Eleven',
        body: longBody,
        updatedAt: updated,
        linkId: 101,
        displayText: 'IgnoredSecond',
        rawTarget: 'ignored',
      },
      // a source with body but anchor not present — falls back to head
      {
        id: 12,
        title: 'Twelve',
        body: 'short content',
        updatedAt: updated,
        linkId: 102,
        displayText: null,
        rawTarget: null,
      },
    ]);
    const res = await BACKLINKS_GET(makeReq(), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    const first = body.data.items[0];
    expect(first.id).toBe(11);
    expect(first.snippet).toContain('FooBar');
    // anchor near start of slice means leading ellipsis
    expect(first.snippet.startsWith('…')).toBe(true);
    expect(first.displayText).toBe('FooBar');
    const second = body.data.items[1];
    expect(second.id).toBe(12);
    expect(second.snippet).toBe('short content');
  });

  it('truncates head fallback snippet to 220 chars with trailing ellipsis when no anchor match', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    selectQueue.push([{ id: 5 }]);
    const huge = 'x'.repeat(500);
    selectQueue.push([
      {
        id: 20,
        title: 'Big',
        body: huge,
        updatedAt: new Date(),
        linkId: 1,
        displayText: 'nope-not-in-body',
        rawTarget: 'nope-not-in-body',
      },
    ]);
    const res = await BACKLINKS_GET(makeReq(), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].snippet.endsWith('…')).toBe(true);
    expect(body.data.items[0].snippet.length).toBeLessThanOrEqual(221);
  });

  it('returns empty snippet when body is blank', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    selectQueue.push([{ id: 5 }]);
    selectQueue.push([
      {
        id: 30,
        title: 'Empty',
        body: '   ',
        updatedAt: new Date(),
        linkId: 1,
        displayText: 'x',
        rawTarget: 'x',
      },
    ]);
    const res = await BACKLINKS_GET(makeReq(), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].snippet).toBe('');
  });

  it('returns empty items array when no backlinks exist', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    selectQueue.push([{ id: 5 }]);
    selectQueue.push([]);
    const res = await BACKLINKS_GET(makeReq(), idParams('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
  });
});

// ===========================================================================
// DELETE /api/portal/brain/knowledge/[id]/attachment
// ===========================================================================

describe('DELETE /api/portal/brain/knowledge/[id]/attachment', () => {
  function makeReq(): Request {
    return new Request('http://x/api/portal/brain/knowledge/9/attachment', { method: 'DELETE' });
  }

  it('short-circuits with entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(deniedResponse(401));
    const res = await ATTACHMENT_DELETE(makeReq(), idParams('9'));
    expect(res.status).toBe(401);
    expect(clearAttachmentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is not a number', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const res = await ATTACHMENT_DELETE(makeReq(), idParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid note id/i);
    expect(clearAttachmentMock).not.toHaveBeenCalled();
  });

  it('returns 404 when clearAttachment returns false', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    clearAttachmentMock.mockResolvedValueOnce(false);
    const res = await ATTACHMENT_DELETE(makeReq(), idParams('9'));
    expect(res.status).toBe(404);
    expect(clearAttachmentMock).toHaveBeenCalledWith(10, 9, 7);
  });

  it('returns 200 success when clearAttachment returns true', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    clearAttachmentMock.mockResolvedValueOnce(true);
    const res = await ATTACHMENT_DELETE(makeReq(), idParams('9'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// POST /api/portal/brain/knowledge/from-template/[id]
// ===========================================================================

describe('POST /api/portal/brain/knowledge/from-template/[id]', () => {
  function makeReq(body: unknown = {}): Request {
    return new Request('http://x/api/portal/brain/knowledge/from-template/42', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('short-circuits with entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(deniedResponse(402));
    const res = await FROM_TEMPLATE_POST(makeReq(), idParams('42'));
    expect(res.status).toBe(402);
  });

  it('returns 400 when template id is not a number', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const res = await FROM_TEMPLATE_POST(makeReq(), idParams('xyz'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid template id/i);
  });

  it('returns 404 when template is not found', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    getTemplateMock.mockResolvedValueOnce(null);
    const res = await FROM_TEMPLATE_POST(makeReq(), idParams('42'));
    expect(res.status).toBe(404);
  });

  it('creates note from template with default name + dedupes from_template tag', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    getTemplateMock.mockResolvedValueOnce({
      id: 42,
      name: 'Daily Standup',
      body: 'Hello {{userName}}',
      defaultTags: ['standup', 'from_template:42'],
    });
    // users lookup returns Dan
    selectQueue.push([{ name: 'Dan Coyle', email: 'dan@example.com' }]);
    applyTemplateMock.mockResolvedValueOnce('Hello Dan Coyle');
    createNoteMock.mockResolvedValueOnce({ id: 555, title: 'Daily Standup' });

    const res = await FROM_TEMPLATE_POST(makeReq(), idParams('42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(555);

    // applyTemplate received template body + ctx with userName
    const applyArgs = applyTemplateMock.mock.calls[0];
    expect(applyArgs[0]).toBe('Hello {{userName}}');
    expect(applyArgs[1].userName).toBe('Dan Coyle');
    expect(applyArgs[1].clientId).toBe(10);
    expect(applyArgs[1].today).toBeInstanceOf(Date);

    // createNote received deduped tags including from_template:42 (once)
    const createArgs = createNoteMock.mock.calls[0][0];
    expect(createArgs.title).toBe('Daily Standup');
    expect(createArgs.body).toBe('Hello Dan Coyle');
    expect(createArgs.source).toBe('manual');
    expect(createArgs.createdBy).toBe(7);
    expect(createArgs.clientId).toBe(10);
    const fromTemplateOccurrences = createArgs.tags.filter(
      (t: string) => t === 'from_template:42',
    ).length;
    expect(fromTemplateOccurrences).toBe(1);
    expect(createArgs.tags).toContain('standup');
  });

  it('uses titleOverride when provided and trimmed', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    getTemplateMock.mockResolvedValueOnce({
      id: 42,
      name: 'Daily Standup',
      body: 'body',
      defaultTags: null,
    });
    selectQueue.push([{ name: 'Dan', email: 'dan@x.com' }]);
    applyTemplateMock.mockResolvedValueOnce('body-applied');
    createNoteMock.mockResolvedValueOnce({ id: 600, title: 'Custom Title' });

    const res = await FROM_TEMPLATE_POST(
      makeReq({ titleOverride: '  Custom Title  ' }),
      idParams('42'),
    );
    expect(res.status).toBe(200);
    const createArgs = createNoteMock.mock.calls[0][0];
    expect(createArgs.title).toBe('Custom Title');
    // defaultTags null is tolerated — tags array only contains the
    // from_template marker.
    expect(createArgs.tags).toEqual(['from_template:42']);
  });

  it('falls back to actor email when actor name is empty', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    getTemplateMock.mockResolvedValueOnce({
      id: 42,
      name: 'T',
      body: 'b',
      defaultTags: [],
    });
    selectQueue.push([{ name: '   ', email: 'fallback@x.com' }]);
    applyTemplateMock.mockResolvedValueOnce('b');
    createNoteMock.mockResolvedValueOnce({ id: 1 });

    const res = await FROM_TEMPLATE_POST(makeReq(), idParams('42'));
    expect(res.status).toBe(200);
    expect(applyTemplateMock.mock.calls[0][1].userName).toBe('fallback@x.com');
  });

  it('uses null userName when no actor row is returned', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    getTemplateMock.mockResolvedValueOnce({
      id: 42,
      name: 'T',
      body: 'b',
      defaultTags: [],
    });
    selectQueue.push([]); // no users row
    applyTemplateMock.mockResolvedValueOnce('b');
    createNoteMock.mockResolvedValueOnce({ id: 1 });

    const res = await FROM_TEMPLATE_POST(makeReq(), idParams('42'));
    expect(res.status).toBe(200);
    expect(applyTemplateMock.mock.calls[0][1].userName).toBeNull();
  });

  it('tolerates malformed JSON body and falls back to template name', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    getTemplateMock.mockResolvedValueOnce({
      id: 42,
      name: 'Template Name',
      body: 'b',
      defaultTags: [],
    });
    selectQueue.push([{ name: 'Dan', email: 'd@x.com' }]);
    applyTemplateMock.mockResolvedValueOnce('b');
    createNoteMock.mockResolvedValueOnce({ id: 1 });

    const badReq = new Request('http://x/api/portal/brain/knowledge/from-template/42', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{',
    });
    const res = await FROM_TEMPLATE_POST(badReq, idParams('42'));
    expect(res.status).toBe(200);
    expect(createNoteMock.mock.calls[0][0].title).toBe('Template Name');
  });
});

// ===========================================================================
// POST /api/portal/brain/knowledge/upload
// ===========================================================================

describe('POST /api/portal/brain/knowledge/upload', () => {
  function makeReq(form: FormData): Request {
    return new Request('http://x/api/portal/brain/knowledge/upload', {
      method: 'POST',
      body: form,
    });
  }

  function makeFile(name = 'doc.pdf', size = 16, type = 'application/pdf'): File {
    const data = new Uint8Array(size).fill(65);
    return new File([data], name, { type });
  }

  it('short-circuits with entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(deniedResponse(402));
    const form = new FormData();
    form.set('file', makeFile());
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(402);
  });

  it('returns 400 when request body is not multipart/form-data', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const badReq = new Request('http://x/api/portal/brain/knowledge/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await UPLOAD_POST(badReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/multipart/i);
  });

  it('returns 400 when no file field provided', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const form = new FormData();
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No file provided/);
  });

  it('returns 400 when file is empty (size 0)', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    const form = new FormData();
    form.set('file', new File([], 'empty.pdf', { type: 'application/pdf' }));
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/File is empty/);
  });

  it('returns 400 when file exceeds size limit', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    // MAX_FILE_SIZE is captured at module-import time, so we need a file
    // that exceeds the default 10MB. Allocate exactly one byte over the limit.
    const tooBig = new Uint8Array(10 * 1024 * 1024 + 1);
    const form = new FormData();
    form.set('file', new File([tooBig], 'big.pdf', { type: 'application/pdf' }));
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/exceeds.*MB limit/);
  });

  it('returns 500 when uploadToS3 throws an Error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockRejectedValueOnce(new Error('S3 down'));
    const form = new FormData();
    form.set('file', makeFile());
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Upload failed: S3 down');
  });

  it('returns 500 with generic message when uploadToS3 throws non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockRejectedValueOnce('weird');
    const form = new FormData();
    form.set('file', makeFile());
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Upload failed');
  });

  it('uses filename as title and defaults body+tags+confidentiality when not provided', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'https://s3/u/doc.pdf',
      storedFilename: 'stored-abc.pdf',
      mimeType: 'application/pdf',
      fileSize: 16,
    });
    createNoteMock.mockResolvedValueOnce({ id: 700 });
    const form = new FormData();
    form.set('file', makeFile('myFile.pdf'));
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    const args = createNoteMock.mock.calls[0][0];
    expect(args.title).toBe('myFile.pdf');
    expect(args.body).toBe('');
    expect(args.tags).toEqual([]);
    expect(args.confidentialityLevel).toBe('standard');
    expect(args.pinned).toBe(false);
    expect(args.source).toBe('document_import');
    expect(args.attachmentUrl).toBe('https://s3/u/doc.pdf');
    expect(args.attachmentFilename).toBe('myFile.pdf');
    expect(args.attachmentMimeType).toBe('application/pdf');
    expect(args.attachmentStoredKey).toBe('stored-abc.pdf');
    expect(args.attachmentFileSize).toBe(16);
    expect(args.createdBy).toBe(7);
    expect(args.clientId).toBe(10);
    // optional ids default null
    expect(args.relationshipOverlayId).toBeNull();
    expect(args.meetingId).toBeNull();
    expect(args.companyId).toBeNull();
    expect(args.dealId).toBeNull();
    expect(args.contactId).toBeNull();
  });

  it('parses provided JSON tags array', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'u', storedFilename: 's', mimeType: 'application/pdf', fileSize: 16,
    });
    createNoteMock.mockResolvedValueOnce({ id: 1 });
    const form = new FormData();
    form.set('file', makeFile());
    form.set('title', '  Hello  ');
    form.set('tags', JSON.stringify(['a', 'b', 42, 'c']));
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(201);
    const args = createNoteMock.mock.calls[0][0];
    expect(args.title).toBe('Hello');
    expect(args.tags).toEqual(['a', 'b', 'c']);
  });

  it('falls back to comma-separated tags when JSON parse fails', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'u', storedFilename: 's', mimeType: 'application/pdf', fileSize: 16,
    });
    createNoteMock.mockResolvedValueOnce({ id: 1 });
    const form = new FormData();
    form.set('file', makeFile());
    form.set('tags', 'one, two ,three');
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(201);
    const args = createNoteMock.mock.calls[0][0];
    expect(args.tags).toEqual(['one', 'two', 'three']);
  });

  it('honors confidentialityLevel/pinned/ids fields and links to relationship/meeting/company/deal/contact', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'u', storedFilename: 's', mimeType: 'image/png', fileSize: 100,
    });
    createNoteMock.mockResolvedValueOnce({ id: 1 });
    const form = new FormData();
    form.set('file', makeFile('img.png', 32, 'image/png'));
    form.set('body', 'note body');
    form.set('confidentialityLevel', 'confidential');
    form.set('pinned', 'true');
    form.set('relationshipOverlayId', '111');
    form.set('meetingId', '222');
    form.set('companyId', '333');
    form.set('dealId', '444');
    form.set('contactId', '555');
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(201);
    const args = createNoteMock.mock.calls[0][0];
    expect(args.body).toBe('note body');
    expect(args.confidentialityLevel).toBe('confidential');
    expect(args.pinned).toBe(true);
    expect(args.relationshipOverlayId).toBe(111);
    expect(args.meetingId).toBe(222);
    expect(args.companyId).toBe(333);
    expect(args.dealId).toBe(444);
    expect(args.contactId).toBe(555);
  });

  it('coerces invalid confidentialityLevel back to standard', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'u', storedFilename: 's', mimeType: 'application/pdf', fileSize: 16,
    });
    createNoteMock.mockResolvedValueOnce({ id: 1 });
    const form = new FormData();
    form.set('file', makeFile());
    form.set('confidentialityLevel', 'top-secret');
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(201);
    const args = createNoteMock.mock.calls[0][0];
    expect(args.confidentialityLevel).toBe('standard');
  });

  it('falls back to application/octet-stream when file.type is empty', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce(entitlementOk());
    uploadToS3Mock.mockResolvedValueOnce({
      url: 'u', storedFilename: 's', mimeType: 'application/octet-stream', fileSize: 16,
    });
    createNoteMock.mockResolvedValueOnce({ id: 1 });
    const form = new FormData();
    form.set('file', makeFile('no-type.bin', 16, ''));
    const res = await UPLOAD_POST(makeReq(form));
    expect(res.status).toBe(201);
    expect(uploadToS3Mock.mock.calls[0][2]).toBe('application/octet-stream');
  });
});
