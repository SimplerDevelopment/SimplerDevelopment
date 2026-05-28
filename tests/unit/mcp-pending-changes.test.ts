// @vitest-environment node
/**
 * Unit tests for lib/mcp/pending-changes.ts.
 *
 * The module is DB-coupled and fires off realtime publishes + approval
 * notifications/emails for staged writes. We mock @/lib/db, @/lib/db/schema,
 * drizzle-orm, the realtime publisher, the CRM notifier, and the approval
 * email sender so we can drive both branches of `stageOrApply`:
 *
 *   1. apply path  — key does NOT require approval; mutation runs immediately
 *      and a realtime publish fires (fire-and-forget).
 *   2. stage path  — key DOES require approval; a `mcp_pending_changes` row
 *      is inserted and approval notifications + emails are queued.
 *
 * We also exercise the private `entityIdFromApplyResult` helper indirectly by
 * inspecting the args passed to `publishEntityFromDb`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── module mocks ──────────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
}));

vi.mock('@/lib/db/schema', () => {
  const mkTable = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    portalApiKeys: mkTable('portalApiKeys'),
    mcpPendingChanges: mkTable('mcpPendingChanges'),
  };
});

interface KeyRow {
  id: number;
  requireCmsApproval: boolean;
}

// Mock state — controls what `db.select(...).from(portalApiKeys)...` returns
// and captures rows inserted into mcpPendingChanges.
const state = {
  keys: [] as KeyRow[],
  pendingInserts: [] as Array<Record<string, unknown>>,
  nextPendingId: 5000,
};

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: { a?: { __col?: string }; b?: unknown } | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg as { a?: { __col?: string }; b?: unknown };
        return chain;
      },
      limit() {
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (activeTable !== 'portalApiKeys') return Promise.resolve([]);
      const col = filter?.a?.__col;
      const wanted = filter?.b;
      const matched = state.keys.filter((k) =>
        col === 'id' ? k.id === wanted : true,
      );
      const projected = matched.map((k) => {
        if (!projection) return k;
        const out: Record<string, unknown> = {};
        for (const [alias, ref] of Object.entries(projection)) {
          const r = ref as { __col?: string };
          out[alias] = r?.__col ? (k as unknown as Record<string, unknown>)[r.__col] : undefined;
        }
        return out;
      });
      return Promise.resolve(projected);
    }
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown>) {
        const row = { ...vals, id: state.nextPendingId++ };
        if (table.__table === 'mcpPendingChanges') {
          state.pendingInserts.push(row);
        }
        return {
          returning() {
            return Promise.resolve([row]);
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// Realtime publish — captured so we can assert the entityId resolution branch.
const publishEntityFromDb = vi.fn(async () => undefined);
vi.mock('@/lib/realtime/internal-publisher', () => ({
  publishEntityFromDb: (args: unknown) => publishEntityFromDb(args as never),
}));

// Notifier — returns rows in the shape sendApprovalEmails expects.
const notifyApprovers = vi.fn(async () => [
  { userId: 11 },
  { userId: 12 },
]);
vi.mock('@/lib/crm/notifications', () => ({
  notifyApprovers: (args: unknown) => notifyApprovers(args as never),
}));

const sendApprovalEmails = vi.fn(async () => undefined);
vi.mock('@/lib/email/mcp-approval-email', () => ({
  sendApprovalEmails: (args: unknown) => sendApprovalEmails(args as never),
}));

// ── helpers ───────────────────────────────────────────────────────────────

interface PortalMcpContextLike {
  userId: number;
  keyId: number;
  scopes: string[];
  client: { id: number };
}

function makeCtx(overrides: Partial<PortalMcpContextLike> = {}): PortalMcpContextLike {
  return {
    userId: 7,
    keyId: 100,
    scopes: ['cms.write'],
    client: { id: 42 },
    ...overrides,
  };
}

async function importModule() {
  return await import('@/lib/mcp/pending-changes');
}

/**
 * Awaits the fire-and-forget realtime / notification work that
 * `stageOrApply` kicks off without awaiting. Two microtasks is enough to
 * let `.catch()` chains attach.
 */
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  state.keys = [];
  state.pendingInserts = [];
  state.nextPendingId = 5000;
  publishEntityFromDb.mockClear();
  publishEntityFromDb.mockImplementation(async () => undefined);
  notifyApprovers.mockClear();
  notifyApprovers.mockImplementation(async () => [{ userId: 11 }, { userId: 12 }]);
  sendApprovalEmails.mockClear();
  sendApprovalEmails.mockImplementation(async () => undefined);
});

// ──────────────────────────────────────────────────────────────────────────
// stageOrApply — apply path (no approval required)
// ──────────────────────────────────────────────────────────────────────────

describe('stageOrApply — apply path', () => {
  it('runs the mutation immediately when the key does not require approval', async () => {
    state.keys.push({ id: 100, requireCmsApproval: false });
    const { stageOrApply } = await importModule();

    const apply = vi.fn(async () => ({ id: 555, title: 'Hello' }));
    const result = await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 'create a post',
      payload: { title: 'Hello' },
      apply,
    });

    expect(apply).toHaveBeenCalledOnce();
    expect(result.pending).toBe(false);
    if (result.pending === false) {
      expect(result.data).toEqual({ id: 555, title: 'Hello' });
    }
    // No staged insert when not required.
    expect(state.pendingInserts).toHaveLength(0);
  });

  it('returns false from keyRequiresApproval when the key row is missing entirely', async () => {
    // No matching key — keyRequiresApproval falls back to `false`.
    const { stageOrApply } = await importModule();
    const apply = vi.fn(async () => ({ id: 1 }));
    const result = await stageOrApply({
      ctx: makeCtx({ keyId: 999 }) as never,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 's',
      payload: {},
      apply,
    });
    expect(result.pending).toBe(false);
    expect(apply).toHaveBeenCalled();
  });

  it('publishes realtime using the apply result id when the staged entityId is null (create)', async () => {
    state.keys.push({ id: 100, requireCmsApproval: false });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 's',
      payload: {},
      apply: async () => ({ id: 888 }),
    });
    await flushMicrotasks();
    expect(publishEntityFromDb).toHaveBeenCalledWith({ entityType: 'post', entityId: 888 });
  });

  it('publishes realtime using the staged entityId when the apply result lacks an id', async () => {
    state.keys.push({ id: 100, requireCmsApproval: false });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'pitch_deck',
      entityId: 321,
      operation: 'update',
      summary: 's',
      payload: {},
      // apply result is not an object with an `id` field.
      apply: async () => ({ updated: true }),
    });
    await flushMicrotasks();
    expect(publishEntityFromDb).toHaveBeenCalledWith({ entityType: 'pitch_deck', entityId: 321 });
  });

  it('publishes realtime using the staged entityId when the apply result is a primitive', async () => {
    state.keys.push({ id: 100, requireCmsApproval: false });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'email_campaign',
      entityId: 77,
      operation: 'send',
      summary: 's',
      payload: {},
      apply: async () => 'ok' as unknown,
    });
    await flushMicrotasks();
    expect(publishEntityFromDb).toHaveBeenCalledWith({ entityType: 'email_campaign', entityId: 77 });
  });

  it('accepts string ids from the apply result (text PKs)', async () => {
    state.keys.push({ id: 100, requireCmsApproval: false });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 's',
      payload: {},
      apply: async () => ({ id: 'post-abc' }),
    });
    await flushMicrotasks();
    expect(publishEntityFromDb).toHaveBeenCalledWith({ entityType: 'post', entityId: 'post-abc' });
  });

  it('swallows realtime publish failures (fire-and-forget; never throws to caller)', async () => {
    state.keys.push({ id: 100, requireCmsApproval: false });
    publishEntityFromDb.mockImplementationOnce(async () => {
      throw new Error('redis down');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { stageOrApply } = await importModule();

    const result = await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: 1,
      operation: 'update',
      summary: 's',
      payload: {},
      apply: async () => ({ id: 1 }),
    });
    await flushMicrotasks();

    expect(result.pending).toBe(false);
    warn.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// stageOrApply — stage path (approval required)
// ──────────────────────────────────────────────────────────────────────────

describe('stageOrApply — stage path', () => {
  it('does NOT call apply and inserts a pending-change row when approval is required', async () => {
    state.keys.push({ id: 100, requireCmsApproval: true });
    const { stageOrApply } = await importModule();

    const apply = vi.fn(async () => ({ id: 1 }));
    const result = await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 'staged post',
      payload: { title: 'X' },
      originalSnapshot: { previous: 'snapshot' },
      apply,
    });

    expect(apply).not.toHaveBeenCalled();
    expect(result.pending).toBe(true);
    if (result.pending === true) {
      expect(result.status).toBe('pending');
      expect(result.summary).toBe('staged post');
      expect(typeof result.pendingId).toBe('number');
    }

    expect(state.pendingInserts).toHaveLength(1);
    const row = state.pendingInserts[0];
    expect(row).toMatchObject({
      clientId: 42,
      userId: 7,
      keyId: 100,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 'staged post',
      status: 'pending',
    });
    expect(row.payload).toEqual({ title: 'X' });
    expect(row.originalSnapshot).toEqual({ previous: 'snapshot' });
  });

  it('defaults originalSnapshot to null when not provided', async () => {
    state.keys.push({ id: 100, requireCmsApproval: true });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: 12,
      operation: 'update',
      summary: 's',
      payload: { a: 1 },
      apply: async () => ({ id: 12 }),
    });
    expect(state.pendingInserts[0].originalSnapshot).toBeNull();
  });

  it('notifies approvers (excluding the actor) and dispatches approval emails to those users', async () => {
    state.keys.push({ id: 100, requireCmsApproval: true });
    const { stageOrApply } = await importModule();
    const result = await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'pitch_deck',
      entityId: null,
      operation: 'create',
      summary: 'staged deck',
      payload: {},
      apply: async () => ({ id: 1 }),
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(notifyApprovers).toHaveBeenCalledOnce();
    const notifyArgs = notifyApprovers.mock.calls[0][0] as Record<string, unknown>;
    expect(notifyArgs).toMatchObject({
      clientId: 42,
      excludeUserId: 7,
      type: 'mcp_pending_change',
      title: 'MCP change awaiting approval',
      body: 'staged deck',
      entityType: 'mcp_approval',
    });
    // entityId is the freshly-inserted pending-change id.
    if (result.pending === true) {
      expect(notifyArgs.entityId).toBe(result.pendingId);
    }

    expect(sendApprovalEmails).toHaveBeenCalledOnce();
    const emailArgs = sendApprovalEmails.mock.calls[0][0] as Record<string, unknown>;
    expect(emailArgs).toMatchObject({
      clientId: 42,
      userIds: [11, 12],
      summary: 'staged deck',
      entityType: 'pitch_deck',
      operation: 'create',
    });
  });

  it('does NOT fire a realtime publish on the stage path', async () => {
    state.keys.push({ id: 100, requireCmsApproval: true });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'post',
      entityId: null,
      operation: 'create',
      summary: 's',
      payload: {},
      apply: async () => ({ id: 1 }),
    });
    await flushMicrotasks();
    expect(publishEntityFromDb).not.toHaveBeenCalled();
  });

  it('swallows notification/email failures without throwing to the caller', async () => {
    state.keys.push({ id: 100, requireCmsApproval: true });
    notifyApprovers.mockImplementationOnce(async () => {
      throw new Error('notif down');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { stageOrApply } = await importModule();

    const result = await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'proposal',
      entityId: null,
      operation: 'create',
      summary: 'doomed notification',
      payload: {},
      apply: async () => ({ id: 1 }),
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(result.pending).toBe(true);
    // Email path should not have fired since notifyApprovers threw first.
    expect(sendApprovalEmails).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('passes the correct EntityType / Operation through to the staged row', async () => {
    state.keys.push({ id: 100, requireCmsApproval: true });
    const { stageOrApply } = await importModule();
    await stageOrApply({
      ctx: makeCtx() as never,
      entityType: 'pitch_deck_slides',
      entityId: 9,
      operation: 'replace_slides',
      summary: 'slide swap',
      payload: { slides: [] },
      apply: async () => ({ id: 9 }),
    });
    expect(state.pendingInserts[0]).toMatchObject({
      entityType: 'pitch_deck_slides',
      operation: 'replace_slides',
    });
  });
});
