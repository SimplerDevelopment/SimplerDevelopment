/**
 * getOrCreatePublishingProject does SELECT-then-INSERT. Two first-visits landing
 * together each saw "no board" and each created one — which is how clientId 104
 * ended up with projects 154 and 155, byte-identical, 0.5s apart (JUL9-010).
 *
 * The fix is a per-client `pg_advisory_xact_lock` plus a re-check INSIDE the
 * lock. Both halves are load-bearing and the second is the one that's easy to
 * drop: the lock alone only serializes the duplicate creates, it doesn't
 * prevent them. The loser of the race must find the winner's board and return
 * it rather than inserting a second.
 *
 * A mocked db can't simulate real concurrency — the advisory lock is what makes
 * this hold under genuine concurrent callers. What it CAN pin is the branch
 * that decides what the loser does, which is the part a refactor would remove.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Rows the next `.limit(1)` (the project lookup) should resolve to, in order. */
let projectLookups: Array<Array<{ id: number }>> = [];
const insertProject = vi.fn();
const executed: string[] = [];

const COLUMN_ROWS = [
  { id: 1, name: 'Idea', order: 0, color: '#6b7280', isDone: false },
];

function selectBuilder() {
  return {
    from: () => ({
      where: () => ({
        limit: async () => projectLookups.shift() ?? [],
        orderBy: async () => COLUMN_ROWS,
      }),
    }),
  };
}

function txBuilder() {
  return {
    select: selectBuilder,
    execute: async (q: unknown) => {
      // drizzle's sql`` builds an object whose queryChunks hold StringChunk
      // instances; JSON round-tripping is the cheapest way to see the literal.
      executed.push(JSON.stringify(q));
    },
    insert: (table: unknown) => ({
      values: (v: unknown) => {
        insertProject(table, v);
        return {
          returning: async () => (Array.isArray(v) ? COLUMN_ROWS : [{ id: 4242 }]),
        };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: selectBuilder,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(txBuilder()),
  },
}));

const { getOrCreatePublishingProject } = await import('@/lib/publishing/bootstrap');

beforeEach(() => {
  projectLookups = [];
  insertProject.mockClear();
  executed.length = 0;
});

describe('getOrCreatePublishingProject — duplicate-board race (JUL9-010)', () => {
  it('returns the existing board without opening a transaction', async () => {
    projectLookups = [[{ id: 155 }]];
    const p = await getOrCreatePublishingProject(104, 1);
    expect(p.id).toBe(155);
    expect(insertProject).not.toHaveBeenCalled();
    expect(executed).toHaveLength(0); // never even took the lock
  });

  // THE regression this card is about. First lookup misses (so we enter the
  // create path), second lookup — inside the lock — finds the board a
  // concurrent caller just committed. We must adopt it, not insert a twin.
  it('adopts the winner\'s board instead of creating a second one', async () => {
    projectLookups = [[], [{ id: 155 }]];
    const p = await getOrCreatePublishingProject(104, 1);
    expect(p.id).toBe(155);
    expect(insertProject, 'inserted a duplicate Publishing board').not.toHaveBeenCalled();
  });

  it('takes the advisory lock before deciding', async () => {
    projectLookups = [[], [{ id: 155 }]];
    await getOrCreatePublishingProject(104, 1);
    expect(executed.join(' ')).toContain('pg_advisory_xact_lock');
  });

  it('still creates the board when there genuinely is none', async () => {
    projectLookups = [[], []];
    const p = await getOrCreatePublishingProject(104, 1);
    expect(p.id).toBe(4242);
    expect(insertProject).toHaveBeenCalled();
  });
});
