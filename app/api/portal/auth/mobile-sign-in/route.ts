/**
 * POST /api/portal/auth/mobile-sign-in
 *
 * Native credentials sign-in for the SimplerDev Chat mobile app. Skips the
 * in-app browser bounce + workspace picker that `/portal/mobile-auth` requires:
 * accepts `{ email, password }`, validates against `users` using the same
 * bcrypt compare as the NextAuth credentials provider in `lib/auth.ts`, then
 * auto-selects the caller's primary client (owned > member, first match wins)
 * and mints a 90-day `portal_api_keys` row.
 *
 * Returns the same shape the mobile `lib/api/auth.ts` callback parser consumes,
 * so it's a drop-in for the OAuth flow.
 *
 * Security:
 *   - Same password verification path as the credentials provider — no shortcut.
 *   - Inactive users (`users.active = false`) are rejected with 401, identical
 *     to the NextAuth provider's behavior.
 *   - Generic `invalid_credentials` on email-or-password mismatch (no user
 *     enumeration).
 *   - Mints a key named "SimplerDev Chat (Mobile)" + ISO date, scopes `['*']`,
 *     `requireCmsApproval: false` (mobile is first-party). Identical to what
 *     `/portal/mobile-auth/page.tsx` produces — users can revoke it from
 *     `/portal/settings/api-keys`.
 */

import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, clients, clientMembers, portalApiKeys } from '@/lib/db/schema';
import { generatePortalApiKey } from '@/lib/mcp-auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_NAME = 'SimplerDev Chat (Mobile)';
const KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PrimaryClient {
  id: number;
  company: string | null;
  subdomain: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * Picks the user's primary client. Strategy:
 *   1. Legacy direct ownership (`clients.userId = user.id`) — always "owner".
 *   2. Otherwise first `clientMembers` row, ordered so 'owner' > 'admin' >
 *      'member' > 'viewer' wins ties.
 *   3. null if the user belongs to no client at all.
 */
async function pickPrimaryClient(userId: number): Promise<PrimaryClient | null> {
  // 1. Direct ownership (legacy). `clients.userId` is unique, so at most one row.
  const [owned] = await db
    .select({ id: clients.id, company: clients.company })
    .from(clients)
    .where(eq(clients.userId, userId))
    .limit(1);

  if (owned) {
    return { id: owned.id, company: owned.company, subdomain: null, role: 'owner' };
  }

  // 2. Team memberships — prefer the highest role.
  const memberRows = await db
    .select({
      clientId: clientMembers.clientId,
      role: clientMembers.role,
      company: clients.company,
    })
    .from(clientMembers)
    .innerJoin(clients, eq(clients.id, clientMembers.clientId))
    .where(eq(clientMembers.userId, userId));

  if (memberRows.length === 0) return null;

  const rank: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
  memberRows.sort((a, b) => (rank[b.role] ?? 0) - (rank[a.role] ?? 0));
  const top = memberRows[0];
  return {
    id: top.clientId,
    company: top.company,
    subdomain: null,
    role: (top.role as PrimaryClient['role']) ?? 'member',
  };
}

export async function POST(req: Request) {
  try {
    // Brute-force guard — same credential surface as the NextAuth provider.
    if (!checkRateLimit(`${getClientIp(req)}:mobile-signin`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many sign-in attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: 'invalid_input', message: 'A valid email is required' },
        { status: 400 },
      );
    }
    if (!password) {
      return NextResponse.json(
        { success: false, error: 'invalid_input', message: 'Password is required' },
        { status: 400 },
      );
    }

    // Same lookup as NextAuth credentials provider in lib/auth.ts.
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.active) {
      return NextResponse.json(
        { success: false, error: 'invalid_credentials', message: 'Wrong email or password' },
        { status: 401 },
      );
    }

    const isValid = await compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'invalid_credentials', message: 'Wrong email or password' },
        { status: 401 },
      );
    }

    const primary = await pickPrimaryClient(user.id);
    if (!primary) {
      return NextResponse.json(
        {
          success: false,
          error: 'no_workspace',
          message: 'No workspace assigned — contact your administrator',
        },
        { status: 403 },
      );
    }

    const { key, hash, preview } = generatePortalApiKey();
    const expiresAt = new Date(Date.now() + KEY_TTL_MS);

    await db.insert(portalApiKeys).values({
      clientId: primary.id,
      userId: user.id,
      name: `${KEY_NAME} — ${new Date().toISOString().slice(0, 10)}`,
      keyHash: hash,
      keyPreview: preview,
      scopes: ['*'],
      // Mobile is a trusted first-party client; CMS writes don't need staging.
      requireCmsApproval: false,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      data: {
        token: key,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        client: {
          id: primary.id,
          company: primary.company ?? '',
          subdomain: primary.subdomain,
          role: primary.role,
        },
      },
    });
  } catch (err) {
    console.error('[mobile-sign-in] unexpected error', err);
    return NextResponse.json(
      { success: false, error: 'server_error', message: 'Sign-in failed. Please try again.' },
      { status: 500 },
    );
  }
}
