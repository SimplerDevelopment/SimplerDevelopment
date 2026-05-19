// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDefaultBlock } from '@/lib/blocks/defaults';
import type { BlockType } from '@/types/blocks';

describe('createDefaultBlock', () => {
  describe('id and order handling', () => {
    it('auto-generates an id when not provided', () => {
      const b = createDefaultBlock('text');
      expect(b.id).toMatch(/^block-\d+-[a-z0-9]+$/);
    });

    it('uses the provided id when supplied', () => {
      const b = createDefaultBlock('text', { id: 'my-id' });
      expect(b.id).toBe('my-id');
    });

    it('defaults order to 0 when not provided', () => {
      const b = createDefaultBlock('text');
      expect(b.order).toBe(0);
    });

    it('uses the provided order when supplied', () => {
      const b = createDefaultBlock('heading', { order: 7 });
      expect(b.order).toBe(7);
    });

    it('accepts both id and order together', () => {
      const b = createDefaultBlock('button', { id: 'btn-1', order: 3 });
      expect(b.id).toBe('btn-1');
      expect(b.order).toBe(3);
    });

    it('treats an empty options object the same as omitted', () => {
      const b = createDefaultBlock('text', {});
      expect(b.order).toBe(0);
      expect(b.id).toBeTruthy();
    });

    it('generates distinct ids across consecutive calls', () => {
      // Don't fake timers so Math.random + Date.now naturally differ.
      const a = createDefaultBlock('text');
      const b = createDefaultBlock('text');
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('basic blocks', () => {
    it('text returns starter copy with sensible alignment/size', () => {
      const b = createDefaultBlock('text') as any;
      expect(b.type).toBe('text');
      expect(typeof b.content).toBe('string');
      expect(b.content.length).toBeGreaterThan(0);
      expect(b.alignment).toBe('left');
      expect(b.size).toBe('base');
    });

    it('heading defaults to level 2', () => {
      const b = createDefaultBlock('heading') as any;
      expect(b.type).toBe('heading');
      expect(b.level).toBe(2);
      expect(b.alignment).toBe('left');
      expect(typeof b.content).toBe('string');
    });

    it('image starts with empty url/alt and centered full-width', () => {
      const b = createDefaultBlock('image') as any;
      expect(b.type).toBe('image');
      expect(b.url).toBe('');
      expect(b.alt).toBe('');
      expect(b.width).toBe('full');
      expect(b.alignment).toBe('center');
    });

    it('button has primary variant and md size', () => {
      const b = createDefaultBlock('button') as any;
      expect(b.type).toBe('button');
      expect(b.variant).toBe('primary');
      expect(b.size).toBe('md');
      expect(b.alignment).toBe('left');
      expect(b.text).toBe('Click me');
      expect(b.url).toBe('');
    });

    it('quote returns empty author and citation', () => {
      const b = createDefaultBlock('quote') as any;
      expect(b.type).toBe('quote');
      expect(b.author).toBe('');
      expect(b.citation).toBe('');
      expect(typeof b.content).toBe('string');
    });

    it('code defaults to javascript language', () => {
      const b = createDefaultBlock('code') as any;
      expect(b.type).toBe('code');
      expect(b.language).toBe('javascript');
      expect(typeof b.code).toBe('string');
    });

    it('html-render seeds title and body richtext fields', () => {
      const b = createDefaultBlock('html-render') as any;
      expect(b.type).toBe('html-render');
      expect(b.width).toBe('full');
      expect(typeof b.html).toBe('string');
      expect(b.html).toContain('data-field="title"');
      expect(b.html).toContain('data-field="body"');
      expect(Array.isArray(b.fields)).toBe(true);
      expect(b.fields).toHaveLength(2);
      expect(b.fields[0]).toEqual({ name: 'title', label: 'Title', type: 'richtext' });
      expect(b.fields[1]).toEqual({ name: 'body', label: 'Body', type: 'richtext' });
      expect(b.values).toEqual({});
    });

    it('post-content returns the minimal { id, order, type } shape', () => {
      const b = createDefaultBlock('post-content') as any;
      expect(b.type).toBe('post-content');
      expect(b.id).toBeTruthy();
      expect(b.order).toBe(0);
      // No other keys aside from base + type.
      expect(Object.keys(b).sort()).toEqual(['id', 'order', 'type']);
    });

    it('spacer defaults height to md', () => {
      const b = createDefaultBlock('spacer') as any;
      expect(b.type).toBe('spacer');
      expect(b.height).toBe('md');
    });

    it('divider defaults to solid line', () => {
      const b = createDefaultBlock('divider') as any;
      expect(b.type).toBe('divider');
      expect(b.lineStyle).toBe('solid');
    });
  });

  describe('media blocks', () => {
    it('video starts with controls true and autoplay false', () => {
      const b = createDefaultBlock('video') as any;
      expect(b.type).toBe('video');
      expect(b.url).toBe('');
      expect(b.caption).toBe('');
      expect(b.autoplay).toBe(false);
      expect(b.controls).toBe(true);
    });

    it('youtube starts empty', () => {
      const b = createDefaultBlock('youtube') as any;
      expect(b.type).toBe('youtube');
      expect(b.url).toBe('');
      expect(b.caption).toBe('');
    });

    it('gallery defaults to grid/3-col with lightbox', () => {
      const b = createDefaultBlock('gallery') as any;
      expect(b.type).toBe('gallery');
      expect(b.images).toEqual([]);
      expect(b.layout).toBe('grid');
      expect(b.columns).toBe(3);
      expect(b.lightbox).toBe(true);
      expect(b.gap).toBe('md');
    });
  });

  describe('layout containers — pre-populated children', () => {
    it('columns starts with two 50/50 columns', () => {
      const b = createDefaultBlock('columns') as any;
      expect(b.type).toBe('columns');
      expect(b.columns).toHaveLength(2);
      expect(b.columns[0].width).toBe(50);
      expect(b.columns[1].width).toBe(50);
      expect(b.columns[0].blocks).toEqual([]);
      expect(b.columns[1].blocks).toEqual([]);
      expect(b.columns[0].id).toMatch(/^col-/);
      expect(b.gap).toBe('md');
    });

    it('section returns empty blocks array', () => {
      const b = createDefaultBlock('section') as any;
      expect(b.type).toBe('section');
      expect(b.blocks).toEqual([]);
    });

    it('accordion has two starter items with ids', () => {
      const b = createDefaultBlock('accordion') as any;
      expect(b.type).toBe('accordion');
      expect(b.title).toBe('Frequently Asked Questions');
      expect(b.items).toHaveLength(2);
      expect(b.items[0].id).toMatch(/^item-/);
      expect(b.items[0].title).toBeTruthy();
      expect(b.items[1].title).toBeTruthy();
    });

    it('tabs starts with two empty tabs', () => {
      const b = createDefaultBlock('tabs') as any;
      expect(b.type).toBe('tabs');
      expect(b.tabs).toHaveLength(2);
      expect(b.tabs[0].id).toMatch(/^tab-/);
      expect(b.tabs[0].label).toBe('Tab 1');
      expect(b.tabs[1].label).toBe('Tab 2');
      expect(b.tabs[0].blocks).toEqual([]);
    });
  });

  describe('component blocks', () => {
    it('hero supplies headline/cta scaffolding', () => {
      const b = createDefaultBlock('hero') as any;
      expect(b.type).toBe('hero');
      expect(b.title).toBeTruthy();
      expect(b.subtitle).toBeTruthy();
      expect(b.description).toBeTruthy();
      expect(b.ctaText).toBe('Get Started');
      expect(b.ctaLink).toBe('/contact');
    });

    it('hero-slideshow seeds two slides with ken-burns autoplay', () => {
      const b = createDefaultBlock('hero-slideshow') as any;
      expect(b.type).toBe('hero-slideshow');
      expect(b.slides).toHaveLength(2);
      expect(b.slides[0].id).toMatch(/^slide-/);
      expect(b.autoplay).toBe(true);
      expect(b.interval).toBe(6000);
      expect(b.transition).toBe('fade');
      expect(b.showDots).toBe(true);
      expect(b.showArrows).toBe(true);
      expect(b.kenBurns).toBe(true);
    });

    it('marquee seeds two text items with autoFill', () => {
      const b = createDefaultBlock('marquee') as any;
      expect(b.type).toBe('marquee');
      expect(b.items).toHaveLength(2);
      expect(b.items[0].type).toBe('text');
      expect(b.autoFill).toBe(true);
      expect(b.speed).toBe(50);
      expect(b.direction).toBe('left');
      expect(b.pauseOnHover).toBe(true);
    });

    it('cta has primary button and gradient background', () => {
      const b = createDefaultBlock('cta') as any;
      expect(b.type).toBe('cta');
      expect(b.primaryButtonText).toBe('Get Started');
      expect(b.primaryButtonUrl).toBe('/contact');
      expect(b.backgroundStyle).toBe('gradient');
    });

    it('card-grid has two cards in three columns', () => {
      const b = createDefaultBlock('card-grid') as any;
      expect(b.type).toBe('card-grid');
      expect(b.cards).toHaveLength(2);
      expect(b.columns).toBe(3);
      expect(b.cards[0].id).toMatch(/^card-/);
    });

    it('flip-card-grid has three cards with rich defaults', () => {
      const b = createDefaultBlock('flip-card-grid') as any;
      expect(b.type).toBe('flip-card-grid');
      expect(b.cards).toHaveLength(3);
      expect(b.columns).toBe(3);
      expect(b.flipTrigger).toBe('hover');
      expect(b.flipAxis).toBe('horizontal');
      expect(b.cardHeight).toBe('280px');
      expect(b.accentColor).toBe('#004D80');
      expect(b.cards[0].frontIcon).toBeTruthy();
    });

    it('metric-cards has four metrics in four columns', () => {
      const b = createDefaultBlock('metric-cards') as any;
      expect(b.type).toBe('metric-cards');
      expect(b.metrics).toHaveLength(4);
      expect(b.columns).toBe(4);
      expect(b.accentColor).toBe('#004D80');
      // Each metric carries value/label/institution/linkText.
      for (const m of b.metrics) {
        expect(m.value).toBeTruthy();
        expect(m.label).toBeTruthy();
        expect(m.institution).toBeTruthy();
        expect(m.linkText).toBeTruthy();
      }
    });

    it('logo-strip seeds six placeholder logos', () => {
      const b = createDefaultBlock('logo-strip') as any;
      expect(b.type).toBe('logo-strip');
      expect(b.logos).toHaveLength(6);
      expect(b.columns).toBe(6);
      expect(b.grayscale).toBe(true);
      expect(b.logoHeight).toBe('40px');
      expect(b.gap).toBe('lg');
      expect(b.alignment).toBe('center');
      expect(b.overline).toBe('TRUSTED BY LEADING COMPANIES');
    });

    it('stats seeds two stats in three columns', () => {
      const b = createDefaultBlock('stats') as any;
      expect(b.type).toBe('stats');
      expect(b.stats).toHaveLength(2);
      expect(b.columns).toBe(3);
      expect(b.title).toBeTruthy();
    });

    it('testimonial returns a complete quote/author/role/company shape', () => {
      const b = createDefaultBlock('testimonial') as any;
      expect(b.type).toBe('testimonial');
      expect(b.quote).toBeTruthy();
      expect(b.author).toBeTruthy();
      expect(b.role).toBeTruthy();
      expect(b.company).toBeTruthy();
    });

    it('featured-content positions image on the right', () => {
      const b = createDefaultBlock('featured-content') as any;
      expect(b.type).toBe('featured-content');
      expect(b.imagePosition).toBe('right');
      expect(b.buttonText).toBe('Learn More');
      expect(b.buttonUrl).toBe('/learn-more');
    });

    it('services-grid starts empty', () => {
      const b = createDefaultBlock('services-grid') as any;
      expect(b.type).toBe('services-grid');
      expect(b.services).toEqual([]);
      expect(b.columns).toBe(3);
    });

    it('blog-posts limits to 3 with excerpt', () => {
      const b = createDefaultBlock('blog-posts') as any;
      expect(b.type).toBe('blog-posts');
      expect(b.limit).toBe(3);
      expect(b.columns).toBe(3);
      expect(b.showExcerpt).toBe(true);
    });

    it('timeline seeds two steps', () => {
      const b = createDefaultBlock('timeline') as any;
      expect(b.type).toBe('timeline');
      expect(b.steps).toHaveLength(2);
      expect(b.steps[0].id).toMatch(/^step-/);
    });

    it('team-showcase seeds one member', () => {
      const b = createDefaultBlock('team-showcase') as any;
      expect(b.type).toBe('team-showcase');
      expect(b.members).toHaveLength(1);
      expect(b.members[0].id).toMatch(/^tm-/);
    });

    it('team-flip-grid seeds one member with question/answer', () => {
      const b = createDefaultBlock('team-flip-grid') as any;
      expect(b.type).toBe('team-flip-grid');
      expect(b.members).toHaveLength(1);
      expect(b.members[0].question).toBeTruthy();
      expect(b.members[0].answer).toBeTruthy();
      expect(b.columns).toBe(3);
    });

    it('bento-grid seeds three cards', () => {
      const b = createDefaultBlock('bento-grid') as any;
      expect(b.type).toBe('bento-grid');
      expect(b.cards).toHaveLength(3);
      expect(b.cards[0].items).toEqual([]);
    });

    it('site-footer starts empty', () => {
      const b = createDefaultBlock('site-footer') as any;
      expect(b.type).toBe('site-footer');
      expect(b.linkGroups).toEqual([]);
      expect(b.socialLinks).toEqual([]);
    });

    it('sticky-scroll-tabs seeds two panels with deterministic ids', () => {
      const b = createDefaultBlock('sticky-scroll-tabs') as any;
      expect(b.type).toBe('sticky-scroll-tabs');
      expect(b.panels).toHaveLength(2);
      expect(b.panels[0].id).toBe('panel-1');
      expect(b.panels[1].id).toBe('panel-2');
      expect(b.panels[0].blocks).toEqual([]);
    });

    it('social-links centers links by default', () => {
      const b = createDefaultBlock('social-links') as any;
      expect(b.type).toBe('social-links');
      expect(b.links).toEqual([]);
      expect(b.alignment).toBe('center');
    });
  });

  describe('eCommerce blocks (minimal defaults)', () => {
    const ecomMinimal: BlockType[] = [
      'product-grid',
      'featured-products',
      'product-categories',
      'shopping-cart',
      'product-detail',
    ];

    it.each(ecomMinimal)('%s returns the minimal { id, order, type } shape', (t) => {
      const b = createDefaultBlock(t) as any;
      expect(b.type).toBe(t);
      expect(Object.keys(b).sort()).toEqual(['id', 'order', 'type']);
    });

    it('store-banner has a default title', () => {
      const b = createDefaultBlock('store-banner') as any;
      expect(b.type).toBe('store-banner');
      expect(b.title).toBe('Special Offer');
    });
  });

  describe('forms / interactive blocks', () => {
    it('booking shows page title with default height', () => {
      const b = createDefaultBlock('booking') as any;
      expect(b.type).toBe('booking');
      expect(b.slug).toBe('');
      expect(b.showPageTitle).toBe(true);
      expect(b.height).toBe('700px');
    });

    it('booking-menu has title + description', () => {
      const b = createDefaultBlock('booking-menu') as any;
      expect(b.type).toBe('booking-menu');
      expect(b.title).toBeTruthy();
      expect(b.description).toBeTruthy();
    });

    it('survey has slug + showPageTitle + 700px height', () => {
      const b = createDefaultBlock('survey') as any;
      expect(b.type).toBe('survey');
      expect(b.slug).toBe('');
      expect(b.showPageTitle).toBe(true);
      expect(b.height).toBe('700px');
    });

    it('survey-results defaults to bar chart with limits', () => {
      const b = createDefaultBlock('survey-results') as any;
      expect(b.type).toBe('survey-results');
      expect(b.chartType).toBe('bar');
      expect(b.showResponseCount).toBe(true);
      expect(b.showTextResponses).toBe(true);
      expect(b.textResponseLimit).toBe(5);
      expect(b.layout).toBe('stacked');
    });
  });

  describe('email-only blocks', () => {
    it('email-header centers by default', () => {
      const b = createDefaultBlock('email-header') as any;
      expect(b.type).toBe('email-header');
      expect(b.alignment).toBe('center');
    });

    it('email-footer shows unsubscribe', () => {
      const b = createDefaultBlock('email-footer') as any;
      expect(b.type).toBe('email-footer');
      expect(b.showUnsubscribe).toBe(true);
    });
  });

  describe('deck/survey/palizzi-specific blocks', () => {
    it('survey-input defaults to text fieldType', () => {
      const b = createDefaultBlock('survey-input') as any;
      expect(b.type).toBe('survey-input');
      expect(b.fieldType).toBe('text');
      expect(b.fieldLabel).toBe('Your answer');
    });

    it('deck-next-slide has Next label', () => {
      const b = createDefaultBlock('deck-next-slide') as any;
      expect(b.type).toBe('deck-next-slide');
      expect(b.text).toBe('Next');
    });

    it('deck-jump-to targets slide 1 by default', () => {
      const b = createDefaultBlock('deck-jump-to') as any;
      expect(b.type).toBe('deck-jump-to');
      expect(b.text).toBe('Go');
      expect(b.targetSlide).toBe(1);
    });

    const palizziTypes: BlockType[] = [
      'palizzi-nav',
      'palizzi-hero',
      'palizzi-welcome',
      'palizzi-history',
      'palizzi-menu',
      'palizzi-rules',
      'palizzi-membership',
      'palizzi-footer',
    ];

    it.each(palizziTypes)('%s returns the matching type tag', (t) => {
      const b = createDefaultBlock(t) as any;
      expect(b.type).toBe(t);
      expect(b.id).toBeTruthy();
      expect(b.order).toBe(0);
    });

    it('palizzi-nav has empty links array', () => {
      const b = createDefaultBlock('palizzi-nav') as any;
      expect(Array.isArray(b.links)).toBe(true);
      expect(b.links).toEqual([]);
    });

    it('palizzi-welcome has paragraphs array', () => {
      const b = createDefaultBlock('palizzi-welcome') as any;
      expect(Array.isArray(b.paragraphs)).toBe(true);
    });

    it('palizzi-menu has foodSections + cocktails arrays', () => {
      const b = createDefaultBlock('palizzi-menu') as any;
      expect(Array.isArray(b.foodSections)).toBe(true);
      expect(Array.isArray(b.cocktails)).toBe(true);
    });

    it('palizzi-rules has badges + rules arrays', () => {
      const b = createDefaultBlock('palizzi-rules') as any;
      expect(Array.isArray(b.badges)).toBe(true);
      expect(Array.isArray(b.rules)).toBe(true);
    });

    it('palizzi-footer has columns array', () => {
      const b = createDefaultBlock('palizzi-footer') as any;
      expect(Array.isArray(b.columns)).toBe(true);
    });
  });

  describe('html-embed', () => {
    it('returns a sandboxed iframe scaffold', () => {
      const b = createDefaultBlock('html-embed') as any;
      expect(b.type).toBe('html-embed');
      expect(b.url).toBe('');
      expect(b.height).toBe('600px');
      expect(b.width).toBe('full');
      expect(b.sandbox).toBe('scripts');
      expect(b.iframeTitle).toBe('Embedded HTML content');
    });
  });

  describe('popup', () => {
    it('seeds a time-delay trigger with default copy', () => {
      const b = createDefaultBlock('popup') as any;
      expect(b.type).toBe('popup');
      expect(b.trigger).toBe('time-delay');
      expect(b.delaySeconds).toBe(5);
      expect(b.scrollPercent).toBe(50);
      expect(b.frequency).toBe('once-per-session');
      expect(b.headline).toBeTruthy();
      expect(b.body).toContain('<p>');
      expect(b.ctaLabel).toBeTruthy();
      expect(b.ctaUrl).toBe('#');
      expect(b.dismissable).toBe(true);
    });
  });

  describe('exhaustiveness / fallback', () => {
    it('unknown block type falls back to a text-shaped default', () => {
      // Cast through unknown to bypass the BlockType union and hit the
      // default branch (TypeScript would normally reject this).
      const b = createDefaultBlock('not-a-real-type' as unknown as BlockType) as any;
      expect(b.id).toBeTruthy();
      expect(b.order).toBe(0);
      expect(b.type).toBe('text');
      expect(b.content).toBe('');
      expect(b.alignment).toBe('left');
      expect(b.size).toBe('base');
    });

    it('unknown block type still respects supplied id/order', () => {
      const b = createDefaultBlock(
        'still-not-real' as unknown as BlockType,
        { id: 'x', order: 9 },
      ) as any;
      expect(b.id).toBe('x');
      expect(b.order).toBe(9);
      expect(b.type).toBe('text');
    });
  });

  describe('cross-cutting smoke checks', () => {
    // Every known block type must produce an object where b.type === type,
    // an id is present, and order is a number — this is the contract callers
    // rely on regardless of which branch is taken.
    const knownTypes: BlockType[] = [
      'text', 'heading', 'image', 'button', 'quote', 'code', 'html-render',
      'post-content', 'spacer', 'divider',
      'video', 'youtube', 'gallery',
      'columns', 'section', 'accordion', 'tabs',
      'hero', 'hero-slideshow', 'marquee', 'cta', 'card-grid', 'flip-card-grid',
      'metric-cards', 'logo-strip', 'stats', 'testimonial', 'featured-content',
      'services-grid', 'blog-posts', 'timeline', 'team-showcase', 'team-flip-grid',
      'bento-grid', 'site-footer', 'sticky-scroll-tabs', 'social-links',
      'product-grid', 'featured-products', 'product-categories', 'shopping-cart',
      'store-banner', 'product-detail',
      'booking', 'booking-menu', 'survey', 'survey-results',
      'email-header', 'email-footer',
      'survey-input', 'deck-next-slide', 'deck-jump-to',
      'palizzi-nav', 'palizzi-hero', 'palizzi-welcome', 'palizzi-history',
      'palizzi-menu', 'palizzi-rules', 'palizzi-membership', 'palizzi-footer',
      'html-embed', 'popup',
    ];

    it.each(knownTypes)('%s produces a block whose .type matches', (t) => {
      const b = createDefaultBlock(t) as any;
      expect(b.type).toBe(t);
      expect(b.id).toBeTruthy();
      expect(typeof b.order).toBe('number');
    });

    it('honors a supplied id across every known block type', () => {
      for (const t of knownTypes) {
        const b = createDefaultBlock(t, { id: `seed-${t}` }) as any;
        expect(b.id).toBe(`seed-${t}`);
      }
    });
  });

  describe('id generation with fake timers (determinism check)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('encodes Date.now() into the generated block id', () => {
      const now = Date.now();
      const b = createDefaultBlock('text') as any;
      expect(b.id).toContain(`block-${now}-`);
    });

    it('child-entity ids (columns/items/etc.) also reflect Date.now()', () => {
      const now = Date.now();
      const cols = createDefaultBlock('columns') as any;
      expect(cols.columns[0].id).toBe(`col-${now}-1`);
      expect(cols.columns[1].id).toBe(`col-${now}-2`);

      const acc = createDefaultBlock('accordion') as any;
      expect(acc.items[0].id).toBe(`item-${now}-1`);
      expect(acc.items[1].id).toBe(`item-${now}-2`);

      const tabs = createDefaultBlock('tabs') as any;
      expect(tabs.tabs[0].id).toBe(`tab-${now}-1`);
      expect(tabs.tabs[1].id).toBe(`tab-${now}-2`);
    });
  });
});
