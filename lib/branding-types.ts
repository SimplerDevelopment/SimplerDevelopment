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
  /**
   * Named button presets — clients define N button styles in the profile and
   * reference them from ButtonBlock via presetId. Values accept brand sentinels
   * ("brand.primary", etc.) so presets track palette edits.
   */
  buttonPresets?: BrandButtonPreset[];
  faviconUrl?: string;
  ogImageUrl?: string;
}

export interface BrandButtonPreset {
  /** Stable UUID — block.presetId refers to this. */
  id: string;
  name: string;
  backgroundColor?: string;
  color?: string;
  hoverBackgroundColor?: string;
  hoverColor?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: string;
  fontWeight?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: string;
  paddingX?: string;
  paddingY?: string;
  /** Optional short description for the preset picker */
  description?: string;
}

export interface BrandingProfileSummary {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
}
