// @vitest-environment node
/**
 * Unit tests for `lib/security/block-allowlist.ts` — the gate that prevents
 * non-staff authors from persisting `html-render` / `html-embed` blocks
 * (those re-execute their `<script>` tags at render time).
 *
 * The route-level wiring is tested in `route-block-templates.test.ts`. Here
 * we cover the helper's branches directly:
 *
 *   - admin / editor / employee pass through, regardless of content.
 *   - client (any other / null / undefined role) is rejected when restricted
 *     blocks are present.
 *   - Safe blocks always pass.
 *   - Nested children are walked (the recursive scan in findRestrictedType).
 *   - `assertBlocksAllowedForUserId` consults the DB only when the content
 *     could trip the gate, and honours the user's role from the DB result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertBlocksAllowedForRole,
  assertBlocksAllowedForUserId,
  BlockGateError,
  PRIVILEGED_ROLES,
  RESTRICTED_BLOCK_TYPES,
} from '@/lib/security/block-allowlist';

const dbWhereMock = vi.fn();
const dbFromMock = vi.fn(() => ({ where: dbWhereMock }));
const dbSelectMock = vi.fn(() => ({ from: dbFromMock }));

vi.mock('@/lib/db', () => ({
  db: { select: (...args: unknown[]) => dbSelectMock(...args) },
}));
vi.mock('@/lib/db/schema', () => ({
  users: { id: { __c: 'id' }, role: { __c: 'role' } },
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return { ...actual, eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }) };
});

// Make `select().from().where().limit(...)` resolve to the queued rows.
let userRows: Array<{ role: string }> = [];
beforeEach(() => {
  userRows = [];
  dbSelectMock.mockClear();
  dbFromMock.mockClear();
  dbWhereMock.mockReset();
  // .where() returns a thenable that also has a .limit() — both paths must
  // resolve to the same queue.
  dbWhereMock.mockImplementation(() => {
    const thenable = {
      limit: () => Promise.resolve(userRows),
      then: (resolve: (rows: Array<{ role: string }>) => void) => resolve(userRows),
    };
    return thenable;
  });
});

describe('assertBlocksAllowedForRole', () => {
  it('exports the canonical set of privileged roles', () => {
    expect(PRIVILEGED_ROLES.has('admin')).toBe(true);
    expect(PRIVILEGED_ROLES.has('editor')).toBe(true);
    expect(PRIVILEGED_ROLES.has('employee')).toBe(true);
    expect(PRIVILEGED_ROLES.has('client')).toBe(false);
  });

  it('exports the canonical restricted block types', () => {
    expect(RESTRICTED_BLOCK_TYPES).toEqual(['html-render', 'html-embed']);
  });

  for (const role of ['admin', 'editor', 'employee']) {
    it(`is a no-op when role=${role}, even with restricted blocks`, () => {
      expect(() =>
        assertBlocksAllowedForRole([{ type: 'html-render', html: '<script>x</script>' }], role),
      ).not.toThrow();
    });
  }

  it('throws BlockGateError for client role on an html-render block', () => {
    expect(() =>
      assertBlocksAllowedForRole([{ type: 'html-render' }], 'client'),
    ).toThrow(BlockGateError);
  });

  it('throws BlockGateError when role is null/undefined and an html-embed block is present', () => {
    expect(() =>
      assertBlocksAllowedForRole([{ type: 'html-embed' }], null),
    ).toThrow(BlockGateError);
    expect(() =>
      assertBlocksAllowedForRole([{ type: 'html-embed' }], undefined),
    ).toThrow(BlockGateError);
  });

  it('walks nested children and detects a restricted block deep in the tree', () => {
    const tree = [
      {
        type: 'columns',
        children: [
          { type: 'column', children: [{ type: 'html-render', html: '<script>x</script>' }] },
        ],
      },
    ];
    expect(() => assertBlocksAllowedForRole(tree, 'client')).toThrow(BlockGateError);
  });

  it('is a no-op for client role when content has only safe blocks', () => {
    expect(() =>
      assertBlocksAllowedForRole(
        [
          { type: 'heading', text: 'Hi' },
          { type: 'text', text: 'Hello world' },
        ],
        'client',
      ),
    ).not.toThrow();
  });
});

describe('assertBlocksAllowedForUserId', () => {
  it('short-circuits without a DB call when content has no restricted blocks', async () => {
    await expect(
      assertBlocksAllowedForUserId([{ type: 'heading' }], 99),
    ).resolves.toBeUndefined();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it('looks up the user and PASSES when their role is privileged (admin)', async () => {
    userRows = [{ role: 'admin' }];
    await expect(
      assertBlocksAllowedForUserId([{ type: 'html-render' }], 99),
    ).resolves.toBeUndefined();
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it('looks up the user and THROWS BlockGateError when their role is not privileged', async () => {
    userRows = [{ role: 'client' }];
    await expect(
      assertBlocksAllowedForUserId([{ type: 'html-embed' }], 99),
    ).rejects.toThrow(BlockGateError);
  });

  it('treats a missing user row as non-privileged (conservative)', async () => {
    userRows = [];
    await expect(
      assertBlocksAllowedForUserId([{ type: 'html-render' }], 99),
    ).rejects.toThrow(BlockGateError);
  });
});
