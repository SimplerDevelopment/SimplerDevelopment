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
import { HeroSlideshowBlockRender } from '@/components/blocks/render/HeroSlideshowBlockRender';
import { MarqueeBlockRender } from '@/components/blocks/render/MarqueeBlockRender';
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
import { BookingBlockRender } from '@/components/blocks/render/BookingBlockRender';
import { BookingMenuBlockRender } from '@/components/blocks/render/BookingMenuBlockRender';
import { SurveyBlockRender } from '@/components/blocks/render/SurveyBlockRender';
import { SocialLinksBlockRender } from '@/components/blocks/render/SocialLinksBlockRender';
import { EmailHeaderBlockRender } from '@/components/blocks/render/EmailHeaderBlockRender';
import { EmailFooterBlockRender } from '@/components/blocks/render/EmailFooterBlockRender';
import { PalizziNavBlockRender } from '@/components/blocks/render/PalizziNavBlockRender';
import { PalizziHeroBlockRender } from '@/components/blocks/render/PalizziHeroBlockRender';
import { PalizziWelcomeBlockRender } from '@/components/blocks/render/PalizziWelcomeBlockRender';
import { PalizziHistoryBlockRender } from '@/components/blocks/render/PalizziHistoryBlockRender';
import { PalizziMenuBlockRender } from '@/components/blocks/render/PalizziMenuBlockRender';
import { PalizziRulesBlockRender } from '@/components/blocks/render/PalizziRulesBlockRender';
import { PalizziMembershipBlockRender } from '@/components/blocks/render/PalizziMembershipBlockRender';
import { PalizziFooterBlockRender } from '@/components/blocks/render/PalizziFooterBlockRender';
import { ProductDetailBlockRender } from '@/components/blocks/render/ProductDetailBlockRender';
import { SurveyResultsBlockRender } from '@/components/blocks/render/SurveyResultsBlockRender';
import { TimelineBlockRender } from '@/components/blocks/render/TimelineBlockRender';
import { TeamShowcaseBlockRender } from '@/components/blocks/render/TeamShowcaseBlockRender';
import { TeamFlipGridBlockRender } from '@/components/blocks/render/TeamFlipGridBlockRender';
import { BentoGridBlockRender } from '@/components/blocks/render/BentoGridBlockRender';
import { FlipCardGridBlockRender } from '@/components/blocks/render/FlipCardGridBlockRender';
import { MetricCardsBlockRender } from '@/components/blocks/render/MetricCardsBlockRender';
import { LogoStripBlockRender } from '@/components/blocks/render/LogoStripBlockRender';
import { SiteFooterBlockRender } from '@/components/blocks/render/SiteFooterBlockRender';
import { DeckNextSlideBlockRender, DeckJumpToBlockRender } from '@/components/blocks/render/DeckNavBlockRender';
import { SurveyInputBlockRender } from '@/components/blocks/render/SurveyInputBlockRender';

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
  'hero-slideshow': HeroSlideshowBlockRender,
  marquee: MarqueeBlockRender,
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
  booking: BookingBlockRender,
  'booking-menu': BookingMenuBlockRender,
  survey: SurveyBlockRender,
  'social-links': SocialLinksBlockRender,
  'email-header': EmailHeaderBlockRender,
  'email-footer': EmailFooterBlockRender,
  'palizzi-nav': PalizziNavBlockRender,
  'palizzi-hero': PalizziHeroBlockRender,
  'palizzi-welcome': PalizziWelcomeBlockRender,
  'palizzi-history': PalizziHistoryBlockRender,
  'palizzi-menu': PalizziMenuBlockRender,
  'palizzi-rules': PalizziRulesBlockRender,
  'palizzi-membership': PalizziMembershipBlockRender,
  'palizzi-footer': PalizziFooterBlockRender,
  'product-detail': ProductDetailBlockRender,
  'survey-results': SurveyResultsBlockRender,
  timeline: TimelineBlockRender,
  'team-showcase': TeamShowcaseBlockRender,
  'team-flip-grid': TeamFlipGridBlockRender,
  'bento-grid': BentoGridBlockRender,
  'flip-card-grid': FlipCardGridBlockRender,
  'metric-cards': MetricCardsBlockRender,
  'logo-strip': LogoStripBlockRender,
  'site-footer': SiteFooterBlockRender,
  'deck-next-slide': DeckNextSlideBlockRender,
  'deck-jump-to': DeckJumpToBlockRender,
  'survey-input': SurveyInputBlockRender,
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
