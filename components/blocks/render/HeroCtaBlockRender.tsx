'use client';

import dynamic from 'next/dynamic';
import { HeroCtaBlock, Block } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';
import { safeHref } from '@/lib/utils/safe-href';
import { HeadingBlockRender } from './HeadingBlockRender';
import { TextBlockRender } from './TextBlockRender';
import { ImageBlockRender } from './ImageBlockRender';
import { LogoStripBlockRender } from './LogoStripBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import { ancestorStyle, useResolvedTypography } from './typography-cascade';

// ColumnsBlockRender recursively imports the full block-render universe
// (including the BlogPosts -> lib/db chain) — see lazy-blocks.tsx. It's only
// needed for the 'hero' layout's optional nested `blocks` (e.g. trust bars).
// Loading it lazily here keeps the 'banner' layout (legacy CtaBlockRender,
// which never has child blocks) from paying that weight, matching the
// pre-merge CtaBlockRender.tsx, which had no dependency on it at all.
const ColumnsBlockRender = dynamic(() =>
  import('./ColumnsBlockRender').then((m) => m.ColumnsBlockRender));

interface ElementKeyMap {
  subtitle: string;
  title: string;
  description: string;
  primaryButton: string;
  secondaryButton: string;
}

// Canonical elementStyles keys for a native `hero-cta` block. The legacy
// `HeroBlockRender` adapter overrides `primaryButton`/`secondaryButton` to
// the old 'cta'/'secondaryCta' keys so pre-existing per-element style
// overrides on stored `hero` blocks keep resolving correctly.
const DEFAULT_ELEMENT_KEYS: ElementKeyMap = {
  subtitle: 'subtitle',
  title: 'title',
  description: 'description',
  primaryButton: 'primaryButton',
  secondaryButton: 'secondaryButton',
};

interface HeroCtaBlockRenderProps {
  block: HeroCtaBlock;
  /** Override which elementStyles keys are consulted — see DEFAULT_ELEMENT_KEYS. */
  elementKeys?: Partial<ElementKeyMap>;
}

/**
 * Unified renderer for the `hero-cta` block (VEQA-067 Strategy A).
 *
 * `layout: 'hero'` reproduces the legacy `HeroBlockRender` full-bleed look;
 * `layout: 'banner'` reproduces the legacy `CtaBlockRender` centered-band
 * look. The legacy `HeroBlockRender`/`CtaBlockRender` components are now thin
 * adapters that normalize their old field names onto `HeroCtaBlock` and
 * delegate here — the JSX below is moved verbatim from those two components
 * per variant, not redesigned, so existing stored blocks render pixel-identically.
 */
export function HeroCtaBlockRender({ block, elementKeys }: HeroCtaBlockRenderProps) {
  const branding = useBranding();
  const keys = { ...DEFAULT_ELEMENT_KEYS, ...elementKeys };

  // VEQA-032 step 3b — resolved once per named text slot, unconditionally
  // (both layouts share these hook calls — 'banner' never reads
  // resolvedSubtitle, that's fine, rules-of-hooks just wants a stable call
  // order). own = block.style is shared across slots, so this reproduces the
  // pre-existing `hasCustomFontSize`/`hasCustomFontWeight` behavior exactly
  // for the 'own' tier while adding elementStyles- and ancestor-awareness
  // per slot. Buttons are chrome — no resolution for primaryButton/secondaryButton.
  const resolvedSubtitle = useResolvedTypography(block, keys.subtitle);
  const resolvedTitle = useResolvedTypography(block, keys.title);
  const resolvedDescription = useResolvedTypography(block, keys.description);

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
        block.responsive.visibility,
        block.responsive.fontSize
      )
    : '';

  if (block.layout === 'banner') {
    // ─── 'banner' — legacy CtaBlockRender look ─────────────────────────────
    const style = typeof block.style === 'object' ? block.style : {};
    const hasCustomPadding = !!(style.paddingTop || style.paddingBottom || style.padding);

    const bgStyle = block.backgroundStyle || 'gradient';
    const backgroundClass = bgStyle === 'solid' ? 'bg-primary/10'
      : bgStyle === 'none' ? ''
      : ''; // gradient handled via inline style when branding available

    const gradientStyle: React.CSSProperties = {};
    if (bgStyle === 'gradient') {
      if (branding) {
        gradientStyle.background = `linear-gradient(to right, ${branding.primaryColor}20, ${branding.secondaryColor}20, ${branding.accentColor}20)`;
      } else {
        gradientStyle.background = 'linear-gradient(to right, hsl(var(--primary) / 0.2), rgb(168 85 247 / 0.2), rgb(236 72 153 / 0.2))';
      }
    }

    // Authors can override the default gradient via the style sidebar — pass
    // backgroundColor / customCSS / padding through to the wrapping section so
    // a hero-cta (banner) block can render as a full-bleed branded band.
    const wrapperStyle: React.CSSProperties = { ...gradientStyle };
    if (style.backgroundColor) wrapperStyle.backgroundColor = style.backgroundColor;
    if (style.paddingTop) wrapperStyle.paddingTop = style.paddingTop as string;
    if (style.paddingBottom) wrapperStyle.paddingBottom = style.paddingBottom as string;
    if (style.paddingLeft) wrapperStyle.paddingLeft = style.paddingLeft as string;
    if (style.paddingRight) wrapperStyle.paddingRight = style.paddingRight as string;
    if (style.color) wrapperStyle.color = style.color as string;
    if (typeof style.customCSS === 'string' && style.customCSS.trim()) {
      for (const decl of style.customCSS.split(';')) {
        const idx = decl.indexOf(':');
        if (idx < 0) continue;
        const prop = decl.slice(0, idx).trim();
        const val = decl.slice(idx + 1).trim();
        if (!prop || !val) continue;
        const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        (wrapperStyle as Record<string, string>)[camel] = val;
      }
    }

    return (
      <section className={`relative overflow-hidden ${hasCustomPadding ? '' : 'py-16'} ${backgroundClass} ${responsiveClasses}`} style={wrapperStyle}>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 data-editable-field="title" className={`font-display ${resolvedTitle.fontSize.value ? '' : 'text-4xl md:text-6xl'} ${resolvedTitle.fontWeight.value ? '' : 'font-bold'} mb-6 tracking-wide`} style={{ ...ancestorStyle(resolvedTitle), ...getElementCSS(block.elementStyles, keys.title) }} dangerouslySetInnerHTML={{ __html: block.title }} />

          {block.description && (
            <p data-editable-field="description" className={`${resolvedDescription.fontSize.value ? '' : 'text-xl md:text-2xl'} text-muted-foreground mb-12 max-w-3xl mx-auto`} style={{ ...ancestorStyle(resolvedDescription), ...getElementCSS(block.elementStyles, keys.description) }} dangerouslySetInnerHTML={{ __html: block.description }} />
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button href={safeHref(block.primaryButtonUrl) ?? undefined} size="lg" style={getElementCSS(block.elementStyles, keys.primaryButton)}>
              {block.primaryButtonText}
            </Button>
            {block.secondaryButtonText && block.secondaryButtonUrl && (
              <Button href={block.secondaryButtonUrl} variant="outline" size="lg" style={getElementCSS(block.elementStyles, keys.secondaryButton)}>
                {block.secondaryButtonText}
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ─── 'hero' — legacy HeroBlockRender look ──────────────────────────────
  const style = typeof block.style === 'object' ? block.style : {};

  const hasBackground = !!block.backgroundImage;
  const hasCustomBg = !!(style.backgroundColor || style.backgroundGradient || style.backgroundImage);
  // VEQA-032 step 3b — subtitle/title/description color here is
  // background-contingent (`hasBackground ? 'text-white...' : 'text-primary'
  // /'text-muted-foreground'`), not an own-value fallback guard, so there's
  // no guard to replace. We still apply the full `ancestorStyle(resolved)`
  // (which includes color when the ancestor source wins) below, same as
  // every other content node — an inline style always beats these classes
  // regardless, and the existing own/elementStyles > ancestor precedence
  // remains the escape hatch if an ancestor color ever fights a background
  // image's contrast: set the block's own color/elementStyles override and
  // it wins.

  return (
    <section className={`relative min-h-[60vh] flex items-center justify-center overflow-hidden ${responsiveClasses}`}>
      {hasBackground ? (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${block.backgroundImage})` }}
        />
      ) : !hasCustomBg ? (
        <div
          className={`absolute inset-0 z-0 ${!branding ? 'bg-gradient-to-b from-primary/10 via-background to-background' : ''}`}
          style={branding ? { background: `linear-gradient(to bottom, ${branding.primaryColor}1a, ${branding.backgroundColor}, ${branding.backgroundColor})` } : undefined}
        />
      ) : null}

      {/* Same escape hatch as the banner layout: explicit style paddings
          replace the built-in py-20 instead of stacking on top of it. Only
          the vertical axis — px-4 always stands. */}
      <div
        className={`relative z-10 container mx-auto px-4 ${style.paddingTop || style.paddingBottom ? '' : 'py-20'}`}
        style={{
          ...(style.paddingTop ? { paddingTop: style.paddingTop as string } : {}),
          ...(style.paddingBottom ? { paddingBottom: style.paddingBottom as string } : {}),
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          {block.subtitle && (
            <p data-editable-field="subtitle" className={`${resolvedSubtitle.fontWeight.value ? '' : 'font-semibold'} mb-4 uppercase tracking-wide ${hasBackground ? 'text-white/80' : 'text-primary'}`} style={{ ...ancestorStyle(resolvedSubtitle), ...getElementCSS(block.elementStyles, keys.subtitle) }} dangerouslySetInnerHTML={{ __html: block.subtitle }} />
          )}

          <h1 data-editable-field="title" className={`font-display ${resolvedTitle.fontSize.value ? '' : 'text-5xl md:text-7xl'} ${resolvedTitle.fontWeight.value ? '' : 'font-bold'} mb-6 tracking-wide ${hasBackground ? 'text-white' : ''}`} style={{ ...ancestorStyle(resolvedTitle), ...getElementCSS(block.elementStyles, keys.title) }} dangerouslySetInnerHTML={{ __html: block.title }} />

          {block.description && (
            <p data-editable-field="description" className={`${resolvedDescription.fontSize.value ? '' : 'text-xl md:text-2xl'} mb-8 max-w-2xl mx-auto ${hasBackground ? 'text-white/80' : 'text-muted-foreground'}`} style={{ ...ancestorStyle(resolvedDescription), ...getElementCSS(block.elementStyles, keys.description) }} dangerouslySetInnerHTML={{ __html: block.description }} />
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center items-center">
            {block.primaryButtonText && block.primaryButtonUrl && (
              <Button href={block.primaryButtonUrl} size="lg" style={getElementCSS(block.elementStyles, keys.primaryButton)}>
                {block.primaryButtonText}
              </Button>
            )}
            {block.secondaryButtonText && block.secondaryButtonUrl && (
              <Button href={block.secondaryButtonUrl} variant="outline" size="lg" style={getElementCSS(block.elementStyles, keys.secondaryButton)}>
                {block.secondaryButtonText}
              </Button>
            )}
          </div>
        </div>
      </div>

      {block.blocks && block.blocks.length > 0 && (
        <div className="relative z-10 w-full hero-subblocks">
          {block.blocks.map((child) => (
            <div key={child.id} data-block-id={child.id} data-block-type={child.type}>
              <BlockStyleWrapper block={child}>
                {renderHeroChild(child)}
              </BlockStyleWrapper>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderHeroChild(block: Block) {
  switch (block.type) {
    case 'heading': return <HeadingBlockRender block={block} />;
    case 'text': return <TextBlockRender block={block} />;
    case 'image': return <ImageBlockRender block={block} />;
    case 'columns': return <ColumnsBlockRender block={block} />;
    case 'logo-strip': return <LogoStripBlockRender block={block} />;
    default: return null;
  }
}
