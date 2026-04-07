import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages } from '@/lib/db/schema';
import type { BookingPageStyling } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBrandingByBookingPageSlug, brandingToCssVars } from '@/lib/branding';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db.select({
    id: bookingPages.id,
    title: bookingPages.title,
    slug: bookingPages.slug,
    description: bookingPages.description,
    duration: bookingPages.duration,
    timezone: bookingPages.timezone,
    availability: bookingPages.availability,
    questions: bookingPages.questions,
    color: bookingPages.color,
    styling: bookingPages.styling,
    maxAdvanceDays: bookingPages.maxAdvanceDays,
    minNoticeMins: bookingPages.minNoticeMins,
  }).from(bookingPages)
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  const branding = await getBrandingByBookingPageSlug(slug);
  const styling = (page.styling || {}) as BookingPageStyling;

  // Merge: branding profile as base, per-page styling overrides on top
  const mergedBranding = {
    primaryColor: styling.primaryColor || branding?.primaryColor || page.color || '#2563eb',
    secondaryColor: styling.secondaryColor || branding?.secondaryColor || '#1e40af',
    accentColor: styling.accentColor || branding?.accentColor || '#f59e0b',
    backgroundColor: styling.backgroundColor || branding?.backgroundColor || '#ffffff',
    textColor: styling.textColor || branding?.textColor || '#111827',
    headingFont: styling.headingFont || branding?.headingFont || '',
    bodyFont: styling.bodyFont || branding?.bodyFont || '',
    logoUrl: styling.hideLogo ? '' : (branding?.logoUrl || branding?.logoRectUrl || ''),
    borderRadius: styling.borderRadius || branding?.borderRadius,
    buttonStyle: {
      primaryBg: styling.buttonPrimaryBg || branding?.buttonStyle?.primaryBg,
      primaryText: styling.buttonPrimaryText || branding?.buttonStyle?.primaryText,
      borderRadius: styling.buttonBorderRadius || branding?.buttonStyle?.borderRadius,
    },
  };

  const cssVars = branding ? brandingToCssVars(branding) : undefined;

  return NextResponse.json({
    success: true,
    data: {
      ...page,
      styling: undefined, // don't leak raw styling to client
      branding: mergedBranding,
      cssVars,
      hideTitle: styling.hideTitle || false,
    },
  });
}
