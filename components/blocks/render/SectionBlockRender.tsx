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
import { SurveyBlockRender } from './SurveyBlockRender';
import { SocialLinksBlockRender } from './SocialLinksBlockRender';
import { TimelineBlockRender } from './TimelineBlockRender';
import { TeamShowcaseBlockRender } from './TeamShowcaseBlockRender';
import { BentoGridBlockRender } from './BentoGridBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import React from 'react';

interface SectionBlockRenderProps {
  block: SectionBlock;
}

export function SectionBlockRender({ block }: SectionBlockRenderProps) {
  const Tag = block.htmlTag || 'section';

  const containerStyle: React.CSSProperties = {
    ...(block.backgroundColor ? { backgroundColor: block.backgroundColor } : {}),
    ...(block.backgroundImage ? {
      backgroundImage: `url(${block.backgroundImage})`,
      backgroundSize: block.backgroundSize || 'cover',
      backgroundPosition: block.backgroundPosition || 'center',
    } : {}),
    ...(block.color ? { color: block.color } : {}),
    padding: `${block.paddingTop || '0'} ${block.paddingRight || '0'} ${block.paddingBottom || '0'} ${block.paddingLeft || '0'}`,
  };

  // Apply section's layout styles (flex, gap, etc.) to the inner container
  const s = block.style;
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
      className={`${block.fontFamily || ''} ${block.cssClass || ''} relative overflow-hidden`}
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
          <div key={nestedBlock.id}>
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
    default: return null;
  }
}
