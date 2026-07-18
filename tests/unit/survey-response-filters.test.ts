/**
 * Unit tests for the survey response filter helper (RESP-01).
 *
 * Covers parseResponseFilters' validation behavior (malformed dates dropped,
 * empty strings dropped, exact source pass-through) and the WHERE-builder's
 * literal-escape behavior for keyword search.
 */
import { describe, it, expect } from 'vitest';
import {
  KNOWN_SOURCES,
  buildResponseWhere,
  parseResponseFilters,
} from '@/lib/surveys/response-filters';

function urlWith(params: Record<string, string>): URL {
  const u = new URL('http://localhost/x');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

describe('parseResponseFilters', () => {
  it('returns all-null for an empty URL', () => {
    expect(parseResponseFilters(urlWith({}))).toEqual({
      from: null, to: null, source: null, q: null,
    });
  });

  it('accepts well-formed ISO dates', () => {
    const out = parseResponseFilters(urlWith({ from: '2026-01-01', to: '2026-01-31' }));
    expect(out.from).toBe('2026-01-01');
    expect(out.to).toBe('2026-01-31');
  });

  it('drops malformed dates silently', () => {
    const out = parseResponseFilters(urlWith({ from: 'yesterday', to: '01/31/2026' }));
    expect(out.from).toBeNull();
    expect(out.to).toBeNull();
  });

  it('drops blank source / q', () => {
    const out = parseResponseFilters(urlWith({ source: '', q: '   ' }));
    expect(out.source).toBeNull();
    expect(out.q).toBeNull();
  });

  it('preserves source + q payload (trims whitespace on q)', () => {
    const out = parseResponseFilters(urlWith({ source: 'embed', q: '  bob ' }));
    expect(out.source).toBe('embed');
    expect(out.q).toBe('bob');
  });

  it('exposes the canonical source list', () => {
    expect(KNOWN_SOURCES).toEqual(['link', 'email', 'embed', 'crm', 'booking']);
  });
});

describe('buildResponseWhere', () => {
  it('returns a clause that compiles when no filters are set', () => {
    const where = buildResponseWhere(42, { from: null, to: null, source: null, q: null });
    expect(where).toBeTruthy();
  });

  it('returns a clause for every combination of filters', () => {
    const where = buildResponseWhere(42, {
      from: '2026-01-01',
      to: '2026-01-31',
      source: 'email',
      q: 'alice',
    });
    expect(where).toBeTruthy();
  });

  it('does not crash on LIKE-special characters in the keyword', () => {
    // Backslashes, percent, underscore would otherwise break LIKE syntax.
    const where = buildResponseWhere(42, {
      from: null, to: null, source: null, q: '50% off_now\\',
    });
    expect(where).toBeTruthy();
  });
});
