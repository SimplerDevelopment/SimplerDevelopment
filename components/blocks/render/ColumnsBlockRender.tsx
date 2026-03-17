'use client';

import { ColumnsBlock, Block } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
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
import { GalleryBlockRender } from './GalleryBlockRender';
import { HeroBlockRender } from './HeroBlockRender';
import { ServicesGridBlockRender } from './ServicesGridBlockRender';
import { CtaBlockRender } from './CtaBlockRender';
import { TestimonialBlockRender } from './TestimonialBlockRender';
import { StatsBlockRender } from './StatsBlockRender';
import { BlogPostsBlockRender } from './BlogPostsBlockRender';
import { FeaturedContentBlockRender } from './FeaturedContentBlockRender';
import { CardGridBlockRender } from './CardGridBlockRender';
import { AccordionBlockRender } from './AccordionBlockRender';
import { TabsBlockRender } from './TabsBlockRender';
import { SectionBlockRender } from './SectionBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';

interface ColumnsBlockRenderProps {
  block: ColumnsBlock;
}

export function ColumnsBlockRender({ block }: ColumnsBlockRenderProps) {
  // Try to get editor viewport context (available in inline preview, not on real pages)
  let editorViewport: string | null = null;
  try {
    const { useBlockEditor } = require('@/contexts/BlockEditorContext');
    const ctx = useBlockEditor();
    editorViewport = ctx.currentViewport;
  } catch {
    // Not in editor context — use CSS-based responsive approach
  }

  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  const stackOnMobile = block.stackOnMobile !== false;
  const stackOnTablet = block.stackOnTablet === true;

  // If in editor context, use JS-driven stacking based on viewport selector
  const shouldStackFromEditor = editorViewport
    ? (editorViewport === 'mobile' && stackOnMobile) || (editorViewport === 'tablet' && stackOnTablet)
    : null;

  const reverseOnStack = block.reverseOnStack === true;
  const colClass = reverseOnStack ? 'flex-col-reverse' : 'flex-col';

  // CSS classes for real page rendering (no editor context)
  const stackingClasses = shouldStackFromEditor !== null
    ? (shouldStackFromEditor ? colClass : 'flex-row')
    : stackOnMobile
      ? stackOnTablet
        ? `${colClass} lg:flex-row`
        : `${colClass} md:flex-row`
      : 'flex-row';

  const colStackAttr = shouldStackFromEditor !== null
    ? null // Don't need data attr when using JS-driven stacking
    : stackOnMobile
      ? stackOnTablet
        ? 'data-col-stacks-lg'
        : 'data-col-stacks-md'
      : 'data-col-stacks-never';

  // Generate responsive classes from block settings
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  return (
    <div className={`py-8 my-8 ${responsiveClasses}`}>
      <div className={`flex ${stackingClasses} ${gapClasses[block.gap || 'md']}`}>
        {block.columns.map((column) => {
          const paddingClass = column.padding === 'sm' ? 'p-2' : column.padding === 'md' ? 'p-4' : column.padding === 'lg' ? 'p-6' : '';
          const verticalAlignClass = column.verticalAlign === 'center' ? 'flex flex-col justify-center' : column.verticalAlign === 'bottom' ? 'flex flex-col justify-end' : '';

          return (
            <div
              key={column.id}
              className={`${paddingClass} ${verticalAlignClass} ${column.cssClass || ''}`}
              {...(colStackAttr ? { [colStackAttr]: '' } : {})}
              style={{
                ...(shouldStackFromEditor !== null
                  ? {
                      width: shouldStackFromEditor ? '100%' : `${column.width}%`,
                      flex: shouldStackFromEditor ? '0 0 100%' : `0 0 ${column.width}%`,
                    }
                  : { '--col-width': `${column.width}%` } as React.CSSProperties
                ),
                ...(column.backgroundColor ? { backgroundColor: column.backgroundColor } : {}),
              }}
            >
              {column.blocks.map((nestedBlock) => (
                <div key={nestedBlock.id}>
                  <BlockStyleWrapper block={nestedBlock}>
                    {renderNestedBlock(nestedBlock)}
                  </BlockStyleWrapper>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderNestedBlock(block: Block) {
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
    case 'gallery':
      return <GalleryBlockRender block={block} />;
    case 'hero':
      return <HeroBlockRender block={block} />;
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
    case 'accordion':
      return <AccordionBlockRender block={block} />;
    case 'tabs':
      return <TabsBlockRender block={block} />;
    case 'section':
      return <SectionBlockRender block={block} />;
    default:
      return null;
  }
}
