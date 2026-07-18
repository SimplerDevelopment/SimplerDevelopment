import { db } from '@/lib/db';
import { zoomTokens, bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID!;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET!;
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

function basicAuth(): string {
  return Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
}

async function getAuthedClient(clientId: number): Promise<string | null> {
  const [token] = await db.select().from(zoomTokens)
    .where(eq(zoomTokens.clientId, clientId))
    .limit(1);

  if (!token) return null;

  // Auto-refresh if expired (with 60s buffer)
  if (token.expiresAt.getTime() < Date.now() + 60_000) {
    try {
      const res = await fetch(ZOOM_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
        }),
      });

      if (!res.ok) {
        console.error('Failed to refresh Zoom token:', await res.text());
        return null;
      }

      const data = await res.json();
      await db.update(zoomTokens)
        .set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(zoomTokens.clientId, clientId));

      return data.access_token;
    } catch (err) {
      console.error('Failed to refresh Zoom token:', err);
      return null;
    }
  }

  return token.accessToken;
}

/**
 * Exchange an authorization code for Zoom tokens.
 */
export async function exchangeZoomCode(code: string, redirectUri: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  try {
    const res = await fetch(ZOOM_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      console.error('Failed to exchange Zoom code:', await res.text());
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (err) {
    console.error('Failed to exchange Zoom code:', err);
    return null;
  }
}

/**
 * Create a Zoom meeting for a booking.
 * Returns the join URL or null on failure.
 */
export async function createZoomMeeting(opts: {
  clientId: number;
  bookingId: number;
  title: string;
  startTime: Date;
  duration: number; // minutes
  timezone: string;
}): Promise<string | null> {
  const accessToken = await getAuthedClient(opts.clientId);
  if (!accessToken) return null;

  try {
    const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: opts.title,
        type: 2, // scheduled meeting
        start_time: opts.startTime.toISOString(),
        duration: opts.duration,
        timezone: opts.timezone,
        settings: {
          join_before_host: true,
          waiting_room: false,
          meeting_authentication: false,
        },
      }),
    });

    if (!res.ok) {
      console.error('Failed to create Zoom meeting:', await res.text());
      return null;
    }

    const data = await res.json();
    const joinUrl = data.join_url as string;

    if (joinUrl) {
      await db.update(bookings)
        .set({ meetingLink: joinUrl, updatedAt: new Date() })
        .where(eq(bookings.id, opts.bookingId));
    }

    return joinUrl;
  } catch (err) {
    console.error('Failed to create Zoom meeting:', err);
    return null;
  }
}

/**
 * Delete a Zoom meeting when a booking is cancelled.
 */
export async function deleteZoomMeeting(
  clientId: number,
  meetingLink: string,
): Promise<boolean> {
  const accessToken = await getAuthedClient(clientId);
  if (!accessToken) return false;

  // Extract meeting ID from join URL (https://zoom.us/j/12345...)
  const match = meetingLink.match(/\/j\/(\d+)/);
  if (!match) return false;

  try {
    const res = await fetch(`${ZOOM_API_BASE}/meetings/${match[1]}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    return res.ok || res.status === 404; // 404 = already deleted
  } catch (err) {
    console.error('Failed to delete Zoom meeting:', err);
    return false;
  }
}

/**
 * Revoke Zoom tokens for a client.
 */
export async function revokeZoomTokens(clientId: number): Promise<boolean> {
  const [token] = await db.select().from(zoomTokens)
    .where(eq(zoomTokens.clientId, clientId))
    .limit(1);

  if (!token) return false;

  try {
    await fetch(`https://zoom.us/oauth/revoke?token=${token.accessToken}`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${basicAuth()}` },
    });
  } catch {
    // Best-effort revocation
  }

  await db.delete(zoomTokens).where(eq(zoomTokens.clientId, clientId));
  return true;
}
