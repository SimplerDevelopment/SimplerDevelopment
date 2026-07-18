// @vitest-environment node
/**
 * Unit tests for the survey email-sequence routes (DIST-01 / DIST-02):
 *   app/api/portal/surveys/[id]/email-sequences/route.ts (GET, POST)
 *   app/api/portal/surveys/[id]/email-sequences/[sequenceId]/route.ts (PUT, DELETE)
 *
 * Mock-DB pattern matches `route-survey-ai-summary.test.ts`. We focus on the
 * tenant-scoping invariant (survey.clientId must match the session client),
 * the auth gate, and the input-validation hand-off to
 * `lib/surveys/email-sequence-input.ts` — the input parser itself is pure and
 * tested via its own consumers; here we only assert the route surfaces its
 * error message as a 400.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const getPortalClientMock = vi.fn();
const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();

// Insert / update / delete chain spies
const insertReturningMock = vi.fn();
const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
const insertMock = vi.fn(() => ({ values: insertValuesMock }));
const updateReturningMock = vi.fn();
const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
const updateMock = vi.fn(() => ({ set: updateSetMock }));
const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

// FIFO row queue for chained selects.
let selectQueue: unknown[][] = [];
function takeNext(): unknown[] {
  const next = selectQueue.shift();
  return next ?? [];
}
function chainable(): unknown {
  const obj: Record<string, unknown> = {};
  obj.from = () => chainable();
  obj.where = () => chainable();
  obj.limit = () => chainable();
  obj.orderBy = () => chainable();
  obj.then = (resolve: (rows: unknown[]) => void) => resolve(takeNext());
  return obj;
}

vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => authMock(...args) }));
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (...args: unknown[]) => isAuthErrorMock(...args),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => chainable(),
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  },
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    and: (...args: unknown[]) => ({ _and: args }),
    eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    asc: (a: unknown) => ({ _asc: a }),
  };
});
vi.mock('@/lib/db/schema', () => ({
  surveys: { __t: 'surveys' },
  surveyEmailSequences: {
    __t: 'survey_email_sequences',
    id: { __c: 'id' },
    surveyId: { __c: 'survey_id' },
    delayHours: { __c: 'delay_hours' },
  },
}));

// We *don't* mock email-sequence-input — it's pure and we want the real
// validation rules to flow through. The route imports `parseSequenceInput`
// directly from there.

async function loadCollection() {
  return import('@/app/api/portal/surveys/[id]/email-sequences/route');
}
async function loadItem() {
  return import('@/app/api/portal/surveys/[id]/email-sequences/[sequenceId]/route');
}

function paramsId(id: string) {
  return { params: Promise.resolve({ id }) };
}
function paramsItem(id: string, sequenceId: string) {
  return { params: Promise.resolve({ id, sequenceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 42 });
  // Default: authorizePortal returns "ok" — isAuthError returns false.
  authorizePortalMock.mockResolvedValue({ client: { id: 42 }, userId: 7, role: 'owner' });
  isAuthErrorMock.mockReturnValue(false);
});

describe('GET /api/portal/surveys/[id]/email-sequences (collection)', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { GET } = await loadCollection();
    const res = await GET(new Request('http://x'), paramsId('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the survey belongs to a different client (cross-tenant)', async () => {
    // survey lookup empty
    selectQueue.push([]);
    const { GET } = await loadCollection();
    const res = await GET(new Request('http://x'), paramsId('999'));
    expect(res.status).toBe(404);
  });

  it('returns the sequence rows on success', async () => {
    selectQueue.push([{ id: 1, clientId: 42 }]);
    selectQueue.push([
      { id: 10, surveyId: 1, subject: 'Welcome', delayHours: 0, enabled: true },
      { id: 11, surveyId: 1, subject: 'Follow-up', delayHours: 24, enabled: true },
    ]);
    const { GET } = await loadCollection();
    const res = await GET(new Request('http://x'), paramsId('1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown[] };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(2);
  });
});

describe('POST /api/portal/surveys/[id]/email-sequences (collection)', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { POST } = await loadCollection();
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({}) }),
      paramsId('1'),
    );
    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 404 when survey belongs to a different client (cross-tenant)', async () => {
    selectQueue.push([]); // survey lookup empty
    const { POST } = await loadCollection();
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Hi', bodyHtml: '<p>Hi</p>' }),
      }),
      paramsId('1'),
    );
    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the input parser rejects the body shape', async () => {
    selectQueue.push([{ id: 1, clientId: 42 }]);
    const { POST } = await loadCollection();
    // Missing subject + bodyHtml — parseSequenceInput('create') will reject.
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({}) }),
      paramsId('1'),
    );
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inserts and returns the new row when the body is valid', async () => {
    selectQueue.push([{ id: 1, clientId: 42 }]);
    insertReturningMock.mockResolvedValueOnce([
      { id: 99, surveyId: 1, subject: 'Hi', bodyHtml: '<p>Hi</p>', delayHours: 0 },
    ]);
    const { POST } = await loadCollection();
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Hi', bodyHtml: '<p>Hi</p>', delayHours: 0 }),
      }),
      paramsId('1'),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { success: boolean; data: { id: number } };
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(99);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/portal/surveys/[id]/email-sequences/[sequenceId] (item)', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { PUT } = await loadItem();
    const res = await PUT(
      new Request('http://x', { method: 'PUT', body: JSON.stringify({ subject: 'X' }) }),
      paramsItem('1', '10'),
    );
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when survey belongs to a different client (cross-tenant)', async () => {
    selectQueue.push([]); // survey lookup empty → loadForClient returns null
    const { PUT } = await loadItem();
    const res = await PUT(
      new Request('http://x', { method: 'PUT', body: JSON.stringify({ subject: 'X' }) }),
      paramsItem('1', '10'),
    );
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates and returns the row on success', async () => {
    selectQueue.push([{ id: 1, clientId: 42 }]); // survey row
    selectQueue.push([{ id: 10, surveyId: 1 }]); // sequence row
    updateReturningMock.mockResolvedValueOnce([
      { id: 10, surveyId: 1, subject: 'Updated' },
    ]);
    const { PUT } = await loadItem();
    const res = await PUT(
      new Request('http://x', {
        method: 'PUT',
        body: JSON.stringify({ subject: 'Updated' }),
      }),
      paramsItem('1', '10'),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { subject: string } };
    expect(json.success).toBe(true);
    expect(json.data.subject).toBe('Updated');
  });
});

describe('DELETE /api/portal/surveys/[id]/email-sequences/[sequenceId] (item)', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { DELETE } = await loadItem();
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), paramsItem('1', '10'));
    expect(res.status).toBe(401);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('returns 404 when survey belongs to a different client (cross-tenant)', async () => {
    selectQueue.push([]);
    const { DELETE } = await loadItem();
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), paramsItem('1', '10'));
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('deletes and returns a success envelope', async () => {
    selectQueue.push([{ id: 1, clientId: 42 }]); // survey
    selectQueue.push([{ id: 10, surveyId: 1 }]); // sequence
    const { DELETE } = await loadItem();
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), paramsItem('1', '10'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
