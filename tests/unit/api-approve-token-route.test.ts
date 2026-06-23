// @vitest-environment node
/**
 * Unit tests for app/api/approve/[token]/route.ts (GET / POST).
 *
 * Strategy:
 *  - lookupApprovalLink and recordReview are mocked from @/lib/mcp/approval-links.
 *  - applyPendingChange mocked from @/lib/mcp/approvals.
 *  - applyPublishAllToSlides mocked from @/lib/decks/publish-slide.
 *  - revalidatePath mocked from next/cache.
 *  - @/lib/db is mocked with a chainable select/update/delete/insert builder.
 *  - All schema tables are proxied as inert column markers.
 *  - drizzle-orm helpers (eq, and) are stubbed to plain marker objects.
 *
 * Coverage: GET 200, GET 404; POST 404, POST already-approved/rejected (400),
 * POST bad action (400), POST missing reviewerName (400),
 * POST approve happy path (200), POST reject happy path (200),
 * POST approve side-effect failure (500), POST each entity type.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── drizzle-orm stub ──────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

// ── schema stub ───────────────────────────────────────────────────────────────
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
  return new Proxy(
    {
      posts: wrap('posts'),
      pitchDecks: wrap('pitchDecks'),
      emailCampaigns: wrap('emailCampaigns'),
      blockTemplates: wrap('blockTemplates'),
      mcpPendingChanges: wrap('mcpPendingChanges'),
      surveys: wrap('surveys'),
      bookingPages: wrap('bookingPages'),
      mcpApprovalLinks: wrap('mcpApprovalLinks'),
    },
    {
      get(t, p: string) {
        return p in t ? t[p as keyof typeof t] : wrap(p);
      },
    },
  );
});

// ── db mock ───────────────────────────────────────────────────────────────────
let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];
let deleteCalls: Array<{ table: string }> = [];
let nextSelectThrows: Error | null = null;
let nextUpdateThrows: Error | null = null;

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let settled: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!settled) {
        if (nextSelectThrows) {
          const e = nextSelectThrows;
          nextSelectThrows = null;
          settled = Promise.reject(e);
        } else {
          settled = Promise.resolve(selectQueue.shift() ?? []);
        }
      }
      return settled;
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'leftJoin', 'innerJoin', 'orderBy', 'groupBy']) {
      chain[m] = () => chain;
    }
    chain.limit = () => ({
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return materialize().then(onF, onR);
      },
    });
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(_filter: unknown) {
            if (nextUpdateThrows) {
              const e = nextUpdateThrows;
              nextUpdateThrows = null;
              return Promise.reject(e);
            }
            updateCalls.push({ table: table.__table, patch });
            return Promise.resolve(undefined);
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(_filter: unknown) {
        deleteCalls.push({ table: table.__table });
        return Promise.resolve(undefined);
      },
    };
  }

  function buildInsert(_table: { __table: string }) {
    return {
      values(_vals: unknown) {
        return {
          returning(_cols: unknown) {
            return Promise.resolve([]);
          },
        };
      },
    };
  }

  return {
    db: {
      select: () => buildSelect(),
      update: (t: { __table: string }) => buildUpdate(t),
      delete: (t: { __table: string }) => buildDelete(t),
      insert: (t: { __table: string }) => buildInsert(t),
    },
  };
});

// ── approval-links mock ───────────────────────────────────────────────────────
const mockLookupApprovalLink = vi.fn();
const mockRecordReview = vi.fn();

vi.mock('@/lib/mcp/approval-links', () => ({
  lookupApprovalLink: (...args: unknown[]) => mockLookupApprovalLink(...args),
  recordReview: (...args: unknown[]) => mockRecordReview(...args),
}));

// ── approvals mock ────────────────────────────────────────────────────────────
const mockApplyPendingChange = vi.fn();

vi.mock('@/lib/mcp/approvals', () => ({
  applyPendingChange: (...args: unknown[]) => mockApplyPendingChange(...args),
}));

// ── decks/publish-slide mock ───────────────────────────────────────────────────
const mockApplyPublishAllToSlides = vi.fn();

vi.mock('@/lib/decks/publish-slide', () => ({
  applyPublishAllToSlides: (...args: unknown[]) => mockApplyPublishAllToSlides(...args),
}));

// ── next/cache mock ───────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ── module under test (after all vi.mock calls) ───────────────────────────────
const { GET, POST } = await import('@/app/api/approve/[token]/route');

// ── shared helpers ────────────────────────────────────────────────────────────
const VALID_TOKEN = 'a'.repeat(64);

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/approve/${VALID_TOKEN}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePendingLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    token: VALID_TOKEN,
    clientId: 10,
    linkType: 'entity',
    entityType: 'post',
    entityId: 42,
    pendingChangeId: null,
    status: 'pending',
    summary: 'Approve my post',
    createdBy: 5,
    keyId: null,
    reviewerName: null,
    reviewerEmail: null,
    reviewNote: null,
    reviewedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeUpdatedLink(link: Record<string, unknown>, decision: string) {
  return { ...link, status: decision, reviewerName: 'Jane Doe', reviewedAt: new Date() };
}

beforeEach(() => {
  selectQueue = [];
  updateCalls = [];
  deleteCalls = [];
  nextSelectThrows = null;
  nextUpdateThrows = null;
  vi.clearAllMocks();
  mockApplyPublishAllToSlides.mockReturnValue([]);
});

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/approve/[token]', () => {
  it('returns 404 when lookupApprovalLink returns null', async () => {
    mockLookupApprovalLink.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, message: 'Approval link not found' });
  });

  it('returns 200 with serialized link data when found', async () => {
    const link = makePendingLink();
    mockLookupApprovalLink.mockResolvedValue(link);
    const res = await GET(new NextRequest('http://localhost'), makeParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      token: VALID_TOKEN,
      status: 'pending',
      entityType: 'post',
      entityId: 42,
    });
  });

  it('serialized data includes only the defined fields (no internal ids)', async () => {
    const link = makePendingLink({ entityType: 'pitch_deck', entityId: 99 });
    mockLookupApprovalLink.mockResolvedValue(link);
    const res = await GET(new NextRequest('http://localhost'), makeParams(VALID_TOKEN));
    const body = await res.json();
    // Internal fields not in serializeLink should be absent
    expect(body.data.clientId).toBeUndefined();
    expect(body.data.createdBy).toBeUndefined();
    expect(body.data.keyId).toBeUndefined();
    // serializeLink fields should be present
    expect(body.data.linkType).toBe('entity');
    expect(body.data.summary).toBe('Approve my post');
  });

  it('passes the token to lookupApprovalLink', async () => {
    mockLookupApprovalLink.mockResolvedValue(null);
    await GET(new NextRequest('http://localhost'), makeParams(VALID_TOKEN));
    expect(mockLookupApprovalLink).toHaveBeenCalledWith(VALID_TOKEN);
  });
});

// ── POST — validation ─────────────────────────────────────────────────────────

describe('POST /api/approve/[token] — validation', () => {
  it('returns 404 when link is not found', async () => {
    mockLookupApprovalLink.mockResolvedValue(null);
    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, message: 'Approval link not found' });
  });

  it('returns 400 when link is already approved', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink({ status: 'approved' }));
    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('approved');
  });

  it('returns 400 when link is already rejected', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink({ status: 'rejected' }));
    const res = await POST(
      makePostRequest({ action: 'reject', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('rejected');
  });

  it('returns 400 when action is missing', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink());
    const res = await POST(
      makePostRequest({ reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('action');
  });

  it('returns 400 when action is an invalid value', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink());
    const res = await POST(
      makePostRequest({ action: 'maybe', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('action');
  });

  it('returns 400 when reviewerName is missing', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink());
    const res = await POST(
      makePostRequest({ action: 'approve' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('reviewerName');
  });

  it('returns 400 when reviewerName is blank whitespace', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink());
    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: '   ' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('reviewerName');
  });

  it('handles a non-JSON request body gracefully (treats as empty object)', async () => {
    mockLookupApprovalLink.mockResolvedValue(makePendingLink());
    const req = new NextRequest(`http://localhost/api/approve/${VALID_TOKEN}`, {
      method: 'POST',
      body: 'not-json',
    });
    const res = await POST(req, makeParams(VALID_TOKEN));
    // Fails on action validation since action=undefined
    expect(res.status).toBe(400);
  });
});

// ── POST — approve happy path ─────────────────────────────────────────────────

describe('POST /api/approve/[token] — approve happy path (post entity)', () => {
  it('returns 200 and calls recordReview with decision=approved', async () => {
    const link = makePendingLink({ entityType: 'post', entityId: 42 });
    const updatedLink = makeUpdatedLink(link, 'approved');
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(updatedLink);
    // DB select returns the post row
    selectQueue.push([{ id: 42 }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane Doe', reviewerEmail: 'jane@example.com' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ status: 'approved' });
    expect(mockRecordReview).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approved', reviewerName: 'Jane Doe' }),
    );
  });

  it('updates the post row with published=true and publishedAt', async () => {
    const link = makePendingLink({ entityType: 'post', entityId: 42 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 42 }]);

    await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const postUpdate = updateCalls.find((c) => c.table === 'posts');
    expect(postUpdate?.patch).toMatchObject({ published: true });
    expect(postUpdate?.patch.publishedAt).toBeInstanceOf(Date);
  });
});

// ── POST — reject happy path ──────────────────────────────────────────────────

describe('POST /api/approve/[token] — reject', () => {
  it('returns 200 without running side-effects when action=reject', async () => {
    const link = makePendingLink({ entityType: 'post', entityId: 42 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'rejected'));

    const res = await POST(
      makePostRequest({ action: 'reject', reviewerName: 'Jane', reviewNote: 'Not ready' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // No DB select calls for the entity on reject
    expect(selectQueue.length).toBe(0);
    expect(updateCalls.length).toBe(0);
    expect(mockRecordReview).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'rejected', reviewNote: 'Not ready' }),
    );
  });
});

// ── POST — side-effect failures (500) ────────────────────────────────────────

describe('POST /api/approve/[token] — 500 on side-effect failure', () => {
  it('returns 500 when the post entity is not found in DB', async () => {
    const link = makePendingLink({ entityType: 'post', entityId: 42 });
    mockLookupApprovalLink.mockResolvedValue(link);
    // select returns empty → post not found
    selectQueue.push([]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Post not found/);
  });

  it('returns 500 when the email_campaign entity is not found', async () => {
    const link = makePendingLink({ entityType: 'email_campaign', entityId: 77 });
    mockLookupApprovalLink.mockResolvedValue(link);
    selectQueue.push([]); // campaign not found

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Campaign not found/);
  });

  it('returns 500 when entity link has no entityId', async () => {
    const link = makePendingLink({ entityType: 'post', entityId: null, linkType: 'entity' });
    mockLookupApprovalLink.mockResolvedValue(link);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/no entityId/);
  });

  it('returns 500 with error message on unknown entityType', async () => {
    const link = makePendingLink({ entityType: 'widget', entityId: 1, linkType: 'entity' });
    mockLookupApprovalLink.mockResolvedValue(link);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/widget/);
  });
});

// ── POST — pitch_deck entity type ─────────────────────────────────────────────

describe('POST /api/approve/[token] — pitch_deck entity', () => {
  it('approves a pitch deck: calls applyPublishAllToSlides and updates status=published', async () => {
    const link = makePendingLink({ entityType: 'pitch_deck', entityId: 55, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    mockApplyPublishAllToSlides.mockReturnValue([{ id: 1, live: {} }]);
    // DB select returns deck row
    selectQueue.push([{ id: 55, clientId: 10, slides: [] }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    expect(mockApplyPublishAllToSlides).toHaveBeenCalledWith([]);
    const deckUpdate = updateCalls.find((c) => c.table === 'pitchDecks');
    expect(deckUpdate?.patch).toMatchObject({ status: 'published', formatVersion: 2 });
  });

  it('returns 500 when deck is not found', async () => {
    const link = makePendingLink({ entityType: 'pitch_deck', entityId: 99, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    selectQueue.push([]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Deck not found/);
  });
});

// ── POST — survey entity type ─────────────────────────────────────────────────

describe('POST /api/approve/[token] — survey entity', () => {
  it('approves a draft survey: sets status=active', async () => {
    const link = makePendingLink({ entityType: 'survey', entityId: 11, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 11, status: 'draft' }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const surveyUpdate = updateCalls.find((c) => c.table === 'surveys');
    expect(surveyUpdate?.patch).toMatchObject({ status: 'active' });
  });

  it('skips status update when survey is already active', async () => {
    const link = makePendingLink({ entityType: 'survey', entityId: 11, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 11, status: 'active' }]);

    await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    const surveyUpdate = updateCalls.find((c) => c.table === 'surveys');
    expect(surveyUpdate).toBeUndefined();
  });

  it('returns 500 when survey is not found', async () => {
    const link = makePendingLink({ entityType: 'survey', entityId: 11, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    selectQueue.push([]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
  });
});

// ── POST — booking_page entity type ──────────────────────────────────────────

describe('POST /api/approve/[token] — booking_page entity', () => {
  it('approves an inactive booking page: sets active=true', async () => {
    const link = makePendingLink({ entityType: 'booking_page', entityId: 22, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 22, active: false }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const update = updateCalls.find((c) => c.table === 'bookingPages');
    expect(update?.patch).toMatchObject({ active: true });
  });

  it('skips update when booking page is already active', async () => {
    const link = makePendingLink({ entityType: 'booking_page', entityId: 22, clientId: 10 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 22, active: true }]);

    await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    const update = updateCalls.find((c) => c.table === 'bookingPages');
    expect(update).toBeUndefined();
  });
});

// ── POST — block_template entity type ────────────────────────────────────────

describe('POST /api/approve/[token] — block_template entity', () => {
  it('deletes template when draft has pendingDelete=true', async () => {
    const link = makePendingLink({ entityType: 'block_template', entityId: 7 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 7, draft: { pendingDelete: true }, version: 1 }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls.find((c) => c.table === 'blockTemplates')).toBeDefined();
  });

  it('applies draft fields as a no-op when draft is null', async () => {
    const link = makePendingLink({ entityType: 'block_template', entityId: 7 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{ id: 7, draft: null, version: 1 }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    // no-op affirmation: no update, no delete
    expect(res.status).toBe(200);
    expect(updateCalls.find((c) => c.table === 'blockTemplates')).toBeUndefined();
    expect(deleteCalls.find((c) => c.table === 'blockTemplates')).toBeUndefined();
  });

  it('promotes draft fields to live row when draft is populated', async () => {
    const link = makePendingLink({ entityType: 'block_template', entityId: 7 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    selectQueue.push([{
      id: 7,
      version: 3,
      draft: { name: 'New Name', blocks: [{ type: 'heading' }] },
    }]);

    await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    const update = updateCalls.find((c) => c.table === 'blockTemplates');
    expect(update?.patch).toMatchObject({
      name: 'New Name',
      blocks: [{ type: 'heading' }],
      draft: null,
      version: 4,
    });
  });

  it('returns 500 when block_template is not found', async () => {
    const link = makePendingLink({ entityType: 'block_template', entityId: 7 });
    mockLookupApprovalLink.mockResolvedValue(link);
    selectQueue.push([]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Template not found/);
  });
});

// ── POST — pending_change link type ──────────────────────────────────────────

describe('POST /api/approve/[token] — pending_change linkType', () => {
  it('calls applyPendingChange and updates mcpPendingChanges status', async () => {
    const link = makePendingLink({
      linkType: 'pending_change',
      pendingChangeId: 33,
      entityType: 'post',
      entityId: null,
    });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(makeUpdatedLink(link, 'approved'));
    mockApplyPendingChange.mockResolvedValue(undefined);
    // select returns the pending change row
    selectQueue.push([{ id: 33, clientId: 10, status: 'pending' }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    expect(mockApplyPendingChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 33, status: 'pending' }),
      10,
      5, // createdBy
    );
    const changeUpdate = updateCalls.find((c) => c.table === 'mcpPendingChanges');
    expect(changeUpdate?.patch).toMatchObject({ status: 'approved' });
  });

  it('returns 500 when pending_change link has no pendingChangeId', async () => {
    const link = makePendingLink({
      linkType: 'pending_change',
      pendingChangeId: null,
      entityId: null,
    });
    mockLookupApprovalLink.mockResolvedValue(link);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/no pendingChangeId/);
  });

  it('returns 500 when the pending change row is not found', async () => {
    const link = makePendingLink({
      linkType: 'pending_change',
      pendingChangeId: 33,
      entityId: null,
    });
    mockLookupApprovalLink.mockResolvedValue(link);
    selectQueue.push([]); // no change found

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/Pending change not found/);
  });

  it('returns 500 when the pending change is not in pending status', async () => {
    const link = makePendingLink({
      linkType: 'pending_change',
      pendingChangeId: 33,
      entityId: null,
    });
    mockLookupApprovalLink.mockResolvedValue(link);
    selectQueue.push([{ id: 33, clientId: 10, status: 'approved' }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/approved/);
  });
});

// ── POST — recordReview returns null ──────────────────────────────────────────

describe('POST /api/approve/[token] — recordReview returns null', () => {
  it('returns 200 with data=null when recordReview returns null', async () => {
    const link = makePendingLink({ entityType: 'post', entityId: 42 });
    mockLookupApprovalLink.mockResolvedValue(link);
    mockRecordReview.mockResolvedValue(null);
    selectQueue.push([{ id: 42 }]);

    const res = await POST(
      makePostRequest({ action: 'approve', reviewerName: 'Jane' }),
      makeParams(VALID_TOKEN),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });
});
