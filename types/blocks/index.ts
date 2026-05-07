/**
 * Public surface for block-system types.
 *
 * This module is a barrel — it preserves the historical `@/types/blocks`
 * import path (which previously pointed at a single 1.4kLOC file). The
 * actual interfaces are split by category in sibling files:
 *
 *   - base.ts       — `BlockStyle`, `BaseBlock`, `PostContentBlock`
 *   - layout.ts     — columns, sections, tabs, accordion, dividers, spacers
 *   - content.ts    — text, heading, quote, code, html-render
 *   - media.ts      — image, video, youtube, gallery, marquee, html-embed
 *   - form.ts       — buttons, booking, survey, deck navigation
 *   - commerce.ts   — product grids, cart, store banner, etc.
 *   - components.ts — hero, cta, team, metric cards, footer, etc.
 *   - dynamic.ts    — blog feed + Palizzi client-specific blocks
 *   - editor.ts     — editor state (history, drag, paste, page settings)
 *
 * Adding a new block: pick the category, declare the interface there,
 * add it to the `Block` union below, and (if user-pickable) register it
 * in `lib/blocks/registry.ts`.
 */

// Re-export every public name from the leaf modules so consumers continue
// to import from '@/types/blocks' unchanged.
export * from './base';
export * from './layout';
export * from './content';
export * from './media';
export * from './form';
export * from './commerce';
export * from './components';
export * from './dynamic';
export * from './editor';

import type { PostContentBlock } from './base';
import type {
  ColumnsBlock,
  SpacerBlock,
  DividerBlock,
  SectionBlock,
  TabsBlock,
  AccordionBlock,
  StickyScrollTabsBlock,
} from './layout';
import type {
  TextBlock,
  HeadingBlock,
  QuoteBlock,
  CodeBlock,
  HtmlRenderBlock,
} from './content';
import type {
  ImageBlock,
  VideoBlock,
  YoutubeBlock,
  GalleryBlock,
  MarqueeBlock,
  HtmlEmbedBlock,
} from './media';
import type {
  ButtonBlock,
  BookingBlock,
  BookingMenuBlock,
  SurveyBlock,
  SurveyResultsBlock,
  SurveyInputBlock,
  DeckNextSlideBlock,
  DeckJumpToBlock,
} from './form';
import type {
  ProductGridBlock,
  FeaturedProductsBlock,
  ProductCategoriesBlock,
  ShoppingCartBlock,
  ProductDetailBlock,
  StoreBannerBlock,
} from './commerce';
import type {
  HeroBlock,
  HeroSlideshowBlock,
  CtaBlock,
  TestimonialBlock,
  StatsBlock,
  FeaturedContentBlock,
  CardGridBlock,
  ServicesGridBlock,
  TimelineBlock,
  TeamShowcaseBlock,
  TeamFlipGridBlock,
  BentoGridBlock,
  FlipCardGridBlock,
  MetricCardsBlock,
  LogoStripBlock,
  SiteFooterBlock,
  SocialLinksBlock,
  EmailHeaderBlock,
  EmailFooterBlock,
  PopupBlock,
} from './components';
import type {
  BlogPostsBlock,
  PalizziNavBlock,
  PalizziHeroBlock,
  PalizziWelcomeBlock,
  PalizziHistoryBlock,
  PalizziMenuBlock,
  PalizziRulesBlock,
  PalizziMembershipBlock,
  PalizziFooterBlock,
} from './dynamic';

// Union type of all blocks
export type Block =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | ButtonBlock
  | SpacerBlock
  | DividerBlock
  | ColumnsBlock
  | CodeBlock
  | HtmlRenderBlock
  | QuoteBlock
  | VideoBlock
  | YoutubeBlock
  | HeroBlock
  | HeroSlideshowBlock
  | MarqueeBlock
  | ServicesGridBlock
  | CtaBlock
  | TestimonialBlock
  | StatsBlock
  | BlogPostsBlock
  | FeaturedContentBlock
  | AccordionBlock
  | TabsBlock
  | StickyScrollTabsBlock
  | CardGridBlock
  | SectionBlock
  | GalleryBlock
  | PalizziNavBlock
  | PalizziHeroBlock
  | PalizziWelcomeBlock
  | PalizziHistoryBlock
  | PalizziMenuBlock
  | PalizziRulesBlock
  | PalizziMembershipBlock
  | PalizziFooterBlock
  | ProductGridBlock
  | FeaturedProductsBlock
  | ProductCategoriesBlock
  | ShoppingCartBlock
  | StoreBannerBlock
  | ProductDetailBlock
  | BookingBlock
  | BookingMenuBlock
  | SurveyBlock
  | SurveyResultsBlock
  | SocialLinksBlock
  | EmailHeaderBlock
  | EmailFooterBlock
  | TimelineBlock
  | TeamShowcaseBlock
  | TeamFlipGridBlock
  | BentoGridBlock
  | FlipCardGridBlock
  | MetricCardsBlock
  | LogoStripBlock
  | SiteFooterBlock
  | DeckNextSlideBlock
  | DeckJumpToBlock
  | SurveyInputBlock
  | HtmlEmbedBlock
  | PopupBlock
  | PostContentBlock;

export type BlockType = Block['type'];
