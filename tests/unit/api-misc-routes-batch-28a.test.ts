// @vitest-environment node
/**
 * Unit tests for four brain/knowledge API routes (batch 28a):
 *   - app/api/portal/brain/knowledge/[id]/route.ts          (GET, PATCH, DELETE)
 *   - app/api/portal/brain/knowledge/bulk/route.ts          (POST)
 *   - app/api/portal/brain/knowledge/graph/route.ts         (GET)
 *   - app/api/portal/brain/knowledge/trash/empty/route.ts   (POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const getNoteMock = vi.fn();
const updateNoteMock = vi.fn();
const deleteNoteMock = vi.fn();
const bulkUpdateNotesMock = vi.fn();
const emptyTrashMock = vi.fn();
vi.mock('@/lib/brain/notes', () => ({
  getNote: (...args: unknown[]) => getNoteMock(...args),
  updateNote: (...args: unknown[]) => updateNoteMock(...args),
  deleteNote: (...args: unknown[]) => deleteNoteMock(...args),
  bulkUpdateNotes: (...args: unknown[]) => bulkUpdateNotesMock(...args),
  emptyTrash: (...args: unknown[]) => emptyTrashMock(...args),
}));

const getKnowledgeGraphMock = vi.fn();
vi.mock('@/lib/brain/graph', () => ({
  getKnowledgeGraph: (...args: unknown[]) => getKnowledgeGraphMock(...args),
}));

// ---- modules under test (loaded AFTER mocks) ----
const idRoute = await import('@/app/api/portal/brain/knowledge/[id]/route');
const bulkRoute = await import('@/app/api/portal/brain/knowledge/bulk/route');
const graphRoute = await import('@/app/api/portal/brain/knowledge/graph/route');
const trashEmptyRoute = await import('@/app/api/portal/brain/knowledge/trash/empty/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const FAIL_RESPONSE = NextResponse.json(
  { success: false, code: 'BRAIN_NOT_ENTITLED' },
  { status: 402 },
);

beforeEach(() => {
  requireBrainEntitlementMock.mockReset();
  getNoteMock.mockReset();
  updateNoteMock.mockReset();
  deleteNoteMock.mockReset();
  bulkUpdateNotesMock.mockReset();
  emptyTrashMock.mockReset();
  getKnowledgeGraphMock.mockReset();
});

// ===========================================================================
// brain/knowledge/[id]
// ===========================================================================

describe('GET /api/portal/brain/knowledge/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await idRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/1'),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    const res = await idRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/abc'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid note id/i);
  });

  it('returns 404 when getNote returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getNoteMock.mockResolvedValue(null);
    const res = await idRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42'),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the note when found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getNoteMock.mockResolvedValue({ id: 42, title: 'N' });
    const res = await idRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/42'),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect(getNoteMock).toHaveBeenCalledWith(5, 42);
    expect((await res.json()).data).toEqual({ id: 42, title: 'N' });
  });
});

describe('PATCH /api/portal/brain/knowledge/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/1', {
        method: 'PATCH',
        body: '{}',
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'write' });
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/zzz', {
        method: 'PATCH',
        body: '{}',
      }),
      makeParams('zzz'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not a JSON object', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/42', {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid body/i);
  });

  it('returns 404 when updateNote returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    updateNoteMock.mockResolvedValue(null);
    const res = await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/42', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'New' }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('updates with sanitized fields and returns the result', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateNoteMock.mockResolvedValue({ id: 42, title: 'Updated' });
    const res = await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/42', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated',
          body: 'new body',
          tags: ['a', 1, 'b'],
          meetingId: 7,
          relationshipOverlayId: 8,
          companyId: 9,
          dealId: 10,
          contactId: 11,
          confidentialityLevel: 'restricted',
          pinned: true,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: 42, title: 'Updated' });
    expect(updateNoteMock).toHaveBeenCalledWith(
      5,
      42,
      expect.objectContaining({
        title: 'Updated',
        body: 'new body',
        tags: ['a', 'b'], // non-strings filtered
        meetingId: 7,
        relationshipOverlayId: 8,
        companyId: 9,
        dealId: 10,
        contactId: 11,
        confidentialityLevel: 'restricted',
        pinned: true,
      }),
      99,
    );
  });

  it('passes nulls through for clearable fields', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateNoteMock.mockResolvedValue({ id: 42 });
    await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/42', {
        method: 'PATCH',
        body: JSON.stringify({
          meetingId: null,
          relationshipOverlayId: null,
          companyId: null,
          dealId: null,
          contactId: null,
        }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    const arg = updateNoteMock.mock.calls[0][2];
    expect(arg.meetingId).toBeNull();
    expect(arg.relationshipOverlayId).toBeNull();
    expect(arg.companyId).toBeNull();
    expect(arg.dealId).toBeNull();
    expect(arg.contactId).toBeNull();
  });

  it('drops invalid fields (non-string title/body, invalid confidentiality, non-bool pinned, non-numeric ids)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    updateNoteMock.mockResolvedValue({ id: 42 });
    await idRoute.PATCH(
      makeReq('http://x/api/portal/brain/knowledge/42', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 123,
          body: { x: 1 },
          tags: 'not-array',
          meetingId: 'seven',
          confidentialityLevel: 'top-secret',
          pinned: 'yes',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      makeParams('42'),
    );
    const arg = updateNoteMock.mock.calls[0][2];
    expect(arg.title).toBeUndefined();
    expect(arg.body).toBeUndefined();
    expect(arg.tags).toBeUndefined();
    expect(arg.meetingId).toBeUndefined();
    expect(arg.confidentialityLevel).toBeUndefined();
    expect(arg.pinned).toBeUndefined();
  });
});

describe('DELETE /api/portal/brain/knowledge/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/1', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'admin' });
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/abc', { method: 'DELETE' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when getNote returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    getNoteMock.mockResolvedValue(null);
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleteNote returns false', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'admin',
    });
    getNoteMock.mockResolvedValue({ id: 42, deletedAt: null });
    deleteNoteMock.mockResolvedValue(false);
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(404);
  });

  it('soft-deletes a live note (no force) and reports deleted="soft"', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    getNoteMock.mockResolvedValue({ id: 42, deletedAt: null });
    deleteNoteMock.mockResolvedValue(true);
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 42, deleted: 'soft' });
    expect(deleteNoteMock).toHaveBeenCalledWith(5, 42, 99, {});
  });

  it('hard-deletes a soft-deleted note (force: true) and reports deleted="hard"', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    getNoteMock.mockResolvedValue({ id: 42, deletedAt: new Date() });
    deleteNoteMock.mockResolvedValue(true);
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 42, deleted: 'hard' });
    expect(deleteNoteMock).toHaveBeenCalledWith(5, 42, 99, { force: true });
  });

  it('returns 500 when deleteNote throws', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getNoteMock.mockResolvedValue({ id: 42, deletedAt: null });
    deleteNoteMock.mockRejectedValue(new Error('db dead'));
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('db dead');
  });

  it('returns 500 with default message when deleteNote throws non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getNoteMock.mockResolvedValue({ id: 42, deletedAt: null });
    deleteNoteMock.mockRejectedValue('string-failure');
    const res = await idRoute.DELETE(
      makeReq('http://x/api/portal/brain/knowledge/42', { method: 'DELETE' }),
      makeParams('42'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Delete failed');
  });
});

// ===========================================================================
// brain/knowledge/bulk
// ===========================================================================

describe('POST /api/portal/brain/knowledge/bulk', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'write' });
  });

  it('returns 400 when body is not a JSON object', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid body/i);
  });

  it('returns 400 when ids is missing or empty', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [], op: { kind: 'soft_delete' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/non-empty array/i);
  });

  it('returns 400 when ids has no integers', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: ['abc', null, 1.5], op: { kind: 'soft_delete' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/integers/i);
  });

  it('returns 400 when ids exceeds MAX_BULK (500)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, op: { kind: 'soft_delete' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/capped at 500/i);
  });

  it('returns 400 when op is missing/invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [1, 2], op: { kind: 'wat' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid op/i);
  });

  it('returns 400 when add_tags op has no string tags', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [1], op: { kind: 'add_tags', tags: [1, 2, '   '] } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when add_tags op is missing tags array', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [1], op: { kind: 'remove_tags' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when replace_tag_prefix lacks from/to strings', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: [1],
          op: { kind: 'replace_tag_prefix', from: 1, to: 'b' },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when replace_tag_prefix from is whitespace-only', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'write',
    });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: [1],
          op: { kind: 'replace_tag_prefix', from: '   ', to: 'b' },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('passes a soft_delete op through to bulkUpdateNotes', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    bulkUpdateNotesMock.mockResolvedValue({ updated: 2 });
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [1, 2], op: { kind: 'soft_delete' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ updated: 2 });
    expect(bulkUpdateNotesMock).toHaveBeenCalledWith(5, [1, 2], { kind: 'soft_delete' }, 99);
  });

  it('passes an add_tags op (filtered) through to bulkUpdateNotes', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    bulkUpdateNotesMock.mockResolvedValue({ updated: 1 });
    await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: [10, 'bogus', 11.7, 12],
          op: { kind: 'add_tags', tags: ['a', '  ', 'b', 99] },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(bulkUpdateNotesMock).toHaveBeenCalledWith(
      5,
      [10, 12],
      { kind: 'add_tags', tags: ['a', 'b'] },
      99,
    );
  });

  it('passes a replace_tag_prefix op through to bulkUpdateNotes', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    bulkUpdateNotesMock.mockResolvedValue({ updated: 7 });
    await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: [1],
          op: { kind: 'replace_tag_prefix', from: 'old/', to: 'new/' },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(bulkUpdateNotesMock).toHaveBeenCalledWith(
      5,
      [1],
      { kind: 'replace_tag_prefix', from: 'old/', to: 'new/' },
      99,
    );
  });

  it('returns 500 when bulkUpdateNotes throws (Error)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bulkUpdateNotesMock.mockRejectedValue(new Error('boom'));
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [1], op: { kind: 'soft_delete' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('boom');
  });

  it('returns 500 with default message when bulkUpdateNotes throws non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'write',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bulkUpdateNotesMock.mockRejectedValue('plain');
    const res = await bulkRoute.POST(
      makeReq('http://x/api/portal/brain/knowledge/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [1], op: { kind: 'soft_delete' } }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Bulk update failed');
  });
});

// ===========================================================================
// brain/knowledge/graph
// ===========================================================================

describe('GET /api/portal/brain/knowledge/graph', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await graphRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/graph'),
    );
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns the graph with default options when no query params are set', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getKnowledgeGraphMock.mockResolvedValue({ nodes: [], edges: [], truncated: false });
    const res = await graphRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/graph'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ nodes: [], edges: [], truncated: false });
    expect(getKnowledgeGraphMock).toHaveBeenCalledWith(5, {
      tag: undefined,
      orphansOnly: false,
      includeCrm: false,
    });
  });

  it('passes tag, orphansOnly, and includeCrm through', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getKnowledgeGraphMock.mockResolvedValue({ nodes: [{ id: 'n1' }], edges: [], truncated: false });
    await graphRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/graph?tag=%20foo%20&orphansOnly=true&includeCrm=true'),
    );
    expect(getKnowledgeGraphMock).toHaveBeenCalledWith(5, {
      tag: 'foo',
      orphansOnly: true,
      includeCrm: true,
    });
  });

  it('treats whitespace-only tag as undefined', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getKnowledgeGraphMock.mockResolvedValue({ nodes: [], edges: [], truncated: false });
    await graphRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/graph?tag=%20%20'),
    );
    expect(getKnowledgeGraphMock).toHaveBeenCalledWith(5, {
      tag: undefined,
      orphansOnly: false,
      includeCrm: false,
    });
  });

  it('treats non-"true" boolean params as false', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 1,
      role: 'read',
    });
    getKnowledgeGraphMock.mockResolvedValue({ nodes: [], edges: [], truncated: false });
    await graphRoute.GET(
      makeReq('http://x/api/portal/brain/knowledge/graph?orphansOnly=1&includeCrm=yes'),
    );
    expect(getKnowledgeGraphMock).toHaveBeenCalledWith(5, {
      tag: undefined,
      orphansOnly: false,
      includeCrm: false,
    });
  });
});

// ===========================================================================
// brain/knowledge/trash/empty
// ===========================================================================

describe('POST /api/portal/brain/knowledge/trash/empty', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await trashEmptyRoute.POST();
    expect(res.status).toBe(402);
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'admin' });
  });

  it('returns the summary on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    emptyTrashMock.mockResolvedValue({ purged: 3 });
    const res = await trashEmptyRoute.POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ purged: 3 });
    expect(emptyTrashMock).toHaveBeenCalledWith(5, 99);
  });

  it('returns 500 when emptyTrash throws (Error)', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    emptyTrashMock.mockRejectedValue(new Error('s3 down'));
    const res = await trashEmptyRoute.POST();
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('s3 down');
  });

  it('returns 500 with default message when emptyTrash throws non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5 },
      userId: 99,
      role: 'admin',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    emptyTrashMock.mockRejectedValue('nope');
    const res = await trashEmptyRoute.POST();
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Empty trash failed');
  });
});
