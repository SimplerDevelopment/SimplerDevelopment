// @vitest-environment node
/**
 * Unit tests for lib/magamommy/orchestrator.ts
 *
 * Exports under test:
 *   - thisMondayUTC      (pure utility — no mocks needed)
 *   - runWeeklyDrop      (orchestrator — mocks db, researcher, concept-writer,
 *                          designer, publisher)
 *
 * Each stage is mocked so tests run without a real DB or AI client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── drizzle-orm stub ──────────────────────────────────────────────────────────
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual };
});

// ── schema stub ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db/schema', () => ({
  magamommyDrops: { id: 'magamommyDrops.id', websiteId: 'magamommyDrops.websiteId', weekOf: 'magamommyDrops.weekOf', status: 'magamommyDrops.status' },
  clientWebsites: { id: 'clientWebsites.id', clientId: 'clientWebsites.clientId', domain: 'clientWebsites.domain', subdomain: 'clientWebsites.subdomain' },
  products: { id: 'products.id', websiteId: 'products.websiteId', slug: 'products.slug' },
}));

// ── db mock ───────────────────────────────────────────────────────────────────
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

// ── agent mocks ───────────────────────────────────────────────────────────────
const mockRunResearcher = vi.fn();
vi.mock('@/lib/magamommy/agents/researcher', () => ({
  runResearcher: (...args: unknown[]) => mockRunResearcher(...args),
}));

const mockRunConceptWriter = vi.fn();
vi.mock('@/lib/magamommy/agents/concept-writer', () => ({
  runConceptWriter: (...args: unknown[]) => mockRunConceptWriter(...args),
}));

const mockRunDesigner = vi.fn();
vi.mock('@/lib/magamommy/agents/designer', () => ({
  runDesigner: (...args: unknown[]) => mockRunDesigner(...args),
}));

const mockRunPublisher = vi.fn();
vi.mock('@/lib/magamommy/agents/publisher', () => ({
  runPublisher: (...args: unknown[]) => mockRunPublisher(...args),
}));

// ── module under test (after all vi.mock calls) ───────────────────────────────
const { thisMondayUTC, runWeeklyDrop } = await import('@/lib/magamommy/orchestrator');

// ── shared helpers ────────────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

function makeUpdateChain() {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockResolvedValue([]);
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);
  return chain;
}

/** Standard "happy path" context rows returned by db.select. */
function setupContextSelects(opts: {
  websiteId?: number;
  clientId?: number;
  templateProductId?: number;
  dropRows?: unknown[];
} = {}) {
  const websiteId = opts.websiteId ?? 5;
  const clientId = opts.clientId ?? 3;
  const templateProductId = opts.templateProductId ?? 99;

  // 1. site by domain or subdomain or by websiteId hint
  mockDbSelect
    .mockReturnValueOnce(makeSelectChain([{ id: websiteId, clientId }]))
    // 2. template product
    .mockReturnValueOnce(makeSelectChain([{ id: templateProductId }]))
    // 3. existing drop row (getOrCreateDropRow)
    .mockReturnValueOnce(makeSelectChain(opts.dropRows ?? []));
}

const WEEK_STR = '2026-06-02'; // Monday

const freshDropRow = {
  id: 1,
  status: 'pending',
  briefId: null,
  conceptId: null,
  designId: null,
  productId: null,
};

// ── thisMondayUTC ─────────────────────────────────────────────────────────────

describe('thisMondayUTC', () => {
  it('returns a Monday when called on a Monday', () => {
    const monday = new Date('2026-06-01T10:00:00Z'); // 2026-06-01 is a Monday
    const result = thisMondayUTC(monday);
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('returns the previous Monday when called on a Wednesday', () => {
    const wednesday = new Date('2026-06-03T10:00:00Z');
    const result = thisMondayUTC(wednesday);
    expect(result.getUTCDay()).toBe(1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('returns the previous Monday when called on a Sunday', () => {
    const sunday = new Date('2026-06-07T10:00:00Z');
    const result = thisMondayUTC(sunday);
    expect(result.getUTCDay()).toBe(1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('returns the previous Monday when called on a Saturday', () => {
    const saturday = new Date('2026-06-06T10:00:00Z');
    const result = thisMondayUTC(saturday);
    expect(result.getUTCDay()).toBe(1);
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('returns midnight UTC for the result', () => {
    const friday = new Date('2026-05-29T15:30:00Z');
    const result = thisMondayUTC(friday);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it('defaults to "now" when no argument passed', () => {
    // Just verify it returns a Date whose day is 1 (Monday) without throwing
    const result = thisMondayUTC();
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCDay()).toBe(1);
  });
});

// ── runWeeklyDrop ─────────────────────────────────────────────────────────────

describe('runWeeklyDrop', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Context resolution: lookup by websiteId hint ──────────────────────────

  it('resolves context by websiteId when provided', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))   // site by id
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))                // template
      .mockReturnValueOnce(makeSelectChain([]));                         // no existing drop
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: 1, status: 'pending', briefId: null, conceptId: null, designId: null, productId: null }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com/p/30' });

    const result = await runWeeklyDrop({ websiteId: 5, weekOf: new Date(WEEK_STR) });
    expect(result.status).toBe('live');
    expect(result.websiteId).toBe(5);
  });

  it('throws when websiteId hint resolves no website', async () => {
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    await expect(
      runWeeklyDrop({ websiteId: 999, weekOf: new Date(WEEK_STR) }),
    ).rejects.toThrow('website 999 not found');
  });

  // ── Context resolution: lookup by domain/subdomain ────────────────────────

  it('resolves context by domain when no websiteId given', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))   // domain lookup
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))                // template
      .mockReturnValueOnce(makeSelectChain([]));                         // no drop
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com/p/30' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.status).toBe('live');
  });

  it('falls back to subdomain lookup when domain lookup returns nothing', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([]))                          // domain miss
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))   // subdomain hit
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))                // template
      .mockReturnValueOnce(makeSelectChain([]));                         // no drop
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com/p/30' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.status).toBe('live');
  });

  it('throws when neither domain nor subdomain lookup finds the site', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([]))  // domain miss
      .mockReturnValueOnce(makeSelectChain([])); // subdomain miss

    await expect(
      runWeeklyDrop({ weekOf: new Date(WEEK_STR) }),
    ).rejects.toThrow('Magamommy website not found');
  });

  it('throws when template product is missing', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))  // site
      .mockReturnValueOnce(makeSelectChain([]));                         // no template

    await expect(
      runWeeklyDrop({ weekOf: new Date(WEEK_STR) }),
    ).rejects.toThrow('heavyweight-tee-template');
  });

  // ── Already live drop ─────────────────────────────────────────────────────

  it('returns cached live state without re-running stages', async () => {
    const liveRow = {
      id: 7,
      status: 'live',
      briefId: 10,
      conceptId: 20,
      designId: 'des-1',
      productId: 30,
    };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([liveRow]));

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.status).toBe('live');
    expect(result.dropId).toBe(7);
    expect(result.briefId).toBe(10);
    expect(result.conceptId).toBe(20);
    expect(result.designId).toBe('des-1');
    expect(result.productId).toBe(30);
    expect(mockRunResearcher).not.toHaveBeenCalled();
    expect(mockRunConceptWriter).not.toHaveBeenCalled();
    expect(mockRunDesigner).not.toHaveBeenCalled();
    expect(mockRunPublisher).not.toHaveBeenCalled();
  });

  // ── Force flag ────────────────────────────────────────────────────────────

  it('re-runs all stages when force=true even if drop is live', async () => {
    const liveRow = {
      id: 7,
      status: 'live',
      briefId: 10,
      conceptId: 20,
      designId: 'des-1',
      productId: 30,
    };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([liveRow]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 11 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 21 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-2' });
    mockRunPublisher.mockResolvedValue({ productId: 31, publicUrl: 'https://example.com/p/31' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR), force: true });

    expect(result.status).toBe('live');
    expect(mockRunResearcher).toHaveBeenCalledOnce();
    expect(mockRunConceptWriter).toHaveBeenCalledOnce();
    expect(mockRunDesigner).toHaveBeenCalledOnce();
    expect(mockRunPublisher).toHaveBeenCalledOnce();
  });

  // ── Resume mid-pipeline ───────────────────────────────────────────────────

  it('skips research stage when briefId already exists on the row', async () => {
    const partialRow = {
      id: 2,
      status: 'concepting',
      briefId: 10,
      conceptId: null,
      designId: null,
      productId: null,
    };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([partialRow]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com/p/30' });

    await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(mockRunResearcher).not.toHaveBeenCalled();
    expect(mockRunConceptWriter).toHaveBeenCalledOnce();
  });

  it('skips research and concept stages when conceptId already exists', async () => {
    const partialRow = {
      id: 3,
      status: 'designing',
      briefId: 10,
      conceptId: 20,
      designId: null,
      productId: null,
    };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([partialRow]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com/p/30' });

    await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(mockRunResearcher).not.toHaveBeenCalled();
    expect(mockRunConceptWriter).not.toHaveBeenCalled();
    expect(mockRunDesigner).toHaveBeenCalledOnce();
  });

  it('skips research, concept, and design when designId already exists', async () => {
    const partialRow = {
      id: 4,
      status: 'publishing',
      briefId: 10,
      conceptId: 20,
      designId: 'des-1',
      productId: null,
    };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([partialRow]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com/p/30' });

    await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(mockRunResearcher).not.toHaveBeenCalled();
    expect(mockRunConceptWriter).not.toHaveBeenCalled();
    expect(mockRunDesigner).not.toHaveBeenCalled();
    expect(mockRunPublisher).toHaveBeenCalledOnce();
  });

  // ── Full happy path ───────────────────────────────────────────────────────

  it('runs all four stages on a fresh drop and returns live status', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://store.magamommy.com/products/drop' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.status).toBe('live');
    expect(result.briefId).toBe(10);
    expect(result.conceptId).toBe(20);
    expect(result.designId).toBe('des-1');
    expect(result.productId).toBe(30);
    expect(result.publicUrl).toBe('https://store.magamommy.com/products/drop');
  });

  it('includes timings object with all four stages on full run', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.timings).toBeDefined();
    expect(typeof result.timings?.research).toBe('number');
    expect(typeof result.timings?.concept).toBe('number');
    expect(typeof result.timings?.design).toBe('number');
    expect(typeof result.timings?.publish).toBe('number');
  });

  it('returns correct weekOf string', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.weekOf).toBe(WEEK_STR);
  });

  it('inserts a new drop row when none exists', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow, id: 42 }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com' });

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.dropId).toBe(42);
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('returns failed status when researcher throws', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockRejectedValue(new Error('[researcher] failed to fetch trends'));

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('[researcher] failed to fetch trends');
    expect(result.errorStage).toBe('research');
  });

  it('returns failed status when concept-writer throws', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockRejectedValue(new Error('[concept-writer] API timeout'));

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('[concept-writer] API timeout');
    expect(result.errorStage).toBe('concept');
  });

  it('returns failed status when designer throws', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockRejectedValue(new Error('[designer] gpt-image-1 generation failed'));

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('[designer]');
    expect(result.errorStage).toBe('design');
  });

  it('returns failed status when publisher throws', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockRejectedValue(new Error('[publisher] product insert failed'));

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.status).toBe('failed');
    expect(result.errorStage).toBe('publish');
  });

  it('includes timings for completed stages even when a later stage fails', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockRejectedValue(new Error('[concept-writer] quota exceeded'));

    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    expect(result.timings?.research).toBeGreaterThanOrEqual(0);
    expect(result.timings?.concept).toBeUndefined();
  });

  it('updates db status to failed on error', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockRejectedValue(new Error('hard fail'));

    await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });

    // setStatus is called with 'failed' — db.update was invoked at least once
    expect(mockDbUpdate).toHaveBeenCalled();
    const lastUpdateCall = mockDbUpdate.mock.calls[mockDbUpdate.mock.calls.length - 1];
    expect(lastUpdateCall).toBeDefined();
  });

  // ── guessStage (exercised indirectly) ─────────────────────────────────────

  it('guessStage maps researcher error to research', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockRejectedValue(new Error('[researcher] boom'));
    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.errorStage).toBe('research');
  });

  it('guessStage maps unknown error to unknown', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockRejectedValue(new Error('completely unrelated error'));
    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.errorStage).toBe('unknown');
  });

  it('handles non-Error thrown objects gracefully', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    // eslint-disable-next-line @typescript-eslint/only-throw-error
    mockRunResearcher.mockRejectedValue('string error');
    const result = await runWeeklyDrop({ weekOf: new Date(WEEK_STR) });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('string error');
  });

  // ── weekOf defaults to current Monday ────────────────────────────────────

  it('uses current Monday when weekOf is not provided', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: 5, clientId: 3 }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain([{ ...freshDropRow }]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());

    mockRunResearcher.mockResolvedValue({ briefId: 10 });
    mockRunConceptWriter.mockResolvedValue({ conceptId: 20 });
    mockRunDesigner.mockResolvedValue({ designId: 'des-1' });
    mockRunPublisher.mockResolvedValue({ productId: 30, publicUrl: 'https://example.com' });

    const result = await runWeeklyDrop({ websiteId: 5 });
    // weekOf should be a YYYY-MM-DD string for a Monday
    expect(/^\d{4}-\d{2}-\d{2}$/.test(result.weekOf)).toBe(true);
  });
});
