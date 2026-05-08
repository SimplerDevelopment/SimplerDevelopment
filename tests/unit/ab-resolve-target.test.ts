// @vitest-environment node
/**
 * Unit tests for `resolveAbContentForTarget` (lib/ab/resolve.ts).
 *
 * Companion to `ab-render-deck.test.ts` — that file mocks the resolver to
 * drive the deck render path; this file exercises the resolver itself by
 * stubbing `lib/db` and `lib/ab/assign`.
 *
 * Covers:
 *   - missing visitorId → no-op
 *   - no running experiment → no-op
 *   - assignVariant returns null → no-op
 *   - variant with no override → swapped:false, original content preserved
 *   - variant override as string → passed through verbatim, swapped:true
 *   - variant override as object/array → JSON.stringified, swapped:true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbSelectMock = vi.fn();
const assignVariantMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

vi.mock('@/lib/ab/assign', () => ({
  assignVariant: assignVariantMock,
}));

/**
 * Build a 2-stage chained Drizzle-shape select mock.
 *  - First call returns `experimentRow` (or null) from the experiment lookup.
 *  - Second call returns `variantRow` (or undefined) from the variant lookup.
 */
function chainedSelect(experimentRow: unknown, variantRow: unknown) {
  const experimentChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(experimentRow ? [experimentRow] : []),
  };
  const variantChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(variantRow ? [variantRow] : []),
  };
  let call = 0;
  dbSelectMock.mockImplementation(() => {
    call += 1;
    return call === 1 ? experimentChain : variantChain;
  });
}

describe('lib/ab/resolve — resolveAbContentForTarget', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    assignVariantMock.mockReset();
  });

  it('returns content + null ab when visitorId is missing', async () => {
    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, null, 'orig');
    expect(result).toEqual({ content: 'orig', ab: null });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it('returns content + null ab when no experiment is running', async () => {
    chainedSelect(null, null);
    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, 'visitor-1', 'orig');
    expect(result).toEqual({ content: 'orig', ab: null });
    expect(assignVariantMock).not.toHaveBeenCalled();
  });

  it('returns content + null ab when assignVariant returns null', async () => {
    chainedSelect({ id: 5, variantSplit: {}, goalMetric: 'click', goalSelector: null }, null);
    assignVariantMock.mockReturnValue(null);

    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, 'visitor-1', 'orig');
    expect(result).toEqual({ content: 'orig', ab: null });
  });

  it('returns content + swapped:false when variant has no blockTreeOverride', async () => {
    chainedSelect(
      { id: 5, variantSplit: { a: 100 }, goalMetric: 'click', goalSelector: '.cta' },
      { blockTreeOverride: null },
    );
    assignVariantMock.mockReturnValue('a');

    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, 'visitor-1', 'orig');
    expect(result.content).toBe('orig');
    expect(result.ab).toEqual({
      experimentId: 5,
      variantKey: 'a',
      swapped: false,
      goalMetric: 'click',
      goalSelector: '.cta',
    });
  });

  it('returns override content + swapped:true when blockTreeOverride is a string', async () => {
    const overrideJson = '[{"id":"v1","label":"Override","blocks":[]}]';
    chainedSelect(
      { id: 5, variantSplit: { a: 100 }, goalMetric: 'click', goalSelector: null },
      { blockTreeOverride: overrideJson },
    );
    assignVariantMock.mockReturnValue('a');

    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, 'visitor-1', 'orig');
    expect(result.content).toBe(overrideJson);
    expect(result.ab?.swapped).toBe(true);
  });

  it('returns JSON-stringified override + swapped:true when blockTreeOverride is an object/array', async () => {
    const override = [{ id: 'v1', label: 'Override', blocks: [] }];
    chainedSelect(
      { id: 5, variantSplit: { a: 100 }, goalMetric: 'click', goalSelector: null },
      { blockTreeOverride: override },
    );
    assignVariantMock.mockReturnValue('a');

    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, 'visitor-1', 'orig');
    expect(result.content).toBe(JSON.stringify(override));
    expect(result.ab?.swapped).toBe(true);
  });

  it('falls back to original content when the variant lookup throws', async () => {
    const experimentChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: 5, variantSplit: { a: 100 }, goalMetric: 'click', goalSelector: null },
      ]),
    };
    const variantChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('db down')),
    };
    let call = 0;
    dbSelectMock.mockImplementation(() => {
      call += 1;
      return call === 1 ? experimentChain : variantChain;
    });
    assignVariantMock.mockReturnValue('a');

    const { resolveAbContentForTarget } = await import('@/lib/ab/resolve');
    const result = await resolveAbContentForTarget('deck', 1, 'visitor-1', 'orig');
    expect(result).toEqual({ content: 'orig', ab: null });
  });
});
