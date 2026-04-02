'use client';

import { ButtonBlock } from '@/types/blocks';
import Link from 'next/link';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { useBranding } from '@/contexts/BrandingContext';

interface ButtonBlockRenderProps {
  block: ButtonBlock;
}

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

  return (
    <div className={responsiveClasses}>
      <div className={`flex ${alignmentClass} my-4`}>
        <Link
          href={block.url}
          target={block.openInNewTab ? '_blank' : undefined}
          rel={block.openInNewTab ? 'noopener noreferrer' : undefined}
          className={`${variantClass} ${sizeClass} font-medium inline-flex items-center transition-colors ${!bs?.borderRadius && !branding?.borderRadius ? 'rounded-md' : ''}`}
          style={inlineStyle}
          data-editable-field="text"
        >
          {block.text}
        </Link>
      </div>
    </div>
  );
}
