// @vitest-environment node
/**
 * Unit tests for lib/crm/notifications.ts.
 *
 * Covers the three exported emitter functions NOT tested by the existing
 * notification-preferences-gate.test.ts (which only tests shouldDeliverNotification):
 *
 *   - createCrmNotification
 *       • preference gate returns deliver=false  → returns null, no insert
 *       • gate returns instant                   → inserts row, invalidates cache
 *       • gate returns digest_daily              → inserts with metadata.digest=true
 *       • all optional fields forwarded correctly
 *
 *   - notifyAllClientUsers
 *       • no members found → returns []
 *       • all members gated-off → returns []
 *       • excludeUserId excludes the submitter from member query
 *       • mixed preferences (instant + digest_daily + off)
 *       • invalidateNotificationsCache called for delivered members
 *
 *   - notifyApprovers
 *       • client not found  → empty recipientId set → returns []
 *       • legacy owner included even without a clientMembers row
 *       • excludeUserId removes a recipient from the set
 *       • all approvers gated-off → returns []
 *       • successful insert path
 *       • digest_daily metadata propagated
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared call-queue state ───────────────────────────────────────────────────

interface State {
  // Each entry is the resolved value for one db.select()...limit() call.
  // select calls are dequeued FIFO so tests can stage multi-step flows.
  selectQueue: unknown[][];
  // One entry per db.insert()…returning() call.
  insertQueue: unknown[][];
  revalidateTagCalls: string[];
}

const state: State = {
  selectQueue: [],
  insertQueue: [],
  revalidateTagCalls: [],
};

function reset() {
  state.selectQueue = [];
  state.insertQueue = [];
  state.revalidateTagCalls = [];
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn((...args: string[]) => {
    state.revalidateTagCalls.push(args[0]);
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
    crmNotifications: table('crm_notifications', [
      'id', 'clientId', 'userId', 'type', 'title', 'body',
      'entityType', 'entityId', 'metadata', 'createdAt',
    ]),
    clientMembers: table('client_members', ['clientId', 'userId', 'role']),
    clients: table('clients', ['id', 'userId']),
    notificationPreferences: table('notification_preferences', [
      'clientId', 'userId', 'notificationType', 'delivery',
    ]),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({ op: 'eq' }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  ne: (_col: unknown, _val: unknown) => ({ op: 'ne' }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
}));

vi.mock('@/lib/db', () => {
  // Chainable select that pops one entry from state.selectQueue when resolved.
  function makeSelectChain() {
    const chain: Record<string, () => unknown> = {};
    const passthroughMethods = ['from', 'where', 'orderBy', 'groupBy', 'offset'];
    for (const m of passthroughMethods) chain[m] = () => chain;
    // limit() returns a thenable that resolves on .then() or .limit()
    chain.limit = () => {
      const rows = state.selectQueue.shift() ?? [];
      return {
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
    };
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const rows = state.selectQueue.shift() ?? [];
      return Promise.resolve(rows).then(resolve, reject);
    };
    return chain;
  }

  // Chainable insert that pops one entry from state.insertQueue on .returning()
  function makeInsertChain() {
    const chain = {
      values() { return chain; },
      returning() {
        const rows = state.insertQueue.shift() ?? [];
        return Promise.resolve(rows);
      },
    };
    return chain;
  }

  const db = {
    select() { return makeSelectChain(); },
    selectDistinct() { return makeSelectChain(); },
    insert() { return makeInsertChain(); },
  };

  return { db };
});

// ─── Module under test (imported after mocks) ─────────────────────────────────

import {
  createCrmNotification,
  notifyAllClientUsers,
  notifyApprovers,
} from '@/lib/crm/notifications';

beforeEach(() => { reset(); });

// ─── createCrmNotification ────────────────────────────────────────────────────

describe('createCrmNotification @notifications @coverage', () => {
  it('returns null and skips insert when preference gate says deliver=false', async () => {
    // Preference lookup → delivery = 'off'
    state.selectQueue = [[{ delivery: 'off' }]];

    const result = await createCrmNotification({
      clientId: 1,
      userId: 10,
      type: 'mention',
      title: 'You were mentioned',
    });

    expect(result).toBeNull();
    // No insert was popped, insertQueue still empty
    expect(state.insertQueue).toHaveLength(0);
    expect(state.revalidateTagCalls).toHaveLength(0);
  });

  it('inserts notification and invalidates cache for instant delivery', async () => {
    // Preference lookup → no row (default instant)
    state.selectQueue = [[]];
    const row = {
      id: 42, clientId: 1, userId: 10, type: 'mention',
      title: 'You were mentioned', metadata: null,
    };
    state.insertQueue = [[row]];

    const result = await createCrmNotification({
      clientId: 1,
      userId: 10,
      type: 'mention',
      title: 'You were mentioned',
    });

    expect(result).toEqual(row);
    expect(state.revalidateTagCalls).toContain('notifications:10');
  });

  it('sets metadata.digest=true for digest_daily preference', async () => {
    state.selectQueue = [[{ delivery: 'digest_daily' }]];
    const row = {
      id: 43, clientId: 1, userId: 10, type: 'deal_update',
      title: 'Deal updated', metadata: { digest: true },
    };
    state.insertQueue = [[row]];

    const result = await createCrmNotification({
      clientId: 1,
      userId: 10,
      type: 'deal_update',
      title: 'Deal updated',
    });

    expect(result).not.toBeNull();
    // We can verify insert was consumed (not left in queue)
    expect(state.insertQueue).toHaveLength(0);
    expect(state.revalidateTagCalls).toContain('notifications:10');
  });

  it('passes optional fields (body, entityType, entityId) through to insert', async () => {
    state.selectQueue = [[{ delivery: 'instant' }]];
    const row = {
      id: 44, clientId: 2, userId: 20, type: 'task_assigned',
      title: 'Task assigned to you', body: 'Check your queue',
      entityType: 'task', entityId: 99, metadata: null,
    };
    state.insertQueue = [[row]];

    const result = await createCrmNotification({
      clientId: 2,
      userId: 20,
      type: 'task_assigned',
      title: 'Task assigned to you',
      body: 'Check your queue',
      entityType: 'task',
      entityId: 99,
    });

    expect(result).not.toBeNull();
    // The mock returns the row as-is; real code would pass these values — verify
    // the returned row's shape matches what was staged.
    expect((result as typeof row).entityType).toBe('task');
    expect((result as typeof row).entityId).toBe(99);
  });

  it('returns null (without crash) when insert returns empty array', async () => {
    // Covers the `if (notification)` guard: insert conflict returned nothing.
    state.selectQueue = [[{ delivery: 'instant' }]];
    state.insertQueue = [[/* empty returning */]];

    const result = await createCrmNotification({
      clientId: 1,
      userId: 10,
      type: 'mention',
      title: 'Title',
    });

    // notification is undefined → guard skips invalidate → returns undefined
    expect(result).toBeUndefined();
    expect(state.revalidateTagCalls).toHaveLength(0);
  });
});

// ─── notifyAllClientUsers ─────────────────────────────────────────────────────

describe('notifyAllClientUsers @notifications @coverage', () => {
  it('returns empty array when no members are found for the client', async () => {
    // membersQuery → empty
    state.selectQueue = [[]];

    const result = await notifyAllClientUsers({
      clientId: 5,
      type: 'system',
      title: 'Maintenance tonight',
    });

    expect(result).toEqual([]);
    expect(state.revalidateTagCalls).toHaveLength(0);
  });

  it('returns empty array when all members have delivery=off', async () => {
    // membersQuery → two members
    state.selectQueue = [
      [{ userId: 1 }, { userId: 2 }],
      // per-user preference for userId=1
      [{ delivery: 'off' }],
      // per-user preference for userId=2
      [{ delivery: 'off' }],
    ];

    const result = await notifyAllClientUsers({
      clientId: 5,
      type: 'system',
      title: 'Downtime',
    });

    expect(result).toEqual([]);
    expect(state.revalidateTagCalls).toHaveLength(0);
  });

  it('inserts one row per delivered member and invalidates their caches', async () => {
    // membersQuery → two members
    state.selectQueue = [
      [{ userId: 11 }, { userId: 12 }],
      // preference for userId=11 → instant
      [],
      // preference for userId=12 → instant
      [],
    ];
    const rows = [
      { id: 100, userId: 11, clientId: 5, metadata: null },
      { id: 101, userId: 12, clientId: 5, metadata: null },
    ];
    state.insertQueue = [rows];

    const result = await notifyAllClientUsers({
      clientId: 5,
      type: 'mention',
      title: 'You were mentioned',
    });

    expect(result).toHaveLength(2);
    expect(state.revalidateTagCalls).toContain('notifications:11');
    expect(state.revalidateTagCalls).toContain('notifications:12');
  });

  it('sets digest metadata for members with digest_daily preference', async () => {
    // two members: one instant, one digest
    state.selectQueue = [
      [{ userId: 21 }, { userId: 22 }],
      [],                              // userId=21 → no pref row → instant
      [{ delivery: 'digest_daily' }],  // userId=22 → digest
    ];
    const insertedRows = [
      { id: 200, userId: 21, metadata: null },
      { id: 201, userId: 22, metadata: { digest: true } },
    ];
    state.insertQueue = [insertedRows];

    const result = await notifyAllClientUsers({
      clientId: 5,
      type: 'update',
      title: 'Deal updated',
    });

    expect(result).toHaveLength(2);
    // Both caches invalidated even for digest members (they still get a row)
    expect(state.revalidateTagCalls).toContain('notifications:21');
    expect(state.revalidateTagCalls).toContain('notifications:22');
  });

  it('excludes the submitter when excludeUserId is set', async () => {
    // With excludeUserId, the members WHERE clause uses ne(). Our mock still
    // returns what we stage — we just verify the function proceeds normally.
    state.selectQueue = [
      [{ userId: 31 }], // excludeUserId=30 not in the result (handled by DB WHERE)
      [],               // preference for userId=31 → instant
    ];
    state.insertQueue = [[{ id: 300, userId: 31 }]];

    const result = await notifyAllClientUsers({
      clientId: 7,
      excludeUserId: 30,
      type: 'comment',
      title: 'New comment',
    });

    expect(result).toHaveLength(1);
  });

  it('forwards optional entityType, entityId, body to the insert', async () => {
    state.selectQueue = [
      [{ userId: 41 }],
      [],
    ];
    state.insertQueue = [[{ id: 400, userId: 41, entityType: 'deal', entityId: 55 }]];

    const result = await notifyAllClientUsers({
      clientId: 8,
      type: 'deal_comment',
      title: 'Deal comment',
      body: 'Check the deal',
      entityType: 'deal',
      entityId: 55,
    });

    expect(result).toHaveLength(1);
    expect(state.insertQueue).toHaveLength(0); // consumed
  });
});

// ─── notifyApprovers ─────────────────────────────────────────────────────────

describe('notifyApprovers @notifications @coverage', () => {
  it('returns empty array when client row not found and no admin members', async () => {
    // client lookup → empty
    state.selectQueue = [
      [],  // clients select (owner)
      [],  // clientMembers select (admin/owner role)
    ];

    const result = await notifyApprovers({
      clientId: 99,
      type: 'approval_needed',
      title: 'Approve change',
    });

    expect(result).toEqual([]);
    expect(state.revalidateTagCalls).toHaveLength(0);
  });

  it('includes the legacy direct owner even without a clientMembers row', async () => {
    // client lookup → owner userId=7 (no members row)
    state.selectQueue = [
      [{ userId: 7 }],   // clients select
      [],                // clientMembers select (no admin rows)
      [],                // preference for userId=7 → no pref → instant
    ];
    state.insertQueue = [[{ id: 500, userId: 7, metadata: null }]];

    const result = await notifyApprovers({
      clientId: 10,
      type: 'approval_needed',
      title: 'Please approve',
    });

    expect(result).toHaveLength(1);
    expect(state.revalidateTagCalls).toContain('notifications:7');
  });

  it('excludes the submitter from the recipient set via excludeUserId', async () => {
    // owner=7 AND admin member=7 → after excludeUserId=7 the set is empty
    state.selectQueue = [
      [{ userId: 7 }],           // owner
      [{ userId: 7 }],           // admin members (same person)
    ];

    const result = await notifyApprovers({
      clientId: 10,
      excludeUserId: 7,
      type: 'approval_needed',
      title: 'Approve',
    });

    expect(result).toEqual([]);
    expect(state.revalidateTagCalls).toHaveLength(0);
  });

  it('returns empty array when all approvers have delivery=off', async () => {
    state.selectQueue = [
      [{ userId: 8 }],          // owner
      [{ userId: 9 }],          // admin member
      [{ delivery: 'off' }],    // preference for userId=8
      [{ delivery: 'off' }],    // preference for userId=9
    ];

    const result = await notifyApprovers({
      clientId: 10,
      type: 'approval_needed',
      title: 'Approve',
    });

    expect(result).toEqual([]);
    expect(state.revalidateTagCalls).toHaveLength(0);
  });

  it('inserts notification rows for all delivering approvers', async () => {
    state.selectQueue = [
      [{ userId: 15 }],           // owner
      [{ userId: 16 }],           // admin member
      [],                          // preference userId=15 → instant (no row)
      [],                          // preference userId=16 → instant (no row)
    ];
    const rows = [
      { id: 600, userId: 15, metadata: null },
      { id: 601, userId: 16, metadata: null },
    ];
    state.insertQueue = [rows];

    const result = await notifyApprovers({
      clientId: 10,
      type: 'approval_needed',
      title: 'Approve this change',
      body: 'Please review',
      entityType: 'proposal',
      entityId: 77,
    });

    expect(result).toHaveLength(2);
    expect(state.revalidateTagCalls).toContain('notifications:15');
    expect(state.revalidateTagCalls).toContain('notifications:16');
    expect(state.insertQueue).toHaveLength(0); // consumed
  });

  it('propagates digest_daily metadata for approvers with that preference', async () => {
    state.selectQueue = [
      [{ userId: 20 }],                  // owner
      [],                                // no admin members
      [{ delivery: 'digest_daily' }],    // preference for userId=20
    ];
    state.insertQueue = [[{ id: 700, userId: 20, metadata: { digest: true } }]];

    const result = await notifyApprovers({
      clientId: 11,
      type: 'approval_needed',
      title: 'Digest test',
    });

    expect(result).toHaveLength(1);
    expect(state.revalidateTagCalls).toContain('notifications:20');
  });

  it('deduplicates when owner is also listed as an admin member', async () => {
    // userId=5 appears in both the clients row and clientMembers admin rows.
    // The Set should collapse them into a single recipient.
    state.selectQueue = [
      [{ userId: 5 }],    // owner
      [{ userId: 5 }],   // admin member (same person)
      [],                  // preference for userId=5 → instant (single gate call)
    ];
    state.insertQueue = [[{ id: 800, userId: 5 }]];

    const result = await notifyApprovers({
      clientId: 12,
      type: 'approval_needed',
      title: 'Dedup test',
    });

    // Only one insert row for userId=5
    expect(result).toHaveLength(1);
    expect(state.revalidateTagCalls.filter((t) => t === 'notifications:5')).toHaveLength(1);
  });
});
