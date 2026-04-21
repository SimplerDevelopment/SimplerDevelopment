'use client';

import { ButtonBlock } from '@/types/blocks';
import Link from 'next/link';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { useBranding } from '@/contexts/BrandingContext';
import { findPreset, presetToStyle } from '@/lib/branding/button-presets';

interface ButtonBlockRenderProps {
  block: ButtonBlock;
}

// CSS for hover effects — injected once via <style> tag
const HOVER_STYLES = `
.btn-hover-lift { transition: transform 0.25s ease, box-shadow 0.25s ease; }
.btn-hover-lift:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }

.btn-hover-glow { transition: box-shadow 0.3s ease; }
.btn-hover-glow:hover { box-shadow: 0 0 20px rgba(99,102,241,0.4), 0 0 40px rgba(99,102,241,0.15); }

.btn-hover-fill { position: relative; overflow: hidden; z-index: 0; transition: color 0.3s ease; }
.btn-hover-fill::before { content: ''; position: absolute; inset: 0; z-index: -1; background: currentColor; opacity: 0; transition: opacity 0.3s ease; }
.btn-hover-fill:hover::before { opacity: 0.1; }

.btn-hover-slide { position: relative; overflow: hidden; z-index: 0; }
.btn-hover-slide::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; z-index: -1; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transition: left 0.5s ease; }
.btn-hover-slide:hover::before { left: 100%; }

.btn-hover-pulse:hover { animation: btn-pulse 0.6s ease; }
@keyframes btn-pulse { 0% { transform: scale(1); } 30% { transform: scale(1.05); } 60% { transform: scale(0.98); } 100% { transform: scale(1); } }

.btn-icon { font-family: 'Material Icons'; font-size: 1.15em; line-height: 1; vertical-align: middle; }
`;

let stylesInjected = false;

export function ButtonBlockRender({ block }: ButtonBlockRenderProps) {
  const branding = useBranding();

  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomBg = !!style.backgroundColor;
  const hasCustomColor = !!style.color;
  const hasCustomFontSize = !!style.fontSize;

  const alignmentClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  }[block.alignment || 'left'];

  const variant = block.variant || 'primary';
  const bs = branding?.buttonStyle;
  const preset = findPreset(branding?.buttonPresets, block.presetId);

  const variantMap = {
    primary: {
      bg: hasCustomBg ? '' : 'bg-primary hover:bg-primary/90',
      text: hasCustomColor ? '' : 'text-primary-foreground',
    },
    secondary: {
      bg: hasCustomBg ? '' : 'bg-secondary hover:bg-secondary/90',
      text: hasCustomColor ? '' : 'text-secondary-foreground',
    },
    outline: {
      bg: hasCustomBg ? '' : 'border border-primary hover:bg-primary/10',
      text: hasCustomColor ? '' : 'text-primary',
    },
  } as const;
  const variantClasses = variantMap[variant as keyof typeof variantMap] ?? variantMap.primary;
  // When a preset is active, it fully owns bg/text/border — skip the Tailwind
  // variant classes so they don't fight with preset inline styles.
  const variantClass = preset ? '' : `${variantClasses.bg} ${variantClasses.text}`.trim();

  const sizePadding = {
    sm: 'px-3 py-1.5',
    md: 'px-4 py-2',
    lg: 'px-6 py-3',
  }[block.size || 'md'];
  const sizeText = hasCustomFontSize ? '' : {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }[block.size || 'md'];
  const sizeClass = `${sizePadding} ${sizeText}`.trim();

  // Build inline styles — preset (if any) is the base, legacy buttonStyle or
  // block.style layer on top so per-block overrides always win.
  let inlineStyle: React.CSSProperties = {};

  if (preset) {
    inlineStyle = { ...presetToStyle(preset) };
  } else if (bs) {
    const btnRadius = bs.borderRadius || branding?.borderRadius;
    if (btnRadius) inlineStyle.borderRadius = btnRadius;

    if (variant === 'primary') {
      if (bs.primaryBg) inlineStyle.backgroundColor = bs.primaryBg;
      if (bs.primaryText) inlineStyle.color = bs.primaryText;
    } else if (variant === 'secondary') {
      if (bs.secondaryBg) inlineStyle.backgroundColor = bs.secondaryBg;
      if (bs.secondaryText) inlineStyle.color = bs.secondaryText;
    }
  } else if (branding?.borderRadius) {
    inlineStyle.borderRadius = branding.borderRadius;
  }

  // block.style overrides — lets users tweak bg/color/border/etc. after
  // applying a preset. BlockStyleWrapper paints the wrapper div separately;
  // reading the same values here brings them to the Link so they're visible.
  if (style.backgroundColor) inlineStyle.backgroundColor = style.backgroundColor;
  if (style.color) inlineStyle.color = style.color;
  if (style.borderColor) inlineStyle.borderColor = style.borderColor;
  if (style.borderWidth) inlineStyle.borderWidth = style.borderWidth;
  if (style.borderStyle) inlineStyle.borderStyle = style.borderStyle as React.CSSProperties['borderStyle'];
  if (style.borderRadius) inlineStyle.borderRadius = style.borderRadius;
  if (style.fontSize) inlineStyle.fontSize = style.fontSize;
  if (style.fontWeight) inlineStyle.fontWeight = style.fontWeight;
  if (style.letterSpacing) inlineStyle.letterSpacing = style.letterSpacing;
  if (style.textTransform) inlineStyle.textTransform = style.textTransform;

  // Generate responsive classes from block settings
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
        block.responsive.visibility
      )
    : '';

  // Hover effect class
  const hoverClass = block.hoverEffect && block.hoverEffect !== 'none'
    ? `btn-hover-${block.hoverEffect}`
    : '';

  // Glow color override — use branding primary or accent for the glow
  const glowStyle: Record<string, string> = {};
  if (block.hoverEffect === 'glow' && branding) {
    const glowColor = bs?.primaryBg || branding.primaryColor || '#6366f1';
    // Convert hex to rgba for the glow
    const r = parseInt(glowColor.slice(1, 3), 16);
    const g = parseInt(glowColor.slice(3, 5), 16);
    const b = parseInt(glowColor.slice(5, 7), 16);
    if (!isNaN(r)) {
      glowStyle['--glow-color'] = `rgba(${r},${g},${b},0.4)`;
    }
  }

  const iconEl = block.icon ? (
    <span className="btn-icon material-icons" aria-hidden="true">{block.icon}</span>
  ) : null;

  const iconPos = block.iconPosition || 'left';

  return (
    <>
      {!stylesInjected && (
        <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />
      )}
      <div className={responsiveClasses}>
        <div className={`flex ${alignmentClass} my-4`}>
          <Link
            href={block.url}
            target={block.openInNewTab ? '_blank' : undefined}
            rel={block.openInNewTab ? 'noopener noreferrer' : undefined}
            className={`${variantClass} ${sizeClass} ${hoverClass} font-medium inline-flex items-center gap-2 transition-colors ${!bs?.borderRadius && !branding?.borderRadius ? 'rounded-md' : ''}`}
            style={{ ...inlineStyle, ...glowStyle }}
            data-editable-field="text"
          >
            {iconPos === 'left' && iconEl}
            {block.text}
            {iconPos === 'right' && iconEl}
          </Link>
        </div>
      </div>
    </>
  );
}
