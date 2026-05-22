// @vitest-environment node
/**
 * Unit tests for four small brain API routes (batch 29a):
 *   - app/api/portal/brain/review-items/[id]/approve/route.ts            (POST)
 *   - app/api/portal/brain/review-items/[id]/reject/route.ts             (POST)
 *   - app/api/portal/brain/tasks/[id]/promote-to-kanban/route.ts         (POST)
 *   - app/api/portal/brain/templates/[id]/route.ts                       (GET, PATCH, DELETE)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing route modules)
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const approveReviewItemMock = vi.fn();
const rejectReviewItemMock = vi.fn();
vi.mock('@/lib/brain/review', () => ({
  approveReviewItem: (...args: unknown[]) => approveReviewItemMock(...args),
  rejectReviewItem: (...args: unknown[]) => rejectReviewItemMock(...args),
}));

const promoteTaskToKanbanMock = vi.fn();
vi.mock('@/lib/brain/tasks', () => ({
  promoteTaskToKanban: (...args: unknown[]) => promoteTaskToKanbanMock(...args),
}));

const getTemplateMock = vi.fn();
const updateTemplateMock = vi.fn();
const deleteTemplateMock = vi.fn();

class FakeDuplicateTemplateNameError extends Error {
  constructor(message = 'duplicate') {
    super(message);
    this.name = 'DuplicateTemplateNameError';
  }
}

vi.mock('@/lib/brain/templates', () => ({
  getTemplate: (...args: unknown[]) => getTemplateMock(...args),
  updateTemplate: (...args: unknown[]) => updateTemplateMock(...args),
  deleteTemplate: (...args: unknown[]) => deleteTemplateMock(...args),
  DuplicateTemplateNameError: FakeDuplicateTemplateNameError,
}));

// ---- modules under test (loaded AFTER mocks) ----

const approveRoute = await import('@/app/api/portal/brain/review-items/[id]/approve/route');
const rejectRoute = await import('@/app/api/portal/brain/review-items/[id]/reject/route');
const promoteRoute = await import('@/app/api/portal/brain/tasks/[id]/promote-to-kanban/route');
const templatesRoute = await import('@/app/api/portal/brain/templates/[id]/route');

// ---- helpers ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(url: string, method: string, raw: string): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
}

const ENTITLED = { client: { id: 42 }, userId: 7, role: 'admin' as const };

beforeEach(() => {
  requireBrainEntitlementMock.mockReset();
  approveReviewItemMock.mockReset();
  rejectReviewItemMock.mockReset();
  promoteTaskToKanbanMock.mockReset();
  getTemplateMock.mockReset();
  updateTemplateMock.mockReset();
  deleteTemplateMock.mockReset();
});

// ===========================================================================
// review-items/[id]/approve/route.ts
// ===========================================================================

describe('POST /api/portal/brain/review-items/[id]/approve', () => {
  it('short-circuits with the entitlement guard response when not entitled', async () => {
    const guardResponse = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: guardResponse });
    const res = await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/1/approve', 'POST', {}),
      makeParams('1'),
    );
    expect(res).toBe(guardResponse);
    expect(approveReviewItemMock).not.toHaveBeenCalled();
  });

  it('passes action=write to requireBrainEntitlement', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    approveReviewItemMock.mockResolvedValue({ ok: true });
    await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/1/approve', 'POST', {}),
      makeParams('1'),
    );
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'write' });
  });

  it('returns 400 when id is NaN', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/abc/approve', 'POST', {}),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid review item id/i);
    expect(approveReviewItemMock).not.toHaveBeenCalled();
  });

  it('approves with no editedPayload when body is malformed JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    approveReviewItemMock.mockResolvedValue({ ok: true, itemId: 5 });
    const res = await approveRoute.POST(
      makeRawRequest('http://x/api/portal/brain/review-items/5/approve', 'POST', '{not json'),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    expect(approveReviewItemMock).toHaveBeenCalledWith({
      clientId: 42,
      itemId: 5,
      actorId: 7,
      editedPayload: undefined,
    });
  });

  it('approves and forwards a well-formed editedPayload object', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    approveReviewItemMock.mockResolvedValue({ ok: true, itemId: 5, data: 'x' });
    const res = await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/approve', 'POST', {
        editedPayload: { title: 'New' },
      }),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ ok: true, itemId: 5, data: 'x' });
    expect(approveReviewItemMock).toHaveBeenCalledWith({
      clientId: 42,
      itemId: 5,
      actorId: 7,
      editedPayload: { title: 'New' },
    });
  });

  it('ignores a non-object editedPayload (string)', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    approveReviewItemMock.mockResolvedValue({ ok: true });
    await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/approve', 'POST', {
        editedPayload: 'a-string',
      }),
      makeParams('5'),
    );
    expect(approveReviewItemMock).toHaveBeenCalledWith({
      clientId: 42,
      itemId: 5,
      actorId: 7,
      editedPayload: undefined,
    });
  });

  it('returns 400 with the error message when approveReviewItem throws an Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    approveReviewItemMock.mockRejectedValue(new Error('boom'));
    const res = await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/approve', 'POST', {}),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('boom');
  });

  it('returns 400 with default message when approveReviewItem throws a non-Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    approveReviewItemMock.mockRejectedValue('weird');
    const res = await approveRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/approve', 'POST', {}),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Failed to approve review item');
  });
});

// ===========================================================================
// review-items/[id]/reject/route.ts
// ===========================================================================

describe('POST /api/portal/brain/review-items/[id]/reject', () => {
  it('short-circuits with the entitlement guard response when not entitled', async () => {
    const guardResponse = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: guardResponse });
    const res = await rejectRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/1/reject', 'POST', {}),
      makeParams('1'),
    );
    expect(res).toBe(guardResponse);
    expect(rejectReviewItemMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is NaN', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await rejectRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/xyz/reject', 'POST', {}),
      makeParams('xyz'),
    );
    expect(res.status).toBe(400);
    expect(rejectReviewItemMock).not.toHaveBeenCalled();
  });

  it('returns 404 when rejectReviewItem returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    rejectReviewItemMock.mockResolvedValue(null);
    const res = await rejectRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/reject', 'POST', { reason: 'why' }),
      makeParams('5'),
    );
    expect(res.status).toBe(404);
    expect(rejectReviewItemMock).toHaveBeenCalledWith({
      clientId: 42,
      itemId: 5,
      actorId: 7,
      reason: 'why',
    });
  });

  it('returns 200 with data on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    rejectReviewItemMock.mockResolvedValue({ id: 5, status: 'rejected' });
    const res = await rejectRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/reject', 'POST', { reason: 'spam' }),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 5, status: 'rejected' });
  });

  it('truncates a long reason to 500 chars', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    rejectReviewItemMock.mockResolvedValue({ id: 5 });
    const longReason = 'x'.repeat(600);
    await rejectRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/reject', 'POST', { reason: longReason }),
      makeParams('5'),
    );
    expect(rejectReviewItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'x'.repeat(500) }),
    );
  });

  it('passes reason=undefined when reason is not a string', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    rejectReviewItemMock.mockResolvedValue({ id: 5 });
    await rejectRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/review-items/5/reject', 'POST', { reason: 123 }),
      makeParams('5'),
    );
    expect(rejectReviewItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: undefined }),
    );
  });

  it('treats malformed JSON body as empty (reason undefined)', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    rejectReviewItemMock.mockResolvedValue({ id: 5 });
    await rejectRoute.POST(
      makeRawRequest('http://x/api/portal/brain/review-items/5/reject', 'POST', '{not json'),
      makeParams('5'),
    );
    expect(rejectReviewItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: undefined }),
    );
  });
});

// ===========================================================================
// tasks/[id]/promote-to-kanban/route.ts
// ===========================================================================

describe('POST /api/portal/brain/tasks/[id]/promote-to-kanban', () => {
  it('short-circuits with the entitlement guard response when not entitled', async () => {
    const guardResponse = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: guardResponse });
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/1/promote-to-kanban', 'POST', { projectId: 5 }),
      makeParams('1'),
    );
    expect(res).toBe(guardResponse);
    expect(promoteTaskToKanbanMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is NaN', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/abc/promote-to-kanban', 'POST', { projectId: 5 }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid task id/i);
  });

  it('returns 400 when body is malformed JSON (null body)', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await promoteRoute.POST(
      makeRawRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', '{not json'),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid body/i);
  });

  it('returns 400 when projectId is missing', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', {}),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/projectId is required/i);
  });

  it('returns 400 when projectId is not a number', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', { projectId: '5' }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
  });

  it('promotes successfully when only projectId is provided (columnId undefined)', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    promoteTaskToKanbanMock.mockResolvedValue({ kanbanCardId: 99 });
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', { projectId: 8 }),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ kanbanCardId: 99 });
    expect(promoteTaskToKanbanMock).toHaveBeenCalledWith({
      clientId: 42,
      taskId: 5,
      projectId: 8,
      columnId: undefined,
      actorId: 7,
    });
  });

  it('passes columnId when provided as a number', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    promoteTaskToKanbanMock.mockResolvedValue({ kanbanCardId: 99 });
    await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', {
        projectId: 8,
        columnId: 11,
      }),
      makeParams('5'),
    );
    expect(promoteTaskToKanbanMock).toHaveBeenCalledWith(
      expect.objectContaining({ columnId: 11 }),
    );
  });

  it('returns 400 with thrown error message on promote failure', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    promoteTaskToKanbanMock.mockRejectedValue(new Error('column gone'));
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', { projectId: 8 }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('column gone');
  });

  it('returns 400 with default message on non-Error rejection', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    promoteTaskToKanbanMock.mockRejectedValue('weird');
    const res = await promoteRoute.POST(
      makeJsonRequest('http://x/api/portal/brain/tasks/5/promote-to-kanban', 'POST', { projectId: 8 }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Failed to promote task');
  });
});

// ===========================================================================
// templates/[id]/route.ts — GET
// ===========================================================================

describe('GET /api/portal/brain/templates/[id]', () => {
  it('short-circuits with guard response when not entitled', async () => {
    const guardResponse = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: guardResponse });
    const res = await templatesRoute.GET(
      new Request('http://x/api/portal/brain/templates/5'),
      makeParams('5'),
    );
    expect(res).toBe(guardResponse);
  });

  it('uses action=read', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    getTemplateMock.mockResolvedValue({ id: 5 });
    await templatesRoute.GET(
      new Request('http://x/api/portal/brain/templates/5'),
      makeParams('5'),
    );
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns 400 when id is NaN', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.GET(
      new Request('http://x/api/portal/brain/templates/abc'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when template not found', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    getTemplateMock.mockResolvedValue(null);
    const res = await templatesRoute.GET(
      new Request('http://x/api/portal/brain/templates/5'),
      makeParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with the template when found', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    getTemplateMock.mockResolvedValue({ id: 5, name: 'T' });
    const res = await templatesRoute.GET(
      new Request('http://x/api/portal/brain/templates/5'),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 5, name: 'T' });
    expect(getTemplateMock).toHaveBeenCalledWith(42, 5);
  });
});

// ===========================================================================
// templates/[id]/route.ts — PATCH
// ===========================================================================

describe('PATCH /api/portal/brain/templates/[id]', () => {
  it('short-circuits with guard response when not entitled', async () => {
    const guardResponse = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: guardResponse });
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(res).toBe(guardResponse);
  });

  it('uses action=write', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockResolvedValue({ id: 5, name: 'X' });
    await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'write' });
  });

  it('returns 400 when id is NaN', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/abc', 'PATCH', { name: 'X' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is malformed JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeRawRequest('http://x/api/portal/brain/templates/5', 'PATCH', '{not json'),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid body/i);
  });

  it('returns 400 when name is empty string', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: '   ' }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/1-150 characters/);
  });

  it('returns 400 when name exceeds 150 chars', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'x'.repeat(151) }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is empty string', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { body: '' }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/non-empty/);
  });

  it('returns 400 when trigger is invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { trigger: 'bogus' }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid trigger/i);
  });

  it('returns 400 when enabled is not boolean', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { enabled: 'yes' }),
      makeParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/enabled must be a boolean/i);
  });

  it('builds the patch with valid name/body/trigger/variables/defaultTags/enabled', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockResolvedValue({ id: 5 });
    await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', {
        name: 'My Template',
        body: 'Hello {{name}}',
        trigger: 'daily',
        variables: ['name', 42, 'place'],
        defaultTags: ['tag1', 99, 'tag2'],
        enabled: true,
      }),
      makeParams('5'),
    );
    expect(updateTemplateMock).toHaveBeenCalledWith(
      42,
      5,
      {
        name: 'My Template',
        body: 'Hello {{name}}',
        trigger: 'daily',
        variables: ['name', 'place'],
        defaultTags: ['tag1', 'tag2'],
        enabled: true,
      },
      7,
    );
  });

  it('passes null for variables/defaultTags when not arrays', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockResolvedValue({ id: 5 });
    await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', {
        variables: 'not-array',
        defaultTags: null,
      }),
      makeParams('5'),
    );
    expect(updateTemplateMock).toHaveBeenCalledWith(
      42,
      5,
      { variables: null, defaultTags: null },
      7,
    );
  });

  it('returns 404 when updateTemplate returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockResolvedValue(null);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with updated record on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockResolvedValue({ id: 5, name: 'X' });
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 5, name: 'X' });
  });

  it('returns 409 on DuplicateTemplateNameError', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockRejectedValue(new FakeDuplicateTemplateNameError('dup'));
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already exists/i);
  });

  it('returns 500 with error message on other Error', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('db down');
  });

  it('returns 500 with default message on non-Error rejection', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    updateTemplateMock.mockRejectedValue('weird');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await templatesRoute.PATCH(
      makeJsonRequest('http://x/api/portal/brain/templates/5', 'PATCH', { name: 'X' }),
      makeParams('5'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Update failed');
  });
});

// ===========================================================================
// templates/[id]/route.ts — DELETE
// ===========================================================================

describe('DELETE /api/portal/brain/templates/[id]', () => {
  it('short-circuits with guard response when not entitled', async () => {
    const guardResponse = new Response('nope', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: guardResponse });
    const res = await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/5', { method: 'DELETE' }),
      makeParams('5'),
    );
    expect(res).toBe(guardResponse);
  });

  it('uses action=admin', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    deleteTemplateMock.mockResolvedValue(true);
    await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/5', { method: 'DELETE' }),
      makeParams('5'),
    );
    expect(requireBrainEntitlementMock).toHaveBeenCalledWith({ action: 'admin' });
  });

  it('returns 400 when id is NaN', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    const res = await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/abc', { method: 'DELETE' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleteTemplate returns false', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    deleteTemplateMock.mockResolvedValue(false);
    const res = await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/5', { method: 'DELETE' }),
      makeParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful delete', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    deleteTemplateMock.mockResolvedValue(true);
    const res = await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/5', { method: 'DELETE' }),
      makeParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteTemplateMock).toHaveBeenCalledWith(42, 5, 7);
  });

  it('returns 500 with thrown error message on delete failure', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    deleteTemplateMock.mockRejectedValue(new Error('fk constraint'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/5', { method: 'DELETE' }),
      makeParams('5'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('fk constraint');
  });

  it('returns 500 with default message on non-Error rejection', async () => {
    requireBrainEntitlementMock.mockResolvedValue(ENTITLED);
    deleteTemplateMock.mockRejectedValue('weird');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await templatesRoute.DELETE(
      new Request('http://x/api/portal/brain/templates/5', { method: 'DELETE' }),
      makeParams('5'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Delete failed');
  });
});
