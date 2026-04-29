// @vitest-environment node
/**
 * Unit tests for the pure helpers in lib/crm/contacts.ts and lib/crm/companies.ts.
 * The DB-touching paths (upsertContactByEmail, findCompanyByDomain) require a
 * live Postgres and are exercised at the integration layer; these tests cover
 * just the parsing logic.
 */
import { describe, it, expect } from 'vitest';
import { parseDisplayName, normalizeDomain, domainFromEmail, isPersonalDomain } from '@/lib/crm/parse';

describe('parseDisplayName', () => {
  it('parses "First Last" form', () => {
    expect(parseDisplayName('Jane Doe', 'jane@acme.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('parses "First Middle Last" — middle and last collapse into lastName', () => {
    expect(parseDisplayName('Mary Jane Doe', 'mjd@acme.com')).toEqual({
      firstName: 'Mary',
      lastName: 'Jane Doe',
    });
  });

  it('strips angle-bracket email from "Name <email>" form', () => {
    expect(parseDisplayName('Jane Doe <jane@acme.com>', 'jane@acme.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('strips surrounding quotes', () => {
    expect(parseDisplayName('"Jane Doe"', 'jane@acme.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('falls back to dotted email local-part when no display name', () => {
    expect(parseDisplayName(undefined, 'jane.doe@acme.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('falls back to underscore-separated local-part', () => {
    expect(parseDisplayName('', 'jane_doe@acme.com')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('falls back to single-name local-part with null lastName', () => {
    expect(parseDisplayName(undefined, 'support@acme.com')).toEqual({
      firstName: 'Support',
      lastName: null,
    });
  });

  it('handles display name that is just the email (returns local-part)', () => {
    expect(parseDisplayName('jane@acme.com', 'jane@acme.com')).toEqual({
      firstName: 'Jane',
      lastName: null,
    });
  });

  it('caps firstName/lastName at 100 chars (matches schema varchar(100))', () => {
    const long = 'A'.repeat(150);
    const r = parseDisplayName(long, 'a@x.com');
    expect(r.firstName.length).toBe(100);
  });

  it('survives an empty email gracefully', () => {
    const r = parseDisplayName(undefined, '');
    expect(r.firstName).toBe('Unknown');
  });
});

describe('normalizeDomain', () => {
  it.each([
    ['acme.com', 'acme.com'],
    ['ACME.com', 'acme.com'],
    ['www.acme.com', 'acme.com'],
    ['https://acme.com', 'acme.com'],
    ['https://www.acme.com/', 'acme.com'],
    ['http://www.acme.com/path/to/x', 'acme.com'],
    ['  acme.com  ', 'acme.com'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe('domainFromEmail', () => {
  it.each([
    ['jane@acme.com', 'acme.com'],
    ['jane@WWW.ACME.com', 'acme.com'],
    ['JANE@acme.com', 'acme.com'],
    ['no-at-sign', ''],
    ['', ''],
    ['multiple@@signs.com', ''],   // malformed: domain part contains another @
  ])('%s → %s', (input, expected) => {
    expect(domainFromEmail(input)).toBe(expected);
  });
});

describe('isPersonalDomain', () => {
  it.each([
    ['gmail.com', true],
    ['GMAIL.COM', true],
    ['yahoo.com', true],
    ['outlook.com', true],
    ['icloud.com', true],
    ['acme.com', false],
    ['mycompany.io', false],
    ['', false],
  ])('%s → %s', (input, expected) => {
    expect(isPersonalDomain(input)).toBe(expected);
  });
});
