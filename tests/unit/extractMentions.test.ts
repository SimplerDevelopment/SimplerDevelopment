import { describe, it, expect } from 'vitest';
import { extractMentions } from '@/lib/crm/extract-mentions';

describe('extractMentions', () => {
  it('returns empty array on empty / non-string input', () => {
    expect(extractMentions('')).toEqual([]);
    // @ts-expect-error — runtime guard
    expect(extractMentions(null)).toEqual([]);
    // @ts-expect-error — runtime guard
    expect(extractMentions(undefined)).toEqual([]);
  });

  it('parses a single well-formed mention', () => {
    expect(extractMentions('Hello @[Dan](42)!')).toEqual([42]);
  });

  it('parses multiple distinct mentions in occurrence order', () => {
    expect(extractMentions('@[A](1) and @[B](2) plus @[C](3)')).toEqual([1, 2, 3]);
  });

  it('deduplicates repeated user IDs', () => {
    expect(extractMentions('@[A](7) and again @[A](7) and @[A again](7)')).toEqual([7]);
  });

  it('ignores malformed mentions (no parens, empty id, non-numeric id)', () => {
    expect(extractMentions('@John no parens')).toEqual([]);
    expect(extractMentions('@[John] no id')).toEqual([]);
    expect(extractMentions('@[John]() empty id')).toEqual([]);
    expect(extractMentions('@[John](abc) non-numeric')).toEqual([]);
  });

  it('rejects zero or negative IDs', () => {
    expect(extractMentions('@[Bot](0)')).toEqual([]);
  });

  it('handles mixed valid and invalid tokens', () => {
    const body = 'Hi @John, also @[Sue](5) and @[Bob](abc) and @[Sue](5)';
    expect(extractMentions(body)).toEqual([5]);
  });
});
