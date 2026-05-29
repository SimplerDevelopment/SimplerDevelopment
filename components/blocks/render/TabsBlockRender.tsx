'use client';

import { TabsBlock, Block } from '@/types/blocks';
import {
  BookingBlockRender,
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
import { useState } from 'react';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
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
import { SectionBlockRender } from './SectionBlockRender';
import { MarqueeBlockRender } from './MarqueeBlockRender';
import { ColumnsBlockRender } from './ColumnsBlockRender';
import { SocialLinksBlockRender } from './SocialLinksBlockRender';
import { DeckNextSlideBlockRender, DeckJumpToBlockRender } from './DeckNavBlockRender';
import { PopupBlockRender } from './PopupBlockRender';
import { PostContentPlaceholderRender } from './PostContentPlaceholderRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';

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
          {block.tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const baseStyle = getElementCSS(block.elementStyles, 'tab');
            const activeStyle = isActive ? getElementCSS(block.elementStyles, 'activeTab') : undefined;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-primary text-primary bg-background'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                style={{ ...baseStyle, ...activeStyle }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div
          className="p-6 bg-card min-h-[200px]"
          style={getElementCSS(block.elementStyles, 'tabPanel')}
        >
          {activeTab && activeTab.blocks.length > 0 ? (
            <div className="space-y-4">
              {activeTab.blocks.map((nestedBlock) => (
                <div key={nestedBlock.id}>
                  <BlockStyleWrapper block={nestedBlock}>
                    {renderNestedBlock(nestedBlock)}
                  </BlockStyleWrapper>
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
    case 'gallery':
      return <GalleryBlockRender block={block} />;
    case 'hero':
      return <HeroBlockRender block={block} />;
    case 'hero-slideshow':
      return <HeroSlideshowBlockRender block={block} />;
    case 'marquee':
      return <MarqueeBlockRender block={block} />;
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
    case 'section':
      return <SectionBlockRender block={block} />;
    case 'columns':
      return <ColumnsBlockRender block={block} />;
    case 'tabs':
      return <TabsBlockRender block={block} />;
    case 'booking':
      return <BookingBlockRender block={block} />;
    case 'survey':
      return <SurveyBlockRender block={block} />;
    case 'social-links':
      return <SocialLinksBlockRender block={block} />;
    case 'product-grid':
      return <ProductGridBlockRender block={block} />;
    case 'featured-products':
      return <FeaturedProductsBlockRender block={block} />;
    case 'product-categories':
      return <ProductCategoriesBlockRender block={block} />;
    case 'shopping-cart':
      return <ShoppingCartBlockRender block={block} />;
    case 'store-banner':
      return <StoreBannerBlockRender block={block} />;
    case 'deck-next-slide':
      return <DeckNextSlideBlockRender block={block} />;
    case 'deck-jump-to':
      return <DeckJumpToBlockRender block={block} />;
    case 'post-content':
      return <PostContentPlaceholderRender block={block as Extract<Block, { type: 'post-content' }>} />;
    case 'html-render':
      return <HtmlRenderBlockRender block={block as Extract<Block, { type: 'html-render' }>} />;
    case 'html-embed':
      return <HtmlEmbedBlockRender block={block as Extract<Block, { type: 'html-embed' }>} />;
    case 'popup':
      return <PopupBlockRender block={block as Extract<Block, { type: 'popup' }>} />;
    default:
      return null;
  }
}
