/**
 * Shared Branding System
 *
 * Single source of truth for loading and resolving brand identity across the
 * platform. Supports multiple named branding profiles per client.
 *
 * Used by:
 *  - CMS block rendering (CSS variables)
 *  - Pitch deck generation (theme colors/fonts)
 *  - Proposals & contracts
 *  - Public site rendering
 */

import { db } from '@/lib/db';
import { siteBranding, clientWebsites, brandingProfiles } from '@/lib/db/schema';
import type { PitchDeckTheme } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Resolved branding — the superset used across the platform. */
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
  typography?: Record<string, { font?: string; size?: string; weight?: string; lineHeight?: string }>;
  darkMode?: {
    primaryColor?: string; secondaryColor?: string; accentColor?: string;
    backgroundColor?: string; textColor?: string;
    navBackground?: string; navTextColor?: string;
    logoUrl?: string; logoSquareUrl?: string; logoRectUrl?: string; logoIconUrl?: string;
  };
}

/** Summary for dropdowns / selectors. */
export interface BrandingProfileSummary {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
}

const DEFAULTS: ResolvedBranding = {
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFont: '',
  bodyFont: '',
  logoUrl: '',
  logoSquareUrl: '',
  logoRectUrl: '',
  logoIconUrl: '',
  logoText: '',
  logoAlt: '',
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
};

// ---------------------------------------------------------------------------
// Row → ResolvedBranding mapper (works for both siteBranding and brandingProfiles)
// ---------------------------------------------------------------------------

function rowToBranding(row: Record<string, unknown>): ResolvedBranding {
  return {
    primaryColor: (row.primaryColor as string) ?? DEFAULTS.primaryColor,
    secondaryColor: (row.secondaryColor as string) ?? DEFAULTS.secondaryColor,
    accentColor: (row.accentColor as string) ?? DEFAULTS.accentColor,
    backgroundColor: (row.backgroundColor as string) ?? DEFAULTS.backgroundColor,
    textColor: (row.textColor as string) ?? DEFAULTS.textColor,
    headingFont: (row.headingFont as string) ?? DEFAULTS.headingFont,
    bodyFont: (row.bodyFont as string) ?? DEFAULTS.bodyFont,
    logoUrl: (row.logoUrl as string) ?? DEFAULTS.logoUrl,
    logoSquareUrl: (row.logoSquareUrl as string) ?? DEFAULTS.logoSquareUrl,
    logoRectUrl: (row.logoRectUrl as string) ?? DEFAULTS.logoRectUrl,
    logoIconUrl: (row.logoIconUrl as string) ?? DEFAULTS.logoIconUrl,
    logoText: (row.logoText as string) ?? DEFAULTS.logoText,
    logoAlt: (row.logoAlt as string) ?? DEFAULTS.logoAlt,
    navTemplate: (row.navTemplate as string) ?? DEFAULTS.navTemplate,
    navPosition: (row.navPosition as string) ?? DEFAULTS.navPosition,
    navBackground: (row.navBackground as string) ?? DEFAULTS.navBackground,
    navTextColor: (row.navTextColor as string) ?? DEFAULTS.navTextColor,
    typography: (row.typography as ResolvedBranding['typography']) ?? undefined,
    darkMode: (row.darkMode as ResolvedBranding['darkMode']) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/** Load branding from a specific profile ID. */
export async function getBrandingByProfileId(profileId: number): Promise<ResolvedBranding> {
  const [row] = await db
    .select()
    .from(brandingProfiles)
    .where(eq(brandingProfiles.id, profileId))
    .limit(1);

  if (!row) return { ...DEFAULTS };
  return rowToBranding(row);
}

/** Load branding for a website. Prefers assigned profile, falls back to siteBranding. */
export async function getBrandingByWebsiteId(websiteId: number): Promise<ResolvedBranding> {
  // Check if website has an assigned branding profile
  const [site] = await db
    .select({ brandingProfileId: clientWebsites.brandingProfileId })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, websiteId))
    .limit(1);

  if (site?.brandingProfileId) {
    return getBrandingByProfileId(site.brandingProfileId);
  }

  // Fall back to siteBranding row
  const [row] = await db
    .select()
    .from(siteBranding)
    .where(eq(siteBranding.websiteId, websiteId))
    .limit(1);

  if (!row) return { ...DEFAULTS };
  return rowToBranding(row);
}

/** Load branding for a client — prefers default profile, falls back to first website. */
export async function getBrandingByClientId(clientId: number): Promise<ResolvedBranding & { websiteId?: number }> {
  // Check for a default branding profile
  const [defaultProfile] = await db
    .select()
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.isDefault, true)))
    .limit(1);

  if (defaultProfile) {
    return rowToBranding(defaultProfile);
  }

  // Fall back to first active website's branding
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return { ...DEFAULTS };

  const branding = await getBrandingByWebsiteId(site.id);
  return { ...branding, websiteId: site.id };
}

/** List all branding profiles for a client (for dropdown selectors). */
export async function getProfilesByClientId(clientId: number): Promise<BrandingProfileSummary[]> {
  const rows = await db
    .select({
      id: brandingProfiles.id,
      name: brandingProfiles.name,
      isDefault: brandingProfiles.isDefault,
      primaryColor: brandingProfiles.primaryColor,
      accentColor: brandingProfiles.accentColor,
      logoUrl: brandingProfiles.logoUrl,
    })
    .from(brandingProfiles)
    .where(eq(brandingProfiles.clientId, clientId))
    .orderBy(desc(brandingProfiles.isDefault), brandingProfiles.name);

  return rows;
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

/** Convert resolved branding to PitchDeckTheme format. */
export function brandingToPitchDeckTheme(branding: ResolvedBranding): PitchDeckTheme {
  return {
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
    backgroundColor: isDarkColor(branding.backgroundColor)
      ? branding.backgroundColor
      : '#0f172a',
    textColor: isDarkColor(branding.backgroundColor)
      ? branding.textColor
      : '#f8fafc',
    headingFont: branding.headingFont || 'Inter',
    bodyFont: branding.bodyFont || 'Inter',
    logo: branding.logoUrl || branding.logoRectUrl || undefined,
  };
}

/** Generate CSS custom properties from branding for injection into page/iframe. */
export function brandingToCssVars(branding: ResolvedBranding): Record<string, string> {
  const vars: Record<string, string> = {
    '--brand-primary': branding.primaryColor,
    '--brand-secondary': branding.secondaryColor,
    '--brand-accent': branding.accentColor,
    '--brand-bg': branding.backgroundColor,
    '--brand-text': branding.textColor,
    '--brand-nav-bg': branding.navBackground,
    '--brand-nav-text': branding.navTextColor,
  };

  if (branding.headingFont) vars['--brand-heading-font'] = branding.headingFont;
  if (branding.bodyFont) vars['--brand-body-font'] = branding.bodyFont;

  return vars;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDarkColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
