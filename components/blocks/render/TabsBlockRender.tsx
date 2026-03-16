'use client';

import { TabsBlock, Block } from '@/types/blocks';
import { useState } from 'react';
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

interface TabsBlockRenderProps {
  block: TabsBlock;
}

export function TabsBlockRender({ block }: TabsBlockRenderProps) {
  const [activeTabId, setActiveTabId] = useState(block.tabs[0]?.id);

  const activeTab = block.tabs.find(tab => tab.id === activeTabId);

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
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-border bg-muted/30">
          {block.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                activeTabId === tab.id
                  ? 'border-primary text-primary bg-background'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 bg-card min-h-[200px]">
          {activeTab && activeTab.blocks.length > 0 ? (
            <div className="space-y-4">
              {activeTab.blocks.map((nestedBlock) => (
                <div key={nestedBlock.id}>
                  {renderNestedBlock(nestedBlock)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">This tab is empty</p>
          )}
        </div>
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
