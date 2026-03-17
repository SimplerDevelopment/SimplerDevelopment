'use client';

import { useBlockEditor } from '@/contexts/BlockEditorContext';
import { EditorInner } from './VisualBlockEditorEnhanced';
import { BlockType } from '@/types/blocks';
import { TextBlockRender } from './render/TextBlockRender';
import { HeadingBlockRender } from './render/HeadingBlockRender';
import { ImageBlockRender } from './render/ImageBlockRender';
import { QuoteBlockRender } from './render/QuoteBlockRender';
import { CodeBlockRender } from './render/CodeBlockRender';
import { VideoBlockRender } from './render/VideoBlockRender';
import { YoutubeBlockRender } from './render/YoutubeBlockRender';
import { ColumnsBlockRender } from './render/ColumnsBlockRender';
import { ButtonBlockRender } from './render/ButtonBlockRender';
import { SpacerBlockRender } from './render/SpacerBlockRender';
import { DividerBlockRender } from './render/DividerBlockRender';
import { HeroBlockRender } from './render/HeroBlockRender';
import { CtaBlockRender } from './render/CtaBlockRender';
import { ServicesGridBlockRender } from './render/ServicesGridBlockRender';
import { TestimonialBlockRender } from './render/TestimonialBlockRender';
import { StatsBlockRender } from './render/StatsBlockRender';
import { BlogPostsBlockRender } from './render/BlogPostsBlockRender';
import { FeaturedContentBlockRender } from './render/FeaturedContentBlockRender';
import { CardGridBlockRender } from './render/CardGridBlockRender';
import { AccordionBlockRender } from './render/AccordionBlockRender';
import { TabsBlockRender } from './render/TabsBlockRender';
import { Block } from '@/types/blocks';
import { SectionBlockRender } from './render/SectionBlockRender';
import { GalleryBlockRender } from './render/GalleryBlockRender';
import { BlockStyleWrapper } from './render/BlockStyleWrapper';
import { getViewportWidth } from '@/lib/utils/responsive';

interface EditorWithPreviewProps {
  onChange: (blocks: Block[]) => void;
  blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }>;
}

export function EditorWithPreview({ onChange, blockTypes }: EditorWithPreviewProps) {
  const { state, selectBlock, togglePreviewMode, currentViewport } = useBlockEditor();

  // Render block in preview mode using production render components
  const renderBlockPreview = (block: Block) => {
    switch (block.type) {
      case 'text':
        return <TextBlockRender block={block} />;
      case 'heading':
        return <HeadingBlockRender block={block} />;
      case 'image':
        return <ImageBlockRender block={block} />;
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
      case 'button':
        return <ButtonBlockRender block={block} />;
      case 'spacer':
        return <SpacerBlockRender block={block} />;
      case 'divider':
        return <DividerBlockRender block={block} />;
      case 'hero':
        return <HeroBlockRender block={block} />;
      case 'cta':
        return <CtaBlockRender block={block} />;
      case 'services-grid':
        return <ServicesGridBlockRender block={block} />;
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
      case 'gallery':
        return <GalleryBlockRender block={block} />;
      default:
        return <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded">Unsupported block type: {block.type}</div>;
    }
  };

  return (
    <div className="relative" data-block-editor>
      {state.previewMode ? (
        <div className={`preview-mode bg-background flex ${currentViewport === 'desktop' ? '' : 'justify-center'}`}>
          <div
            className={`bg-background transition-all duration-300 ease-in-out ${
              currentViewport === 'desktop' ? 'w-full' : 'shadow-lg border-x border-border'
            }`}
            style={{
              width: currentViewport === 'desktop' ? '100%' : `${getViewportWidth(currentViewport)}px`,
              maxWidth: '100%',
            }}
          >
            <div className="space-y-0">
              {state.blocks.map((block) => (
                <div
                  key={block.id}
                  className="relative group"
                  onMouseEnter={() => selectBlock(block.id)}
                  onMouseLeave={() => selectBlock(null)}
                >
                  {/* Preview Content */}
                  <div className="block-preview">
                    <BlockStyleWrapper block={block}>
                      {renderBlockPreview(block)}
                    </BlockStyleWrapper>
                  </div>

                  {/* Hover Overlay with Edit Button */}
                  {state.selectedBlockId === block.id && (
                    <div className="absolute inset-0 bg-primary/5 border-2 border-primary rounded-lg pointer-events-none">
                      <button
                        type="button"
                        onClick={() => {
                          togglePreviewMode();
                          selectBlock(block.id);
                        }}
                        className="absolute top-2 right-2 pointer-events-auto px-3 py-1.5 bg-primary text-primary-foreground rounded shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EditorInner onChange={onChange} blockTypes={blockTypes} />
      )}
    </div>
  );
}
