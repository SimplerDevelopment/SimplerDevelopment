import React from 'react';
import type { ComponentManifestEntry } from '@/types/visual-editor';

// Block render components
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
import { GalleryBlockRender } from '@/components/blocks/render/GalleryBlockRender';
import { ProductGridBlockRender } from '@/components/blocks/render/ProductGridBlockRender';
import { FeaturedProductsBlockRender } from '@/components/blocks/render/FeaturedProductsBlockRender';
import { ProductCategoriesBlockRender } from '@/components/blocks/render/ProductCategoriesBlockRender';
import { ShoppingCartBlockRender } from '@/components/blocks/render/ShoppingCartBlockRender';
import { StoreBannerBlockRender } from '@/components/blocks/render/StoreBannerBlockRender';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlockComponent = React.ComponentType<{ block: any }>;

interface BlockRegistry {
  get(type: string): BlockComponent | undefined;
  getCustomManifests(): ComponentManifestEntry[];
}

const BUILT_IN: Record<string, BlockComponent> = {
  text: TextBlockRender,
  heading: HeadingBlockRender,
  image: ImageBlockRender,
  button: ButtonBlockRender,
  spacer: SpacerBlockRender,
  divider: DividerBlockRender,
  quote: QuoteBlockRender,
  code: CodeBlockRender,
  video: VideoBlockRender,
  youtube: YoutubeBlockRender,
  columns: ColumnsBlockRender,
  tabs: TabsBlockRender,
  accordion: AccordionBlockRender,
  hero: HeroBlockRender,
  'services-grid': ServicesGridBlockRender,
  cta: CtaBlockRender,
  testimonial: TestimonialBlockRender,
  stats: StatsBlockRender,
  'blog-posts': BlogPostsBlockRender,
  'featured-content': FeaturedContentBlockRender,
  'card-grid': CardGridBlockRender,
  section: SectionBlockRender,
  gallery: GalleryBlockRender,
  'product-grid': ProductGridBlockRender,
  'featured-products': FeaturedProductsBlockRender,
  'product-categories': ProductCategoriesBlockRender,
  'shopping-cart': ShoppingCartBlockRender,
  'store-banner': StoreBannerBlockRender,
};

let _registry: BlockRegistry | null = null;

export function getBlockRegistry(): BlockRegistry {
  if (_registry) return _registry;

  _registry = {
    get(type: string) {
      return BUILT_IN[type];
    },
    getCustomManifests() {
      return [];
    },
  };

  return _registry;
}
