import { google } from 'googleapis';
import { db } from '@/lib/db';
import { googleWebsiteTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/analytics.readonly',
];

export function createOAuth2Client(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

/**
 * Returns a configured OAuth2 client for a website's stored Google tokens.
 * Auto-refreshes expired tokens and updates the DB.
 */
export async function getAuthenticatedClient(websiteId: number) {
  const [token] = await db
    .select()
    .from(googleWebsiteTokens)
    .where(eq(googleWebsiteTokens.websiteId, websiteId))
    .limit(1);

  if (!token) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  });

  // Refresh if expired or expiring within 5 minutes
  if (Date.now() >= token.expiresAt.getTime() - 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await db
      .update(googleWebsiteTokens)
      .set({
        accessToken: credentials.access_token!,
        expiresAt: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(googleWebsiteTokens.websiteId, websiteId));
    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}
