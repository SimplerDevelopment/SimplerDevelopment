// @vitest-environment node
/**
 * Unit tests for the pure path/slug helpers in lib/brain/topics.ts.
 *
 * The DB-bound mutations (createTopic / moveTopic / mergeTopic / deleteTopic /
 * importTopicsFromTags) are exercised against a real Postgres in
 * tests/integration/api/brain/topics.test.ts. This file covers only the
 * pure-string derivation that doesn't touch the DB.
 */
import { describe, it, expect, vi } from 'vitest';

// The module imports `@/lib/db` at the top level for the DB-bound helpers.
// Stub it so we can import the pure `deriveSlug` export without booting
// a real connection.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  brainTopics: {},
  brainEntityTopics: {},
  brainAuditLogs: {},
  brainNotes: {},
  brainMeetings: {},
  brainTasks: {},
  brainDecisions: {},
  brainRelationshipOverlays: {},
}));
vi.mock('@/lib/brain/audit', () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

const { deriveSlug } = await import('@/lib/brain/topics');

describe('deriveSlug', () => {
  it('lowercases and replaces non-alphanumerics with dashes', () => {
    expect(deriveSlug('Hello World')).toBe('hello-world');
    expect(deriveSlug('Marketing / SEO')).toBe('marketing-seo');
    expect(deriveSlug('Operations & Hiring')).toBe('operations-hiring');
  });

  it('collapses runs of non-alphanumerics into a single dash', () => {
    expect(deriveSlug('foo!!!bar')).toBe('foo-bar');
    expect(deriveSlug('a   b   c')).toBe('a-b-c');
  });

  it('trims leading and trailing dashes', () => {
    expect(deriveSlug('  --hello--  ')).toBe('hello');
    expect(deriveSlug('!!foo!!')).toBe('foo');
  });

  it('falls back to "topic" for empty / pure-punctuation names', () => {
    expect(deriveSlug('')).toBe('topic');
    expect(deriveSlug('   ')).toBe('topic');
    expect(deriveSlug('!!!')).toBe('topic');
  });

  it('preserves digits', () => {
    expect(deriveSlug('Q4 Planning 2026')).toBe('q4-planning-2026');
  });

  it('truncates at 150 chars (matches column length)', () => {
    const long = 'a'.repeat(300);
    expect(deriveSlug(long).length).toBeLessThanOrEqual(150);
  });

  it('unicode collapses to dashes (slug stays ASCII-safe)', () => {
    // Non-[a-z0-9] (including any unicode letters) → dashes. The fallback
    // kicks in if the entire input collapses to empty.
    expect(deriveSlug('日本語')).toBe('topic');
    expect(deriveSlug('café')).toBe('cafe');  // é normalized to "e" via NFKD diacritic strip (canonical slugify)
  });
});
