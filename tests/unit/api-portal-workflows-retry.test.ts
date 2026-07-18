// @vitest-environment node
/**
 * Unit tests for POST /api/portal/workflows/runs/[runId]/retry
 *
 * Verifies:
 *  - 401 when unauthenticated
 *  - 400 for non-numeric runId
 *  - 404 when run not found or wrong tenant
 *  - dead_letter steps are reset to pending (nextRetryAt cleared, error cleared)
 *  - parent run is moved back to pending
 *  - resetStepCount reflects only dead_letter rows updated
 *  - non-dead_letter steps are left untouched
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Schema table markers ──────────────────────────────────────────────────────

const SCHEMA = {
  workflowRuns: {
    __table: 'workflowRuns',
    id: { __col: 'id' },
    clientId: { __col: 'clientId' },
    status: { __col: 'status' },
    error: { __col: 'error' },
    completedAt: { __col: 'completedAt' },
  },
  workflowRunSteps: {
    __table: 'workflowRunSteps',
    id: { __col: 'id' },
    runId: { __col: 'runId' },
    clientId: { __col: 'clientId' },
    status: { __col: 'status' },
    nextRetryAt: { __col: 'nextRetryAt' },
    error: { __col: 'error' },
    updatedAt: { __col: 'updatedAt' },
  },
};

vi.mock('@/lib/db/schema', () => SCHEMA);

vi.mock('drizzle-orm', () => ({
  eq: (a, b) => ({ op: 'eq', col: a?.__col, val: b }),
  and: (...args) => ({ op: 'and', args }),
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: vi.fn(),
  isAuthError: (r) => r !== null && typeof r === 'object' && 'response' in r,
}));
vi.mock('@/lib/portal-client', () => ({ getPortalClient: vi.fn() }));

// ── In-memory state ───────────────────────────────────────────────────────────

const state = { runs: [], steps: [] };

function evalFilter(row, f) {
  if (!f || typeof f !== 'object') return true;
  if (f.op === 'eq') return row[f.col] === f.val;
  if (f.op === 'and') return f.args.every((a) => evalFilter(row, a));
  return true;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (cols) => {
      let tableName = '';
      let pendingFilter = null;
      const chain = {
        from: (table) => { tableName = table.__table ?? ''; return chain; },
        where: (f) => { pendingFilter = f; return chain; },
        limit: (_n) => {
          const store = tableName === 'workflowRuns' ? state.runs : state.steps;
          const rows = store.filter((r) => evalFilter(r, pendingFilter));
          if (!cols || typeof cols !== 'object' || Array.isArray(cols)) return Promise.resolve(rows);
          const keys = Object.keys(cols);
          return Promise.resolve(rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]]))));
        },
      };
      return chain;
    },
    update: (table) => {
      const tableName = table.__table ?? '';
      let setValues = {};
      let pendingFilter = null;
      const chain = {
        set: (vals) => { setValues = vals; return chain; },
        where: (f) => { pendingFilter = f; return chain; },
        returning: (cols) => {
          const store = tableName === 'workflowRuns' ? state.runs : state.steps;
          const updated = [];
          for (const row of store) {
            if (evalFilter(row, pendingFilter)) {
              Object.assign(row, setValues);
              if (!cols || typeof cols !== 'object' || Array.isArray(cols)) {
                updated.push({ ...row });
              } else {
                const keys = Object.keys(cols);
                updated.push(Object.fromEntries(keys.map((k) => [k, row[k]])));
              }
            }
          }
          return Promise.resolve(updated);
        },
      };
      return chain;
    },
  },
}));

import { auth } from '@/lib/auth';
import { authorizePortal } from '@/lib/portal-auth';
import { getPortalClient } from '@/lib/portal-client';

const mockedAuth = auth;
const mockedAuthorize = authorizePortal;
const mockedGetClient = getPortalClient;

async function callRetry(runId) {
  const mod = await import('@/app/api/portal/workflows/runs/[runId]/retry/route');
  const res = await mod.POST(
    new Request(`http://localhost/api/portal/workflows/runs/${runId}/retry`, { method: 'POST' }),
    { params: Promise.resolve({ runId }) },
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  state.runs = [];
  state.steps = [];
  mockedAuth.mockResolvedValue({ user: { id: '7' } });
  mockedAuthorize.mockResolvedValue({ client: { id: 10 }, userId: 7, role: 'admin' });
  mockedGetClient.mockResolvedValue({ id: 10 });
});

describe('POST /api/portal/workflows/runs/[runId]/retry', () => {
  describe('auth guards', () => {
    it('returns 401 when session is absent', async () => {
      mockedAuth.mockResolvedValue(null);
      const { status, body } = await callRetry('1');
      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });

    it('returns 401 when session has no user.id', async () => {
      mockedAuth.mockResolvedValue({ user: {} });
      const { status } = await callRetry('1');
      expect(status).toBe(401);
    });

    it('returns 400 for a non-numeric runId', async () => {
      const { status, body } = await callRetry('abc');
      expect(status).toBe(400);
      expect(body.error).toMatch(/invalid runid/i);
    });
  });

  describe('tenant scoping', () => {
    it('returns 404 when run belongs to a different client', async () => {
      state.runs.push({ id: 42, workflowId: 1, clientId: 99, status: 'failed', error: 'boom', completedAt: null });
      const { status } = await callRetry('42');
      expect(status).toBe(404);
    });

    it('returns 404 when run does not exist', async () => {
      const { status } = await callRetry('999');
      expect(status).toBe(404);
    });
  });

  describe('dead_letter reset', () => {
    beforeEach(() => {
      state.runs.push({
        id: 5, workflowId: 1, clientId: 10,
        status: 'failed', error: 'max retries exceeded', completedAt: new Date(),
      });
    });

    it('resets all dead_letter steps to pending and returns success:true', async () => {
      state.steps.push(
        { id: 1, runId: 5, clientId: 10, status: 'dead_letter', nextRetryAt: new Date(), error: 'timeout', updatedAt: new Date() },
        { id: 2, runId: 5, clientId: 10, status: 'dead_letter', nextRetryAt: new Date(), error: 'neterr', updatedAt: new Date() },
      );
      const { status, body } = await callRetry('5');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.resetStepCount).toBe(2);
    });

    it('clears nextRetryAt and error on each reset step', async () => {
      state.steps.push({ id: 1, runId: 5, clientId: 10, status: 'dead_letter', nextRetryAt: new Date(), error: 'fail', updatedAt: new Date() });
      await callRetry('5');
      expect(state.steps[0].status).toBe('pending');
      expect(state.steps[0].nextRetryAt).toBeNull();
      expect(state.steps[0].error).toBeNull();
    });

    it('does not touch completed or already-pending steps', async () => {
      state.steps.push(
        { id: 1, runId: 5, clientId: 10, status: 'completed', nextRetryAt: null, error: null, updatedAt: new Date() },
        { id: 2, runId: 5, clientId: 10, status: 'dead_letter', nextRetryAt: new Date(), error: 'x', updatedAt: new Date() },
        { id: 3, runId: 5, clientId: 10, status: 'pending', nextRetryAt: null, error: null, updatedAt: new Date() },
      );
      await callRetry('5');
      expect(state.steps[0].status).toBe('completed');
      expect(state.steps[1].status).toBe('pending');
      expect(state.steps[2].status).toBe('pending');
    });

    it('returns resetStepCount of 0 when no dead_letter steps exist', async () => {
      state.steps.push({ id: 1, runId: 5, clientId: 10, status: 'completed', nextRetryAt: null, error: null, updatedAt: new Date() });
      const { body } = await callRetry('5');
      expect(body.data.resetStepCount).toBe(0);
    });

    it('moves the parent run back to pending and clears error + completedAt', async () => {
      state.steps.push({ id: 1, runId: 5, clientId: 10, status: 'dead_letter', nextRetryAt: new Date(), error: 'fail', updatedAt: new Date() });
      await callRetry('5');
      const run = state.runs.find((r) => r.id === 5);
      expect(run.status).toBe('pending');
      expect(run.error).toBeNull();
      expect(run.completedAt).toBeNull();
    });

    it('only resets steps belonging to the authenticated tenant (clientId guard)', async () => {
      state.steps.push(
        { id: 1, runId: 5, clientId: 99, status: 'dead_letter', nextRetryAt: new Date(), error: 'x', updatedAt: new Date() },
        { id: 2, runId: 5, clientId: 10, status: 'dead_letter', nextRetryAt: new Date(), error: 'y', updatedAt: new Date() },
      );
      const { body } = await callRetry('5');
      expect(body.data.resetStepCount).toBe(1);
      expect(state.steps[0].status).toBe('dead_letter');
      expect(state.steps[1].status).toBe('pending');
    });
  });
});
