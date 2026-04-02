'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';
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

  // Build branding-aware inline styles
  const brandStyle: React.CSSProperties = { ...style };
  const btnRadius = bs?.borderRadius || branding?.borderRadius;
  if (btnRadius) brandStyle.borderRadius = btnRadius;

  if (variant === 'default' && bs) {
    if (bs.primaryBg) brandStyle.backgroundColor = bs.primaryBg;
    if (bs.primaryText) brandStyle.color = bs.primaryText;
  } else if (variant === 'outline' && bs) {
    if (bs.primaryBg) brandStyle.borderColor = bs.primaryBg;
  }

  const baseClasses = `inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizes[size]} ${!btnRadius ? 'rounded-lg' : ''} ${className}`;

  const content = (
    <motion.span
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="inline-flex items-center gap-2"
    >
      {children}
    </motion.span>
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
