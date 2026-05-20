import type { BaseBlock } from './base';
import type { Block } from './index';

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: 'sm' | 'md' | 'lg' | 'xl';
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: Column[];
  gap?: 'sm' | 'md' | 'lg';
  stackOnMobile?: boolean; // Default: true
  stackOnTablet?: boolean; // Default: false
  reverseOnStack?: boolean; // Default: false — reverse column order when stacked
}

export interface Column {
  id: string;
  width: number | string; // Number (50) or string ("50%")
  blocks: Block[];
  // Per-column settings
  backgroundColor?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  verticalAlign?: 'top' | 'center' | 'bottom';
  cssClass?: string;
}

export interface AccordionBlock extends BaseBlock {
  type: 'accordion';
  title?: string;
  items: Array<{
    id: string;
    title: string;
    content: string;
  }>;
}

export interface TabsBlock extends BaseBlock {
  type: 'tabs';
  tabs: Array<{
    id: string;
    label: string;
    blocks: Block[];
  }>;
}

/**
 * Sticky Scroll Tabs — full-viewport panels that cross-fade as the user scrolls,
 * with a sticky tab strip that highlights the active panel. Inspired by the
 * "wp-block-postcaptain-scroll-tabs" pattern. Universal — usable for any
 * multi-section "show one panel at a time, scroll-driven" UX.
 */
export interface StickyScrollTabsBlock extends BaseBlock {
  type: 'sticky-scroll-tabs';
  /** Optional eyebrow above the heading. */
  overline?: string;
  /** Optional section heading rendered above the tabs. */
  title?: string;
  /** Optional supporting paragraph rendered alongside / under the heading. */
  description?: string;
  /** Each panel gets a tab pill + a content block list. */
  panels: Array<{
    id: string;
    label: string;
    icon?: string; // Material Icon name
    blocks: Block[];
  }>;
  /** Px offset from top where the sticky tab strip pins. Default 80. */
  stickyTopOffset?: number;
  /** Visual height of each panel (CSS unit). Default '60vh'. */
  panelMinHeight?: string;
  /** Pill border radius. Default '999px'. */
  tabBorderRadius?: string;
  /** Pill colors. */
  activeTabBackground?: string;
  activeTabColor?: string;
  inactiveTabBackground?: string;
  inactiveTabColor?: string;
  /**
   * Optional mobile-specific pill colors. When set, the mobile carousel tab
   * strip uses these instead of the desktop colors. Useful when desktop and
   * mobile designs diverge (e.g. desktop uses white pills, mobile uses
   * mint-green). Each falls back to its desktop counterpart when undefined.
   */
  mobileActiveTabBackground?: string;
  mobileActiveTabColor?: string;
  mobileInactiveTabBackground?: string;
  mobileInactiveTabColor?: string;
  /**
   * Behavior of the tab strip on mobile (≤1024px).
   * - 'hide':     panels stack vertically, no tab UI rendered (legacy default).
   * - 'carousel': panels stack vertically AND a sticky horizontal-scroll tab strip
   *               renders at the top; tapping a tab scrolls to its panel. Default.
   */
  mobileTabsBehavior?: 'hide' | 'carousel';
}

export interface SectionBlock extends BaseBlock {
  type: 'section';
  blocks: Block[];
  /**
   * @deprecated Use `block.style.backgroundColor` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   * The renderer treats `block.style.*` as the winning value.
   */
  backgroundColor?: string;
  backgroundImage?: string;
  /**
   * @deprecated Use `block.style.backgroundSize` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   * The renderer treats `block.style.*` as the winning value.
   */
  backgroundSize?: 'cover' | 'contain' | 'auto';
  /**
   * @deprecated Use `block.style.backgroundPosition` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   * The renderer treats `block.style.*` as the winning value.
   */
  backgroundPosition?: string;
  maxWidth?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingTop?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingBottom?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingLeft?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingRight?: string;
  /**
   * @deprecated Use `block.style.color` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  color?: string;
  /**
   * @deprecated Use `block.style.fontFamily` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  fontFamily?: string;
  cssClass?: string;
  htmlTag?: 'section' | 'div' | 'article' | 'aside' | 'header' | 'footer';
  /** Diagonal split: a second color rendered with a clip-path on the right side */
  splitColor?: string;
  /** Clip-path polygon for the split overlay, e.g. "polygon(55% 0, 100% 0, 100% 100%, 45% 100%)" */
  splitClipPath?: string;
}
