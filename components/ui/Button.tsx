'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { useBranding } from '@/contexts/BrandingContext';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'warm';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
}

const variantClasses = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border-2 border-primary bg-transparent hover:bg-primary hover:text-primary-foreground',
  ghost: 'bg-transparent hover:bg-primary/10',
  warm: 'bg-accent-warm text-white hover:bg-amber-600',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export function Button({
  children,
  href,
  onClick,
  variant = 'default',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  style,
}: ButtonProps) {
  const branding = useBranding();
  const bs = branding?.buttonStyle;

  // Build branding-aware inline styles. Explicit values from `style` (e.g.
  // block.elementStyles.cta) always win over branding defaults — branding is a
  // fallback for blocks the user hasn't styled, not an override.
  const brandStyle: React.CSSProperties = { ...style };
  const btnRadius = bs?.borderRadius || branding?.borderRadius;
  if (btnRadius && !style?.borderRadius) brandStyle.borderRadius = btnRadius;

  if (variant === 'default' && bs) {
    if (bs.primaryBg && !style?.backgroundColor) brandStyle.backgroundColor = bs.primaryBg;
    if (bs.primaryText && !style?.color) brandStyle.color = bs.primaryText;
  } else if (variant === 'outline' && bs) {
    if (bs.primaryBg && !style?.borderColor) brandStyle.borderColor = bs.primaryBg;
  }

  // `group` + CSS transforms replace the former framer-motion whileHover/whileTap
  // scale — same hover-grow / tap-shrink feel with zero JS (framer-motion was a
  // major hydration / Total-Blocking-Time cost on every marketing page).
  const baseClasses = `group inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizes[size]} ${!btnRadius ? 'rounded-lg' : ''} ${className}`;

  const content = (
    <span className="inline-flex items-center gap-2 transition-transform duration-150 ease-out motion-safe:group-hover:scale-[1.02] motion-safe:group-active:scale-[0.98]">
      {children}
    </span>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={baseClasses} style={brandStyle}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
      style={brandStyle}
    >
      {content}
    </button>
  );
}
