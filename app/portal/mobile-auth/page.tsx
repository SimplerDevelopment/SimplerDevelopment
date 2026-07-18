/**
 * /portal/mobile-auth — mobile sign-in bridge
 *
 * Opened by the SimplerDev Chat mobile app via `expo-web-browser`'s
 * `WebBrowser.openAuthSessionAsync(url, 'sd-chat://callback')`. The portal's
 * normal NextAuth gate (in `lib/auth.ts → authorized`) handles the sign-in
 * round-trip: if the user has no session, they're bounced to `/portal/login`
 * and back here after sign-in.
 *
 * Once authenticated, this page asks the user to confirm and mints a
 * `portal_api_keys` row scoped to the active client. The key (an `sd_mcp_…`
 * Bearer token) is returned via a deep link:
 *
 *     sd-chat://callback?token=sd_mcp_…&user_id=…&user_email=…&client_id=…
 *
 * The mobile app's in-app browser captures that URL and hands the token to
 * `expo-secure-store` for persistence. No separate JWT signing path needed —
 * we re-use the existing `resolvePortalFromRequest()` validator that every
 * other API/MCP caller already uses.
 *
 * Security notes:
 * - Only mints when the user explicitly clicks "Connect to mobile app",
 *   so an attacker who tricks a logged-in user into opening this URL still
 *   needs a UI interaction.
 * - `redirect_uri` is whitelisted to `sd-chat://callback` only — no
 *   user-supplied callback URL is honored. (Phase 3 can broaden this if we
 *   add a desktop client.)
 * - The minted key is named "SimplerDev Chat (Mobile)" + a timestamp so users
 *   can see/revoke it from `/portal/settings/api-keys`.
 * - 90-day expiry. Sign-out from mobile revokes via `DELETE /api/portal/api-keys?id=…`.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { portalApiKeys, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { generatePortalApiKey } from '@/lib/mcp-auth';

const MOBILE_REDIRECT = 'sd-chat://callback';
const KEY_NAME = 'SimplerDev Chat (Mobile)';
const KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

async function mintTokenAndRedirect() {
  'use server';
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/portal/login?callbackUrl=/portal/mobile-auth');
  }

  const userId = parseInt(session.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    redirect(`${MOBILE_REDIRECT}?error=no_client`);
  }

  const [userRow] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    redirect(`${MOBILE_REDIRECT}?error=no_user`);
  }

  const { key, hash, preview } = generatePortalApiKey();
  const expiresAt = new Date(Date.now() + KEY_TTL_MS);

  await db.insert(portalApiKeys).values({
    clientId: client.id,
    userId: userRow.id,
    name: `${KEY_NAME} — ${new Date().toISOString().slice(0, 10)}`,
    keyHash: hash,
    keyPreview: preview,
    scopes: ['*'],
    // Mobile is a trusted first-party client; CMS writes don't need staging.
    requireCmsApproval: false,
    expiresAt,
  });

  const params = new URLSearchParams({
    token: key,
    user_id: String(userRow.id),
    user_email: userRow.email,
    user_name: userRow.name,
    user_role: userRow.role,
    client_id: String(client.id),
    client_name: client.company ?? '',
    expires_at: expiresAt.toISOString(),
  });
  redirect(`${MOBILE_REDIRECT}?${params.toString()}`);
}

export default async function MobileAuthPage() {
  // Force the NextAuth gate first — if not logged in, lib/auth.ts redirects to
  // /portal/login with this URL as callback.
  const session = await auth();
  if (!session?.user?.id) {
    // `authorized()` in lib/auth.ts already handles this, but be explicit so
    // the page never renders the unauth state.
    redirect('/portal/login?callbackUrl=/portal/mobile-auth');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #5B5BD6 0%, #8B5CF6 100%)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: 'linear-gradient(135deg, #5B5BD6 0%, #8B5CF6 100%)',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 32,
          }}
        >
          {/* Material Icons "auto_awesome" rendered as a Unicode-ish star fallback */}
          <span style={{ fontFamily: '"Material Icons"', fontSize: 32 }}>auto_awesome</span>
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#0B0F19' }}>
          Connect SimplerDev Chat
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: '#5E6473' }}>
          You&rsquo;re signed in as <strong>{session.user!.email}</strong>. Tap the button below to
          finish connecting the mobile app. We&rsquo;ll create a long-lived access token tied to
          this device so you don&rsquo;t have to sign in again.
        </p>
        <form action={mintTokenAndRedirect}>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #5B5BD6 0%, #8B5CF6 100%)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Connect to mobile app
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: 12, color: '#9CA0AB' }}>
          You can revoke this access any time at <strong>/portal/settings/api-keys</strong>.
        </p>
      </div>
    </div>
  );
}
