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

interface ColumnsBlockRenderProps {
  block: ColumnsBlock;
}

export function ColumnsBlockRender({ block }: ColumnsBlockRenderProps) {
  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  // Generate responsive stacking classes
  const stackOnMobile = block.stackOnMobile !== false; // Default to true
  const stackOnTablet = block.stackOnTablet === true; // Default to false

  const stackingClasses = stackOnMobile
    ? stackOnTablet
      ? 'flex-col lg:flex-row' // Stack on mobile and tablet, row on desktop
      : 'flex-col md:flex-row' // Stack on mobile, row on tablet and desktop
    : 'flex-row'; // Never stack

  const colStackAttr = stackOnMobile
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
              {...{ [colStackAttr]: '' }}
              style={{
                '--col-width': `${column.width}%`,
                ...(column.backgroundColor ? { backgroundColor: column.backgroundColor } : {}),
              } as React.CSSProperties}
            >
              {column.blocks.map((nestedBlock) => (
                <div key={nestedBlock.id}>
                  {renderNestedBlock(nestedBlock)}
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
    default:
      return null;
  }
}
