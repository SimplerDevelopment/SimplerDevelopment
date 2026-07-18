/**
 * Public booking reschedule endpoint (Phase 1).
 *
 * GET  ?token=<rescheduleToken>
 *   Returns the booking + page config when the token is valid, the booking is
 *   confirmed, and the appointment is still far enough in the future that it
 *   falls outside the reschedule window (startTime > now + rescheduleWindowHours).
 *
 * POST { token, newStartTime, newEndTime, timezone }
 *   Re-validates the new slot (availability + capacity), atomically moves the
 *   booking, best-effort updates the Google Calendar event, emits
 *   booking.rescheduled on the automation bus, and sends a reschedule email
 *   to the guest (and host, best-effort).
 *
 * Envelope: { success, data | error }
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingPages } from '@/lib/db/schema';
import { eq, and, ne, lte, gte } from 'drizzle-orm';
import { isSlotWithinAvailability } from '@/lib/booking/availability';
import { checkSlotCapacity } from '@/lib/booking/capacity';
import { updateCalendarEvent } from '@/lib/google-calendar';
import { emitEvent } from '@/lib/automation';
import { sendRescheduleEmail, loadBookingBrand } from '@/lib/email/booking-emails';
import { resolveHostNotificationEmail } from '@/lib/booking/host-notification';

// ── GET ?token= ────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: bookings.id,
      bookingPageId: bookings.bookingPageId,
      clientId: bookings.clientId,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      timezone: bookings.timezone,
      status: bookings.status,
      rescheduleCount: bookings.rescheduleCount,
      // page config for the widget
      pageTitle: bookingPages.title,
      pageSlug: bookingPages.slug,
      pageDuration: bookingPages.duration,
      rescheduleEnabled: bookingPages.rescheduleEnabled,
      rescheduleWindowHours: bookingPages.rescheduleWindowHours,
    })
    .from(bookings)
    .innerJoin(bookingPages, eq(bookings.bookingPageId, bookingPages.id))
    .where(eq(bookings.rescheduleToken, token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
  }

  if (row.status !== 'confirmed') {
    return NextResponse.json(
      { success: false, error: 'Only confirmed bookings can be rescheduled' },
      { status: 409 },
    );
  }

  if (!row.rescheduleEnabled) {
    return NextResponse.json(
      { success: false, error: 'Rescheduling is not enabled for this booking page' },
      { status: 403 },
    );
  }

  // Enforce reschedule window: must be > rescheduleWindowHours from now
  const windowCutoff = new Date(
    Date.now() + row.rescheduleWindowHours * 60 * 60 * 1000,
  );
  if (row.startTime <= windowCutoff) {
    return NextResponse.json(
      {
        success: false,
        error: `Bookings can only be rescheduled more than ${row.rescheduleWindowHours} hour(s) before the appointment`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: row.id,
      guestName: row.guestName,
      guestEmail: row.guestEmail,
      startTime: row.startTime,
      endTime: row.endTime,
      timezone: row.timezone,
      status: row.status,
      rescheduleCount: row.rescheduleCount,
      page: {
        id: row.bookingPageId,
        title: row.pageTitle,
        slug: row.pageSlug,
        duration: row.pageDuration,
        rescheduleEnabled: row.rescheduleEnabled,
        rescheduleWindowHours: row.rescheduleWindowHours,
      },
    },
  });
}

// ── POST { token, newStartTime, newEndTime, timezone } ─────────────────────────

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, newStartTime: rawStart, newEndTime: rawEnd, timezone } = body as {
    token?: string;
    newStartTime?: string;
    newEndTime?: string;
    timezone?: string;
  };

  if (!token) {
    return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
  }
  if (!rawStart) {
    return NextResponse.json({ success: false, error: 'newStartTime is required' }, { status: 400 });
  }
  if (!rawEnd) {
    return NextResponse.json({ success: false, error: 'newEndTime is required' }, { status: 400 });
  }

  const newStart = new Date(rawStart);
  const newEnd = new Date(rawEnd);

  if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
    return NextResponse.json(
      { success: false, error: 'newStartTime and newEndTime must be valid ISO timestamps' },
      { status: 400 },
    );
  }

  if (newEnd <= newStart) {
    return NextResponse.json(
      { success: false, error: 'newEndTime must be after newStartTime' },
      { status: 400 },
    );
  }

  // ── Fetch the booking + page together ──────────────────────────────────────

  const [row] = await db
    .select()
    .from(bookings)
    .innerJoin(bookingPages, eq(bookings.bookingPageId, bookingPages.id))
    .where(
      and(
        eq(bookings.rescheduleToken, token),
        eq(bookings.status, 'confirmed'),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
  }

  const booking = row.bookings;
  const page = row.booking_pages;

  if (!page.rescheduleEnabled) {
    return NextResponse.json(
      { success: false, error: 'Rescheduling is not enabled for this booking page' },
      { status: 403 },
    );
  }

  // Enforce reschedule window on the *current* appointment
  const windowCutoff = new Date(
    Date.now() + page.rescheduleWindowHours * 60 * 60 * 1000,
  );
  if (booking.startTime <= windowCutoff) {
    return NextResponse.json(
      {
        success: false,
        error: `Bookings can only be rescheduled more than ${page.rescheduleWindowHours} hour(s) before the appointment`,
      },
      { status: 409 },
    );
  }

  // New slot must be in the future (with min notice)
  const minNoticeTime = new Date(Date.now() + page.minNoticeMins * 60 * 1000);
  if (newStart < minNoticeTime) {
    return NextResponse.json(
      { success: false, error: 'The new time slot is too soon' },
      { status: 409 },
    );
  }

  // Max advance check
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + page.maxAdvanceDays);
  if (newStart > maxDate) {
    return NextResponse.json(
      { success: false, error: 'The new time slot is too far in advance' },
      { status: 400 },
    );
  }

  // ── Availability check (mirrors book route) ────────────────────────────────

  const effectiveTz = timezone || booking.timezone || page.timezone;

  if (!(await isSlotWithinAvailability(page, newStart, null))) {
    return NextResponse.json(
      { success: false, error: 'The new time slot is not within available hours' },
      { status: 409 },
    );
  }

  // ── Capacity / conflict check ──────────────────────────────────────────────
  // For group bookings: validate seat capacity for the new slot excluding
  // the current booking (which will move).  For 1:1: exclude self so we
  // don't conflict with our own existing slot.

  if (page.bookingType === 'group') {
    const cap = await checkSlotCapacity(page.id, newStart, booking.groupSize ?? 1);
    if (!cap.available) {
      return NextResponse.json(
        { success: false, error: `Only ${cap.remaining} seats remaining for that slot` },
        { status: 409 },
      );
    }
  } else if (page.maxGuests) {
    // Capacity-mode individual — count seats already booked for the new slot.
    const existing = await db
      .select({ groupSize: bookings.groupSize })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingPageId, page.id),
          ne(bookings.status, 'cancelled'),
          eq(bookings.startTime, newStart),
        ),
      );
    const booked = existing.reduce((sum, b) => sum + (b.groupSize ?? 1), 0);
    if (booked + (booking.groupSize ?? 1) > page.maxGuests) {
      return NextResponse.json(
        { success: false, error: `Only ${page.maxGuests - booked} spots remaining for that slot` },
        { status: 409 },
      );
    }
  } else {
    // 1:1 conflict check with buffers, excluding the current booking
    const bufferStart = new Date(newStart.getTime() - page.bufferBefore * 60 * 1000);
    const bufferEnd = new Date(newEnd.getTime() + page.bufferAfter * 60 * 1000);

    const conflicting = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingPageId, page.id),
          ne(bookings.status, 'cancelled'),
          ne(bookings.id, booking.id), // exclude self
          lte(bookings.startTime, bufferEnd),
          gte(bookings.endTime, bufferStart),
        ),
      )
      .limit(1);

    if (conflicting.length > 0) {
      return NextResponse.json(
        { success: false, error: 'The new time slot is no longer available' },
        { status: 409 },
      );
    }
  }

  // ── Atomic update: preserve previous times, move to new ───────────────────

  const [updated] = await db
    .update(bookings)
    .set({
      previousStartTime: booking.startTime,
      previousEndTime: booking.endTime,
      startTime: newStart,
      endTime: newEnd,
      timezone: effectiveTz,
      rescheduleCount: (booking.rescheduleCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, booking.id))
    .returning();

  // ── Best-effort Google Calendar update ─────────────────────────────────────

  if (booking.googleEventId) {
    try {
      await updateCalendarEvent({
        clientId: booking.clientId,
        googleEventId: booking.googleEventId,
        startTime: newStart,
        endTime: newEnd,
        timezone: effectiveTz,
      });
    } catch (err) {
      // Best-effort — log and continue; reschedule must succeed regardless.
      console.warn('[reschedule] GCal update failed (best-effort):', err);
    }
  }

  // ── Emit automation event ──────────────────────────────────────────────────

  emitEvent('booking.rescheduled', booking.clientId, 0, {
    bookingId: booking.id,
    bookingPageId: page.id,
    pageTitle: page.title,
    pageSlug: page.slug,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    previousStartTime: booking.startTime,
    previousEndTime: booking.endTime,
    startTime: newStart,
    endTime: newEnd,
    timezone: effectiveTz,
    rescheduleCount: updated.rescheduleCount,
  });

  // ── Reschedule email (best-effort) ─────────────────────────────────────────

  const brand = await loadBookingBrand(page.id).catch(() => null);
  const hostEmail = await resolveHostNotificationEmail(
    booking.clientId,
    booking.assignedTo,
  ).catch(() => null);

  sendRescheduleEmail({
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    pageTitle: page.title,
    newStartTime: newStart,
    newEndTime: newEnd,
    previousStartTime: booking.startTime,
    timezone: effectiveTz,
    cancelToken: booking.cancelToken,
    rescheduleToken: token,
    bookingSlug: page.slug,
    duration: page.duration,
    meetingLink: booking.meetingLink,
    hostEmail,
    brand,
  }).catch((err) => {
    console.warn('[reschedule] Email send failed (best-effort):', err);
  });

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      guestName: updated.guestName,
      startTime: updated.startTime,
      endTime: updated.endTime,
      timezone: updated.timezone,
      previousStartTime: updated.previousStartTime,
      previousEndTime: updated.previousEndTime,
      rescheduleCount: updated.rescheduleCount,
      status: updated.status,
    },
  });
}
