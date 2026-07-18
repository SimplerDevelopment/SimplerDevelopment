// @vitest-environment node
/**
 * Unit tests for the pure `parseWikiLinks` regex parser in
 * lib/brain/extract-wikilinks.ts. The DB-syncing `extractAndSyncWikiLinks`
 * is exercised at the integration layer — only the JSON parse path lives
 * here.
 */
import { describe, it, expect, vi } from 'vitest';

// `extract-wikilinks.ts` imports `@/lib/db` at module load (used only by the
// async DB sync helper). Stub so the unit suite can import the pure export.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  brainNotes: {},
  brainKbLinks: {},
}));

const { parseWikiLinks } = await import('@/lib/brain/extract-wikilinks');

describe('parseWikiLinks', () => {
  it('returns empty array for empty body', () => {
    expect(parseWikiLinks('')).toEqual([]);
  });

  it('returns empty array for body with no links', () => {
    expect(parseWikiLinks('plain text with no links here')).toEqual([]);
  });

  it('parses a single [[Title]] wikilink with no anchor or alias', () => {
    const out = parseWikiLinks('see [[Acme Co]] for context');
    expect(out).toEqual([
      {
        rawTarget: 'Acme Co',
        anchor: null,
        displayText: null,
        linkType: 'wikilink',
      },
    ]);
  });

  it('parses [[Title|alias]] with display text', () => {
    const out = parseWikiLinks('see [[Acme Co|the client]]');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      rawTarget: 'Acme Co',
      anchor: null,
      displayText: 'the client',
      linkType: 'wikilink',
    });
  });

  it('parses [[Title#anchor]] with anchor only', () => {
    const out = parseWikiLinks('jump to [[Spec#Section 2]]');
    expect(out[0]).toMatchObject({
      rawTarget: 'Spec',
      anchor: 'Section 2',
      displayText: null,
      linkType: 'wikilink',
    });
  });

  it('parses [[Title#anchor|alias]] with both anchor and alias', () => {
    const out = parseWikiLinks('see [[Spec#Section 2|the spec]]');
    expect(out[0]).toMatchObject({
      rawTarget: 'Spec',
      anchor: 'Section 2',
      displayText: 'the spec',
      linkType: 'wikilink',
    });
  });

  it('parses ![[Title]] as embed (linkType=embed)', () => {
    const out = parseWikiLinks('embed: ![[Cover Image]]');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      rawTarget: 'Cover Image',
      linkType: 'embed',
    });
  });

  it('preserves order of multiple links in one body', () => {
    const out = parseWikiLinks('first [[Alpha]] then [[Bravo]] last [[Charlie]]');
    expect(out.map((l) => l.rawTarget)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('skips empty wikilinks like [[]] and [[ | alias]]', () => {
    // The regex only matches `[[...]]` with at least one inner char (`[^\]]+`).
    // After stripping the alias, an empty target is filtered out by the
    // `if (target.length > 0)` guard.
    const out = parseWikiLinks('empty [[]] and [[ | only-alias ]]');
    expect(out).toEqual([]);
  });

  it('skips malformed [[unclosed wikilinks gracefully', () => {
    const out = parseWikiLinks('this is [[unclosed and trailing text');
    expect(out).toEqual([]);
  });

  it('parses links across multiline bodies', () => {
    const body = 'line one [[A]]\nline two [[B|second]]\nline three';
    const out = parseWikiLinks(body);
    expect(out.map((l) => l.rawTarget)).toEqual(['A', 'B']);
    expect(out[1]?.displayText).toBe('second');
  });

  it('parses wikilinks inside code-block fences (current behavior — no skip)', () => {
    // Pinning behavior: the parser does NOT special-case ``` fences. Wikilinks
    // inside code blocks are extracted just like everywhere else. If we ever
    // want to skip them, this test will need updating — that's intentional.
    const body = '```\ncode [[InsideFence]]\n```';
    const out = parseWikiLinks(body);
    expect(out).toEqual([
      {
        rawTarget: 'InsideFence',
        anchor: null,
        displayText: null,
        linkType: 'wikilink',
      },
    ]);
  });

  it('trims whitespace inside the link target, anchor, and alias', () => {
    const out = parseWikiLinks('[[  Spaced Title  #  anchor  |  display  ]]');
    expect(out[0]).toMatchObject({
      rawTarget: 'Spaced Title',
      anchor: 'anchor',
      displayText: 'display',
    });
  });

  it('treats the first | as the alias separator (greedy left-side target)', () => {
    const out = parseWikiLinks('[[A|B|C]]');
    expect(out[0]).toMatchObject({
      rawTarget: 'A',
      displayText: 'B|C',
    });
  });

  it('treats the first # as the anchor separator', () => {
    const out = parseWikiLinks('[[Page#first#second]]');
    expect(out[0]).toMatchObject({
      rawTarget: 'Page',
      anchor: 'first#second',
    });
  });

  it('handles mixed embeds and wikilinks in one body and tags linkType correctly', () => {
    const out = parseWikiLinks('text ![[Image]] and [[Page]]');
    expect(out).toEqual([
      { rawTarget: 'Image', anchor: null, displayText: null, linkType: 'embed' },
      { rawTarget: 'Page', anchor: null, displayText: null, linkType: 'wikilink' },
    ]);
  });
});
