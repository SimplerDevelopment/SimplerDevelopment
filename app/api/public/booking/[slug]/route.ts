import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookingPageMembers, users } from '@/lib/db/schema';
import type { BookingPageStyling } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBrandingByBookingPageSlug, brandingToCssVars } from '@/lib/branding';
import { resolveApprovalContext } from '@/lib/mcp/approval-mode';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db.select({
    id: bookingPages.id,
    // Selected for the approval-mode checks below; both are stripped from the
    // response body before it leaves (see the returned object).
    clientId: bookingPages.clientId,
    active: bookingPages.active,
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
    price: bookingPages.price,
    priceLabel: bookingPages.priceLabel,
    maxGuests: bookingPages.maxGuests,
    enableAddOns: bookingPages.enableAddOns,
    enableGiftCertificates: bookingPages.enableGiftCertificates,
    enableDiscountCodes: bookingPages.enableDiscountCodes,
    enableWaivers: bookingPages.enableWaivers,
    requireWaiverBeforeBooking: bookingPages.requireWaiverBeforeBooking,
    waiverContent: bookingPages.waiverContent,
    checkinEnabled: bookingPages.checkinEnabled,
    allowStaffSelection: bookingPages.allowStaffSelection,
    bookingType: bookingPages.bookingType,
    groupCapacity: bookingPages.groupCapacity,
    // assignmentMode is intentionally NOT exposed publicly — it's an
    // internal load-balancing concern. assignedUserId likewise stays
    // server-side; the widget never displays which staff was picked.
  }).from(bookingPages)
    .where(eq(bookingPages.slug, slug))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  // An inactive booking page is invisible to the public — approving one is what
  // flips active=true. A reviewer holding a live approval link for THIS page
  // sees it as it will publish (PUX-060/070); everyone else still gets the
  // active-only rule that used to live in the WHERE clause above.
  //
  // Reservations remain impossible either way: every booking write path is
  // refused by the middleware gate while an approval cookie is present, and
  // none of them is shimmed (PUX-067/070).
  const approval = await resolveApprovalContext('booking_page', page.id);
  const viaApproval = !!approval && approval.clientId === page.clientId;
  if (!page.active && !viaApproval) {
    return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });
  }

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

  // If staff selection is enabled, include available staff members
  let staffMembers: { userId: number; name: string; color: string | null }[] = [];
  if (page.allowStaffSelection) {
    const members = await db
      .select({
        userId: bookingPageMembers.userId,
        displayName: bookingPageMembers.displayName,
        color: bookingPageMembers.color,
        userName: users.name,
      })
      .from(bookingPageMembers)
      .innerJoin(users, eq(users.id, bookingPageMembers.userId))
      .where(and(
        eq(bookingPageMembers.bookingPageId, page.id),
        eq(bookingPageMembers.active, true),
      ));
    staffMembers = members.map(m => ({
      userId: m.userId,
      name: m.displayName || m.userName,
      color: m.color,
    }));
  }

  return NextResponse.json({
    success: true,
    data: {
      ...page,
      styling: undefined, // don't leak raw styling to client
      // Selected only for the approval-mode checks above — internal, never public.
      clientId: undefined,
      active: undefined,
      branding: mergedBranding,
      cssVars,
      hideTitle: styling.hideTitle || false,
      allowStaffSelection: page.allowStaffSelection,
      staffMembers,
    },
  });
}
