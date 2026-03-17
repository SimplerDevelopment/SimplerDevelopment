'use client';

import { Block, PageSettings } from '@/types/blocks';
import { TextBlockRender } from '@/components/blocks/render/TextBlockRender';
import { HeadingBlockRender } from '@/components/blocks/render/HeadingBlockRender';
import { ImageBlockRender } from '@/components/blocks/render/ImageBlockRender';
import { ButtonBlockRender } from '@/components/blocks/render/ButtonBlockRender';
import { SpacerBlockRender } from '@/components/blocks/render/SpacerBlockRender';
import { DividerBlockRender } from '@/components/blocks/render/DividerBlockRender';
import { QuoteBlockRender } from '@/components/blocks/render/QuoteBlockRender';
import { CodeBlockRender } from '@/components/blocks/render/CodeBlockRender';
import { VideoBlockRender } from '@/components/blocks/render/VideoBlockRender';
import { YoutubeBlockRender } from '@/components/blocks/render/YoutubeBlockRender';
import { ColumnsBlockRender } from '@/components/blocks/render/ColumnsBlockRender';
import { TabsBlockRender } from '@/components/blocks/render/TabsBlockRender';
import { AccordionBlockRender } from '@/components/blocks/render/AccordionBlockRender';
import { HeroBlockRender } from '@/components/blocks/render/HeroBlockRender';
import { ServicesGridBlockRender } from '@/components/blocks/render/ServicesGridBlockRender';
import { CtaBlockRender } from '@/components/blocks/render/CtaBlockRender';
import { TestimonialBlockRender } from '@/components/blocks/render/TestimonialBlockRender';
import { StatsBlockRender } from '@/components/blocks/render/StatsBlockRender';
import { BlogPostsBlockRender } from '@/components/blocks/render/BlogPostsBlockRender';
import { FeaturedContentBlockRender } from '@/components/blocks/render/FeaturedContentBlockRender';
import { CardGridBlockRender } from '@/components/blocks/render/CardGridBlockRender';
import { SectionBlockRender } from '@/components/blocks/render/SectionBlockRender';
import { BlockStyleWrapper } from '@/components/blocks/render/BlockStyleWrapper';
import Link from 'next/link';

interface PreviewRendererProps {
  title: string;
  blocks: Block[];
  htmlContent?: string;
  isDraft: boolean;
  pageSettings?: PageSettings;
}

function renderBlock(block: Block) {
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
    case 'columns':
      return <ColumnsBlockRender block={block} />;
    case 'tabs':
      return <TabsBlockRender block={block} />;
    case 'accordion':
      return <AccordionBlockRender block={block} />;
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
    case 'section':
      return <SectionBlockRender block={block} />;
    default:
      return null;
  }
}

export function PreviewRenderer({ title, blocks, htmlContent, isDraft, pageSettings = {} }: PreviewRendererProps) {
  const ps = pageSettings;
  return (
    <div className="min-h-screen bg-background">
      {/* Preview banner */}
      <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="font-medium">Preview Mode</span>
          {isDraft && (
            <span className="px-1.5 py-0.5 bg-amber-600/20 rounded text-xs font-medium">DRAFT</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/30 rounded text-xs font-medium transition-colors"
        >
          Close Preview
        </button>
      </div>

      {/* Page content */}
      <article
        className={`block-content ${ps.fontFamily || ''} ${ps.cssClass || ''}`}
        style={{
          ...(ps.backgroundColor ? { backgroundColor: ps.backgroundColor } : {}),
          ...(ps.backgroundImage ? {
            backgroundImage: `url(${ps.backgroundImage})`,
            backgroundSize: ps.backgroundSize || 'cover',
            backgroundPosition: ps.backgroundPosition || 'center',
          } : {}),
          ...(ps.maxWidth ? { maxWidth: ps.maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
          ...(ps.color ? { color: ps.color } : {}),
          padding: `${ps.paddingTop || '0'} ${ps.paddingRight || '0'} ${ps.paddingBottom || '0'} ${ps.paddingLeft || '0'}`,
        }}
      >
        {htmlContent ? (
          <div className="max-w-4xl mx-auto px-4 py-12">
            <div
              className="prose prose-lg dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        ) : blocks.length === 0 ? (
          <div className="max-w-4xl mx-auto px-4 py-24 text-center">
            <p className="text-muted-foreground text-lg">This page has no content yet.</p>
          </div>
        ) : (
          blocks.map((block) => (
            <div key={block.id} className="block-wrapper">
              <BlockStyleWrapper block={block}>
                {renderBlock(block)}
              </BlockStyleWrapper>
            </div>
          ))
        )}
      </article>
    </div>
  );
}
