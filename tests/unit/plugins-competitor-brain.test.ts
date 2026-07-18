// @vitest-environment node
/**
 * Unit tests for `lib/plugins/handlers/content-tools/competitor-brain.ts`:
 *
 *   - getBrainCardIdForCompetitor: pure slug→cardId lookup.
 *   - ingestBriefAsBrainNote: inserts the right shape into brain_notes.
 *   - maybePostVulnerabilityChangeComment: silent on no-prior, no-change,
 *     non-deep depth; posts a comment on score movement; skips when no
 *     mapped card exists for the slug.
 *
 * DB is mocked end-to-end. The bot-user lookup is mocked via the
 * `tools-bot@simplerdevelopment.com` row returning id=999.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = {
  insert: vi.fn(),
  select: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/db/schema/auth', () => ({ users: { _t: 'users' } }));
vi.mock('@/lib/db/schema/brain', () => ({ brainNotes: { _t: 'brainNotes' } }));
vi.mock('@/lib/db/schema/pm', () => ({
  kanbanCards: { _t: 'kanbanCards' },
  kanbanCardComments: { _t: 'kanbanCardComments' },
}));
vi.mock('@/lib/db/schema/plugins', () => ({
  contentBriefs: { _t: 'contentBriefs', clientId: { _c: 'clientId' }, meta: { _c: 'meta' }, id: { _c: 'id' } },
}));

const {
  getBrainCardIdForCompetitor,
  ingestBriefAsBrainNote,
  maybePostVulnerabilityChangeComment,
  __resetBotUserIdCache,
} = await import('@/lib/plugins/handlers/content-tools/competitor-brain');

const BOT_USER_ID = 999;

function mockBotUserLookup(found = true): void {
  // First select() call is the bot-user lookup.
  const limit = vi.fn().mockResolvedValue(found ? [{ id: BOT_USER_ID }] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

function mockSimpleInsertReturning(returnedRows: Array<{ id: number }>): void {
  const returning = vi.fn().mockResolvedValue(returnedRows);
  const values = vi.fn().mockReturnValue({ returning });
  dbMock.insert.mockReturnValueOnce({ values });
}

function mockPriorBriefSelect(
  rows: Array<{ id: number; meta: Record<string, unknown> }>,
): void {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValueOnce({ from });
}

beforeEach(() => {
  dbMock.insert.mockReset();
  dbMock.select.mockReset();
  __resetBotUserIdCache();
});

// ─── getBrainCardIdForCompetitor ──────────────────────────────────────────

describe('getBrainCardIdForCompetitor', () => {
  it('maps known competitor slugs to their BRAIN card ids', () => {
    expect(getBrainCardIdForCompetitor('rhb')).toBe(146);
    expect(getBrainCardIdForCompetitor('carnegie')).toBe(144);
    expect(getBrainCardIdForCompetitor('waybetter')).toBe(147);
    expect(getBrainCardIdForCompetitor('human-capital')).toBe(148);
  });

  it('returns null for an unknown slug', () => {
    expect(getBrainCardIdForCompetitor('enrollmentfuel')).toBeNull();
    expect(getBrainCardIdForCompetitor('')).toBeNull();
    expect(getBrainCardIdForCompetitor('SIG')).toBeNull();
  });
});

// ─── ingestBriefAsBrainNote ───────────────────────────────────────────────

describe('ingestBriefAsBrainNote', () => {
  it('inserts a brain_notes row with tagged competitor + monitor depth and returns the id', async () => {
    mockBotUserLookup(true);
    mockSimpleInsertReturning([{ id: 5001 }]);

    const id = await ingestBriefAsBrainNote({
      clientId: 100,
      briefId: 42,
      competitorSlug: 'rhb',
      depth: 'deep',
      topic: 'Competitor monitor: rhb (deep)',
      body: 'TL;DR — RHB is still being absorbed by SIG.\n\n## ...',
    });

    expect(id).toBe(5001);
    // The insert builder mock captured the values payload.
    const insertCall = dbMock.insert.mock.results[0]?.value;
    const valuesCall = insertCall.values.mock.calls[0]?.[0];
    expect(valuesCall.clientId).toBe(100);
    expect(valuesCall.title).toMatch(/Competitor monitor: rhb \(deep\)/);
    expect(valuesCall.tags).toEqual(['competitor:rhb', 'monitor:deep']);
    expect(valuesCall.source).toBe('plugin-content-tools');
    expect(valuesCall.sourceUrl).toBe('plugin-content-tools://briefs/42');
    expect(valuesCall.createdBy).toBe(BOT_USER_ID);
  });

  it('returns null if the insert throws', async () => {
    mockBotUserLookup(true);
    const returning = vi.fn().mockRejectedValue(new Error('boom'));
    const values = vi.fn().mockReturnValue({ returning });
    dbMock.insert.mockReturnValueOnce({ values });

    const id = await ingestBriefAsBrainNote({
      clientId: 100,
      briefId: 1,
      competitorSlug: 'rhb',
      depth: 'news',
      topic: 't',
      body: 'b',
    });

    expect(id).toBeNull();
  });

  it('still inserts with createdBy=null when the bot user is missing', async () => {
    mockBotUserLookup(false);
    mockSimpleInsertReturning([{ id: 1 }]);

    await ingestBriefAsBrainNote({
      clientId: 100,
      briefId: 1,
      competitorSlug: 'rhb',
      depth: 'news',
      topic: 't',
      body: 'b',
    });

    const valuesCall = dbMock.insert.mock.results[0]?.value.values.mock.calls[0]?.[0];
    expect(valuesCall.createdBy).toBeNull();
  });
});

// ─── maybePostVulnerabilityChangeComment ──────────────────────────────────

describe('maybePostVulnerabilityChangeComment', () => {
  it('returns null when depth is not "deep" (news-mode is silent)', async () => {
    const result = await maybePostVulnerabilityChangeComment({
      clientId: 100,
      newBriefId: 10,
      competitorSlug: 'rhb',
      depth: 'news',
      newVulnerability: { score: 'HIGH' },
    });
    expect(result).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('returns null when no vulnerability is supplied', async () => {
    const result = await maybePostVulnerabilityChangeComment({
      clientId: 100,
      newBriefId: 10,
      competitorSlug: 'rhb',
      depth: 'deep',
      newVulnerability: undefined,
    });
    expect(result).toBeNull();
  });

  it('returns null for an unmapped competitor slug', async () => {
    const result = await maybePostVulnerabilityChangeComment({
      clientId: 100,
      newBriefId: 10,
      competitorSlug: 'enrollmentfuel',
      depth: 'deep',
      newVulnerability: { score: 'HIGH' },
    });
    expect(result).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('returns null on the FIRST deep-dive (no prior brief to compare)', async () => {
    mockPriorBriefSelect([]); // no prior

    const result = await maybePostVulnerabilityChangeComment({
      clientId: 100,
      newBriefId: 10,
      competitorSlug: 'rhb',
      depth: 'deep',
      newVulnerability: { score: 'HIGH' },
    });

    expect(result).toBeNull();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('returns null on UNCHANGED score', async () => {
    mockPriorBriefSelect([
      { id: 5, meta: { vulnerability: { score: 'HIGH', rationale: 'r' } } },
    ]);

    const result = await maybePostVulnerabilityChangeComment({
      clientId: 100,
      newBriefId: 10,
      competitorSlug: 'rhb',
      depth: 'deep',
      newVulnerability: { score: 'HIGH' },
    });

    expect(result).toBeNull();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('posts a kanban_card_comments row when the score moves', async () => {
    mockPriorBriefSelect([
      { id: 5, meta: { vulnerability: { score: 'HIGH' } } },
    ]);
    mockBotUserLookup(true);
    mockSimpleInsertReturning([{ id: 8888 }]);

    const result = await maybePostVulnerabilityChangeComment({
      clientId: 100,
      newBriefId: 10,
      competitorSlug: 'rhb',
      depth: 'deep',
      newVulnerability: { score: 'MED', rationale: 'PE pressure easing.' },
    });

    expect(result).not.toBeNull();
    expect(result!.change).toEqual({ fromScore: 'HIGH', toScore: 'MED' });
    expect(result!.commentId).toBe(8888);

    const insertCall = dbMock.insert.mock.results[0]?.value;
    const valuesCall = insertCall.values.mock.calls[0]?.[0];
    expect(valuesCall.cardId).toBe(146); // BRAIN-6 / rhb
    expect(valuesCall.userId).toBe(BOT_USER_ID);
    expect(valuesCall.body).toMatch(/HIGH → MED/);
    expect(valuesCall.body).toMatch(/less vulnerable/);
    expect(valuesCall.body).toMatch(/PE pressure easing/);
  });
});
