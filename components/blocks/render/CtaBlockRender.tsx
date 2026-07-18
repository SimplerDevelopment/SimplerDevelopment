'use client';

import { CtaBlock, HeroCtaBlock } from '@/types/blocks';
import { HeroCtaBlockRender } from './HeroCtaBlockRender';

interface CtaBlockRenderProps {
  block: CtaBlock;
}

/**
 * Thin back-compat adapter (VEQA-067 Strategy A). Legacy `cta` blocks stay
 * `type: 'cta'` in `posts.content` — no content migration — and render
 * through the unified `HeroCtaBlockRender` with `layout: 'banner'`. Field
 * names already match the canonical hero-cta shape 1:1, so no renaming is
 * needed here; the elementStyles keys ('title'/'description'/'primaryButton'/
 * 'secondaryButton') also match the renderer's defaults.
 */
export function CtaBlockRender({ block }: CtaBlockRenderProps) {
  const normalized: HeroCtaBlock = {
    ...block,
    type: 'hero-cta',
    layout: 'banner',
  };

  return <HeroCtaBlockRender block={normalized} />;
}
