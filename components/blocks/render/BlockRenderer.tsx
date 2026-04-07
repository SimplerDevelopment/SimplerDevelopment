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
import { AccordionBlockRender } from './AccordionBlockRender';
import { HeroBlockRender } from './HeroBlockRender';
import { HeroSlideshowBlockRender } from './HeroSlideshowBlockRender';
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
import { ProductGridBlockRender } from './ProductGridBlockRender';
import { FeaturedProductsBlockRender } from './FeaturedProductsBlockRender';
import { ProductCategoriesBlockRender } from './ProductCategoriesBlockRender';
import { ShoppingCartBlockRender } from './ShoppingCartBlockRender';
import { StoreBannerBlockRender } from './StoreBannerBlockRender';
import { ProductDetailBlockRender } from './ProductDetailBlockRender';
import { BookingBlockRender } from './BookingBlockRender';
import { SurveyBlockRender } from './SurveyBlockRender';
import { SurveyResultsBlockRender } from './SurveyResultsBlockRender';
import { SocialLinksBlockRender } from './SocialLinksBlockRender';
import { EmailHeaderBlockRender } from './EmailHeaderBlockRender';
import { EmailFooterBlockRender } from './EmailFooterBlockRender';
import { TimelineBlockRender } from './TimelineBlockRender';
import { TeamShowcaseBlockRender } from './TeamShowcaseBlockRender';
import { BentoGridBlockRender } from './BentoGridBlockRender';
import { SiteFooterBlockRender } from './SiteFooterBlockRender';
import { DeckNextSlideBlockRender, DeckJumpToBlockRender } from './DeckNavBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import type { ResolvedBranding } from '@/lib/branding';
import { BrandingProvider } from '@/contexts/BrandingContext';

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
  ]);

  const rendered = (
    <div className={hasCustomLayout ? 'block-content' : 'block-content'}>
      {blocks.map((block) => {
        const isFullWidth = FULL_WIDTH_TYPES.has(block.type);
        return (
          <div key={block.id} className={hasCustomLayout ? '' : isFullWidth ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
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

function renderBlock(block: Block, siteId?: number) {
  switch (block.type) {
    case 'text':
      return <TextBlockRender block={block} />;
    case 'heading':
      return <HeadingBlockRender block={block} />;
    case 'image':
      return <ImageBlockRender block={block} />;
    case 'button':
      return <ButtonBlockRender block={block} />;
    case 'spacer':
      return <SpacerBlockRender block={block} />;
    case 'divider':
      return <DividerBlockRender block={block} />;
    case 'quote':
      return <QuoteBlockRender block={block} />;
    case 'code':
      return <CodeBlockRender block={block} />;
    case 'video':
      return <VideoBlockRender block={block} />;
    case 'youtube':
      return <YoutubeBlockRender block={block} />;
    case 'columns':
      return <ColumnsBlockRender block={block} />;
    case 'tabs':
      return <TabsBlockRender block={block} />;
    case 'accordion':
      return <AccordionBlockRender block={block} />;
    case 'hero':
      return <HeroBlockRender block={block} />;
    case 'hero-slideshow':
      return <HeroSlideshowBlockRender block={block} />;
    case 'marquee':
      return <MarqueeBlockRender block={block} />;
    case 'services-grid':
      return <ServicesGridBlockRender block={block} />;
    case 'cta':
      return <CtaBlockRender block={block} />;
    case 'testimonial':
      return <TestimonialBlockRender block={block} />;
    case 'stats':
      return <StatsBlockRender block={block} />;
    case 'blog-posts':
      return <BlogPostsBlockRender block={block} />;
    case 'featured-content':
      return <FeaturedContentBlockRender block={block} />;
    case 'card-grid':
      return <CardGridBlockRender block={block} />;
    case 'section':
      return <SectionBlockRender block={block} />;
    case 'gallery':
      return <GalleryBlockRender block={block} />;
    case 'palizzi-nav':
      return <PalizziNavBlockRender block={block} />;
    case 'palizzi-hero':
      return <PalizziHeroBlockRender block={block} />;
    case 'palizzi-welcome':
      return <PalizziWelcomeBlockRender block={block} />;
    case 'palizzi-history':
      return <PalizziHistoryBlockRender block={block} />;
    case 'palizzi-menu':
      return <PalizziMenuBlockRender block={block} />;
    case 'palizzi-rules':
      return <PalizziRulesBlockRender block={block} />;
    case 'palizzi-membership':
      return <PalizziMembershipBlockRender block={block} />;
    case 'palizzi-footer':
      return <PalizziFooterBlockRender block={block} />;
    case 'product-grid':
      return <ProductGridBlockRender block={block} siteId={siteId} />;
    case 'featured-products':
      return <FeaturedProductsBlockRender block={block} siteId={siteId} />;
    case 'product-categories':
      return <ProductCategoriesBlockRender block={block} siteId={siteId} />;
    case 'shopping-cart':
      return <ShoppingCartBlockRender block={block} siteId={siteId} />;
    case 'store-banner':
      return <StoreBannerBlockRender block={block} />;
    case 'product-detail':
      return <ProductDetailBlockRender block={block} siteId={siteId} />;
    case 'booking':
      return <BookingBlockRender block={block} />;
    case 'survey':
      return <SurveyBlockRender block={block} />;
    case 'survey-results':
      return <SurveyResultsBlockRender block={block} />;
    case 'social-links':
      return <SocialLinksBlockRender block={block} />;
    case 'email-header':
      return <EmailHeaderBlockRender block={block} />;
    case 'email-footer':
      return <EmailFooterBlockRender block={block} />;
    case 'timeline':
      return <TimelineBlockRender block={block} />;
    case 'team-showcase':
      return <TeamShowcaseBlockRender block={block} />;
    case 'bento-grid':
      return <BentoGridBlockRender block={block} />;
    case 'site-footer':
      return <SiteFooterBlockRender block={block} />;
    case 'deck-next-slide':
      return <DeckNextSlideBlockRender block={block} />;
    case 'deck-jump-to':
      return <DeckJumpToBlockRender block={block} />;
    default:
      return null;
  }
}
