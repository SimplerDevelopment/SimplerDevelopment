'use client';

import { ButtonBlock } from '@/types/blocks';
import Link from 'next/link';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { useBranding } from '@/contexts/BrandingContext';

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

  const alignmentClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  }[block.alignment || 'left'];

  const variant = block.variant || 'primary';
  const bs = branding?.buttonStyle;

  const variantClass = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
    outline: 'border border-primary text-primary hover:bg-primary/10',
  }[variant];

  const sizeClass = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }[block.size || 'md'];

  // Build inline styles from branding button settings
  const inlineStyle: React.CSSProperties = {};
  if (bs) {
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
  const glowStyle: React.CSSProperties = {};
  if (block.hoverEffect === 'glow' && branding) {
    const glowColor = bs?.primaryBg || branding.primaryColor || '#6366f1';
    // Convert hex to rgba for the glow
    const r = parseInt(glowColor.slice(1, 3), 16);
    const g = parseInt(glowColor.slice(3, 5), 16);
    const b = parseInt(glowColor.slice(5, 7), 16);
    if (!isNaN(r)) {
      glowStyle['--glow-color' as string] = `rgba(${r},${g},${b},0.4)`;
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
