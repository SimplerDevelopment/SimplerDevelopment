import { describe, it, expect } from 'vitest';
import { buildPreviewBlocks } from '@/lib/branding/preview-blocks';
import type { ResolvedBranding } from '@/lib/branding';
import type { BrandMessagingContext } from '@/lib/branding/block-defaults';
import type {
  HeroBlock,
  HeadingBlock,
  TextBlock,
  CardGridBlock,
  CtaBlock,
  SiteFooterBlock,
} from '@/types/blocks';

function makeBranding(overrides: Partial<ResolvedBranding> = {}): ResolvedBranding {
  return {
    primaryColor: '#000',
    secondaryColor: '#111',
    accentColor: '#222',
    backgroundColor: '#fff',
    textColor: '#333',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    logoUrl: '',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoIconUrl: '',
    logoText: '',
    logoAlt: '',
    navTemplate: 'default',
    navPosition: 'top',
    navBackground: '#fff',
    navTextColor: '#000',
    ...overrides,
  };
}

describe('buildPreviewBlocks', () => {
  describe('output structure', () => {
    it('returns six blocks in correct order with stable ids/types', () => {
      const blocks = buildPreviewBlocks({ branding: makeBranding() });

      expect(blocks).toHaveLength(6);
      expect(blocks.map((b) => b.type)).toEqual([
        'hero',
        'heading',
        'text',
        'card-grid',
        'cta',
        'site-footer',
      ]);
      expect(blocks.map((b) => b.id)).toEqual([
        'preview-hero',
        'preview-heading',
        'preview-text',
        'preview-cards',
        'preview-cta',
        'preview-footer',
      ]);
      expect(blocks.map((b) => b.order)).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  describe('default copy (no messaging)', () => {
    it('uses placeholder hero/text/cta copy when messaging is undefined', () => {
      const blocks = buildPreviewBlocks({ branding: makeBranding() });

      const hero = blocks[0] as HeroBlock;
      expect(hero.title).toBe('A bold tagline that captures your brand.');
      expect(hero.subtitle).toBe(
        'Explain what you do and why it matters to your customers.',
      );
      expect(hero.description).toBe(
        'This is a short elevator pitch or mission statement that appears under the hero.',
      );

      const text = blocks[2] as TextBlock;
      expect(text.content).toContain('Longer supporting copy lives here');

      const cta = blocks[4] as CtaBlock;
      expect(cta.title).toBe('Ready to work with Your Company?');
      expect(cta.description).toBe(
        'Explain what you do and why it matters to your customers.',
      );
    });

    it('uses default differentiator cards when none provided', () => {
      const blocks = buildPreviewBlocks({ branding: makeBranding() });
      const grid = blocks[3] as CardGridBlock;

      expect(grid.cards).toHaveLength(3);
      expect(grid.cards.map((c) => c.title)).toEqual([
        'Thoughtful craft',
        'Clear communication',
        'Results you can measure',
      ]);
      expect(grid.cards.map((c) => c.icon)).toEqual([
        'auto_awesome',
        'insights',
        'verified',
      ]);
      expect(grid.cards.map((c) => c.id)).toEqual([
        'preview-card-1',
        'preview-card-2',
        'preview-card-3',
      ]);
    });

    it('treats empty messaging object identically to undefined', () => {
      const a = buildPreviewBlocks({ branding: makeBranding(), messaging: {} });
      const b = buildPreviewBlocks({ branding: makeBranding() });
      expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('treats whitespace-only messaging strings as missing', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: {
          companyName: '   ',
          tagline: '\t\n',
          valueProposition: '  ',
          elevatorPitch: '',
          boilerplate: '   ',
        },
      });
      const hero = blocks[0] as HeroBlock;
      const cta = blocks[4] as CtaBlock;
      expect(hero.title).toBe('A bold tagline that captures your brand.');
      expect(cta.title).toBe('Ready to work with Your Company?');
    });
  });

  describe('messaging overrides', () => {
    it('uses companyName, tagline, valueProposition, elevatorPitch, boilerplate', () => {
      const messaging: BrandMessagingContext = {
        companyName: 'Acme Co',
        tagline: 'Build faster.',
        valueProposition: 'We help teams ship.',
        elevatorPitch: 'Acme cuts dev cycles in half.',
        boilerplate: 'Founded 2020 in Brooklyn.',
      };
      const blocks = buildPreviewBlocks({ branding: makeBranding(), messaging });
      const hero = blocks[0] as HeroBlock;
      const text = blocks[2] as TextBlock;
      const cta = blocks[4] as CtaBlock;

      expect(hero.title).toBe('Build faster.');
      expect(hero.subtitle).toBe('We help teams ship.');
      expect(hero.description).toBe('Acme cuts dev cycles in half.');
      expect(text.content).toBe('Founded 2020 in Brooklyn.');
      expect(cta.title).toBe('Ready to work with Acme Co?');
      expect(cta.description).toBe('We help teams ship.');
    });

    it('trims surrounding whitespace from messaging strings', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: {
          companyName: '  Acme  ',
          tagline: '\tHello world\n',
          valueProposition: '  Prop  ',
          elevatorPitch: '  Pitch  ',
          boilerplate: '  Boiler  ',
        },
      });
      const hero = blocks[0] as HeroBlock;
      const text = blocks[2] as TextBlock;
      const cta = blocks[4] as CtaBlock;
      expect(hero.title).toBe('Hello world');
      expect(hero.subtitle).toBe('Prop');
      expect(hero.description).toBe('Pitch');
      expect(text.content).toBe('Boiler');
      expect(cta.title).toBe('Ready to work with Acme?');
    });

    it('falls back to missionStatement when elevatorPitch missing', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { missionStatement: 'We exist to help.' },
      });
      const hero = blocks[0] as HeroBlock;
      expect(hero.description).toBe('We exist to help.');
    });

    it('prefers elevatorPitch over missionStatement when both present', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: {
          elevatorPitch: 'The pitch.',
          missionStatement: 'The mission.',
        },
      });
      const hero = blocks[0] as HeroBlock;
      expect(hero.description).toBe('The pitch.');
    });

    it('falls back to default pitch when both elevatorPitch and missionStatement missing', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { companyName: 'X' },
      });
      const hero = blocks[0] as HeroBlock;
      expect(hero.description).toBe(
        'This is a short elevator pitch or mission statement that appears under the hero.',
      );
    });
  });

  describe('differentiator cards', () => {
    it('uses provided differentiators (up to 3)', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: {
          keyDifferentiators: ['Speed', 'Quality', 'Care', 'Extra', 'Five'],
        },
      });
      const grid = blocks[3] as CardGridBlock;
      expect(grid.cards.map((c) => c.title)).toEqual(['Speed', 'Quality', 'Care']);
    });

    it('pads with defaults when fewer than 3 differentiators... actually keeps only provided count', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { keyDifferentiators: ['Only one'] },
      });
      const grid = blocks[3] as CardGridBlock;
      expect(grid.cards).toHaveLength(1);
      expect(grid.cards[0].title).toBe('Only one');
      expect(grid.cards[0].icon).toBe('auto_awesome');
    });

    it('returns two cards with first two icons when two differentiators provided', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { keyDifferentiators: ['First', 'Second'] },
      });
      const grid = blocks[3] as CardGridBlock;
      expect(grid.cards).toHaveLength(2);
      expect(grid.cards[0].icon).toBe('auto_awesome');
      expect(grid.cards[1].icon).toBe('insights');
      expect(grid.cards[0].description).toContain('supporting sentence');
      expect(grid.cards[1].description).toContain('supporting sentence');
    });

    it('falls back to defaults when keyDifferentiators is empty array', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { keyDifferentiators: [] },
      });
      const grid = blocks[3] as CardGridBlock;
      expect(grid.cards.map((c) => c.title)).toEqual([
        'Thoughtful craft',
        'Clear communication',
        'Results you can measure',
      ]);
    });

    it('filters out blank/whitespace-only differentiators before slicing', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: {
          keyDifferentiators: ['', '  ', 'Real one', '\t', 'Another'],
        },
      });
      const grid = blocks[3] as CardGridBlock;
      expect(grid.cards.map((c) => c.title)).toEqual(['Real one', 'Another']);
    });

    it('falls back to defaults when all differentiators are blank', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { keyDifferentiators: ['', '  ', '\n'] },
      });
      const grid = blocks[3] as CardGridBlock;
      expect(grid.cards.map((c) => c.title)).toEqual([
        'Thoughtful craft',
        'Clear communication',
        'Results you can measure',
      ]);
    });

    it('assigns distinct descriptions per card index', () => {
      const blocks = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { keyDifferentiators: ['A', 'B', 'C'] },
      });
      const grid = blocks[3] as CardGridBlock;
      const descs = grid.cards.map((c) => c.description);
      expect(new Set(descs).size).toBe(3);
    });
  });

  describe('hero block styling', () => {
    it('applies brand sentinels in hero style', () => {
      const hero = buildPreviewBlocks({ branding: makeBranding() })[0] as HeroBlock;
      expect(hero.style?.backgroundColor).toBe('brand.bg');
      expect(hero.style?.color).toBe('brand.text');
      expect(hero.style?.padding).toBe('6rem 2rem');
      expect(hero.ctaText).toBe('Get Started');
      expect(hero.ctaLink).toBe('#');
      expect(hero.secondaryCtaText).toBe('Learn More');
      expect(hero.secondaryCtaLink).toBe('#');
    });
  });

  describe('heading + text blocks', () => {
    it('uses left alignment and brand.text color', () => {
      const blocks = buildPreviewBlocks({ branding: makeBranding() });
      const heading = blocks[1] as HeadingBlock;
      const text = blocks[2] as TextBlock;

      expect(heading.content).toBe('What we do');
      expect(heading.level).toBe(2);
      expect(heading.alignment).toBe('left');
      expect(heading.style?.color).toBe('brand.text');

      expect(text.alignment).toBe('left');
      expect(text.size).toBe('base');
      expect(text.style?.color).toBe('brand.text');
    });
  });

  describe('card grid block', () => {
    it('has 3 columns and brand.text color', () => {
      const grid = buildPreviewBlocks({ branding: makeBranding() })[3] as CardGridBlock;
      expect(grid.columns).toBe(3);
      expect(grid.title).toBe('What sets us apart');
      expect(grid.description).toBe('A few things clients count on.');
      expect(grid.style?.color).toBe('brand.text');
    });
  });

  describe('cta block', () => {
    it('uses brand.primary background with brand.btnPrimaryText color', () => {
      const cta = buildPreviewBlocks({ branding: makeBranding() })[4] as CtaBlock;
      expect(cta.backgroundStyle).toBe('solid');
      expect(cta.style?.backgroundColor).toBe('brand.primary');
      expect(cta.style?.color).toBe('brand.btnPrimaryText');
      expect(cta.primaryButtonText).toBe('Start a project');
      expect(cta.primaryButtonUrl).toBe('#');
      expect(cta.secondaryButtonText).toBe('Talk to us');
      expect(cta.secondaryButtonUrl).toBe('#');
    });
  });

  describe('site-footer block', () => {
    it('prefers branding.logoUrl when present', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding({
          logoUrl: 'https://cdn.example.com/main.png',
          logoRectUrl: 'https://cdn.example.com/rect.png',
        }),
      })[5] as SiteFooterBlock;
      expect(footer.logoUrl).toBe('https://cdn.example.com/main.png');
    });

    it('falls back to logoRectUrl when logoUrl is missing', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding({ logoUrl: '', logoRectUrl: 'https://cdn.example.com/rect.png' }),
      })[5] as SiteFooterBlock;
      expect(footer.logoUrl).toBe('https://cdn.example.com/rect.png');
    });

    it('uses undefined when both logoUrl and logoRectUrl are empty', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding({ logoUrl: '', logoRectUrl: '' }),
      })[5] as SiteFooterBlock;
      expect(footer.logoUrl).toBeUndefined();
    });

    it('uses branding.logoAlt when present', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding({ logoAlt: 'Acme Inc' }),
        messaging: { companyName: 'OtherName' },
      })[5] as SiteFooterBlock;
      expect(footer.logoAlt).toBe('Acme Inc');
    });

    it('falls back to company name when logoAlt is empty', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding({ logoAlt: '' }),
        messaging: { companyName: 'Acme' },
      })[5] as SiteFooterBlock;
      expect(footer.logoAlt).toBe('Acme');
    });

    it('uses default company in logoAlt when neither logoAlt nor companyName set', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding({ logoAlt: '' }),
      })[5] as SiteFooterBlock;
      expect(footer.logoAlt).toBe('Your Company');
    });

    it('renders standard Company/Resources link groups', () => {
      const footer = buildPreviewBlocks({ branding: makeBranding() })[5] as SiteFooterBlock;
      expect(footer.linkGroups).toHaveLength(2);
      expect(footer.linkGroups?.[0].label).toBe('Company');
      expect(footer.linkGroups?.[0].links.map((l) => l.label)).toEqual(['About', 'Contact']);
      expect(footer.linkGroups?.[1].label).toBe('Resources');
      expect(footer.linkGroups?.[1].links.map((l) => l.label)).toEqual(['Blog', 'Careers']);
      // Every href is the placeholder anchor
      const allHrefs = (footer.linkGroups ?? []).flatMap((g) => g.links.map((l) => l.href));
      expect(allHrefs.every((h) => h === '#')).toBe(true);
    });

    it('uses CSS variables for footer colors', () => {
      const footer = buildPreviewBlocks({ branding: makeBranding() })[5] as SiteFooterBlock;
      expect(footer.backgroundColor).toBe('var(--brand-text)');
      expect(footer.textColor).toBe('var(--brand-bg)');
      expect(footer.accentColor).toBe('var(--brand-accent)');
    });

    it('uses default example.com email when no companyName provided', () => {
      const footer = buildPreviewBlocks({ branding: makeBranding() })[5] as SiteFooterBlock;
      expect(footer.contactInfo?.email).toBe('hello@example.com');
    });

    it('derives email slug from companyName by lowercasing and stripping non-alphanumerics', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { companyName: 'Acme Co., Ltd. & Sons!' },
      })[5] as SiteFooterBlock;
      expect(footer.contactInfo?.email).toBe('hello@acmecoltdsons');
    });

    it('truncates long company slug to 24 chars', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: {
          companyName: 'ThisIsAReallyLongCompanyNameThatExceedsTwentyFourChars',
        },
      })[5] as SiteFooterBlock;
      const local = footer.contactInfo?.email?.split('@')[1] ?? '';
      expect(local.length).toBeLessThanOrEqual(24);
      expect(footer.contactInfo?.email).toBe('hello@thisisareallylongcompany');
    });

    it('falls back to "example" slug when companyName has no alphanumerics', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { companyName: '!!!---???' },
      })[5] as SiteFooterBlock;
      expect(footer.contactInfo?.email).toBe('hello@example');
    });

    it('copyright includes current year and company name', () => {
      const year = new Date().getFullYear();
      const footer = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { companyName: 'Acme' },
      })[5] as SiteFooterBlock;
      expect(footer.copyright).toBe(`© ${year} Acme. All rights reserved.`);
    });

    it('copyright uses default company when missing', () => {
      const year = new Date().getFullYear();
      const footer = buildPreviewBlocks({ branding: makeBranding() })[5] as SiteFooterBlock;
      expect(footer.copyright).toBe(`© ${year} Your Company. All rights reserved.`);
    });

    it('uses tagline (or default) for footer tagline', () => {
      const footer = buildPreviewBlocks({
        branding: makeBranding(),
        messaging: { tagline: 'Faster shipping.' },
      })[5] as SiteFooterBlock;
      expect(footer.tagline).toBe('Faster shipping.');

      const footer2 = buildPreviewBlocks({ branding: makeBranding() })[5] as SiteFooterBlock;
      expect(footer2.tagline).toBe('A bold tagline that captures your brand.');
    });
  });

  describe('purity', () => {
    it('returns a fresh array on each call (different references)', () => {
      const a = buildPreviewBlocks({ branding: makeBranding() });
      const b = buildPreviewBlocks({ branding: makeBranding() });
      expect(a).not.toBe(b);
      expect(a[0]).not.toBe(b[0]);
    });

    it('does not mutate input messaging.keyDifferentiators', () => {
      const messaging: BrandMessagingContext = {
        keyDifferentiators: ['A', '', 'B', '  ', 'C', 'D'],
      };
      const before = [...(messaging.keyDifferentiators ?? [])];
      buildPreviewBlocks({ branding: makeBranding(), messaging });
      expect(messaging.keyDifferentiators).toEqual(before);
    });
  });
});
