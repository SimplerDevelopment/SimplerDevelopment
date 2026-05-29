'use client';

import { Block, BlockEditorData } from '@/types/blocks';
import { TextBlockRender } from './TextBlockRender';
import { HeadingBlockRender } from './HeadingBlockRender';
import { ImageBlockRender } from './ImageBlockRender';
import { ButtonBlockRender } from './ButtonBlockRender';
import { SpacerBlockRender } from './SpacerBlockRender';
import { DividerBlockRender } from './DividerBlockRender';
import { QuoteBlockRender } from './QuoteBlockRender';
import { CodeBlockRender } from './CodeBlockRender';
import { VideoBlockRender } from './VideoBlockRender';
import { YoutubeBlockRender } from './YoutubeBlockRender';
import { ColumnsBlockRender } from './ColumnsBlockRender';
import { TabsBlockRender } from './TabsBlockRender';
import { StickyScrollTabsBlockRender } from './StickyScrollTabsBlockRender';
import { AccordionBlockRender } from './AccordionBlockRender';
import { HeroBlockRender } from './HeroBlockRender';
import { MarqueeBlockRender } from './MarqueeBlockRender';
import { ServicesGridBlockRender } from './ServicesGridBlockRender';
import { CtaBlockRender } from './CtaBlockRender';
import { TestimonialBlockRender } from './TestimonialBlockRender';
import { StatsBlockRender } from './StatsBlockRender';
import { BlogPostsBlockRender } from './BlogPostsBlockRender';
import { FeaturedContentBlockRender } from './FeaturedContentBlockRender';
import { CardGridBlockRender } from './CardGridBlockRender';
import { SectionBlockRender } from './SectionBlockRender';
import { GalleryBlockRender } from './GalleryBlockRender';
import { PalizziNavBlockRender } from './PalizziNavBlockRender';
import { PalizziHeroBlockRender } from './PalizziHeroBlockRender';
import { PalizziWelcomeBlockRender } from './PalizziWelcomeBlockRender';
import { PalizziHistoryBlockRender } from './PalizziHistoryBlockRender';
import { PalizziMenuBlockRender } from './PalizziMenuBlockRender';
import { PalizziRulesBlockRender } from './PalizziRulesBlockRender';
import { PalizziMembershipBlockRender } from './PalizziMembershipBlockRender';
import { PalizziFooterBlockRender } from './PalizziFooterBlockRender';
import { SocialLinksBlockRender } from './SocialLinksBlockRender';
import { EmailHeaderBlockRender } from './EmailHeaderBlockRender';
import { EmailFooterBlockRender } from './EmailFooterBlockRender';
import { TimelineBlockRender } from './TimelineBlockRender';
import { TeamShowcaseBlockRender } from './TeamShowcaseBlockRender';
import { TeamFlipGridBlockRender } from './TeamFlipGridBlockRender';
import { BentoGridBlockRender } from './BentoGridBlockRender';
import { SiteFooterBlockRender } from './SiteFooterBlockRender';
import { DeckNextSlideBlockRender, DeckJumpToBlockRender } from './DeckNavBlockRender';
import { FlipCardGridBlockRender } from './FlipCardGridBlockRender';
import { MetricCardsBlockRender } from './MetricCardsBlockRender';
import { LogoStripBlockRender } from './LogoStripBlockRender';
import { PopupBlockRender } from './PopupBlockRender';
import { PostContentPlaceholderRender } from './PostContentPlaceholderRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import type { ResolvedBranding } from '@/lib/branding';
import { BrandingProvider } from '@/contexts/BrandingContext';

// Heavy / rarely-needed block renderers are lazy-loaded from the shared
// lazy-blocks module (Stripe/booking, survey engine, commerce, html-render/
// embed, slideshow). See that file for the full rationale. The switch below is
// unchanged — these names just resolve to next/dynamic components now.
import {
  HeroSlideshowBlockRender,
  ProductGridBlockRender,
  FeaturedProductsBlockRender,
  ProductCategoriesBlockRender,
  ShoppingCartBlockRender,
  StoreBannerBlockRender,
  ProductDetailBlockRender,
  BookingBlockRender,
  BookingMenuBlockRender,
  SurveyBlockRender,
  SurveyResultsBlockRender,
  SurveyInputBlockRender,
  HtmlEmbedBlockRender,
  HtmlRenderBlockRender,
} from './lazy-blocks';

interface BlockRendererProps {
  content: string;
  siteId?: number;
  branding?: ResolvedBranding;
}

export function BlockRenderer({ content, siteId, branding }: BlockRendererProps) {
  // Parse content as BlockEditorData
  let blocks: Block[] = [];

  try {
    const data = JSON.parse(content) as BlockEditorData;
    blocks = data.blocks || [];
  } catch {
    // If not valid JSON, display as raw HTML
    return (
      <div className="prose prose-lg dark:prose-invert max-w-none">
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    );
  }

  if (blocks.length === 0) {
    return null;
  }

  // Detect if content uses custom layout blocks (no wrapper spacing needed)
  const hasCustomLayout = blocks.some((b) => b.type.startsWith('palizzi-'));

  // Full-width block types that should NOT get a constraining container.
  // These handle their own internal widths (hero = full viewport, section = has maxWidth prop, etc.)
  const FULL_WIDTH_TYPES = new Set([
    'hero', 'hero-slideshow', 'section', 'marquee', 'cta', 'site-footer',
    'palizzi-nav', 'palizzi-hero', 'palizzi-welcome', 'palizzi-history',
    'palizzi-menu', 'palizzi-rules', 'palizzi-membership', 'palizzi-footer',
    // html-embed manages its own width via block.width ('full' | 'contained');
    // keep it out of the default max-w-7xl wrapper so 'full' really is full.
    'html-embed',
    // html-render does the same — caller-controlled width, no outer constraint.
    'html-render',
  ]);

  const rendered = (
    <div className={hasCustomLayout ? 'block-content' : 'block-content'} data-site-id={siteId || undefined}>
      {blocks.map((block, idx) => {
        const isFullWidth = FULL_WIDTH_TYPES.has(block.type);
        // Fallback key for legacy data where block.id is missing (e.g. older
        // LLM-authored pitch decks). Write paths now backfill ids, but we
        // can't trust all on-disk content.
        const key = block.id ?? `block-${idx}-${block.type}`;
        return (
          <div
            key={key}
            id={block.anchor || undefined}
            data-block-id={block.id}
            data-block-type={block.type}
            className={hasCustomLayout ? '' : isFullWidth ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}
            style={block.anchor ? { scrollMarginTop: '80px' } : undefined}
          >
            <BlockStyleWrapper block={block}>
              {renderBlock(block, siteId)}
            </BlockStyleWrapper>
          </div>
        );
      })}
    </div>
  );

  // Wrap with BrandingProvider when branding is available — injects CSS variables
  // (--brand-primary, --brand-accent, etc.) so blocks can reference them.
  if (branding) {
    return <BrandingProvider branding={branding}>{rendered}</BrandingProvider>;
  }

  return rendered;
}

// Legacy type aliases from LLM-authored content — normalized before the
// dispatch switch so the renderers still receive canonical types.
const TYPE_ALIASES: Record<string, Block['type']> = {
  'stat-grid': 'stats',
};

function renderBlock(block: Block, siteId?: number) {
  const canonicalType = TYPE_ALIASES[block.type as string] ?? block.type;
  const normalized = (canonicalType === block.type ? block : { ...block, type: canonicalType }) as Block;
  switch (normalized.type) {
    case 'text':
      return <TextBlockRender block={normalized} />;
    case 'heading':
      return <HeadingBlockRender block={normalized} />;
    case 'image':
      return <ImageBlockRender block={normalized} />;
    case 'button':
      return <ButtonBlockRender block={normalized} />;
    case 'spacer':
      return <SpacerBlockRender block={normalized} />;
    case 'divider':
      return <DividerBlockRender block={normalized} />;
    case 'quote':
      return <QuoteBlockRender block={normalized} />;
    case 'code':
      return <CodeBlockRender block={normalized} />;
    case 'video':
      return <VideoBlockRender block={normalized} />;
    case 'youtube':
      return <YoutubeBlockRender block={normalized} />;
    case 'columns':
      return <ColumnsBlockRender block={normalized} />;
    case 'tabs':
      return <TabsBlockRender block={normalized} />;
    case 'sticky-scroll-tabs':
      return <StickyScrollTabsBlockRender block={normalized} />;
    case 'accordion':
      return <AccordionBlockRender block={normalized} />;
    case 'hero':
      return <HeroBlockRender block={normalized} />;
    case 'hero-slideshow':
      return <HeroSlideshowBlockRender block={normalized} />;
    case 'marquee':
      return <MarqueeBlockRender block={normalized} />;
    case 'services-grid':
      return <ServicesGridBlockRender block={normalized} />;
    case 'cta':
      return <CtaBlockRender block={normalized} />;
    case 'testimonial':
      return <TestimonialBlockRender block={normalized} />;
    case 'stats':
      return <StatsBlockRender block={normalized} />;
    case 'blog-posts':
      return <BlogPostsBlockRender block={normalized} />;
    case 'featured-content':
      return <FeaturedContentBlockRender block={normalized} />;
    case 'card-grid':
      return <CardGridBlockRender block={normalized} />;
    case 'section':
      return <SectionBlockRender block={normalized} />;
    case 'gallery':
      return <GalleryBlockRender block={normalized} />;
    case 'palizzi-nav':
      return <PalizziNavBlockRender block={normalized} />;
    case 'palizzi-hero':
      return <PalizziHeroBlockRender block={normalized} />;
    case 'palizzi-welcome':
      return <PalizziWelcomeBlockRender block={normalized} />;
    case 'palizzi-history':
      return <PalizziHistoryBlockRender block={normalized} />;
    case 'palizzi-menu':
      return <PalizziMenuBlockRender block={normalized} />;
    case 'palizzi-rules':
      return <PalizziRulesBlockRender block={normalized} />;
    case 'palizzi-membership':
      return <PalizziMembershipBlockRender block={normalized} />;
    case 'palizzi-footer':
      return <PalizziFooterBlockRender block={normalized} />;
    case 'product-grid':
      return <ProductGridBlockRender block={normalized} siteId={siteId} />;
    case 'featured-products':
      return <FeaturedProductsBlockRender block={normalized} siteId={siteId} />;
    case 'product-categories':
      return <ProductCategoriesBlockRender block={normalized} siteId={siteId} />;
    case 'shopping-cart':
      return <ShoppingCartBlockRender block={normalized} siteId={siteId} />;
    case 'store-banner':
      return <StoreBannerBlockRender block={normalized} />;
    case 'product-detail':
      return <ProductDetailBlockRender block={normalized} siteId={siteId} />;
    case 'booking':
      return <BookingBlockRender block={normalized} />;
    case 'booking-menu':
      return <BookingMenuBlockRender block={normalized} siteId={siteId} />;
    case 'survey':
      return <SurveyBlockRender block={normalized} />;
    case 'survey-results':
      return <SurveyResultsBlockRender block={normalized} />;
    case 'social-links':
      return <SocialLinksBlockRender block={normalized} />;
    case 'email-header':
      return <EmailHeaderBlockRender block={normalized} />;
    case 'email-footer':
      return <EmailFooterBlockRender block={normalized} />;
    case 'timeline':
      return <TimelineBlockRender block={normalized} />;
    case 'team-showcase':
      return <TeamShowcaseBlockRender block={normalized} />;
    case 'team-flip-grid':
      return <TeamFlipGridBlockRender block={normalized} />;
    case 'bento-grid':
      return <BentoGridBlockRender block={normalized} />;
    case 'site-footer':
      return <SiteFooterBlockRender block={normalized} />;
    case 'flip-card-grid':
      return <FlipCardGridBlockRender block={normalized} />;
    case 'metric-cards':
      return <MetricCardsBlockRender block={normalized} />;
    case 'logo-strip':
      return <LogoStripBlockRender block={normalized} />;
    case 'survey-input':
      return <SurveyInputBlockRender block={normalized} />;
    case 'deck-next-slide':
      return <DeckNextSlideBlockRender block={normalized} />;
    case 'deck-jump-to':
      return <DeckJumpToBlockRender block={normalized} />;
    case 'html-embed':
      return <HtmlEmbedBlockRender block={normalized} />;
    case 'html-render':
      return <HtmlRenderBlockRender block={normalized} />;
    case 'popup':
      return <PopupBlockRender block={normalized} />;
    case 'post-content':
      // wrapWithTypeTemplate() substitutes this block with the post body
      // before render in production, so reaching this case means we're
      // rendering a template preview directly — show the visible placeholder
      // so the editor can see the slot.
      return <PostContentPlaceholderRender block={normalized} />;
    default:
      return <UnknownBlockFallback block={normalized} />;
  }
}

/**
 * Rendered when a block has an unrecognized `type`. In development and for
 * draft content it shows an inline warning so silent drift between the MCP
 * schema and the renderer is visible. In production-published content we
 * render nothing (preserves prior behavior — no user-visible breakage).
 */
function UnknownBlockFallback({ block }: { block: Block }) {
  if (process.env.NODE_ENV !== 'development') return null;
  const keys = Object.keys(block).filter(k => k !== 'type' && k !== 'id' && k !== 'order' && k !== 'style' && k !== 'elementStyles' && k !== 'anchor' && k !== 'responsive');
  return (
    <div
      role="alert"
      className="my-4 border border-dashed border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-200 rounded-md px-4 py-3 text-sm"
      data-unknown-block-type={block.type}
    >
      <strong className="font-semibold">Unknown block type:</strong> <code className="font-mono">{block.type}</code>
      {keys.length > 0 && (
        <span className="opacity-70"> — authored fields: [{keys.join(', ')}]</span>
      )}
      <div className="opacity-70 mt-1 text-xs">
        The renderer has no component registered for this type. Either add a case in <code>BlockRenderer.tsx</code> or update the MCP <code>blocks://schema</code> resource. Warning hidden in production.
      </div>
    </div>
  );
}
