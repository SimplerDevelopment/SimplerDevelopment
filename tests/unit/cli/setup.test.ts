import { describe, it, expect } from 'vitest';
import {
  parseEnv,
  hasValue,
  mergeEnv,
  planSecrets,
  generateSecret,
  detectPath,
  isDbPlaceholder,
  MANAGED_SECRETS,
} from '../../../packages/cli/src/commands/setup.js';

describe('hasValue', () => {
  it('treats empty/whitespace/undefined as unset', () => {
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue('')).toBe(false);
    expect(hasValue('   ')).toBe(false);
    expect(hasValue('x')).toBe(true);
  });
});

describe('parseEnv', () => {
  it('parses KEY=value lines and ignores comments/blanks', () => {
    const m = parseEnv('# comment\n\nA=1\nB = two \n# B=nope\nC=');
    expect(m.get('A')).toBe('1');
    expect(m.get('B')).toBe('two');
    expect(m.get('C')).toBe('');
    expect(m.has('# comment')).toBe(false);
  });
});

describe('mergeEnv', () => {
  it('fills a blank key in place without touching comments/order', () => {
    const { text, applied } = mergeEnv('# hdr\nAUTH_SECRET=\nOTHER=keep', {
      AUTH_SECRET: { value: 'gen' },
    });
    expect(text).toBe('# hdr\nAUTH_SECRET=gen\nOTHER=keep');
    expect(applied).toEqual(['AUTH_SECRET']);
  });

  it('never clobbers a real existing value', () => {
    const { text, applied } = mergeEnv('AUTH_SECRET=real', { AUTH_SECRET: { value: 'gen' } });
    expect(text).toBe('AUTH_SECRET=real');
    expect(applied).toEqual([]);
  });

  it('overwrites a value matching its placeholderTest', () => {
    const { applied } = mergeEnv('DATABASE_URL=postgresql://user:password@localhost:5432/simplerdev', {
      DATABASE_URL: { value: 'real-url', placeholderTest: isDbPlaceholder },
    });
    expect(applied).toEqual(['DATABASE_URL']);
  });

  it('appends missing keys under a marker comment', () => {
    const { text, applied } = mergeEnv('A=1', { NEW: { value: 'v' } });
    expect(applied).toEqual(['NEW']);
    expect(text).toContain('# ── Added by `simpler setup` ──');
    expect(text).toContain('NEW=v');
  });
});

describe('planSecrets', () => {
  it('returns every managed secret when none are set', () => {
    expect(planSecrets(new Map())).toEqual(Object.keys(MANAGED_SECRETS));
  });

  it('omits secrets that already have a value', () => {
    const plan = planSecrets(new Map([['AUTH_SECRET', 'x']]));
    expect(plan).not.toContain('AUTH_SECRET');
    expect(plan).toContain('CRON_SECRET');
  });
});

describe('generateSecret', () => {
  it('produces 32-byte hex (64 chars) and base64 (44 chars)', () => {
    expect(generateSecret('hex')).toMatch(/^[0-9a-f]{64}$/);
    const b64 = generateSecret('base64');
    expect(b64).toHaveLength(44);
    expect(Buffer.from(b64, 'base64')).toHaveLength(32);
  });

  it('is non-deterministic', () => {
    expect(generateSecret('hex')).not.toBe(generateSecret('hex'));
  });
});

describe('detectPath', () => {
  it('honors explicit flags', () => {
    expect(detectPath({ docker: true }, { dockerRunning: false })).toBe('docker');
    expect(detectPath({ local: true }, { dockerRunning: true })).toBe('local');
  });

  it('defaults to docker only when the daemon is running', () => {
    expect(detectPath({}, { dockerRunning: true })).toBe('docker');
    expect(detectPath({}, { dockerRunning: false })).toBe('local');
  });

  it('rejects passing both --docker and --local', () => {
    expect(() => detectPath({ docker: true, local: true }, { dockerRunning: false })).toThrow();
  });
});
