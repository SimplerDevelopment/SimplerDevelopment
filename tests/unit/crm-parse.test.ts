/**
 * Unit tests for the pure parsing helpers in lib/crm/parse.ts. Covers
 * the contact-upsert and brain-classification paths' shared name + domain
 * normalization logic.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDisplayName,
  normalizeDomain,
  domainFromEmail,
  capitalize,
  isPersonalDomain,
} from '@/lib/crm/parse';

describe('parseDisplayName — display name present', () => {
  it('splits "Jane Doe <email>" into first/last', () => {
    expect(parseDisplayName('Jane Doe <jane@x.com>', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('strips surrounding quotes from the display name', () => {
    expect(parseDisplayName('"Jane Doe" <jane@x.com>', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('handles multi-word last names', () => {
    expect(parseDisplayName('Jane Mary Doe', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Mary Doe',
    });
  });

  it('returns null lastName when only one token', () => {
    expect(parseDisplayName('Jane', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: null,
    });
  });

  it('collapses multiple whitespace runs', () => {
    expect(parseDisplayName('  Jane    Doe  ', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('caps firstName at 100 chars', () => {
    const long = 'a'.repeat(150);
    const result = parseDisplayName(long, 'a@x.com');
    expect(result.firstName).toHaveLength(100);
  });

  it('caps lastName at 100 chars', () => {
    const long = 'a'.repeat(150);
    const result = parseDisplayName(`First ${long}`, 'a@x.com');
    expect(result.lastName).toHaveLength(100);
  });
});

describe('parseDisplayName — fallback to email local-part', () => {
  it('uses email local-part when raw is undefined', () => {
    expect(parseDisplayName(undefined, 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: null,
    });
  });

  it('uses email local-part when raw is empty string', () => {
    expect(parseDisplayName('', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: null,
    });
  });

  it('falls back when raw equals the email (case-insensitive)', () => {
    expect(parseDisplayName('JANE@x.com', 'jane@x.com')).toEqual({
      firstName: 'Jane',
      lastName: null,
    });
  });

  it('splits local-part on dot into first + last', () => {
    expect(parseDisplayName(undefined, 'jane.doe@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('splits local-part on underscore into first + last', () => {
    expect(parseDisplayName(undefined, 'jane_doe@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('splits local-part on hyphen into first + last', () => {
    expect(parseDisplayName(undefined, 'jane-doe@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('joins 3+ local-part tokens into a single lastName', () => {
    expect(parseDisplayName(undefined, 'jane.mary.doe@x.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Mary doe',
    });
  });

  it('falls back to "Unknown" when both raw and email are empty', () => {
    // fallback chain: localPart || email || 'Unknown' — both empty triggers
    // the literal default.
    expect(parseDisplayName(undefined, '')).toEqual({
      firstName: 'Unknown',
      lastName: null,
    });
  });

  it('preserves a leading @ when email has no local-part but a domain', () => {
    // For email='@nowhere.test': localPart='' so fallback=email itself.
    // The split on /[._-]+/ then runs over '@nowhere.test'.
    const result = parseDisplayName(undefined, '@nowhere.test');
    expect(result.firstName.length).toBeGreaterThan(0);
    // Tokenization across '.' / '_' / '-' separators is documented behavior;
    // we don't pin the exact slicing — just that no exception escapes.
  });
});

describe('normalizeDomain', () => {
  it('returns an empty string for empty input', () => {
    expect(normalizeDomain('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeDomain('   ')).toBe('');
  });

  it('lowercases mixed-case input', () => {
    expect(normalizeDomain('Example.COM')).toBe('example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com');
  });

  it('strips https:// protocol', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com');
  });

  it('strips http:// protocol', () => {
    expect(normalizeDomain('http://example.com')).toBe('example.com');
  });

  it('drops the path portion', () => {
    expect(normalizeDomain('example.com/path/to/thing')).toBe('example.com');
  });

  it('strips a www. prefix', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
  });

  it('handles protocol + www + path together', () => {
    expect(normalizeDomain('https://www.example.com/some/path')).toBe('example.com');
  });
});

describe('domainFromEmail', () => {
  it('returns the domain portion of a valid email', () => {
    expect(domainFromEmail('jane@acme.com')).toBe('acme.com');
  });

  it('normalizes the extracted domain (www, casing)', () => {
    expect(domainFromEmail('jane@WWW.Acme.com')).toBe('acme.com');
  });

  it('returns empty string when there is no @', () => {
    expect(domainFromEmail('no-at-here.com')).toBe('');
  });

  it('returns empty string when domain part contains a second @ (malformed)', () => {
    expect(domainFromEmail('double@@signs.com')).toBe('');
  });

  it('returns empty string when the email ends at the @ (no domain)', () => {
    expect(domainFromEmail('jane@')).toBe('');
  });
});

describe('capitalize', () => {
  it('uppercases the first character', () => {
    expect(capitalize('abc')).toBe('Abc');
  });

  it('leaves an already-capitalized string unchanged', () => {
    expect(capitalize('Abc')).toBe('Abc');
  });

  it('does not lowercase trailing characters', () => {
    expect(capitalize('ABC')).toBe('ABC');
  });

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('isPersonalDomain', () => {
  it.each([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'ymail.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'aol.com',
    'protonmail.com',
    'proton.me',
    'pm.me',
    'fastmail.com',
    'zoho.com',
  ])('flags %s as personal', (domain) => {
    expect(isPersonalDomain(domain)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPersonalDomain('GMAIL.COM')).toBe(true);
  });

  it.each(['acme.com', 'simplerdevelopment.com', 'startup.io', 'example.org'])(
    'does NOT flag %s as personal',
    (domain) => {
      expect(isPersonalDomain(domain)).toBe(false);
    },
  );

  it('returns false for an empty string', () => {
    expect(isPersonalDomain('')).toBe(false);
  });
});
