/**
 * Responsive design utility functions
 */

import { Breakpoint, BREAKPOINTS, SpacingSize, ResponsiveSpacing, ResponsiveVisibility, ResponsiveTypography } from '@/types/responsive';

/**
 * Spacing size to Tailwind class mapping
 */
const SPACING_MAP: Record<SpacingSize, string> = {
  none: '0',
  xs: '1',
  sm: '2',
  md: '4',
  lg: '6',
  xl: '8',
  '2xl': '12',
};

function getSpacingClass(value: string): string {
  return (SPACING_MAP as Record<string, string>)[value] ?? value;
}

/**
 * Typography size to Tailwind class mapping
 */
const TYPOGRAPHY_MAP: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
  '6xl': 'text-6xl',
};

/**
 * Generate responsive padding classes
 */
export function generateResponsivePaddingClasses(
  direction: 'top' | 'bottom' | 'left' | 'right' | 'x' | 'y' | 'all',
  spacing?: ResponsiveSpacing
): string {
  if (!spacing) return '';

  const classes: string[] = [];
  const dirMap = {
    top: 't',
    bottom: 'b',
    left: 'l',
    right: 'r',
    x: 'x',
    y: 'y',
    all: '',
  };

  const dir = dirMap[direction];

  if (spacing.mobile) {
    classes.push(`p${dir ? dir : ''}${dir ? '-' : ''}${getSpacingClass(spacing.mobile)}`);
  }
  if (spacing.tablet) {
    classes.push(`md:p${dir ? dir : ''}${dir ? '-' : ''}${getSpacingClass(spacing.tablet)}`);
  }
  if (spacing.desktop) {
    classes.push(`lg:p${dir ? dir : ''}${dir ? '-' : ''}${getSpacingClass(spacing.desktop)}`);
  }

  return classes.join(' ');
}

/**
 * Generate responsive margin classes
 */
export function generateResponsiveMarginClasses(
  direction: 'top' | 'bottom' | 'left' | 'right' | 'x' | 'y' | 'all',
  spacing?: ResponsiveSpacing
): string {
  if (!spacing) return '';

  const classes: string[] = [];
  const dirMap = {
    top: 't',
    bottom: 'b',
    left: 'l',
    right: 'r',
    x: 'x',
    y: 'y',
    all: '',
  };

  const dir = dirMap[direction];

  if (spacing.mobile) {
    classes.push(`m${dir ? dir : ''}${dir ? '-' : ''}${getSpacingClass(spacing.mobile)}`);
  }
  if (spacing.tablet) {
    classes.push(`md:m${dir ? dir : ''}${dir ? '-' : ''}${getSpacingClass(spacing.tablet)}`);
  }
  if (spacing.desktop) {
    classes.push(`lg:m${dir ? dir : ''}${dir ? '-' : ''}${getSpacingClass(spacing.desktop)}`);
  }

  return classes.join(' ');
}

/**
 * Generate responsive visibility classes
 */
export function generateResponsiveVisibilityClasses(visibility?: ResponsiveVisibility): string {
  if (!visibility) return '';

  const classes: string[] = [];

  // Mobile visibility
  if (visibility.mobile === false) {
    classes.push('hidden');
  } else if (visibility.mobile === true && visibility.tablet === false) {
    classes.push('block md:hidden');
  }

  // Tablet visibility
  if (visibility.tablet === false && visibility.mobile !== false) {
    classes.push('md:hidden');
  } else if (visibility.tablet === true && visibility.mobile === false) {
    classes.push('hidden md:block');
  }

  if (visibility.tablet === true && visibility.desktop === false) {
    classes.push('lg:hidden');
  }

  // Desktop visibility
  if (visibility.desktop === false && visibility.tablet !== false) {
    classes.push('lg:hidden');
  } else if (visibility.desktop === true && visibility.tablet === false) {
    classes.push('hidden lg:block');
  }

  return classes.join(' ');
}

/**
 * Generate responsive typography classes
 */
export function generateResponsiveTypographyClasses(typography?: ResponsiveTypography): string {
  if (!typography) return '';

  const classes: string[] = [];

  if (typography.mobile) {
    classes.push(TYPOGRAPHY_MAP[typography.mobile]);
  }
  if (typography.tablet) {
    classes.push(`md:${TYPOGRAPHY_MAP[typography.tablet]}`);
  }
  if (typography.desktop) {
    classes.push(`lg:${TYPOGRAPHY_MAP[typography.desktop]}`);
  }

  return classes.join(' ');
}

/**
 * Get viewport width for a given breakpoint
 */
export function getViewportWidth(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case 'mobile':
      return 375; // iPhone standard
    case 'tablet':
      return 768; // iPad portrait
    case 'desktop':
      return 1440; // Standard desktop
    default:
      return 1440;
  }
}

/**
 * Combine all responsive classes
 */
export function combineResponsiveClasses(
  paddingTop?: ResponsiveSpacing,
  paddingBottom?: ResponsiveSpacing,
  paddingLeft?: ResponsiveSpacing,
  paddingRight?: ResponsiveSpacing,
  marginTop?: ResponsiveSpacing,
  marginBottom?: ResponsiveSpacing,
  marginLeft?: ResponsiveSpacing,
  marginRight?: ResponsiveSpacing,
  visibility?: ResponsiveVisibility,
  fontSize?: ResponsiveTypography
): string {
  const classes: string[] = [];

  classes.push(generateResponsivePaddingClasses('top', paddingTop));
  classes.push(generateResponsivePaddingClasses('bottom', paddingBottom));
  classes.push(generateResponsivePaddingClasses('left', paddingLeft));
  classes.push(generateResponsivePaddingClasses('right', paddingRight));
  classes.push(generateResponsiveMarginClasses('top', marginTop));
  classes.push(generateResponsiveMarginClasses('bottom', marginBottom));
  classes.push(generateResponsiveMarginClasses('left', marginLeft));
  classes.push(generateResponsiveMarginClasses('right', marginRight));
  classes.push(generateResponsiveVisibilityClasses(visibility));
  classes.push(generateResponsiveTypographyClasses(fontSize));

  return classes.filter(c => c).join(' ');
}
