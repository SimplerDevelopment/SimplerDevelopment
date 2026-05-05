'use client';

import React from 'react';
import { Block } from '@/types/blocks';
import { useBlockEditor } from '@/contexts/BlockEditorContext';
import { SpacingSize } from '@/types/responsive';
import { TextBlockPreview } from './TextBlockPreview';
import { HeadingBlockPreview } from './HeadingBlockPreview';
import { ImageBlockPreview } from './ImageBlockPreview';
import { ButtonBlockPreview } from './ButtonBlockPreview';
import { SpacerBlockPreview } from './SpacerBlockPreview';
import { DividerBlockPreview } from './DividerBlockPreview';
import { QuoteBlockPreview } from './QuoteBlockPreview';
import { CodeBlockPreview } from './CodeBlockPreview';
import { HeroBlockPreview } from './HeroBlockPreview';
import { HeroSlideshowBlockPreview } from './HeroSlideshowBlockPreview';
import { MarqueeBlockPreview } from './MarqueeBlockPreview';
import { CtaBlockPreview } from './CtaBlockPreview';
import { VideoBlockPreview } from './VideoBlockPreview';
import { YoutubeBlockPreview } from './YoutubeBlockPreview';
import { ServicesGridBlockPreview } from './ServicesGridBlockPreview';
import { TestimonialBlockPreview } from './TestimonialBlockPreview';
import { StatsBlockPreview } from './StatsBlockPreview';
import { BlogPostsBlockPreview } from './BlogPostsBlockPreview';
import { CardGridBlockPreview } from './CardGridBlockPreview';
import { FeaturedContentBlockPreview } from './FeaturedContentBlockPreview';
import { AccordionBlockPreview } from './AccordionBlockPreview';
import { TabsBlockPreview } from './TabsBlockPreview';
import { ColumnsBlockPreview } from './ColumnsBlockPreview';
import { SectionBlockPreview } from './SectionBlockPreview';
import { GalleryBlockPreview } from './GalleryBlockPreview';
import { ProductGridBlockPreview } from './ProductGridBlockPreview';
import { FeaturedProductsBlockPreview } from './FeaturedProductsBlockPreview';
import { ProductCategoriesBlockPreview } from './ProductCategoriesBlockPreview';
import { ShoppingCartBlockPreview } from './ShoppingCartBlockPreview';
import { StoreBannerBlockPreview } from './StoreBannerBlockPreview';
import { ProductDetailBlockPreview } from './ProductDetailBlockPreview';
import { BookingBlockPreview } from './BookingBlockPreview';
import { SurveyBlockPreview } from './SurveyBlockPreview';
import { SurveyResultsBlockPreview } from './SurveyResultsBlockPreview';
import { SurveyInputBlockPreview } from './SurveyInputBlockPreview';
import { SocialLinksBlockPreview } from './SocialLinksBlockPreview';
import { EmailHeaderBlockPreview } from './EmailHeaderBlockPreview';
import { EmailFooterBlockPreview } from './EmailFooterBlockPreview';
import { FlipCardGridBlockPreview } from './FlipCardGridBlockPreview';
import { MetricCardsBlockPreview } from './MetricCardsBlockPreview';
import { LogoStripBlockPreview } from './LogoStripBlockPreview';
import { TimelineBlockPreview } from './TimelineBlockPreview';
import { TeamShowcaseBlockPreview } from './TeamShowcaseBlockPreview';
import { TeamFlipGridBlockPreview } from './TeamFlipGridBlockPreview';
import { BentoGridBlockPreview } from './BentoGridBlockPreview';
import { SiteFooterBlockPreview } from './SiteFooterBlockPreview';
import { BookingMenuBlockPreview } from './BookingMenuBlockPreview';
import { HtmlEmbedBlockPreview } from './HtmlEmbedBlockPreview';
import { HtmlRenderBlockRender } from '@/components/blocks/render/HtmlRenderBlockRender';
import { StickyScrollTabsBlockRender } from '@/components/blocks/render/StickyScrollTabsBlockRender';

interface VisualBlockPreviewProps {
  block: Block;
  isSelected: boolean;
  onChange: (updates: Partial<Block>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

const SPACING_CSS: Record<string, string> = {
  none: '0', xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem',
};

function spacingToCss(size?: string): string | undefined {
  if (!size) return undefined;
  // Check preset names first
  if (SPACING_CSS[size]) return SPACING_CSS[size];
  // Pass through raw CSS values (e.g., "48px", "10%", "2rem")
  if (/^[\d.]+(%|px|rem|em|vh|vw)$/.test(size)) return size;
  return undefined;
}

export function VisualBlockPreview({ block, isSelected, onChange, selectedBlockId, onSelectBlock }: VisualBlockPreviewProps) {
  const { currentViewport } = useBlockEditor();

  // Build custom styles from block.style
  const customStyles: React.CSSProperties = {};

  if (block.style && typeof block.style === 'object') {
    if (block.style.backgroundColor) customStyles.backgroundColor = block.style.backgroundColor;
    if (block.style.color) customStyles.color = block.style.color;
    if (block.style.fontSize) customStyles.fontSize = block.style.fontSize;
    if (block.style.fontWeight) customStyles.fontWeight = block.style.fontWeight;
    if (block.style.lineHeight) customStyles.lineHeight = block.style.lineHeight;
    if (block.style.letterSpacing) customStyles.letterSpacing = block.style.letterSpacing;
    if (block.style.borderWidth) customStyles.borderWidth = block.style.borderWidth;
    if (block.style.borderColor) customStyles.borderColor = block.style.borderColor;
    if (block.style.borderStyle) customStyles.borderStyle = block.style.borderStyle;
    if (block.style.borderRadius) customStyles.borderRadius = block.style.borderRadius;
    if (block.style.padding) customStyles.padding = block.style.padding;
    if (block.style.margin) customStyles.margin = block.style.margin;
    if (block.style.boxShadow) customStyles.boxShadow = block.style.boxShadow;
    if (block.style.opacity) customStyles.opacity = block.style.opacity;
    // Flex layout
    if (block.style.display) customStyles.display = block.style.display;
    if (block.style.flexDirection) customStyles.flexDirection = block.style.flexDirection;
    if (block.style.justifyContent) customStyles.justifyContent = block.style.justifyContent;
    if (block.style.alignItems) customStyles.alignItems = block.style.alignItems;
    if (block.style.flexWrap) customStyles.flexWrap = block.style.flexWrap;
    if (block.style.gap) customStyles.gap = block.style.gap;
    if (block.style.alignSelf) customStyles.alignSelf = block.style.alignSelf;
  }

  // Apply responsive spacing for the current viewport (overrides static if set)
  if (block.responsive) {
    const r = block.responsive;
    const vp = currentViewport;
    const pt = spacingToCss(r.paddingTop?.[vp]);
    const pb = spacingToCss(r.paddingBottom?.[vp]);
    const pl = spacingToCss(r.paddingLeft?.[vp]);
    const pr = spacingToCss(r.paddingRight?.[vp]);
    const mt = spacingToCss(r.marginTop?.[vp]);
    const mb = spacingToCss(r.marginBottom?.[vp]);
    const ml = spacingToCss(r.marginLeft?.[vp]);
    const mr = spacingToCss(r.marginRight?.[vp]);

    if (pt || pb || pl || pr) {
      customStyles.padding = `${pt || '0'} ${pr || '0'} ${pb || '0'} ${pl || '0'}`;
    }
    if (mt || mb || ml || mr) {
      customStyles.margin = `${mt || '0'} ${mr || '0'} ${mb || '0'} ${ml || '0'}`;
    }

    // Responsive visibility
    if (r.visibility?.[vp] === false) {
      customStyles.display = 'none';
    }
  }

  // Font family: Tailwind class (font-sans) → className, Google Font name → inline style
  const isTailwindFont = block.style?.fontFamily?.startsWith('font-');
  const fontFamilyClass = isTailwindFont ? block.style?.fontFamily || '' : '';
  if (block.style?.fontFamily && !isTailwindFont) {
    customStyles.fontFamily = `"${block.style.fontFamily}", sans-serif`;
  }

  const renderBlockContent = () => {
    switch (block.type) {
      case 'text':
        return <TextBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
      case 'heading':
        return <HeadingBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
      case 'image':
        return <ImageBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
      case 'button':
        return <ButtonBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
      case 'spacer':
        return <SpacerBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
      case 'divider':
        return <DividerBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
      case 'quote':
        return <QuoteBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'code':
      return <CodeBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'video':
      return <VideoBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'youtube':
      return <YoutubeBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'columns':
      return <ColumnsBlockPreview block={block} isSelected={isSelected} onChange={onChange} selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock} />;
    case 'hero':
      return <HeroBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'hero-slideshow':
      return <HeroSlideshowBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'marquee':
      return <MarqueeBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'services-grid':
      return <ServicesGridBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'cta':
      return <CtaBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'testimonial':
      return <TestimonialBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'stats':
      return <StatsBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'blog-posts':
      return <BlogPostsBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'card-grid':
      return <CardGridBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'featured-content':
      return <FeaturedContentBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'accordion':
      return <AccordionBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'tabs':
      return <TabsBlockPreview block={block} isSelected={isSelected} onChange={onChange} selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock} />;
    case 'section':
      return <SectionBlockPreview block={block} isSelected={isSelected} onChange={onChange} selectedBlockId={selectedBlockId} onSelectBlock={onSelectBlock} />;
    case 'gallery':
      return <GalleryBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'product-grid':
      return <ProductGridBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'featured-products':
      return <FeaturedProductsBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'product-categories':
      return <ProductCategoriesBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'shopping-cart':
      return <ShoppingCartBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'store-banner':
      return <StoreBannerBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'product-detail':
      return <ProductDetailBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'booking':
      return <BookingBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'survey':
      return <SurveyBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'survey-results':
      return <SurveyResultsBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'survey-input':
      return <SurveyInputBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'social-links':
      return <SocialLinksBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'email-header':
      return <EmailHeaderBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'email-footer':
      return <EmailFooterBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'flip-card-grid':
      return <FlipCardGridBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'metric-cards':
      return <MetricCardsBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'logo-strip':
      return <LogoStripBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'timeline':
      return <TimelineBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'team-showcase':
      return <TeamShowcaseBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'team-flip-grid':
      return <TeamFlipGridBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'bento-grid':
      return <BentoGridBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'site-footer':
      return <SiteFooterBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'booking-menu':
      return <BookingMenuBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'html-embed':
      return <HtmlEmbedBlockPreview block={block} isSelected={isSelected} onChange={onChange} />;
    case 'html-render':
      // Delegate to the production renderer — it already handles the empty-
      // state placeholder and (when the editor context is active) wires
      // inline `[data-field]` editing.
      return <HtmlRenderBlockRender block={block} />;
    case 'sticky-scroll-tabs':
      return <StickyScrollTabsBlockRender block={block} />;
    case 'post-content':
      // Template editor only — substituted with the post's blocks at render
      // time. Render a clear placeholder card so authors can see the slot.
      return (
        <div className="px-5 py-8 border-2 border-dashed border-primary/40 bg-primary/5 rounded-lg text-center">
          <span className="material-icons text-primary/70 text-3xl">article</span>
          <div className="mt-2 text-sm font-semibold text-foreground">Post Content</div>
          <div className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            The post’s own blocks render here at runtime. This placeholder only appears in the template editor.
          </div>
        </div>
      );
    default:
      return (
        <div className="p-4 bg-muted/30 border border-border rounded text-muted-foreground text-sm">
          Block type "{(block as Block).type}" preview not yet implemented.
          <br />
          <span className="text-xs">Select to edit using the settings panel.</span>
        </div>
      );
    }
  };

  // Wrap content with custom styles
  return (
    <div className={fontFamilyClass} style={customStyles}>
      {renderBlockContent()}
    </div>
  );
}
