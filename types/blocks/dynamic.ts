import type { BaseBlock } from './base';
import type { NavItem } from '@/lib/actions/client-sites';

// ============================================================================
// Dynamic / blog feed
// ============================================================================

export interface BlogPostsBlock extends BaseBlock {
  type: 'blog-posts';
  title?: string;
  description?: string;
  postType?: string;
  categorySlug?: string;
  limit?: number;
  showExcerpt?: boolean;
  columns?: 2 | 3;
}

// ============================================================================
// Dynamic / site navigation
// ============================================================================

/**
 * Block-placeable site navigation. Unlike every other block, it carries no
 * authored menu data of its own — at render time it fetches the live nav
 * tree for the current site from the `site_navigation` table (the same
 * managed data source the portal's nav manager and the legacy `SiteNavClient`
 * chrome both read), so edits in the nav manager propagate to every page that
 * places this block without a republish. See `NavigationBlockRender` for the
 * fetch. All fields below are purely presentational and optional so the
 * block renders sensibly with zero configuration.
 */
export interface NavigationBlock extends BaseBlock {
  type: 'navigation';
  /** Server-prefetched nav tree, injected at render time by lib/blocks/prefetch-navigation. Never persisted; when present the renderer uses it as initial state and skips its client fetch. */
  initialItems?: NavItem[];
  // Logo
  logoUrl?: string;
  logoAlt?: string;
  /** CSS unit for the logo's rendered height. Defaults to '32px'. */
  logoHeight?: string;
  // Bar colors
  backgroundColor?: string;
  /** Full CSS `background-image` value (e.g. a `linear-gradient(...)`), layered over `backgroundColor` on the nav root. */
  backgroundImage?: string;
  linkColor?: string;
  linkHoverColor?: string;
  // Link typography (desktop + mobile link labels only — never the CTA)
  linkFontSize?: string;
  /** e.g. 'italic' */
  linkFontStyle?: string;
  linkLetterSpacing?: string;
  // CTA button — rendered for any top-level nav item with `isButton: true`.
  ctaBackgroundColor?: string;
  ctaTextColor?: string;
  ctaHoverBackgroundColor?: string;
  ctaBorderRadius?: string;
  // Dropdown panel (desktop hover menu for items with children)
  dropdownBackgroundColor?: string;
  dropdownLinkColor?: string;
  /** Pins the bar to the top of the viewport on scroll. Defaults to true. */
  sticky?: boolean;
  /** Overlay mode: the bar paints OVER the following block (zero layout
   *  height) instead of stacking above it — the transparent-header-over-hero
   *  pattern. Pair with backgroundColor:'transparent' and a light linkColor.
   *  Overlay implies non-sticky (the bar scrolls away with the hero). */
  overlay?: boolean;
  /** CSS unit for the inner container's max-width. Defaults to '1280px'. */
  containerMaxWidth?: string;
  /** Overrides the page's body font for nav text only. */
  fontFamily?: string;
}

