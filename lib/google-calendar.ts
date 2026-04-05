import { google } from 'googleapis';
import { db } from '@/lib/db';
import { googleCalendarTokens, bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
}

async function getAuthedClient(clientId: number) {
  const [token] = await db.select().from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.clientId, clientId))
    .limit(1);

  if (!token) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  });

  // Auto-refresh if expired
  if (token.expiresAt.getTime() < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await db.update(googleCalendarTokens)
        .set({
          accessToken: credentials.access_token!,
          ...(credentials.refresh_token && { refreshToken: credentials.refresh_token }),
          expiresAt: new Date(credentials.expiry_date || Date.now() + 3600_000),
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarTokens.clientId, clientId));
    } catch (err) {
      console.error('Failed to refresh Google Calendar token:', err);
      return null;
    }
  }

  return { oauth2Client, calendarId: token.calendarId || 'primary' };
}

/**
 * Create a Google Calendar event for a booking.
 * Returns { eventId, meetingLink } or null on failure.
 */
export async function createCalendarEvent(opts: {
  clientId: number;
  bookingId: number;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  guestEmail: string;
  guestName: string;
  addGoogleMeet?: boolean;
}): Promise<{ eventId: string; meetingLink: string | null } | null> {
  const auth = await getAuthedClient(opts.clientId);
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });

  try {
    const requestBody: Record<string, unknown> = {
      summary: `${opts.title} — ${opts.guestName}`,
      description: opts.description || `Booking with ${opts.guestName} (${opts.guestEmail})`,
      start: {
        dateTime: opts.startTime.toISOString(),
        timeZone: opts.timezone,
      },
      end: {
        dateTime: opts.endTime.toISOString(),
        timeZone: opts.timezone,
      },
      attendees: [
        { email: opts.guestEmail, displayName: opts.guestName },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
        ],
      },
    };

    if (opts.addGoogleMeet) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `booking-${opts.bookingId}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const event = await calendar.events.insert({
      calendarId: auth.calendarId,
      conferenceDataVersion: opts.addGoogleMeet ? 1 : 0,
      requestBody,
    });

    const eventId = event.data.id;
    const meetingLink = event.data.hangoutLink || null;

    if (eventId) {
      await db.update(bookings)
        .set({
          googleEventId: eventId,
          ...(meetingLink && { meetingLink }),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, opts.bookingId));
    }

    return { eventId: eventId || '', meetingLink };
  } catch (err) {
    console.error('Failed to create Google Calendar event:', err);
    return null;
  }
}

/**
 * Delete a Google Calendar event when a booking is cancelled.
 */
export async function deleteCalendarEvent(
  clientId: number,
  googleEventId: string,
): Promise<boolean> {
  const auth = await getAuthedClient(clientId);
  if (!auth) return false;

  const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });

  try {
    await calendar.events.delete({
      calendarId: auth.calendarId,
      eventId: googleEventId,
    });
    return true;
  } catch (err) {
    console.error('Failed to delete Google Calendar event:', err);
    return false;
  }
}
