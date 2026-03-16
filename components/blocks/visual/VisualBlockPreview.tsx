'use client';

import React from 'react';
import { Block } from '@/types/blocks';
import { TextBlockPreview } from './TextBlockPreview';
import { HeadingBlockPreview } from './HeadingBlockPreview';
import { ImageBlockPreview } from './ImageBlockPreview';
import { ButtonBlockPreview } from './ButtonBlockPreview';
import { SpacerBlockPreview } from './SpacerBlockPreview';
import { DividerBlockPreview } from './DividerBlockPreview';
import { QuoteBlockPreview } from './QuoteBlockPreview';
import { CodeBlockPreview } from './CodeBlockPreview';
import { HeroBlockPreview } from './HeroBlockPreview';
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

interface VisualBlockPreviewProps {
  block: Block;
  isSelected: boolean;
  onChange: (updates: Partial<Block>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

export function VisualBlockPreview({ block, isSelected, onChange, selectedBlockId, onSelectBlock }: VisualBlockPreviewProps) {
  // Build custom styles from block.style
  const customStyles: React.CSSProperties = {};

  if (block.style && typeof block.style === 'object') {
    if (block.style.backgroundColor) customStyles.backgroundColor = block.style.backgroundColor;
    if (block.style.color) customStyles.color = block.style.color;
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
  }

  // Get font family class
  const fontFamilyClass = block.style?.fontFamily || '';

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
