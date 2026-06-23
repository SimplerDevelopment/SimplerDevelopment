import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages, brandingProfiles } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { emitEvent } from '@/lib/automation';
import { slugify } from '@/lib/publishing/slug';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const pages = await db
    .select()
    .from(bookingPages)
    .where(eq(bookingPages.clientId, client.id))
    .orderBy(desc(bookingPages.updatedAt));

  return NextResponse.json({ success: true, data: pages });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'booking' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const { title, description, duration, timezone } = body;
  const requestedBrandingProfileId: number | null | undefined = body.brandingProfileId;
  if (!title?.trim()) return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });

  // Generate slug from title + random suffix
  const baseSlug = slugify(title.trim());
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  // Default brandingProfileId to the tenant's default brand profile when not
  // explicitly supplied — otherwise public /book/<slug> renders in the platform
  // default blue instead of the tenant's brand. If the tenant has no default
  // profile, leave it NULL (the renderer falls back to per-page styling).
  let brandingProfileId: number | null = requestedBrandingProfileId ?? null;
  if (requestedBrandingProfileId === undefined) {
    const [defaultProfile] = await db
      .select({ id: brandingProfiles.id })
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.clientId, client.id), eq(brandingProfiles.isDefault, true)))
      .limit(1);
    if (defaultProfile) brandingProfileId = defaultProfile.id;
  }

  const [page] = await db.insert(bookingPages).values({
    clientId: client.id,
    title: title.trim(),
    slug,
    description: description?.trim() || null,
    duration: duration || 30,
    timezone: timezone || 'America/New_York',
    brandingProfileId,
    createdBy: userId,
    // Configurable fields — mirror what the PUT handler accepts so that a
    // POST-then-read round-trip sees the caller's intended values immediately.
    ...(body.price !== undefined && { price: body.price }),
    ...(body.priceLabel !== undefined && { priceLabel: body.priceLabel || null }),
    ...(body.enableGiftCertificates !== undefined && { enableGiftCertificates: body.enableGiftCertificates }),
    ...(body.enableDiscountCodes !== undefined && { enableDiscountCodes: body.enableDiscountCodes }),
    ...(body.enableAddOns !== undefined && { enableAddOns: body.enableAddOns }),
    ...(body.enableWaivers !== undefined && { enableWaivers: body.enableWaivers }),
    ...(body.waiverContent !== undefined && { waiverContent: body.waiverContent || null }),
    ...(body.requireWaiverBeforeBooking !== undefined && { requireWaiverBeforeBooking: body.requireWaiverBeforeBooking }),
    ...(body.availability !== undefined && { availability: body.availability }),
    ...(body.maxAdvanceDays !== undefined && { maxAdvanceDays: body.maxAdvanceDays }),
    ...(body.minNoticeMins !== undefined && { minNoticeMins: body.minNoticeMins }),
    ...(body.bufferBefore !== undefined && { bufferBefore: body.bufferBefore }),
    ...(body.bufferAfter !== undefined && { bufferAfter: body.bufferAfter }),
    ...(body.color !== undefined && { color: body.color }),
    ...(body.maxGuests !== undefined && { maxGuests: body.maxGuests || null }),
    ...(body.questions !== undefined && { questions: body.questions }),
    ...(body.active !== undefined && { active: body.active }),
    ...(body.googleCalendarSync !== undefined && { googleCalendarSync: body.googleCalendarSync }),
    ...(body.conferenceType !== undefined && { conferenceType: body.conferenceType }),
    ...(body.bookingType !== undefined && { bookingType: body.bookingType }),
    ...(body.groupCapacity !== undefined && { groupCapacity: body.groupCapacity || null }),
    ...(body.allowStaffSelection !== undefined && { allowStaffSelection: body.allowStaffSelection }),
    ...(body.assignedMembers !== undefined && { assignedMembers: body.assignedMembers }),
    ...(body.assignmentMode !== undefined && { assignmentMode: body.assignmentMode }),
    ...(body.styling !== undefined && { styling: body.styling }),
    ...(body.thumbnail !== undefined && { thumbnail: body.thumbnail || null }),
    ...(body.websiteId !== undefined && { websiteId: body.websiteId || null }),
    ...(body.checkinEnabled !== undefined && { checkinEnabled: body.checkinEnabled }),
  }).returning();

  emitEvent('booking.created', client.id, userId, { id: page.id, title: page.title, slug: page.slug, duration: page.duration });

  return NextResponse.json({ success: true, data: page });
}
