// @vitest-environment node
/**
 * Unit tests for lib/feature-flags.ts — the per-client beta gate registry
 * (PUX-135). Pure functions, no DB/auth involved, so no mocking is needed.
 */
import { describe, it, expect } from 'vitest';
import { hasFlag, activeFlags, staleFlags, isFlagKey, STALE_AFTER_DAYS } from '@/lib/feature-flags';

describe('lib/feature-flags.ts', () => {
  describe('isFlagKey', () => {
    it('returns true for a real registry key', () => {
      expect(isFlagKey('portal-redesign')).toBe(true);
    });

    it('returns false for an unknown string', () => {
      expect(isFlagKey('nope')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isFlagKey(undefined)).toBe(false);
      expect(isFlagKey(42)).toBe(false);
      expect(isFlagKey(null)).toBe(false);
    });
  });

  describe('hasFlag', () => {
    it('returns true when the key is present in the client column', () => {
      expect(hasFlag({ featureFlags: ['portal-redesign'] }, 'portal-redesign')).toBe(true);
    });

    it('returns false when the key is absent from the client column', () => {
      expect(hasFlag({ featureFlags: [] }, 'portal-redesign')).toBe(false);
    });

    it('returns false for a null client', () => {
      expect(hasFlag(null, 'portal-redesign')).toBe(false);
    });

    it('returns false for an undefined client', () => {
      expect(hasFlag(undefined, 'portal-redesign')).toBe(false);
    });

    it('returns false when featureFlags itself is null (defensive against a stale row)', () => {
      expect(hasFlag({ featureFlags: null }, 'portal-redesign')).toBe(false);
    });

    it('ignores unknown extra strings sitting alongside a real key', () => {
      expect(hasFlag({ featureFlags: ['some-deleted-flag', 'portal-redesign'] }, 'portal-redesign')).toBe(true);
      expect(hasFlag({ featureFlags: ['some-deleted-flag'] }, 'portal-redesign')).toBe(false);
    });
  });

  describe('activeFlags', () => {
    it('returns only the keys present on the client', () => {
      expect(activeFlags({ featureFlags: ['portal-redesign'] })).toEqual(['portal-redesign']);
    });

    it('returns an empty list for a client with no flags', () => {
      expect(activeFlags({ featureFlags: [] })).toEqual([]);
    });

    it('returns an empty list for a null client', () => {
      expect(activeFlags(null)).toEqual([]);
    });
  });

  describe('staleFlags', () => {
    // 'portal-redesign' has since: '2026-08-27', defaultOn: false in the real registry.
    it('is not stale when `now` is well within STALE_AFTER_DAYS of `since`', () => {
      const now = new Date('2026-09-06T00:00:00.000Z'); // +10 days
      const stale = staleFlags(now);
      expect(stale.find((s) => s.key === 'portal-redesign')).toBeUndefined();
    });

    it('is stale when `now` is more than STALE_AFTER_DAYS past `since`', () => {
      const now = new Date('2026-10-27T00:00:00.000Z'); // +61 days
      const stale = staleFlags(now);
      const entry = stale.find((s) => s.key === 'portal-redesign');
      expect(entry).toBeDefined();
      expect(entry!.reason).toMatch(/61 days old/);
      expect(entry!.reason).toContain(`> ${STALE_AFTER_DAYS}`);
    });

    it('flags exactly STALE_AFTER_DAYS old as not-yet-stale (strict > boundary)', () => {
      const now = new Date('2026-08-27T00:00:00.000Z');
      now.setDate(now.getDate() + STALE_AFTER_DAYS);
      const stale = staleFlags(now);
      expect(stale.find((s) => s.key === 'portal-redesign')).toBeUndefined();
    });
  });
});
