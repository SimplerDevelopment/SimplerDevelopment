/**
 * Responsive design type definitions
 */

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface BreakpointConfig {
  min: number;
  max: number;
  label: string;
  icon: string;
}

export const BREAKPOINTS: Record<Breakpoint, BreakpointConfig> = {
  mobile: {
    min: 320,
    max: 767,
    label: 'Mobile',
    icon: '📱',
  },
  tablet: {
    min: 768,
    max: 1023,
    label: 'Tablet',
    icon: '📱',
  },
  desktop: {
    min: 1024,
    max: 9999,
    label: 'Desktop',
    icon: '💻',
  },
};

export type SpacingSize = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// Accepts preset sizes or custom CSS values (e.g., "48px", "10%")
export type SpacingValue = SpacingSize | (string & {});

export interface ResponsiveSpacing {
  mobile?: SpacingValue;
  tablet?: SpacingValue;
  desktop?: SpacingValue;
}

export interface ResponsiveVisibility {
  mobile?: boolean;
  tablet?: boolean;
  desktop?: boolean;
}

export interface ResponsiveTypography {
  mobile?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
  tablet?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
  desktop?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
}

export interface ResponsiveSettings {
  paddingTop?: ResponsiveSpacing;
  paddingBottom?: ResponsiveSpacing;
  paddingLeft?: ResponsiveSpacing;
  paddingRight?: ResponsiveSpacing;
  marginTop?: ResponsiveSpacing;
  marginBottom?: ResponsiveSpacing;
  marginLeft?: ResponsiveSpacing;
  marginRight?: ResponsiveSpacing;
  visibility?: ResponsiveVisibility;
  fontSize?: ResponsiveTypography;
}
