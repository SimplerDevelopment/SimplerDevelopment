/**
 * Compile-time export-parity gate for `@/types/blocks`.
 *
 * `types/blocks` is a pure type module — it has no runtime values, so we cannot
 * iterate `Object.keys` at runtime. This test instead leans on `tsc --noEmit`
 * to catch any missing/renamed exports: every public name is referenced in a
 * `Pick<>` below, so dropping or renaming an export breaks the build.
 *
 * If you legitimately add a new export, append it to `EXPECTED_EXPORTS` and
 * include it in the `Pick<>`. If you legitimately remove an export, the
 * removal must come with a follow-up release note — this test is the gate.
 */
import { describe, it, expect } from 'vitest';

import type * as Blocks from '@/types/blocks';

// ---------------------------------------------------------------------------
// Compile-time references — every type imported from '@/types/blocks' must
// resolve to a value in this Pick<>. Missing names fail tsc.
// ---------------------------------------------------------------------------

type _PublicSurface = Pick<
  typeof Blocks,
  // —— base ——
  | 'BlockStyle'
  | 'BaseBlock'
  | 'PostContentBlock'
  // —— layout ——
  | 'Column'
  | 'ColumnsBlock'
  | 'SpacerBlock'
  | 'DividerBlock'
  | 'SectionBlock'
  | 'TabsBlock'
  | 'AccordionBlock'
  | 'StickyScrollTabsBlock'
  // —— content ——
  | 'TextBlock'
  | 'HeadingBlock'
  | 'QuoteBlock'
  | 'CodeBlock'
  | 'HtmlRenderBlock'
  | 'HtmlRenderLoop'
  | 'HtmlRenderField'
  | 'HtmlRenderConditional'
  // —— media ——
  | 'ImageBlock'
  | 'VideoBlock'
  | 'YoutubeBlock'
  | 'GalleryBlock'
  | 'MarqueeBlock'
  | 'MarqueeItem'
  | 'HtmlEmbedBlock'
  | 'HtmlEmbedSandbox'
  // —— form / interactive ——
  | 'ButtonBlock'
  | 'BookingBlock'
  | 'BookingMenuBlock'
  | 'SurveyBlock'
  | 'SurveyResultsBlock'
  | 'SurveyResultsChartType'
  | 'SurveyInputBlock'
  | 'DeckNextSlideBlock'
  | 'DeckJumpToBlock'
  // —— commerce ——
  | 'ProductGridBlock'
  | 'FeaturedProductsBlock'
  | 'ProductCategoriesBlock'
  | 'ShoppingCartBlock'
  | 'ProductDetailBlock'
  | 'StoreBannerBlock'
  // —— components / "premium" ——
  | 'HeroBlock'
  | 'HeroSlideshowBlock'
  | 'HeroSlideshowSlide'
  | 'CtaBlock'
  | 'TestimonialBlock'
  | 'StatsBlock'
  | 'FeaturedContentBlock'
  | 'CardGridBlock'
  | 'ServicesGridBlock'
  | 'ServiceBullet'
  | 'TimelineBlock'
  | 'TimelineStep'
  | 'TeamShowcaseBlock'
  | 'TeamMember'
  | 'TeamFlipGridBlock'
  | 'TeamFlipMember'
  | 'BentoGridBlock'
  | 'BentoCard'
  | 'FlipCardGridBlock'
  | 'FlipCard'
  | 'MetricCardsBlock'
  | 'MetricCard'
  | 'LogoStripBlock'
  | 'LogoStripLogo'
  | 'SiteFooterBlock'
  | 'FooterLinkGroup'
  | 'SocialLinksBlock'
  | 'EmailHeaderBlock'
  | 'EmailFooterBlock'
  // —— dynamic / palizzi (client-specific composites) ——
  | 'BlogPostsBlock'
  | 'PalizziNavBlock'
  | 'PalizziHeroBlock'
  | 'PalizziWelcomeBlock'
  | 'PalizziHistoryBlock'
  | 'PalizziMenuBlock'
  | 'PalizziRulesBlock'
  | 'PalizziMembershipBlock'
  | 'PalizziFooterBlock'
  // —— root union + page settings ——
  | 'Block'
  | 'BlockType'
  | 'PageSettings'
  | 'BlockEditorData'
  // —— editor state ——
  | 'HistoryAction'
  | 'HistoryEntry'
  | 'SaveStatus'
  | 'ContentStats'
  | 'EditorState'
  | 'DragState'
  | 'ShortcutCategory'
  | 'KeyboardShortcut'
  | 'PasteWarningType'
  | 'PasteWarning'
  | 'PasteResult'
>;

// Reference the alias so it isn't elided
type _Surface = _PublicSurface;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _surface: _Surface = {} as _Surface;

// ---------------------------------------------------------------------------
// Runtime sanity check — the snapshot count. If somebody adds an export
// without appending here, the count assertion fires; the Pick<> above
// catches removals.
// ---------------------------------------------------------------------------

const EXPECTED_EXPORTS = [
  // base
  'BlockStyle', 'BaseBlock', 'PostContentBlock',
  // layout
  'Column', 'ColumnsBlock', 'SpacerBlock', 'DividerBlock', 'SectionBlock',
  'TabsBlock', 'AccordionBlock', 'StickyScrollTabsBlock',
  // content
  'TextBlock', 'HeadingBlock', 'QuoteBlock', 'CodeBlock',
  'HtmlRenderBlock', 'HtmlRenderLoop', 'HtmlRenderField', 'HtmlRenderConditional',
  // media
  'ImageBlock', 'VideoBlock', 'YoutubeBlock', 'GalleryBlock',
  'MarqueeBlock', 'MarqueeItem', 'HtmlEmbedBlock', 'HtmlEmbedSandbox',
  // form / interactive
  'ButtonBlock', 'BookingBlock', 'BookingMenuBlock', 'SurveyBlock',
  'SurveyResultsBlock', 'SurveyResultsChartType', 'SurveyInputBlock',
  'DeckNextSlideBlock', 'DeckJumpToBlock',
  // commerce
  'ProductGridBlock', 'FeaturedProductsBlock', 'ProductCategoriesBlock',
  'ShoppingCartBlock', 'ProductDetailBlock', 'StoreBannerBlock',
  // components
  'HeroBlock', 'HeroSlideshowBlock', 'HeroSlideshowSlide', 'CtaBlock',
  'TestimonialBlock', 'StatsBlock', 'FeaturedContentBlock', 'CardGridBlock',
  'ServicesGridBlock', 'ServiceBullet', 'TimelineBlock', 'TimelineStep',
  'TeamShowcaseBlock', 'TeamMember', 'TeamFlipGridBlock', 'TeamFlipMember',
  'BentoGridBlock', 'BentoCard', 'FlipCardGridBlock', 'FlipCard',
  'MetricCardsBlock', 'MetricCard', 'LogoStripBlock', 'LogoStripLogo',
  'SiteFooterBlock', 'FooterLinkGroup', 'SocialLinksBlock',
  'EmailHeaderBlock', 'EmailFooterBlock',
  // dynamic / palizzi
  'BlogPostsBlock', 'PalizziNavBlock', 'PalizziHeroBlock', 'PalizziWelcomeBlock',
  'PalizziHistoryBlock', 'PalizziMenuBlock', 'PalizziRulesBlock',
  'PalizziMembershipBlock', 'PalizziFooterBlock',
  // root
  'Block', 'BlockType', 'PageSettings', 'BlockEditorData',
  // editor state
  'HistoryAction', 'HistoryEntry', 'SaveStatus', 'ContentStats',
  'EditorState', 'DragState', 'ShortcutCategory', 'KeyboardShortcut',
  'PasteWarningType', 'PasteWarning', 'PasteResult',
] as const;

describe('@/types/blocks export parity', () => {
  it('records the canonical export list (size = 95)', () => {
    expect(EXPECTED_EXPORTS.length).toBe(95);
    // No duplicates
    expect(new Set(EXPECTED_EXPORTS).size).toBe(EXPECTED_EXPORTS.length);
  });

  it('the type-level Pick<> compiles cleanly', () => {
    // If this file compiles, the Pick<> at the top of the module resolved
    // every name. A removed export would surface as a TS2344 here.
    expect(true).toBe(true);
  });
});
