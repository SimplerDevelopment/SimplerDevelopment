'use client';

import { ButtonBlock } from '@/types/blocks';
import Link from 'next/link';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface ButtonBlockRenderProps {
  block: ButtonBlock;
}

export function ButtonBlockRender({ block }: ButtonBlockRenderProps) {
  const alignmentClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  }[block.alignment || 'left'];

  const variantClass = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
    outline: 'border border-primary text-primary hover:bg-primary/10',
  }[block.variant || 'primary'];

  const sizeClass = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }[block.size || 'md'];

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
          className={`${variantClass} ${sizeClass} rounded-md font-medium inline-flex items-center transition-colors`}
        >
          {block.text}
        </Link>
      </div>
    </div>
  );
}
