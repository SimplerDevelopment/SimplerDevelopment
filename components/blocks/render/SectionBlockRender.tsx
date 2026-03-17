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
import { ServicesGridBlockRender } from './ServicesGridBlockRender';
import { CtaBlockRender } from './CtaBlockRender';
import { TestimonialBlockRender } from './TestimonialBlockRender';
import { StatsBlockRender } from './StatsBlockRender';
import { BlogPostsBlockRender } from './BlogPostsBlockRender';
import { FeaturedContentBlockRender } from './FeaturedContentBlockRender';
import { CardGridBlockRender } from './CardGridBlockRender';
import { GalleryBlockRender } from './GalleryBlockRender';
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

  const innerStyle: React.CSSProperties = {
    ...(block.maxWidth ? { maxWidth: block.maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
  };

  return (
    <Tag
      className={`${block.fontFamily || ''} ${block.cssClass || ''}`}
      style={containerStyle}
    >
      <div style={innerStyle}>
        {block.blocks.map((nestedBlock) => (
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
    case 'services-grid': return <ServicesGridBlockRender block={block} />;
    case 'cta': return <CtaBlockRender block={block} />;
    case 'testimonial': return <TestimonialBlockRender block={block} />;
    case 'stats': return <StatsBlockRender block={block} />;
    case 'blog-posts': return <BlogPostsBlockRender block={block} />;
    case 'featured-content': return <FeaturedContentBlockRender block={block} />;
    case 'card-grid': return <CardGridBlockRender block={block} />;
    case 'section': return <SectionBlockRender block={block} />;
    case 'gallery': return <GalleryBlockRender block={block} />;
    default: return null;
  }
}
