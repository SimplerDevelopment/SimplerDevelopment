import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  bookingPages, bookings, bookingAddOns, bookingSelectedAddOns,
  bookingAttendees,
  discountCodes, giftCertificates, giftCertificateRedemptions,
  clientWebsites, storeSettings, products, productVariants,
} from '@/lib/db/schema';
import { eq, and, ne, gte, lte, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { sendGuestConfirmation, sendHostNotification, loadBookingBrand } from '@/lib/email/booking-emails';
import { createCalendarEvent } from '@/lib/google-calendar';
import { createZoomMeeting } from '@/lib/zoom';
import { clients, users } from '@/lib/db/schema';
import { emitEvent } from '@/lib/automation';
import { pickAssignee } from '@/lib/booking/assign';
import { checkSlotCapacity } from '@/lib/booking/capacity';

interface AttendeeInput {
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

function generateCheckinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 for readability
  let code = 'BK-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  const body = await req.json();
  const {
    name, email, phone, startTime, timezone, answers,
    groupSize: rawGroupSize,
    addOns: selectedAddOns, // Array<{ addOnId: number; quantity: number }>
    discountCode: rawDiscountCode,
    giftCertificateCode: rawGiftCertCode,
    staffId, // optional staff member ID when allowStaffSelection is enabled
    // Group / class bookings
    seats: rawSeats,
    attendees: rawAttendees, // AttendeeInput[]
  } = body;

  const isGroupBooking = page.bookingType === 'group';
  const attendees: AttendeeInput[] = Array.isArray(rawAttendees) ? rawAttendees : [];
  const seats = isGroupBooking
    ? Math.max(1, parseInt(String(rawSeats ?? attendees.length ?? 1)) || 1)
    : 1;

  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });
  if (!startTime) return NextResponse.json({ success: false, message: 'Start time is required' }, { status: 400 });

  const slotStart = new Date(startTime);
  if (isNaN(slotStart.getTime())) {
    return NextResponse.json({ success: false, message: 'Invalid start time' }, { status: 400 });
  }

  const slotEnd = new Date(slotStart.getTime() + page.duration * 60 * 1000);
  const groupSize = Math.max(1, parseInt(String(rawGroupSize)) || 1);

  // Check minNoticeMins
  const now = new Date();
  const minNoticeTime = new Date(now.getTime() + page.minNoticeMins * 60 * 1000);
  if (slotStart < minNoticeTime) {
    return NextResponse.json({ success: false, message: 'This time slot is no longer available' }, { status: 409 });
  }

  // Check maxAdvanceDays
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + page.maxAdvanceDays);
  if (slotStart > maxDate) {
    return NextResponse.json({ success: false, message: 'This date is too far in advance' }, { status: 400 });
  }

  // Check capacity or conflicts
  if (isGroupBooking) {
    // Group / class booking: validate against booking_attendees seat count.
    if (attendees.length > 0 && attendees.length !== seats) {
      return NextResponse.json(
        { success: false, message: 'Number of attendees must match seat count' },
        { status: 400 },
      );
    }
    for (const a of attendees) {
      if (!a?.name?.trim() || !a?.email?.trim()) {
        return NextResponse.json(
          { success: false, message: 'Each attendee needs a name and email' },
          { status: 400 },
        );
      }
    }
    const cap = await checkSlotCapacity(page.id, slotStart, seats);
    if (!cap.available) {
      return NextResponse.json(
        { success: false, message: `Only ${cap.remaining} seats remaining for this slot` },
        { status: 409 },
      );
    }
  } else if (page.maxGuests) {
    // Capacity mode (legacy maxGuests on individual bookings)
    const existingForSlot = await db.select({ groupSize: bookings.groupSize }).from(bookings)
      .where(and(
        eq(bookings.bookingPageId, page.id),
        ne(bookings.status, 'cancelled'),
        eq(bookings.startTime, slotStart),
      ));
    const booked = existingForSlot.reduce((sum, b) => sum + (b.groupSize ?? 1), 0);
    if (booked + groupSize > page.maxGuests) {
      return NextResponse.json({ success: false, message: `Only ${page.maxGuests - booked} spots remaining` }, { status: 409 });
    }
  } else {
    // 1:1 mode — conflict check with buffers
    const bufferStart = new Date(slotStart.getTime() - page.bufferBefore * 60 * 1000);
    const bufferEnd = new Date(slotEnd.getTime() + page.bufferAfter * 60 * 1000);

    const conflicting = await db.select({ id: bookings.id }).from(bookings)
      .where(and(
        eq(bookings.bookingPageId, page.id),
        ne(bookings.status, 'cancelled'),
        lte(bookings.startTime, bufferEnd),
        gte(bookings.endTime, bufferStart),
      ))
      .limit(1);

    if (conflicting.length > 0) {
      return NextResponse.json({ success: false, message: 'This time slot is no longer available' }, { status: 409 });
    }
  }

  // ─── CALCULATE TOTAL ──────────────────────────────────────────────────────

  // Base price
  let subtotal = (page.price || 0) * groupSize;

  // Resolve and price add-ons
  const addOnDetails: { addOnId: number; quantity: number; unitPrice: number; name: string }[] = [];
  if (page.enableAddOns && Array.isArray(selectedAddOns) && selectedAddOns.length > 0) {
    for (const sel of selectedAddOns) {
      const [addOn] = await db.select().from(bookingAddOns)
        .where(and(eq(bookingAddOns.id, sel.addOnId), eq(bookingAddOns.bookingPageId, page.id), eq(bookingAddOns.active, true)))
        .limit(1);
      if (!addOn) continue;

      const qty = Math.min(Math.max(1, sel.quantity || 1), addOn.maxQuantity || 10);
      let unitPrice = addOn.price || 0;
      let addOnName = addOn.name || 'Add-on';

      // Resolve product price if linked
      if (addOn.source === 'product' && addOn.productId) {
        const [product] = await db.select().from(products)
          .where(eq(products.id, addOn.productId)).limit(1);
        if (product) {
          unitPrice = product.price;
          addOnName = product.name;
          if (addOn.variantId) {
            const [variant] = await db.select().from(productVariants)
              .where(eq(productVariants.id, addOn.variantId)).limit(1);
            if (variant?.price) unitPrice = variant.price;
          }
        }
      }

      subtotal += unitPrice * qty;
      addOnDetails.push({ addOnId: addOn.id, quantity: qty, unitPrice, name: addOnName });
    }
  }

  // Apply discount code
  let discountTotal = 0;
  let appliedDiscountCode: string | null = null;

  if (page.enableDiscountCodes && rawDiscountCode) {
    let websiteId = page.websiteId;
    if (!websiteId) {
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.clientId, page.clientId), eq(clientWebsites.active, true)))
        .limit(1);
      websiteId = site?.id ?? null;
    }

    if (websiteId) {
      const [discount] = await db.select().from(discountCodes)
        .where(and(
          eq(discountCodes.websiteId, websiteId),
          eq(discountCodes.code, rawDiscountCode.toUpperCase()),
          eq(discountCodes.active, true),
          sql`${discountCodes.applicableTo} IN ('booking', 'both')`,
        ))
        .limit(1);

      if (discount) {
        const dNow = new Date();
        const valid = (!discount.startsAt || dNow >= discount.startsAt)
          && (!discount.expiresAt || dNow <= discount.expiresAt)
          && (!discount.maxUses || discount.usedCount < discount.maxUses)
          && (!discount.minOrderAmount || subtotal >= discount.minOrderAmount);

        if (valid) {
          appliedDiscountCode = discount.code;
          if (discount.discountType === 'percent') {
            discountTotal = Math.round(subtotal * (discount.amount / 10000));
          } else if (discount.discountType === 'fixed_amount') {
            discountTotal = Math.min(discount.amount, subtotal);
          }
        }
      }
    }
  }

  // Apply gift certificate
  let giftCertAmount = 0;
  let appliedGiftCertCode: string | null = null;

  if (page.enableGiftCertificates && rawGiftCertCode) {
    const [cert] = await db.select().from(giftCertificates)
      .where(and(
        eq(giftCertificates.code, rawGiftCertCode.toUpperCase()),
        eq(giftCertificates.status, 'active'),
        eq(giftCertificates.clientId, page.clientId),
        sql`${giftCertificates.redeemableAt} IN ('booking', 'both')`,
      ))
      .limit(1);

    if (cert && cert.remainingAmount > 0) {
      const afterDiscount = subtotal - discountTotal;
      giftCertAmount = Math.min(cert.remainingAmount, afterDiscount);
      appliedGiftCertCode = cert.code;
    }
  }

  const total = Math.max(0, subtotal - discountTotal - giftCertAmount);

  // ─── CREATE BOOKING ────────────────────────────────────────────────────────

  const cancelToken = crypto.randomUUID();
  const checkinCode = page.checkinEnabled ? generateCheckinCode() : null;
  const needsPayment = total > 0;

  // Resolve staff assignment
  // Precedence:
  //   1. Customer-picked staffId (when allowStaffSelection is on).
  //   2. assignmentMode in ('round_robin' | 'fewest_upcoming') — uses
  //      lib/booking/assign.ts pickAssignee against the configured pool.
  //   3. Legacy fallback to assignedMembers[] auto-distribute (preserves
  //      pre-round-robin-mode behaviour for booking pages still on the
  //      default 'fixed' mode that have multiple assigned members).
  let assignedTo: number | null = null;
  let autoAssignedUserId: number | null = null;

  if (staffId && page.allowStaffSelection) {
    assignedTo = parseInt(String(staffId)) || null;
  } else if (page.assignmentMode && page.assignmentMode !== 'fixed') {
    autoAssignedUserId = await pickAssignee(page.id, slotStart);
    assignedTo = autoAssignedUserId;
  } else if (!page.allowStaffSelection) {
    const assignedMembers = (page.assignedMembers as number[]) || [];
    if (assignedMembers.length === 1) {
      assignedTo = assignedMembers[0];
    } else if (assignedMembers.length > 1) {
      // Legacy: pick the member with fewest upcoming bookings (simple load balancing)
      const upcoming = await db.select({ assignedTo: bookings.assignedTo, count: sql`count(*)::int` })
        .from(bookings)
        .where(and(
          eq(bookings.bookingPageId, page.id),
          ne(bookings.status, 'cancelled'),
          gte(bookings.startTime, new Date()),
        ))
        .groupBy(bookings.assignedTo);
      const countMap = new Map(upcoming.map(r => [r.assignedTo, Number(r.count)]));
      let minCount = Infinity;
      for (const memberId of assignedMembers) {
        const count = countMap.get(memberId) || 0;
        if (count < minCount) { minCount = count; assignedTo = memberId; }
      }
    }
  }

  const [booking] = await db.insert(bookings).values({
    bookingPageId: page.id,
    clientId: page.clientId,
    guestName: name.trim(),
    guestEmail: email.trim(),
    guestPhone: phone?.trim() || null,
    startTime: slotStart,
    endTime: slotEnd,
    timezone: timezone || page.timezone,
    answers: answers || null,
    cancelToken,
    groupSize: isGroupBooking ? seats : groupSize,
    subtotal,
    discountTotal,
    total,
    discountCode: appliedDiscountCode,
    giftCertificateCode: appliedGiftCertCode,
    giftCertificateAmount: giftCertAmount,
    checkinCode,
    assignedTo,
    assignedUserId: autoAssignedUserId,
    paymentStatus: needsPayment ? 'pending' : 'free',
    status: needsPayment ? 'confirmed' : 'confirmed', // confirmed even while pending payment — cancelled if payment fails
  }).returning();

  // For group bookings, persist each attendee. When the request didn't pass
  // an explicit attendees[] (legacy widget), fall back to creating a single
  // attendee row from the primary guest fields so seat math stays correct.
  if (isGroupBooking) {
    const rows = attendees.length > 0
      ? attendees.map(a => ({
          bookingId: booking.id,
          name: (a.name || '').trim(),
          email: (a.email || '').trim(),
          phone: a.phone?.trim() || null,
          notes: a.notes?.trim() || null,
          status: 'confirmed' as const,
        }))
      : Array.from({ length: seats }, (_, i) => ({
          bookingId: booking.id,
          name: i === 0 ? name.trim() : `${name.trim()} (+${i})`,
          email: email.trim(),
          phone: phone?.trim() || null,
          notes: null,
          status: 'confirmed' as const,
        }));

    if (rows.length > 0) {
      await db.insert(bookingAttendees).values(rows);
    }
  }

  emitEvent('booking.guest_booked', page.clientId, 0, {
    bookingId: booking.id,
    bookingPageId: page.id,
    pageTitle: page.title,
    pageSlug: page.slug,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: booking.timezone,
    groupSize: booking.groupSize,
    total: total / 100, // dollars (matches create_crm_deal value contract)
    paymentStatus: needsPayment ? 'pending' : 'free',
    answers: booking.answers,
  });

  // Save selected add-ons
  if (addOnDetails.length > 0) {
    await db.insert(bookingSelectedAddOns).values(
      addOnDetails.map(a => ({
        bookingId: booking.id,
        addOnId: a.addOnId,
        quantity: a.quantity,
        unitPrice: a.unitPrice,
        productName: a.name,
      }))
    );
  }

  // Redeem gift certificate (partial)
  if (appliedGiftCertCode && giftCertAmount > 0) {
    const [cert] = await db.select().from(giftCertificates)
      .where(and(
        eq(giftCertificates.code, appliedGiftCertCode),
        eq(giftCertificates.clientId, page.clientId),
      )).limit(1);
    if (cert) {
      const newRemaining = cert.remainingAmount - giftCertAmount;
      await db.update(giftCertificates)
        .set({
          remainingAmount: newRemaining,
          status: newRemaining <= 0 ? 'fully_redeemed' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(giftCertificates.id, cert.id));

      await db.insert(giftCertificateRedemptions).values({
        giftCertificateId: cert.id,
        amount: giftCertAmount,
        context: 'booking',
        referenceId: booking.id,
        referenceType: 'booking',
      });
    }
  }

  // ─── PAYMENT ───────────────────────────────────────────────────────────────

  if (needsPayment) {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // Check if website has Stripe Connect (use connected account for payouts)
    let stripeParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: total,
      currency: 'usd',
      metadata: {
        type: 'booking',
        bookingId: String(booking.id),
        bookingPageId: String(page.id),
        clientId: String(page.clientId),
      },
    };

    if (page.websiteId) {
      const [store] = await db.select().from(storeSettings)
        .where(and(eq(storeSettings.websiteId, page.websiteId), eq(storeSettings.enabled, true)))
        .limit(1);

      if (store?.stripeAccountId && store.stripeOnboardingComplete) {
        const platformFeePercent = store.platformFeePercent ? parseFloat(store.platformFeePercent) : 5;
        const applicationFee = Math.round(total * (platformFeePercent / 100));

        stripeParams = {
          ...stripeParams,
          currency: store.currency?.toLowerCase() || 'usd',
          application_fee_amount: applicationFee,
          transfer_data: { destination: store.stripeAccountId },
        };
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(stripeParams);

    await db.update(bookings)
      .set({ stripePaymentIntentId: paymentIntent.id })
      .where(eq(bookings.id, booking.id));

    // Increment discount code usage
    if (appliedDiscountCode) {
      await db.update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1`, updatedAt: new Date() })
        .where(eq(discountCodes.code, appliedDiscountCode));
    }

    return NextResponse.json({
      success: true,
      data: {
        id: booking.id,
        clientSecret: paymentIntent.client_secret,
        total,
        paymentStatus: 'pending',
      },
    });
  }

  // ─── FREE BOOKING — send confirmations immediately ─────────────────────────

  // Increment discount code usage for free bookings too
  if (appliedDiscountCode) {
    await db.update(discountCodes)
      .set({ usedCount: sql`${discountCodes.usedCount} + 1`, updatedAt: new Date() })
      .where(eq(discountCodes.code, appliedDiscountCode));
  }

  const bookingTimezone = timezone || page.timezone;
  let meetingLink: string | null = null;

  if (page.googleCalendarSync || page.conferenceType === 'google_meet') {
    const result = await createCalendarEvent({
      clientId: page.clientId,
      bookingId: booking.id,
      title: page.title,
      startTime: slotStart,
      endTime: slotEnd,
      timezone: bookingTimezone,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      addGoogleMeet: page.conferenceType === 'google_meet',
    });
    if (result?.meetingLink) meetingLink = result.meetingLink;
  }

  if (page.conferenceType === 'zoom') {
    meetingLink = await createZoomMeeting({
      clientId: page.clientId,
      bookingId: booking.id,
      title: `${page.title} — ${booking.guestName}`,
      startTime: slotStart,
      duration: page.duration,
      timezone: bookingTimezone,
    });

    if (page.googleCalendarSync) {
      createCalendarEvent({
        clientId: page.clientId,
        bookingId: booking.id,
        title: page.title,
        description: meetingLink ? `Zoom: ${meetingLink}` : undefined,
        startTime: slotStart,
        endTime: slotEnd,
        timezone: bookingTimezone,
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
      }).catch(() => {});
    }
  }

  const emailData = {
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    pageTitle: page.title,
    startTime: slotStart,
    endTime: slotEnd,
    timezone: bookingTimezone,
    cancelToken,
    bookingSlug: page.slug,
    duration: page.duration,
    meetingLink,
    brand: await loadBookingBrand(page.id),
  };

  sendGuestConfirmation(emailData).catch(() => {});

  (async () => {
    const [client] = await db.select({ userId: clients.userId }).from(clients)
      .where(eq(clients.id, page.clientId)).limit(1);
    if (client) {
      const [host] = await db.select({ email: users.email }).from(users)
        .where(eq(users.id, client.userId)).limit(1);
      if (host) {
        sendHostNotification(host.email, emailData).catch(() => {});
      }
    }
  })();

  return NextResponse.json({
    success: true,
    data: {
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      status: booking.status,
      paymentStatus: 'free',
      meetingLink,
      checkinCode,
    },
  });
}
