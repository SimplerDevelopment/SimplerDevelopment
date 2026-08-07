'use client';

import { SectionBlock, Block } from '@/types/blocks';
import {
  BookingBlockRender,
  BookingMenuBlockRender,
  FeaturedProductsBlockRender,
  HeroSlideshowBlockRender,
  HtmlEmbedBlockRender,
  HtmlRenderBlockRender,
  ProductCategoriesBlockRender,
  ProductGridBlockRender,
  ShoppingCartBlockRender,
  StoreBannerBlockRender,
  SurveyBlockRender,
} from './lazy-blocks';
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
import { RoiCalculatorBlockRender } from './RoiCalculatorBlockRender';
import { BlogPostsBlockRender } from './BlogPostsBlockRender';
import { FeaturedContentBlockRender } from './FeaturedContentBlockRender';
import { CardGridBlockRender } from './CardGridBlockRender';
import { GalleryBlockRender } from './GalleryBlockRender';
import { SocialLinksBlockRender } from './SocialLinksBlockRender';
import { TimelineBlockRender } from './TimelineBlockRender';
import { TeamShowcaseBlockRender } from './TeamShowcaseBlockRender';
import { TeamFlipGridBlockRender } from './TeamFlipGridBlockRender';
import { MetricCardsBlockRender } from './MetricCardsBlockRender';
import { LogoStripBlockRender } from './LogoStripBlockRender';
import { FlipCardGridBlockRender } from './FlipCardGridBlockRender';
import { BentoGridBlockRender } from './BentoGridBlockRender';
import { DeckNextSlideBlockRender, DeckJumpToBlockRender } from './DeckNavBlockRender';
import { PopupBlockRender } from './PopupBlockRender';
import { PostContentPlaceholderRender } from './PostContentPlaceholderRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import React from 'react';

// This component's box-model/background/layout styling is hand-mirrored by
// `ContainerBlockRenderer` in EditableBlockRenderer.tsx (the visual-editor
// canvas can't wrap this component with drop-zone chrome, so it duplicates
// the styling logic instead). A styling change here must be mirrored there
// too or the editor canvas and the published page will diverge.
interface SectionBlockRenderProps {
  block: SectionBlock;
}

export function SectionBlockRender({ block }: SectionBlockRenderProps) {
  const Tag = block.htmlTag || 'section';
  const s = block.style;

  // Block-level props (legacy) with block.style as override
  const bgColor = s?.backgroundColor || block.backgroundColor;
  const color = s?.color || block.color;
  const padding = s?.padding || `${block.paddingTop || '0'} ${block.paddingRight || '0'} ${block.paddingBottom || '0'} ${block.paddingLeft || '0'}`;
  // VEQA-034 follow-up: static margin was never forwarded to the section's own
  // Tag — only padding was. BlockStyleWrapper (the ancestor) DOES apply margin
  // to its own wrapper div, but that div has no background/border, so a static
  // margin set via the Style tab appeared to "not render" when inspecting the
  // visible <section> element. Mirror the padding line above so margin reaches
  // the same element padding already does.
  const margin = s?.margin;

  // Compose background-image from gradient + image (gradient layers on top, so it
  // appears above any image). If only gradient is set, that's the entire background.
  const bgLayers: string[] = [];
  if (s?.backgroundGradient) bgLayers.push(s.backgroundGradient);
  const resolvedBgImage = s?.backgroundImage || block.backgroundImage;
  if (resolvedBgImage) bgLayers.push(`url(${resolvedBgImage})`);
  const bgImageStyle = bgLayers.length
    ? {
        backgroundImage: bgLayers.join(', '),
        backgroundSize: s?.backgroundSize || block.backgroundSize || 'cover',
        backgroundPosition: s?.backgroundPosition || block.backgroundPosition || 'center',
        ...(s?.backgroundRepeat ? { backgroundRepeat: s.backgroundRepeat } : {}),
        ...(s?.backgroundAttachment ? { backgroundAttachment: s.backgroundAttachment as React.CSSProperties['backgroundAttachment'] } : {}),
        ...(s?.backgroundBlendMode ? { backgroundBlendMode: s.backgroundBlendMode as React.CSSProperties['backgroundBlendMode'] } : {}),
      }
    : {};

  const containerStyle: React.CSSProperties = {
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...bgImageStyle,
    ...(color ? { color } : {}),
    // Style-tab Font Family writes block.style.fontFamily (a font-family name);
    // apply it so the Style tab controls the section font (it now owns the field).
    ...(s?.fontFamily ? { fontFamily: s.fontFamily } : {}),
    padding,
    ...(margin ? { margin } : {}),
    // Border
    ...(s?.borderWidth ? { borderWidth: s.borderWidth } : {}),
    ...(s?.borderColor ? { borderColor: s.borderColor } : {}),
    ...(s?.borderStyle ? { borderStyle: s.borderStyle as React.CSSProperties['borderStyle'] } : {}),
    ...(s?.borderRadius ? { borderRadius: s.borderRadius } : {}),
    ...(s?.borderTopWidth ? { borderTopWidth: s.borderTopWidth } : {}),
    ...(s?.borderTopColor ? { borderTopColor: s.borderTopColor } : {}),
    ...(s?.borderTopStyle ? { borderTopStyle: s.borderTopStyle as React.CSSProperties['borderTopStyle'] } : {}),
    ...(s?.borderRightWidth ? { borderRightWidth: s.borderRightWidth } : {}),
    ...(s?.borderRightColor ? { borderRightColor: s.borderRightColor } : {}),
    ...(s?.borderRightStyle ? { borderRightStyle: s.borderRightStyle as React.CSSProperties['borderRightStyle'] } : {}),
    ...(s?.borderBottomWidth ? { borderBottomWidth: s.borderBottomWidth } : {}),
    ...(s?.borderBottomColor ? { borderBottomColor: s.borderBottomColor } : {}),
    ...(s?.borderBottomStyle ? { borderBottomStyle: s.borderBottomStyle as React.CSSProperties['borderBottomStyle'] } : {}),
    ...(s?.borderLeftWidth ? { borderLeftWidth: s.borderLeftWidth } : {}),
    ...(s?.borderLeftColor ? { borderLeftColor: s.borderLeftColor } : {}),
    ...(s?.borderLeftStyle ? { borderLeftStyle: s.borderLeftStyle as React.CSSProperties['borderLeftStyle'] } : {}),
    ...(s?.borderTopLeftRadius ? { borderTopLeftRadius: s.borderTopLeftRadius } : {}),
    ...(s?.borderTopRightRadius ? { borderTopRightRadius: s.borderTopRightRadius } : {}),
    ...(s?.borderBottomLeftRadius ? { borderBottomLeftRadius: s.borderBottomLeftRadius } : {}),
    ...(s?.borderBottomRightRadius ? { borderBottomRightRadius: s.borderBottomRightRadius } : {}),
    ...(s?.boxShadow ? { boxShadow: s.boxShadow } : {}),
    ...(s?.opacity ? { opacity: s.opacity } : {}),
    // Overflow must live on THIS element (the one that owns the background +
    // rounded border), not the plain BlockStyleWrapper ancestor — otherwise a
    // background/image bleeds past a rounded border "even with overflow set".
    // Honor an explicit overflow; when a border-radius is set, default to
    // clipping so the background respects the rounded corners.
    ...(s?.overflow ? { overflow: s.overflow } : (s?.borderRadius ? { overflow: 'hidden' } : {})),
  };

  // Apply section's layout styles (flex, gap, etc.) to the inner container.
  // The Style-tab Display/Direction controls write block.responsiveStyle.desktop
  // (per-breakpoint), not flat block.style. Merge desktop-responsive over the
  // flat style so either authoring path lands on the children container —
  // otherwise setting flex-direction: row silently no-ops and children stack.
  const L = block.responsiveStyle?.desktop ? { ...s, ...block.responsiveStyle.desktop } : s;
  const effMaxWidth = L?.maxWidth || block.maxWidth;
  const innerStyle: React.CSSProperties = {
    ...(effMaxWidth ? { maxWidth: effMaxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
    ...(L?.display ? { display: L.display } : {}),
    ...(L?.flexDirection ? { flexDirection: L.flexDirection } : {}),
    ...(L?.justifyContent ? { justifyContent: L.justifyContent } : {}),
    ...(L?.alignItems ? { alignItems: L.alignItems } : {}),
    ...(L?.flexWrap ? { flexWrap: L.flexWrap } : {}),
    ...(L?.gap ? { gap: L.gap } : {}),
    ...(L?.gridTemplateColumns ? { display: 'grid', gridTemplateColumns: L.gridTemplateColumns } : {}),
    ...(L?.gridGap ? { gap: L.gridGap } : {}),
  };

  return (
    <Tag
      className={`${block.fontFamily || ''} ${block.cssClass || ''} relative${block.splitColor ? ' overflow-hidden' : ''}`}
      style={containerStyle}
    >
      {/* Diagonal split overlay */}
      {block.splitColor && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: block.splitColor,
            clipPath: block.splitClipPath || 'polygon(55% 0, 100% 0, 100% 100%, 45% 100%)',
          }}
        />
      )}
      <div className="relative z-10" style={innerStyle}>
        {(block.blocks || []).map((nestedBlock) => (
          <div key={nestedBlock.id} data-block-id={nestedBlock.id} data-block-type={nestedBlock.type}>
            <BlockStyleWrapper block={nestedBlock}>
              {renderNestedBlock(nestedBlock)}
            </BlockStyleWrapper>
          </div>
        ))}
      </div>
    </Tag>
  );
}

function renderNestedBlock(block: Block) {
  switch (block.type) {
    case 'text': return <TextBlockRender block={block} />;
    case 'heading': return <HeadingBlockRender block={block} />;
    case 'image': return <ImageBlockRender block={block} />;
    case 'button': return <ButtonBlockRender block={block} />;
    case 'spacer': return <SpacerBlockRender block={block} />;
    case 'divider': return <DividerBlockRender block={block} />;
    case 'quote': return <QuoteBlockRender block={block} />;
    case 'code': return <CodeBlockRender block={block} />;
    case 'video': return <VideoBlockRender block={block} />;
    case 'youtube': return <YoutubeBlockRender block={block} />;
    case 'columns': return <ColumnsBlockRender block={block} />;
    case 'tabs': return <TabsBlockRender block={block} />;
    case 'sticky-scroll-tabs': return <StickyScrollTabsBlockRender block={block} />;
    case 'accordion': return <AccordionBlockRender block={block} />;
    case 'hero': return <HeroBlockRender block={block} />;
    case 'hero-slideshow': return <HeroSlideshowBlockRender block={block} />;
    case 'marquee': return <MarqueeBlockRender block={block} />;
    case 'services-grid': return <ServicesGridBlockRender block={block} />;
    case 'cta': return <CtaBlockRender block={block} />;
    case 'testimonial': return <TestimonialBlockRender block={block} />;
    case 'stats': return <StatsBlockRender block={block} />;
    case 'roi-calculator': return <RoiCalculatorBlockRender block={block} />;
    case 'blog-posts': return <BlogPostsBlockRender block={block} />;
    case 'featured-content': return <FeaturedContentBlockRender block={block} />;
    case 'card-grid': return <CardGridBlockRender block={block} />;
    case 'section': return <SectionBlockRender block={block} />;
    case 'gallery': return <GalleryBlockRender block={block} />;
    case 'booking': return <BookingBlockRender block={block} />;
    case 'booking-menu': return <BookingMenuBlockRender block={block} />;
    case 'survey': return <SurveyBlockRender block={block} />;
    case 'social-links': return <SocialLinksBlockRender block={block} />;
    case 'product-grid': return <ProductGridBlockRender block={block} />;
    case 'featured-products': return <FeaturedProductsBlockRender block={block} />;
    case 'product-categories': return <ProductCategoriesBlockRender block={block} />;
    case 'shopping-cart': return <ShoppingCartBlockRender block={block} />;
    case 'store-banner': return <StoreBannerBlockRender block={block} />;
    case 'timeline': return <TimelineBlockRender block={block} />;
    case 'team-showcase': return <TeamShowcaseBlockRender block={block} />;
    case 'team-flip-grid': return <TeamFlipGridBlockRender block={block} />;
    case 'bento-grid': return <BentoGridBlockRender block={block} />;
    case 'metric-cards': return <MetricCardsBlockRender block={block} />;
    case 'logo-strip': return <LogoStripBlockRender block={block} />;
    case 'flip-card-grid': return <FlipCardGridBlockRender block={block} />;
    case 'deck-next-slide': return <DeckNextSlideBlockRender block={block} />;
    case 'deck-jump-to': return <DeckJumpToBlockRender block={block} />;
    case 'post-content': return <PostContentPlaceholderRender block={block as Extract<Block, { type: 'post-content' }>} />;
    case 'html-render': return <HtmlRenderBlockRender block={block as Extract<Block, { type: 'html-render' }>} />;
    case 'html-embed': return <HtmlEmbedBlockRender block={block as Extract<Block, { type: 'html-embed' }>} />;
    case 'popup': return <PopupBlockRender block={block as Extract<Block, { type: 'popup' }>} />;
    default: return null;
  }
}
