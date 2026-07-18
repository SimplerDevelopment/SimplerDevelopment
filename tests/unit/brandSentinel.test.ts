import { describe, it, expect } from 'vitest';
import {
  isBrandSentinel,
  resolveBrandSentinel,
  getSentinelLabel,
  getSentinelDef,
  listSentinels,
  BRAND_SENTINELS,
} from '@/lib/branding/sentinel';

describe('brand sentinel system', () => {
  describe('isBrandSentinel', () => {
    it('recognizes valid sentinels', () => {
      expect(isBrandSentinel('brand.primary')).toBe(true);
      expect(isBrandSentinel('brand.accent')).toBe(true);
      expect(isBrandSentinel('brand.headingFont')).toBe(true);
      expect(isBrandSentinel('brand.btnRadius')).toBe(true);
    });

    it('rejects non-sentinel values', () => {
      expect(isBrandSentinel('#ff0000')).toBe(false);
      expect(isBrandSentinel('rgb(255, 0, 0)')).toBe(false);
      expect(isBrandSentinel('brand.madeUp')).toBe(false);
      expect(isBrandSentinel('')).toBe(false);
      expect(isBrandSentinel(undefined)).toBe(false);
      expect(isBrandSentinel(null)).toBe(false);
      expect(isBrandSentinel(42)).toBe(false);
    });
  });

  describe('resolveBrandSentinel', () => {
    it('resolves color sentinels to var()', () => {
      expect(resolveBrandSentinel('brand.primary')).toBe('var(--brand-primary)');
      expect(resolveBrandSentinel('brand.bg')).toBe('var(--brand-bg)');
      expect(resolveBrandSentinel('brand.navText')).toBe('var(--brand-nav-text)');
      expect(resolveBrandSentinel('brand.btnPrimaryBg')).toBe('var(--brand-btn-primary-bg)');
    });

    it('resolves font sentinels with fallback', () => {
      expect(resolveBrandSentinel('brand.headingFont')).toBe('var(--brand-heading-font, sans-serif)');
      expect(resolveBrandSentinel('brand.bodyFont')).toBe('var(--brand-body-font, sans-serif)');
    });

    it('resolves radius sentinels to var()', () => {
      expect(resolveBrandSentinel('brand.radius')).toBe('var(--brand-border-radius)');
      expect(resolveBrandSentinel('brand.btnRadius')).toBe('var(--brand-btn-border-radius)');
    });

    it('passes non-sentinel values through unchanged', () => {
      expect(resolveBrandSentinel('#ff0000')).toBe('#ff0000');
      expect(resolveBrandSentinel('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
      expect(resolveBrandSentinel('8px')).toBe('8px');
    });

    it('passes undefined through unchanged', () => {
      expect(resolveBrandSentinel(undefined)).toBeUndefined();
    });
  });

  describe('getSentinelLabel', () => {
    it('returns human label for sentinel', () => {
      expect(getSentinelLabel('brand.primary')).toBe('Brand Primary');
      expect(getSentinelLabel('brand.bg')).toBe('Brand Background');
    });

    it('returns null for non-sentinel', () => {
      expect(getSentinelLabel('#fff')).toBeNull();
      expect(getSentinelLabel(undefined)).toBeNull();
    });
  });

  describe('getSentinelDef', () => {
    it('returns full definition for sentinel', () => {
      const def = getSentinelDef('brand.primary');
      expect(def).toEqual({
        sentinel: 'brand.primary',
        cssVar: '--brand-primary',
        label: 'Brand Primary',
        kind: 'color',
      });
    });

    it('returns null for non-sentinel', () => {
      expect(getSentinelDef('#fff')).toBeNull();
    });
  });

  describe('listSentinels', () => {
    it('filters by kind', () => {
      const colors = listSentinels('color');
      expect(colors.length).toBeGreaterThan(5);
      expect(colors.every((s) => s.kind === 'color')).toBe(true);

      const fonts = listSentinels('font');
      expect(fonts).toHaveLength(2);
      expect(fonts.every((s) => s.kind === 'font')).toBe(true);

      const radii = listSentinels('radius');
      expect(radii.length).toBeGreaterThanOrEqual(2);
      expect(radii.every((s) => s.kind === 'radius')).toBe(true);
    });
  });

  describe('all registered sentinels are consistent', () => {
    it('has matching sentinel + cssVar naming conventions', () => {
      for (const def of BRAND_SENTINELS) {
        expect(def.sentinel).toMatch(/^brand\./);
        expect(def.cssVar).toMatch(/^--brand-/);
        expect(def.label.length).toBeGreaterThan(0);
      }
    });

    it('every cssVar referenced is emitted by brandingToCssVars', async () => {
      const { brandingToCssVars } = await import('@/lib/branding/css-vars');
      const fakeBranding = {
        profileId: 'p1',
        name: 'Test',
        primaryColor: '#111111',
        secondaryColor: '#222222',
        accentColor: '#333333',
        backgroundColor: '#ffffff',
        textColor: '#000000',
        navBackground: '#eeeeee',
        navTextColor: '#111111',
        logoUrl: null,
        logoSquareUrl: null,
        logoRectUrl: null,
        logoIconUrl: null,
        logoText: null,
        logoAlt: null,
        headingFont: 'Inter',
        bodyFont: 'Inter',
        navTemplate: 'default',
        navPosition: 'top',
        borderRadius: '8px',
        linkColor: '#0000ff',
        linkHoverColor: '#000099',
        faviconUrl: null,
        ogImageUrl: null,
        buttonStyle: {
          primaryBg: '#111',
          primaryText: '#fff',
          primaryHoverBg: '#000',
          secondaryBg: '#eee',
          secondaryText: '#111',
          secondaryHoverBg: '#ccc',
          borderRadius: '6px',
          variant: 'filled',
        },
        darkMode: null,
        typography: undefined,
      } as unknown as Parameters<typeof brandingToCssVars>[0];

      const emitted = brandingToCssVars(fakeBranding);
      for (const def of BRAND_SENTINELS) {
        expect(emitted, `missing css var for sentinel ${def.sentinel}`).toHaveProperty(def.cssVar);
      }
    });
  });
});
