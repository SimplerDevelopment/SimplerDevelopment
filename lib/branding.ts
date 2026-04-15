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
import { siteBranding, clientWebsites, brandingProfiles, bookingPages, surveys } from '@/lib/db/schema';
import type { PitchDeckTheme } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { brandingToCssVars as _brandingToCssVars } from './branding/css-vars';

// ---------------------------------------------------------------------------
// Types (re-exported from pure module for backward compat)
// ---------------------------------------------------------------------------

export type { ResolvedBranding, BrandingProfileSummary } from './branding-types';
import type { ResolvedBranding, BrandingProfileSummary } from './branding-types';

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
    borderRadius: (row.borderRadius as string) ?? undefined,
    linkColor: (row.linkColor as string) ?? undefined,
    linkHoverColor: (row.linkHoverColor as string) ?? undefined,
    buttonStyle: (row.buttonStyle as ResolvedBranding['buttonStyle']) ?? undefined,
    faviconUrl: (row.faviconUrl as string) ?? undefined,
    ogImageUrl: (row.ogImageUrl as string) ?? undefined,
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

/** Load branding for a booking page. Prefers assigned profile, falls back to client default. */
export async function getBrandingByBookingPageSlug(slug: string): Promise<ResolvedBranding | null> {
  const [page] = await db
    .select({
      brandingProfileId: bookingPages.brandingProfileId,
      clientId: bookingPages.clientId,
      color: bookingPages.color,
    })
    .from(bookingPages)
    .where(eq(bookingPages.slug, slug))
    .limit(1);

  if (!page) return null;
  if (page.brandingProfileId) return getBrandingByProfileId(page.brandingProfileId);
  // Fall back to client default profile
  const clientBranding = await getBrandingByClientId(page.clientId);
  // If no profile exists at all, use the page's color field as primary
  if (clientBranding.primaryColor === DEFAULTS.primaryColor && page.color && page.color !== DEFAULTS.primaryColor) {
    return { ...clientBranding, primaryColor: page.color };
  }
  return clientBranding;
}

/** Load branding for a survey. Prefers assigned profile, falls back to client default. */
export async function getBrandingBySurveySlug(slug: string): Promise<ResolvedBranding | null> {
  const [survey] = await db
    .select({
      brandingProfileId: surveys.brandingProfileId,
      clientId: surveys.clientId,
      color: surveys.color,
    })
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);

  if (!survey) return null;
  if (survey.brandingProfileId) return getBrandingByProfileId(survey.brandingProfileId);
  const clientBranding = await getBrandingByClientId(survey.clientId);
  if (clientBranding.primaryColor === DEFAULTS.primaryColor && survey.color && survey.color !== DEFAULTS.primaryColor) {
    return { ...clientBranding, primaryColor: survey.color };
  }
  return clientBranding;
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
export const brandingToCssVars = _brandingToCssVars;

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
