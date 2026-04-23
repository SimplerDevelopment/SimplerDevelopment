'use client';

import { SectionBlock, Block } from '@/types/blocks';
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
import { GalleryBlockRender } from './GalleryBlockRender';
import { ProductGridBlockRender } from './ProductGridBlockRender';
import { FeaturedProductsBlockRender } from './FeaturedProductsBlockRender';
import { ProductCategoriesBlockRender } from './ProductCategoriesBlockRender';
import { ShoppingCartBlockRender } from './ShoppingCartBlockRender';
import { StoreBannerBlockRender } from './StoreBannerBlockRender';
import { BookingBlockRender } from './BookingBlockRender';
import { BookingMenuBlockRender } from './BookingMenuBlockRender';
import { SurveyBlockRender } from './SurveyBlockRender';
import { SocialLinksBlockRender } from './SocialLinksBlockRender';
import { TimelineBlockRender } from './TimelineBlockRender';
import { TeamShowcaseBlockRender } from './TeamShowcaseBlockRender';
import { BentoGridBlockRender } from './BentoGridBlockRender';
import { DeckNextSlideBlockRender, DeckJumpToBlockRender } from './DeckNavBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import React from 'react';

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
    padding,
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
  };

  // Apply section's layout styles (flex, gap, etc.) to the inner container
  const innerStyle: React.CSSProperties = {
    ...(block.maxWidth ? { maxWidth: block.maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
    ...(s?.display ? { display: s.display } : {}),
    ...(s?.flexDirection ? { flexDirection: s.flexDirection } : {}),
    ...(s?.justifyContent ? { justifyContent: s.justifyContent } : {}),
    ...(s?.alignItems ? { alignItems: s.alignItems } : {}),
    ...(s?.flexWrap ? { flexWrap: s.flexWrap } : {}),
    ...(s?.gap ? { gap: s.gap } : {}),
    ...(s?.gridTemplateColumns ? { display: 'grid', gridTemplateColumns: s.gridTemplateColumns } : {}),
    ...(s?.gridGap ? { gap: s.gridGap } : {}),
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
    case 'accordion': return <AccordionBlockRender block={block} />;
    case 'hero': return <HeroBlockRender block={block} />;
    case 'hero-slideshow': return <HeroSlideshowBlockRender block={block} />;
    case 'marquee': return <MarqueeBlockRender block={block} />;
    case 'services-grid': return <ServicesGridBlockRender block={block} />;
    case 'cta': return <CtaBlockRender block={block} />;
    case 'testimonial': return <TestimonialBlockRender block={block} />;
    case 'stats': return <StatsBlockRender block={block} />;
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
    case 'bento-grid': return <BentoGridBlockRender block={block} />;
    case 'deck-next-slide': return <DeckNextSlideBlockRender block={block} />;
    case 'deck-jump-to': return <DeckJumpToBlockRender block={block} />;
    default: return null;
  }
}
