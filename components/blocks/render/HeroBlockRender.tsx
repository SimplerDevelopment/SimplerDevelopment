'use client';

import { HeroBlock, HeroCtaBlock } from '@/types/blocks';
import { HeroCtaBlockRender } from './HeroCtaBlockRender';

interface HeroBlockRenderProps {
  block: HeroBlock;
}

/**
 * Thin back-compat adapter (VEQA-067 Strategy A). Legacy `hero` blocks stay
 * `type: 'hero'` in `posts.content` — no content migration — and render
 * through the unified `HeroCtaBlockRender` with `layout: 'hero'`. Field
 * names are normalized onto the canonical hero-cta shape:
 * ctaText/ctaLink -> primaryButtonText/Url, secondaryCtaText/Link ->
 * secondaryButtonText/Url. `elementKeys` preserves the old 'cta'/'secondaryCta'
 * elementStyles lookup keys so pre-existing per-element overrides still apply.
 */
export function HeroBlockRender({ block }: HeroBlockRenderProps) {
  // Compatibility aliases — some LLM-authored decks (notably older MCP
  // template output) write { eyebrow, headline, subheadline } instead of
  // { subtitle, title, description }. Accept both shapes so historical decks
  // still render; canonical fields always win when present.
  const raw = block as unknown as {
    title?: string; subtitle?: string; description?: string;
    headline?: string; eyebrow?: string; subheadline?: string;
  };
  const title = raw.title ?? raw.headline ?? '';
  const subtitle = raw.subtitle ?? raw.eyebrow;
  const description = raw.description ?? raw.subheadline;

  const normalized: HeroCtaBlock = {
    ...block,
    type: 'hero-cta',
    layout: 'hero',
    title,
    subtitle,
    description,
    primaryButtonText: block.ctaText,
    primaryButtonUrl: block.ctaLink,
    secondaryButtonText: block.secondaryCtaText,
    secondaryButtonUrl: block.secondaryCtaLink,
  };

  return (
    <HeroCtaBlockRender
      block={normalized}
      elementKeys={{ primaryButton: 'cta', secondaryButton: 'secondaryCta' }}
    />
  );
}
