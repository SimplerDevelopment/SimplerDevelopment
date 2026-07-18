import { describe, it, expect } from 'vitest';
import { applyBrandDefaults, messagingRowToContext, type BrandDefaultsContext } from '@/lib/branding/block-defaults';
import type { HeroBlock, CtaBlock, TestimonialBlock, EmailFooterBlock, EmailHeaderBlock, SiteFooterBlock, ButtonBlock } from '@/types/blocks';

const ctx = (overrides: Partial<BrandDefaultsContext> = {}): BrandDefaultsContext => ({
  messaging: {
    companyName: 'Acme',
    tagline: 'Build faster.',
    valueProposition: 'We cut dev cycles in half.',
    elevatorPitch: 'Acme helps teams ship software 2× faster with AI pair-coders.',
    boilerplate: 'Founded 2020 in Brooklyn, Acme serves 500+ startups.',
    socialProof: 'Acme has been great — we shipped twice as fast.',
  },
  logoUrl: 'https://cdn.example.com/logo.png',
  ...overrides,
});

function hero(overrides: Partial<HeroBlock> = {}): HeroBlock {
  return {
    id: 'h1', type: 'hero', order: 0,
    title: 'Hero Title', subtitle: 'Subtitle', description: 'Description',
    ctaText: 'Get Started', ctaLink: '/contact',
    ...overrides,
  };
}

describe('applyBrandDefaults', () => {
  describe('hero block', () => {
    it('replaces placeholder title with tagline', () => {
      const out = applyBrandDefaults(hero(), ctx()) as HeroBlock;
      expect(out.title).toBe('Build faster.');
      expect(out.subtitle).toBe('We cut dev cycles in half.');
      expect(out.description).toBe('Acme helps teams ship software 2× faster with AI pair-coders.');
    });

    it('leaves user-customized title alone', () => {
      const out = applyBrandDefaults(hero({ title: 'My Custom Title' }), ctx()) as HeroBlock;
      expect(out.title).toBe('My Custom Title');
    });

    it('falls back to companyName when tagline missing', () => {
      const out = applyBrandDefaults(hero(), ctx({ messaging: { companyName: 'Acme' } })) as HeroBlock;
      expect(out.title).toBe('Acme');
    });

    it('is a no-op when no messaging provided', () => {
      const input = hero();
      const out = applyBrandDefaults(input, {}) as HeroBlock;
      expect(out.title).toBe('Hero Title');
    });
  });

  describe('cta block', () => {
    it('replaces placeholder title with value proposition', () => {
      const block: CtaBlock = {
        id: 'c1', type: 'cta', order: 0,
        title: 'Ready to get started?',
        description: 'Join thousands of satisfied customers',
        primaryButtonText: 'Get Started', primaryButtonUrl: '/contact',
      };
      const out = applyBrandDefaults(block, ctx()) as CtaBlock;
      expect(out.title).toBe('We cut dev cycles in half.');
      expect(out.description).toBe('Acme helps teams ship software 2× faster with AI pair-coders.');
    });
  });

  describe('testimonial block', () => {
    it('replaces placeholder quote with social proof', () => {
      const block: TestimonialBlock = {
        id: 't1', type: 'testimonial', order: 0,
        quote: 'This is an amazing product!', author: 'John Doe',
      };
      const out = applyBrandDefaults(block, ctx()) as TestimonialBlock;
      expect(out.quote).toBe('Acme has been great — we shipped twice as fast.');
    });

    it('truncates overly long social proof to 280 chars', () => {
      const longProof = 'A'.repeat(500);
      const block: TestimonialBlock = {
        id: 't1', type: 'testimonial', order: 0,
        quote: 'This is an amazing product!', author: 'John Doe',
      };
      const out = applyBrandDefaults(block, ctx({ messaging: { socialProof: longProof } })) as TestimonialBlock;
      expect(out.quote.length).toBe(280);
      expect(out.quote.endsWith('…')).toBe(true);
    });
  });

  describe('email blocks', () => {
    it('sets company name on email-footer', () => {
      const block: EmailFooterBlock = { id: 'ef', type: 'email-footer', order: 0 };
      const out = applyBrandDefaults(block, ctx()) as EmailFooterBlock;
      expect(out.companyName).toBe('Acme');
    });

    it('sets logo on email-header', () => {
      const block: EmailHeaderBlock = { id: 'eh', type: 'email-header', order: 0 };
      const out = applyBrandDefaults(block, ctx()) as EmailHeaderBlock;
      expect(out.logoUrl).toBe('https://cdn.example.com/logo.png');
    });

    it('does not overwrite existing logo', () => {
      const block: EmailHeaderBlock = { id: 'eh', type: 'email-header', order: 0, logoUrl: 'custom.png' };
      const out = applyBrandDefaults(block, ctx()) as EmailHeaderBlock;
      expect(out.logoUrl).toBe('custom.png');
    });
  });

  describe('site-footer', () => {
    it('builds copyright from companyName and current year', () => {
      const block: SiteFooterBlock = { id: 'sf', type: 'site-footer', order: 0, linkGroups: [] };
      const out = applyBrandDefaults(block, ctx()) as SiteFooterBlock;
      const year = new Date().getFullYear();
      expect(out.copyright).toBe(`© ${year} Acme`);
    });

    it('uses boilerplate as tagline, truncating if long', () => {
      const block: SiteFooterBlock = { id: 'sf', type: 'site-footer', order: 0, linkGroups: [] };
      const out = applyBrandDefaults(block, ctx()) as SiteFooterBlock;
      expect(out.tagline).toBe('Founded 2020 in Brooklyn, Acme serves 500+ startups.');
    });
  });

  describe('button with sentinels enabled', () => {
    it('applies brand sentinels to empty button style', () => {
      const block: ButtonBlock = { id: 'b1', type: 'button', order: 0, text: 'Click', url: '/' };
      const out = applyBrandDefaults(block, ctx({ useSentinels: true })) as ButtonBlock;
      expect(out.style?.backgroundColor).toBe('brand.btnPrimaryBg');
      expect(out.style?.color).toBe('brand.btnPrimaryText');
      expect(out.style?.borderRadius).toBe('brand.btnRadius');
    });

    it('does not overwrite user-set style fields', () => {
      const block: ButtonBlock = {
        id: 'b1', type: 'button', order: 0, text: 'Click', url: '/',
        style: { backgroundColor: '#ff0000' },
      };
      const out = applyBrandDefaults(block, ctx({ useSentinels: true })) as ButtonBlock;
      expect(out.style?.backgroundColor).toBe('#ff0000');
      expect(out.style?.color).toBe('brand.btnPrimaryText');
    });

    it('leaves button style alone when useSentinels false', () => {
      const block: ButtonBlock = { id: 'b1', type: 'button', order: 0, text: 'Click', url: '/' };
      const out = applyBrandDefaults(block, ctx({ useSentinels: false })) as ButtonBlock;
      expect(out.style?.backgroundColor).toBeUndefined();
    });
  });

  describe('unhandled block types', () => {
    it('passes through unknown types unchanged', () => {
      const block = { id: 'x', type: 'text', order: 0, content: 'hi' } as const;
      const out = applyBrandDefaults(block, ctx());
      expect(out).toEqual(block);
    });
  });
});

describe('messagingRowToContext', () => {
  it('returns undefined for null/undefined input', () => {
    expect(messagingRowToContext(null)).toBeUndefined();
    expect(messagingRowToContext(undefined)).toBeUndefined();
  });

  it('converts nullable DB row to clean context', () => {
    const row = {
      companyName: 'Acme', tagline: 'Build faster.',
      valueProposition: null, elevatorPitch: 'Longer pitch.',
      boilerplate: null, missionStatement: 'Mission',
      visionStatement: null, keyDifferentiators: ['fast', 'simple'],
      socialProof: null,
    };
    const ctx = messagingRowToContext(row);
    expect(ctx).toEqual({
      companyName: 'Acme',
      tagline: 'Build faster.',
      valueProposition: undefined,
      elevatorPitch: 'Longer pitch.',
      boilerplate: undefined,
      missionStatement: 'Mission',
      visionStatement: undefined,
      keyDifferentiators: ['fast', 'simple'],
      socialProof: undefined,
    });
  });
});
