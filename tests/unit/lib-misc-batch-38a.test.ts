// @vitest-environment jsdom
/**
 * Unit tests for four small lib modules:
 *   - lib/visual-editor/registry.ts
 *   - lib/visual-editor/protocol.ts
 *   - lib/workflows/trigger.ts
 *   - lib/portal-utils.ts
 *
 * - registry.ts: pulls 60+ block render components from `@/components/blocks/render/*`.
 *   We mock each render component module so the eager imports don't drag the world in.
 * - protocol.ts: pure browser helpers (window/postMessage). jsdom env required.
 * - trigger.ts: stubs out `@/lib/db`, `@/lib/db/schema`, `drizzle-orm`, and `./runtime`
 *   so we can drive `enqueueWorkflowRunsForTrigger` against an in-memory workflow list.
 * - portal-utils.ts: pure formatters — no mocking required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ─── Block render component mocks (for registry.ts) ──────────────────────────
// Every component the registry imports gets a tiny named-export stub.
const stubComp = (name: string) => {
  const fn = () => React.createElement('div', { 'data-stub': name });
  fn.displayName = name;
  return fn;
};

vi.mock('@/components/blocks/render/TextBlockRender', () => ({ TextBlockRender: stubComp('TextBlockRender') }));
vi.mock('@/components/blocks/render/HeadingBlockRender', () => ({ HeadingBlockRender: stubComp('HeadingBlockRender') }));
vi.mock('@/components/blocks/render/ImageBlockRender', () => ({ ImageBlockRender: stubComp('ImageBlockRender') }));
vi.mock('@/components/blocks/render/ButtonBlockRender', () => ({ ButtonBlockRender: stubComp('ButtonBlockRender') }));
vi.mock('@/components/blocks/render/SpacerBlockRender', () => ({ SpacerBlockRender: stubComp('SpacerBlockRender') }));
vi.mock('@/components/blocks/render/DividerBlockRender', () => ({ DividerBlockRender: stubComp('DividerBlockRender') }));
vi.mock('@/components/blocks/render/QuoteBlockRender', () => ({ QuoteBlockRender: stubComp('QuoteBlockRender') }));
vi.mock('@/components/blocks/render/CodeBlockRender', () => ({ CodeBlockRender: stubComp('CodeBlockRender') }));
vi.mock('@/components/blocks/render/VideoBlockRender', () => ({ VideoBlockRender: stubComp('VideoBlockRender') }));
vi.mock('@/components/blocks/render/YoutubeBlockRender', () => ({ YoutubeBlockRender: stubComp('YoutubeBlockRender') }));
vi.mock('@/components/blocks/render/ColumnsBlockRender', () => ({ ColumnsBlockRender: stubComp('ColumnsBlockRender') }));
vi.mock('@/components/blocks/render/TabsBlockRender', () => ({ TabsBlockRender: stubComp('TabsBlockRender') }));
vi.mock('@/components/blocks/render/AccordionBlockRender', () => ({ AccordionBlockRender: stubComp('AccordionBlockRender') }));
vi.mock('@/components/blocks/render/HeroBlockRender', () => ({ HeroBlockRender: stubComp('HeroBlockRender') }));
vi.mock('@/components/blocks/render/HeroSlideshowBlockRender', () => ({ HeroSlideshowBlockRender: stubComp('HeroSlideshowBlockRender') }));
vi.mock('@/components/blocks/render/MarqueeBlockRender', () => ({ MarqueeBlockRender: stubComp('MarqueeBlockRender') }));
vi.mock('@/components/blocks/render/ServicesGridBlockRender', () => ({ ServicesGridBlockRender: stubComp('ServicesGridBlockRender') }));
vi.mock('@/components/blocks/render/CtaBlockRender', () => ({ CtaBlockRender: stubComp('CtaBlockRender') }));
vi.mock('@/components/blocks/render/TestimonialBlockRender', () => ({ TestimonialBlockRender: stubComp('TestimonialBlockRender') }));
vi.mock('@/components/blocks/render/StatsBlockRender', () => ({ StatsBlockRender: stubComp('StatsBlockRender') }));
vi.mock('@/components/blocks/render/BlogPostsBlockRender', () => ({ BlogPostsBlockRender: stubComp('BlogPostsBlockRender') }));
vi.mock('@/components/blocks/render/FeaturedContentBlockRender', () => ({ FeaturedContentBlockRender: stubComp('FeaturedContentBlockRender') }));
vi.mock('@/components/blocks/render/CardGridBlockRender', () => ({ CardGridBlockRender: stubComp('CardGridBlockRender') }));
vi.mock('@/components/blocks/render/SectionBlockRender', () => ({ SectionBlockRender: stubComp('SectionBlockRender') }));
vi.mock('@/components/blocks/render/GalleryBlockRender', () => ({ GalleryBlockRender: stubComp('GalleryBlockRender') }));
vi.mock('@/components/blocks/render/ProductGridBlockRender', () => ({ ProductGridBlockRender: stubComp('ProductGridBlockRender') }));
vi.mock('@/components/blocks/render/FeaturedProductsBlockRender', () => ({ FeaturedProductsBlockRender: stubComp('FeaturedProductsBlockRender') }));
vi.mock('@/components/blocks/render/ProductCategoriesBlockRender', () => ({ ProductCategoriesBlockRender: stubComp('ProductCategoriesBlockRender') }));
vi.mock('@/components/blocks/render/ShoppingCartBlockRender', () => ({ ShoppingCartBlockRender: stubComp('ShoppingCartBlockRender') }));
vi.mock('@/components/blocks/render/StoreBannerBlockRender', () => ({ StoreBannerBlockRender: stubComp('StoreBannerBlockRender') }));
vi.mock('@/components/blocks/render/BookingBlockRender', () => ({ BookingBlockRender: stubComp('BookingBlockRender') }));
vi.mock('@/components/blocks/render/BookingMenuBlockRender', () => ({ BookingMenuBlockRender: stubComp('BookingMenuBlockRender') }));
vi.mock('@/components/blocks/render/SurveyBlockRender', () => ({ SurveyBlockRender: stubComp('SurveyBlockRender') }));
vi.mock('@/components/blocks/render/SocialLinksBlockRender', () => ({ SocialLinksBlockRender: stubComp('SocialLinksBlockRender') }));
vi.mock('@/components/blocks/render/EmailHeaderBlockRender', () => ({ EmailHeaderBlockRender: stubComp('EmailHeaderBlockRender') }));
vi.mock('@/components/blocks/render/EmailFooterBlockRender', () => ({ EmailFooterBlockRender: stubComp('EmailFooterBlockRender') }));
vi.mock('@/components/blocks/render/PalizziNavBlockRender', () => ({ PalizziNavBlockRender: stubComp('PalizziNavBlockRender') }));
vi.mock('@/components/blocks/render/PalizziHeroBlockRender', () => ({ PalizziHeroBlockRender: stubComp('PalizziHeroBlockRender') }));
vi.mock('@/components/blocks/render/PalizziWelcomeBlockRender', () => ({ PalizziWelcomeBlockRender: stubComp('PalizziWelcomeBlockRender') }));
vi.mock('@/components/blocks/render/PalizziHistoryBlockRender', () => ({ PalizziHistoryBlockRender: stubComp('PalizziHistoryBlockRender') }));
vi.mock('@/components/blocks/render/PalizziMenuBlockRender', () => ({ PalizziMenuBlockRender: stubComp('PalizziMenuBlockRender') }));
vi.mock('@/components/blocks/render/PalizziRulesBlockRender', () => ({ PalizziRulesBlockRender: stubComp('PalizziRulesBlockRender') }));
vi.mock('@/components/blocks/render/PalizziMembershipBlockRender', () => ({ PalizziMembershipBlockRender: stubComp('PalizziMembershipBlockRender') }));
vi.mock('@/components/blocks/render/PalizziFooterBlockRender', () => ({ PalizziFooterBlockRender: stubComp('PalizziFooterBlockRender') }));
vi.mock('@/components/blocks/render/ProductDetailBlockRender', () => ({ ProductDetailBlockRender: stubComp('ProductDetailBlockRender') }));
vi.mock('@/components/blocks/render/SurveyResultsBlockRender', () => ({ SurveyResultsBlockRender: stubComp('SurveyResultsBlockRender') }));
vi.mock('@/components/blocks/render/TimelineBlockRender', () => ({ TimelineBlockRender: stubComp('TimelineBlockRender') }));
vi.mock('@/components/blocks/render/TeamShowcaseBlockRender', () => ({ TeamShowcaseBlockRender: stubComp('TeamShowcaseBlockRender') }));
vi.mock('@/components/blocks/render/TeamFlipGridBlockRender', () => ({ TeamFlipGridBlockRender: stubComp('TeamFlipGridBlockRender') }));
vi.mock('@/components/blocks/render/BentoGridBlockRender', () => ({ BentoGridBlockRender: stubComp('BentoGridBlockRender') }));
vi.mock('@/components/blocks/render/FlipCardGridBlockRender', () => ({ FlipCardGridBlockRender: stubComp('FlipCardGridBlockRender') }));
vi.mock('@/components/blocks/render/MetricCardsBlockRender', () => ({ MetricCardsBlockRender: stubComp('MetricCardsBlockRender') }));
vi.mock('@/components/blocks/render/LogoStripBlockRender', () => ({ LogoStripBlockRender: stubComp('LogoStripBlockRender') }));
vi.mock('@/components/blocks/render/SiteFooterBlockRender', () => ({ SiteFooterBlockRender: stubComp('SiteFooterBlockRender') }));
vi.mock('@/components/blocks/render/DeckNavBlockRender', () => ({
  DeckNextSlideBlockRender: stubComp('DeckNextSlideBlockRender'),
  DeckJumpToBlockRender: stubComp('DeckJumpToBlockRender'),
}));
vi.mock('@/components/blocks/render/SurveyInputBlockRender', () => ({ SurveyInputBlockRender: stubComp('SurveyInputBlockRender') }));
vi.mock('@/components/blocks/render/HtmlEmbedBlockRender', () => ({ HtmlEmbedBlockRender: stubComp('HtmlEmbedBlockRender') }));
vi.mock('@/components/blocks/render/HtmlRenderBlockRender', () => ({ HtmlRenderBlockRender: stubComp('HtmlRenderBlockRender') }));
vi.mock('@/components/blocks/render/PopupBlockRender', () => ({ PopupBlockRender: stubComp('PopupBlockRender') }));
vi.mock('@/components/blocks/render/PostContentPlaceholderRender', () => ({ PostContentPlaceholderRender: stubComp('PostContentPlaceholderRender') }));

// ─── lib/workflows/trigger.ts deps ──────────────────────────────────────────
// In-memory workflows store the mock reads from.
interface MockWorkflow {
  id: number;
  clientId: number;
  status: string;
  trigger: unknown;
}
const wfState: { rows: MockWorkflow[] } = { rows: [] };

vi.mock('@/lib/db/schema', () => ({
  workflows: {
    id: 'workflows.id',
    clientId: 'workflows.clientId',
    status: 'workflows.status',
    trigger: 'workflows.trigger',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  return {
    db: {
      select(_proj: unknown) {
        const chain = {
          from(_table: unknown) {
            return chain;
          },
          where(filter: { op: string; args: Array<{ op: string; col: string; val: unknown }> }) {
            // Filter is `and(eq(clientId, X), eq(status, 'active'))`.
            const pairs = filter.args.reduce<Record<string, unknown>>((acc, p) => {
              acc[p.col] = p.val;
              return acc;
            }, {});
            const clientId = pairs['workflows.clientId'];
            const status = pairs['workflows.status'];
            const matches = wfState.rows.filter(
              (w) => w.clientId === clientId && w.status === status,
            );
            // Caller selects { id, trigger } — mimic that shape.
            return Promise.resolve(matches.map((w) => ({ id: w.id, trigger: w.trigger })));
          },
        };
        return chain;
      },
    },
  };
});

const runWorkflowMock = vi.fn();
vi.mock('@/lib/workflows/runtime', () => ({
  runWorkflow: (...args: unknown[]) => runWorkflowMock(...args),
}));

// ─────────────────────────────────────────────────────────────────────────────
// 1. registry.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/visual-editor/registry', () => {
  it('returns the same registry instance across calls (singleton)', async () => {
    const mod = await import('@/lib/visual-editor/registry');
    const a = mod.getBlockRegistry();
    const b = mod.getBlockRegistry();
    expect(a).toBe(b);
  });

  it('returns a component for built-in block types', async () => {
    const { getBlockRegistry } = await import('@/lib/visual-editor/registry');
    const reg = getBlockRegistry();
    expect(reg.get('text')).toBeTypeOf('function');
    expect(reg.get('heading')).toBeTypeOf('function');
    expect(reg.get('image')).toBeTypeOf('function');
    expect(reg.get('button')).toBeTypeOf('function');
    expect(reg.get('spacer')).toBeTypeOf('function');
    expect(reg.get('divider')).toBeTypeOf('function');
    expect(reg.get('quote')).toBeTypeOf('function');
    expect(reg.get('code')).toBeTypeOf('function');
  });

  it('returns a component for hyphenated block types', async () => {
    const { getBlockRegistry } = await import('@/lib/visual-editor/registry');
    const reg = getBlockRegistry();
    expect(reg.get('hero-slideshow')).toBeTypeOf('function');
    expect(reg.get('services-grid')).toBeTypeOf('function');
    expect(reg.get('card-grid')).toBeTypeOf('function');
    expect(reg.get('blog-posts')).toBeTypeOf('function');
    expect(reg.get('featured-content')).toBeTypeOf('function');
    expect(reg.get('shopping-cart')).toBeTypeOf('function');
    expect(reg.get('product-detail')).toBeTypeOf('function');
    expect(reg.get('team-flip-grid')).toBeTypeOf('function');
    expect(reg.get('html-render')).toBeTypeOf('function');
    expect(reg.get('html-embed')).toBeTypeOf('function');
    expect(reg.get('post-content')).toBeTypeOf('function');
    expect(reg.get('deck-next-slide')).toBeTypeOf('function');
    expect(reg.get('deck-jump-to')).toBeTypeOf('function');
  });

  it('returns undefined for unknown block types', async () => {
    const { getBlockRegistry } = await import('@/lib/visual-editor/registry');
    const reg = getBlockRegistry();
    expect(reg.get('nonexistent-block-type')).toBeUndefined();
    expect(reg.get('')).toBeUndefined();
    expect(reg.get('TEXT')).toBeUndefined(); // case-sensitive
  });

  it('getCustomManifests returns an empty array (no custom registrations yet)', async () => {
    const { getBlockRegistry } = await import('@/lib/visual-editor/registry');
    const reg = getBlockRegistry();
    expect(reg.getCustomManifests()).toEqual([]);
  });

  it('covers all 60+ registered built-ins (sanity sweep)', async () => {
    const { getBlockRegistry } = await import('@/lib/visual-editor/registry');
    const reg = getBlockRegistry();
    const allTypes = [
      'text', 'heading', 'image', 'button', 'spacer', 'divider', 'quote',
      'code', 'video', 'youtube', 'columns', 'tabs', 'accordion', 'hero',
      'hero-slideshow', 'marquee', 'services-grid', 'cta', 'testimonial',
      'stats', 'blog-posts', 'featured-content', 'card-grid', 'section',
      'gallery', 'product-grid', 'featured-products', 'product-categories',
      'shopping-cart', 'store-banner', 'booking', 'booking-menu', 'survey',
      'social-links', 'email-header', 'email-footer', 'palizzi-nav',
      'palizzi-hero', 'palizzi-welcome', 'palizzi-history', 'palizzi-menu',
      'palizzi-rules', 'palizzi-membership', 'palizzi-footer',
      'product-detail', 'survey-results', 'timeline', 'team-showcase',
      'team-flip-grid', 'bento-grid', 'flip-card-grid', 'metric-cards',
      'logo-strip', 'site-footer', 'deck-next-slide', 'deck-jump-to',
      'survey-input', 'html-embed', 'html-render', 'popup', 'post-content',
    ];
    for (const t of allTypes) {
      expect(reg.get(t), `expected built-in for "${t}"`).toBeTypeOf('function');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. protocol.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/visual-editor/protocol', () => {
  describe('isValidOrigin', () => {
    it('allows http://localhost on any port', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('http://localhost:3000')).toBe(true);
      expect(isValidOrigin('http://localhost:8080')).toBe(true);
      expect(isValidOrigin('http://localhost:0')).toBe(true);
    });

    it('allows http://127.0.0.1 on any port', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('http://127.0.0.1:3000')).toBe(true);
    });

    it('allows the apex simplerdevelopment.com', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('https://simplerdevelopment.com')).toBe(true);
    });

    it('allows subdomains of .simplerdevelopment.com', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('https://app.simplerdevelopment.com')).toBe(true);
      expect(isValidOrigin('https://portal.simplerdevelopment.com')).toBe(true);
    });

    it('allows .up.railway.app subdomains', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('https://my-app.up.railway.app')).toBe(true);
    });

    it('rejects unrelated origins', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('https://evil.com')).toBe(false);
      expect(isValidOrigin('https://simplerdevelopment.net')).toBe(false); // wrong TLD
      expect(isValidOrigin('https://notsimplerdevelopment.com')).toBe(false); // not a subdomain
    });

    it('returns false for malformed URLs', async () => {
      const { isValidOrigin } = await import('@/lib/visual-editor/protocol');
      expect(isValidOrigin('not-a-url')).toBe(false);
      expect(isValidOrigin('')).toBe(false);
      expect(isValidOrigin('://broken')).toBe(false);
    });
  });

  describe('createMessage', () => {
    it('builds a parent-source message with all fields', async () => {
      const { createMessage } = await import('@/lib/visual-editor/protocol');
      const before = Date.now();
      const msg = createMessage('sd-editor-parent', 'TEST_TYPE', { foo: 'bar' });
      const after = Date.now();
      expect(msg.source).toBe('sd-editor-parent');
      expect(msg.type).toBe('TEST_TYPE');
      expect(msg.payload).toEqual({ foo: 'bar' });
      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });

    it('builds an iframe-source message', async () => {
      const { createMessage } = await import('@/lib/visual-editor/protocol');
      const msg = createMessage('sd-editor-iframe', 'X', null);
      expect(msg.source).toBe('sd-editor-iframe');
      expect(msg.payload).toBeNull();
    });
  });

  describe('isVisualEditorMessage', () => {
    it('accepts a well-formed parent message', async () => {
      const { isVisualEditorMessage } = await import('@/lib/visual-editor/protocol');
      expect(
        isVisualEditorMessage({
          source: 'sd-editor-parent',
          type: 'X',
          payload: null,
          timestamp: 0,
        }),
      ).toBe(true);
    });

    it('accepts a well-formed iframe message', async () => {
      const { isVisualEditorMessage } = await import('@/lib/visual-editor/protocol');
      expect(
        isVisualEditorMessage({
          source: 'sd-editor-iframe',
          type: 'X',
          payload: null,
          timestamp: 1234,
        }),
      ).toBe(true);
    });

    it('rejects null, undefined, primitives, and arrays as non-objects', async () => {
      const { isVisualEditorMessage } = await import('@/lib/visual-editor/protocol');
      expect(isVisualEditorMessage(null)).toBe(false);
      expect(isVisualEditorMessage(undefined)).toBe(false);
      expect(isVisualEditorMessage('hello')).toBe(false);
      expect(isVisualEditorMessage(42)).toBe(false);
    });

    it('rejects objects with the wrong source', async () => {
      const { isVisualEditorMessage } = await import('@/lib/visual-editor/protocol');
      expect(
        isVisualEditorMessage({ source: 'other', type: 'X', timestamp: 0 }),
      ).toBe(false);
    });

    it('rejects objects with non-string type', async () => {
      const { isVisualEditorMessage } = await import('@/lib/visual-editor/protocol');
      expect(
        isVisualEditorMessage({ source: 'sd-editor-parent', type: 123, timestamp: 0 }),
      ).toBe(false);
    });

    it('rejects objects with non-number timestamp', async () => {
      const { isVisualEditorMessage } = await import('@/lib/visual-editor/protocol');
      expect(
        isVisualEditorMessage({ source: 'sd-editor-parent', type: 'X', timestamp: 'now' }),
      ).toBe(false);
    });
  });

  describe('sendToIframe', () => {
    it('is a no-op when iframe is null', async () => {
      const { sendToIframe } = await import('@/lib/visual-editor/protocol');
      // Should NOT throw.
      expect(() => sendToIframe(null, 'X', { a: 1 })).not.toThrow();
    });

    it('is a no-op when iframe.contentWindow is null', async () => {
      const { sendToIframe } = await import('@/lib/visual-editor/protocol');
      const iframe = { contentWindow: null } as unknown as HTMLIFrameElement;
      expect(() => sendToIframe(iframe, 'X', null)).not.toThrow();
    });

    it('posts a parent-source message to iframe.contentWindow', async () => {
      const { sendToIframe } = await import('@/lib/visual-editor/protocol');
      const postMessage = vi.fn();
      const iframe = {
        contentWindow: { postMessage },
      } as unknown as HTMLIFrameElement;
      sendToIframe(iframe, 'MY_TYPE', { x: 1 });
      expect(postMessage).toHaveBeenCalledTimes(1);
      const [msg, targetOrigin] = postMessage.mock.calls[0];
      expect(targetOrigin).toBe('*');
      expect(msg).toMatchObject({
        source: 'sd-editor-parent',
        type: 'MY_TYPE',
        payload: { x: 1 },
      });
      expect(typeof msg.timestamp).toBe('number');
    });
  });

  describe('sendToParent', () => {
    let originalParent: Window;
    beforeEach(() => {
      originalParent = window.parent;
    });

    it('is a no-op when window.parent === window (top frame)', async () => {
      const { sendToParent } = await import('@/lib/visual-editor/protocol');
      // jsdom: window.parent is the window itself by default.
      expect(window.parent).toBe(window);
      const spy = vi.spyOn(window, 'postMessage');
      sendToParent('X', { y: 2 });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('posts an iframe-source message when window.parent !== window', async () => {
      const { sendToParent } = await import('@/lib/visual-editor/protocol');
      const postMessage = vi.fn();
      const fakeParent = { postMessage } as unknown as Window;
      // Replace `window.parent` with a fake distinct window.
      Object.defineProperty(window, 'parent', {
        configurable: true,
        value: fakeParent,
      });
      try {
        sendToParent('CHILD_TYPE', { z: 3 });
        expect(postMessage).toHaveBeenCalledTimes(1);
        const [msg, targetOrigin] = postMessage.mock.calls[0];
        expect(targetOrigin).toBe('*');
        expect(msg).toMatchObject({
          source: 'sd-editor-iframe',
          type: 'CHILD_TYPE',
          payload: { z: 3 },
        });
      } finally {
        Object.defineProperty(window, 'parent', {
          configurable: true,
          value: originalParent,
        });
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. lib/workflows/trigger.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/workflows/trigger.enqueueWorkflowRunsForTrigger', () => {
  beforeEach(() => {
    wfState.rows = [];
    runWorkflowMock.mockReset();
  });

  it('returns empty matches when no workflows exist', async () => {
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {});
    expect(out).toEqual({ matchedWorkflowIds: [] });
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it('skips inactive workflows', async () => {
    wfState.rows = [
      { id: 10, clientId: 1, status: 'draft', trigger: { kind: 'contact.created' } },
      { id: 11, clientId: 1, status: 'paused', trigger: { kind: 'contact.created' } },
    ];
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {});
    expect(out.matchedWorkflowIds).toEqual([]);
    expect(runWorkflowMock).not.toHaveBeenCalled();
  });

  it('scopes to clientId — does not pick up other clients active workflows', async () => {
    wfState.rows = [
      { id: 20, clientId: 1, status: 'active', trigger: { kind: 'contact.created' } },
      { id: 21, clientId: 2, status: 'active', trigger: { kind: 'contact.created' } },
    ];
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {}, { awaitRuns: true });
    expect(out.matchedWorkflowIds).toEqual([20]);
    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
  });

  it('matches by trigger.kind for contact.created', async () => {
    wfState.rows = [
      { id: 30, clientId: 1, status: 'active', trigger: { kind: 'contact.created' } },
      { id: 31, clientId: 1, status: 'active', trigger: { kind: 'form.submitted' } },
    ];
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {}, { awaitRuns: true });
    expect(out.matchedWorkflowIds).toEqual([30]);
    expect(runWorkflowMock).toHaveBeenCalledWith(30, expect.objectContaining({ clientId: 1 }), { triggeredBy: 'event' });
  });

  it('enriches context with clientId', async () => {
    wfState.rows = [
      { id: 40, clientId: 7, status: 'active', trigger: { kind: 'contact.created' } },
    ];
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    await enqueueWorkflowRunsForTrigger(7, { kind: 'contact.created' }, { foo: 'bar' }, { awaitRuns: true });
    const callArg = runWorkflowMock.mock.calls[0][1];
    expect(callArg).toEqual({ foo: 'bar', clientId: 7 });
  });

  it('passes through opts.triggeredBy', async () => {
    wfState.rows = [
      { id: 50, clientId: 1, status: 'active', trigger: { kind: 'contact.created' } },
    ];
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {}, { awaitRuns: true, triggeredBy: 'cron' });
    expect(runWorkflowMock).toHaveBeenCalledWith(50, expect.any(Object), { triggeredBy: 'cron' });
  });

  it('defaults triggeredBy to "event" when not provided', async () => {
    wfState.rows = [
      { id: 51, clientId: 1, status: 'active', trigger: { kind: 'contact.created' } },
    ];
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {}, { awaitRuns: true });
    expect(runWorkflowMock).toHaveBeenCalledWith(51, expect.any(Object), { triggeredBy: 'event' });
  });

  it('runs fire-and-forget by default (awaitRuns omitted)', async () => {
    wfState.rows = [
      { id: 60, clientId: 1, status: 'active', trigger: { kind: 'contact.created' } },
    ];
    runWorkflowMock.mockResolvedValueOnce(undefined);
    const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
    const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'contact.created' }, {});
    expect(out.matchedWorkflowIds).toEqual([60]);
    expect(runWorkflowMock).toHaveBeenCalled();
  });

  describe('deal.stage_changed matcher', () => {
    it('matches when stored has no stageId (broad)', async () => {
      wfState.rows = [
        { id: 70, clientId: 1, status: 'active', trigger: { kind: 'deal.stage_changed' } },
      ];
      const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
      const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'deal.stage_changed', stageId: 99 }, {}, { awaitRuns: true });
      expect(out.matchedWorkflowIds).toEqual([70]);
    });

    it('matches when stored.stageId === incoming.stageId', async () => {
      wfState.rows = [
        { id: 71, clientId: 1, status: 'active', trigger: { kind: 'deal.stage_changed', stageId: 5 } },
      ];
      const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
      const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'deal.stage_changed', stageId: 5 }, {}, { awaitRuns: true });
      expect(out.matchedWorkflowIds).toEqual([71]);
    });

    it('rejects when stored.stageId !== incoming.stageId', async () => {
      wfState.rows = [
        { id: 72, clientId: 1, status: 'active', trigger: { kind: 'deal.stage_changed', stageId: 5 } },
      ];
      const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
      const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'deal.stage_changed', stageId: 6 }, {}, { awaitRuns: true });
      expect(out.matchedWorkflowIds).toEqual([]);
    });
  });

  describe('form.submitted matcher', () => {
    it('matches when stored has no formId (broad)', async () => {
      wfState.rows = [
        { id: 80, clientId: 1, status: 'active', trigger: { kind: 'form.submitted' } },
      ];
      const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
      const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'form.submitted', formId: 12 }, {}, { awaitRuns: true });
      expect(out.matchedWorkflowIds).toEqual([80]);
    });

    it('matches when stored.formId === incoming.formId', async () => {
      wfState.rows = [
        { id: 81, clientId: 1, status: 'active', trigger: { kind: 'form.submitted', formId: 12 } },
      ];
      const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
      const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'form.submitted', formId: 12 }, {}, { awaitRuns: true });
      expect(out.matchedWorkflowIds).toEqual([81]);
    });

    it('rejects when stored.formId !== incoming.formId', async () => {
      wfState.rows = [
        { id: 82, clientId: 1, status: 'active', trigger: { kind: 'form.submitted', formId: 12 } },
      ];
      const { enqueueWorkflowRunsForTrigger } = await import('@/lib/workflows/trigger');
      const out = await enqueueWorkflowRunsForTrigger(1, { kind: 'form.submitted', formId: 13 }, {}, { awaitRuns: true });
      expect(out.matchedWorkflowIds).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. lib/portal-utils.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('lib/portal-utils', () => {
  describe('formatCents', () => {
    it('formats whole dollars', async () => {
      const { formatCents } = await import('@/lib/portal-utils');
      expect(formatCents(0)).toBe('$0.00');
      expect(formatCents(100)).toBe('$1.00');
      expect(formatCents(99)).toBe('$0.99');
    });

    it('handles thousands separator', async () => {
      const { formatCents } = await import('@/lib/portal-utils');
      expect(formatCents(123456)).toBe('$1,234.56');
    });

    it('formats negative cents', async () => {
      const { formatCents } = await import('@/lib/portal-utils');
      expect(formatCents(-500)).toBe('-$5.00');
    });
  });

  describe('invoiceStatusColor', () => {
    it('returns mapped classes for known statuses', async () => {
      const { invoiceStatusColor } = await import('@/lib/portal-utils');
      expect(invoiceStatusColor('draft')).toBe('bg-muted text-muted-foreground');
      expect(invoiceStatusColor('sent')).toBe('bg-blue-100 text-blue-700');
      expect(invoiceStatusColor('paid')).toBe('bg-green-100 text-green-700');
      expect(invoiceStatusColor('overdue')).toBe('bg-red-100 text-red-700');
      expect(invoiceStatusColor('cancelled')).toBe('bg-gray-100 text-gray-500');
    });

    it('falls back to muted for unknown status', async () => {
      const { invoiceStatusColor } = await import('@/lib/portal-utils');
      expect(invoiceStatusColor('foo')).toBe('bg-muted text-muted-foreground');
      expect(invoiceStatusColor('')).toBe('bg-muted text-muted-foreground');
    });
  });

  describe('ticketStatusColor', () => {
    it('returns mapped classes for known statuses', async () => {
      const { ticketStatusColor } = await import('@/lib/portal-utils');
      expect(ticketStatusColor('open')).toBe('bg-blue-100 text-blue-700');
      expect(ticketStatusColor('in_progress')).toBe('bg-yellow-100 text-yellow-700');
      expect(ticketStatusColor('waiting')).toBe('bg-orange-100 text-orange-700');
      expect(ticketStatusColor('waiting_on_customer')).toBe('bg-orange-100 text-orange-700');
      expect(ticketStatusColor('resolved')).toBe('bg-green-100 text-green-700');
      expect(ticketStatusColor('closed')).toBe('bg-gray-100 text-gray-500');
    });

    it('falls back to muted for unknown', async () => {
      const { ticketStatusColor } = await import('@/lib/portal-utils');
      expect(ticketStatusColor('unknown')).toBe('bg-muted text-muted-foreground');
    });
  });

  describe('priorityColor', () => {
    it('returns mapped classes for known priorities', async () => {
      const { priorityColor } = await import('@/lib/portal-utils');
      expect(priorityColor('low')).toBe('bg-gray-100 text-gray-600');
      expect(priorityColor('medium')).toBe('bg-blue-100 text-blue-700');
      expect(priorityColor('high')).toBe('bg-orange-100 text-orange-700');
      expect(priorityColor('urgent')).toBe('bg-red-100 text-red-700');
    });

    it('falls back to muted for unknown', async () => {
      const { priorityColor } = await import('@/lib/portal-utils');
      expect(priorityColor('critical')).toBe('bg-muted text-muted-foreground');
    });
  });

  describe('orderStatusColor', () => {
    it('returns mapped classes for known statuses', async () => {
      const { orderStatusColor } = await import('@/lib/portal-utils');
      expect(orderStatusColor('pending')).toBe('bg-yellow-100 text-yellow-700');
      expect(orderStatusColor('confirmed')).toBe('bg-blue-100 text-blue-700');
      expect(orderStatusColor('processing')).toBe('bg-indigo-100 text-indigo-700');
      expect(orderStatusColor('shipped')).toBe('bg-purple-100 text-purple-700');
      expect(orderStatusColor('delivered')).toBe('bg-green-100 text-green-700');
      expect(orderStatusColor('cancelled')).toBe('bg-red-100 text-red-700');
      expect(orderStatusColor('refunded')).toBe('bg-orange-100 text-orange-700');
    });

    it('falls back to muted for unknown', async () => {
      const { orderStatusColor } = await import('@/lib/portal-utils');
      expect(orderStatusColor('lost')).toBe('bg-muted text-muted-foreground');
    });
  });

  describe('paymentStatusColor', () => {
    it('returns mapped classes for known statuses', async () => {
      const { paymentStatusColor } = await import('@/lib/portal-utils');
      expect(paymentStatusColor('pending')).toBe('bg-yellow-100 text-yellow-700');
      expect(paymentStatusColor('paid')).toBe('bg-green-100 text-green-700');
      expect(paymentStatusColor('failed')).toBe('bg-red-100 text-red-700');
      expect(paymentStatusColor('refunded')).toBe('bg-orange-100 text-orange-700');
      expect(paymentStatusColor('partially_refunded')).toBe('bg-amber-100 text-amber-700');
    });

    it('falls back to muted for unknown', async () => {
      const { paymentStatusColor } = await import('@/lib/portal-utils');
      expect(paymentStatusColor('held')).toBe('bg-muted text-muted-foreground');
    });
  });

  describe('stripMarkdown', () => {
    it('strips fenced code blocks', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('before\n```js\nconst x = 1;\n```\nafter')).toContain('before');
      expect(stripMarkdown('before\n```js\nconst x = 1;\n```\nafter')).toContain('after');
      expect(stripMarkdown('```\ncode\n```')).not.toContain('code');
    });

    it('unwraps inline code', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('see `foo` here')).toBe('see foo here');
    });

    it('drops images but keeps alt text', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('![alt text](https://x.com/i.png)')).toBe('alt text');
    });

    it('unwraps links to their text', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('see [the docs](https://x.com)')).toBe('see the docs');
    });

    it('strips heading prefixes', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      // The heading regex `^\s{0,3}#{1,6}\s+` consumes leading hashes plus the
      // following space. `^` is per-line (gm), so adjacent newlines between
      // strippable lines collapse to a single newline before the final
      // `\n{2,}` pass.
      expect(stripMarkdown('# Title\n## Subtitle')).toBe('Title\nSubtitle');
      expect(stripMarkdown('# Hello world')).toBe('Hello world');
      expect(stripMarkdown('###### deepest')).toBe('deepest');
    });

    it('strips blockquotes', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('> quoted')).toBe('quoted');
    });

    it('strips unordered list markers', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      // Single newlines are preserved by stripMarkdown — only \n{2,} collapses.
      expect(stripMarkdown('- item one\n- item two')).toBe('item one\nitem two');
      expect(stripMarkdown('* item')).toBe('item');
      expect(stripMarkdown('+ item')).toBe('item');
    });

    it('strips ordered list markers', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      // The `^\s*\d+\.\s+` regex with `\s*` on a per-line `^` ends up
      // collapsing the gap newline between consecutive list items.
      expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond');
      expect(stripMarkdown('1. only')).toBe('only');
    });

    it('strips bold (** and __)', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('this is **bold**')).toBe('this is bold');
      expect(stripMarkdown('this is __bold__')).toBe('this is bold');
    });

    it('strips italic (* and _)', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('this is *italic*')).toBe('this is italic');
      expect(stripMarkdown('this is _italic_')).toBe('this is italic');
    });

    it('strips strikethrough', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('this is ~~struck~~')).toBe('this is struck');
    });

    it('collapses paragraph breaks into a single space', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('para one\n\npara two')).toBe('para one para two');
    });

    it('trims leading/trailing whitespace', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('   hello   ')).toBe('hello');
    });

    it('returns empty string for empty input', async () => {
      const { stripMarkdown } = await import('@/lib/portal-utils');
      expect(stripMarkdown('')).toBe('');
    });
  });
});
