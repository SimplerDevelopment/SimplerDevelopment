/**
 * Pure types for the branding system — DB-free so they can be imported
 * from anywhere (client, tests, edge runtime).
 *
 * Keep this file free of runtime dependencies.
 */

export interface ResolvedBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string;
  logoSquareUrl: string;
  logoRectUrl: string;
  logoIconUrl: string;
  logoText: string;
  logoAlt: string;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
  typography?: Record<string, { font?: string; size?: string; weight?: string; lineHeight?: string; letterSpacing?: string }>;
  darkMode?: {
    primaryColor?: string; secondaryColor?: string; accentColor?: string;
    backgroundColor?: string; textColor?: string;
    navBackground?: string; navTextColor?: string;
    logoUrl?: string; logoSquareUrl?: string; logoRectUrl?: string; logoIconUrl?: string;
  };
  borderRadius?: string;
  linkColor?: string;
  linkHoverColor?: string;
  buttonStyle?: {
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    secondaryBg?: string; secondaryText?: string; secondaryHoverBg?: string;
    borderRadius?: string; variant?: 'filled' | 'outline';
  };
  faviconUrl?: string;
  ogImageUrl?: string;
}

export interface BrandingProfileSummary {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
}
