'use client';

import type { ComponentType } from 'react';
import type { Block } from '@/types/blocks';
import { ContentPanel } from './_components/block-panels/ContentPanel';
import { MediaPanel } from './_components/block-panels/MediaPanel';
import { HeroPanel } from './_components/block-panels/HeroPanel';
import { LayoutPanel } from './_components/block-panels/LayoutPanel';
import { MarketingPanel } from './_components/block-panels/MarketingPanel';
import { CommercePanel } from './_components/block-panels/CommercePanel';
import { SpecialPanel } from './_components/block-panels/SpecialPanel';

// ─── Panel props type ────────────────────────────────────────────────────────

interface PanelProps {
  block: Block;
  onUpdate: (updates: Partial<Block>) => void;
  siteId?: number;
  /** VEQA-041 — call with `true` while the user is interacting with a
   *  hover-preview-worthy control (e.g. button's Hover Effect select) and
   *  `false` when they stop, so the canvas can force-preview the block's
   *  `:hover` CSS. Only ContentPanel's button case currently uses this. */
  onForceHoverChange?: (active: boolean) => void;
}

// ─── Block-type → panel lookup table ─────────────────────────────────────────

// TWO PARALLEL PANEL SYSTEMS: this PANEL_MAP drives the portal block-content
// editor sidebar. A separate, unrelated dispatch — SLUG_TO_CATEGORY in
// components/blocks/visual/BlockSettings.tsx, routing to
// components/blocks/visual/block-settings/panels/ (DynamicPanel etc.) — drives
// the VisualBlockEditor/settings-popup surface for the SAME block types. A
// field added to only one side half-ships: VEQA-068's card-grid icon-color
// control initially existed only in DynamicPanel and was invisible here until
// MarketingPanel got the matching field (see commit 682da3d4e). Wire both when
// adding a field to an existing block type.
//
// Missing a slug here is a silent no-op, not an error: `Panel` below resolves
// to `undefined` and the sidebar renders nothing for that block type — found
// during VEQA-067 when hero-cta shipped without a PANEL_MAP entry.
const PANEL_MAP: Record<string, ComponentType<PanelProps>> = {
  // Content
  heading: ContentPanel,
  text: ContentPanel,
  button: ContentPanel,
  quote: ContentPanel,
  code: ContentPanel,
  spacer: ContentPanel,
  divider: ContentPanel,

  // Media
  image: MediaPanel,
  video: MediaPanel,
  youtube: MediaPanel,
  gallery: MediaPanel,

  // Hero
  hero: HeroPanel,
  'hero-slideshow': HeroPanel,
  cta: HeroPanel,
  'hero-cta': HeroPanel,
  marquee: HeroPanel,

  // Layout
  columns: LayoutPanel,
  section: LayoutPanel,

  // Marketing
  stats: MarketingPanel,
  'card-grid': MarketingPanel,
  'flip-card-grid': MarketingPanel,
  'metric-cards': MarketingPanel,
  'logo-strip': MarketingPanel,
  'services-grid': MarketingPanel,
  'featured-content': MarketingPanel,
  'bento-grid': MarketingPanel,
  'team-showcase': MarketingPanel,
  'team-flip-grid': MarketingPanel,
  testimonial: MarketingPanel,

  // Commerce
  'product-grid': CommercePanel,
  'featured-products': CommercePanel,
  'product-categories': CommercePanel,
  'shopping-cart': CommercePanel,
  'store-banner': CommercePanel,
  'product-detail': CommercePanel,

  // Special
  booking: SpecialPanel,
  survey: SpecialPanel,
  popup: SpecialPanel,
  'deck-next-slide': SpecialPanel,
  'deck-jump-to': SpecialPanel,
  'booking-menu': SpecialPanel,
  'social-links': SpecialPanel,
  timeline: SpecialPanel,
  accordion: SpecialPanel,
  tabs: SpecialPanel,
  'sticky-scroll-tabs': SpecialPanel,
  'blog-posts': SpecialPanel,
  'survey-results': SpecialPanel,
  'html-embed': SpecialPanel,
  'html-render': SpecialPanel,
  'site-footer': SpecialPanel,
  navigation: SpecialPanel,
};

// ─── Block Content Editor ────────────────────────────────────────────────────

export function BlockContentEditor({ block, onUpdate, siteId, onForceHoverChange }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number; onForceHoverChange?: (active: boolean) => void }) {
  const Panel = PANEL_MAP[block.type];
  return (
    <div className="space-y-3">
      {Panel && <Panel block={block} onUpdate={onUpdate} siteId={siteId} onForceHoverChange={onForceHoverChange} />}
    </div>
  );
}
