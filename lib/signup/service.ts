// Self-serve signup core — shared by the public signup API (credentials path)
// and the Google OAuth path in lib/auth.ts. Both converge on the same shape:
// a `users` row (role 'client') + a `clients` row (billingMode 'saas') owned
// by it. Tenancy: the client row is created here and owned by the new user —
// no cross-tenant reads.

import { randomBytes } from 'crypto';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { users, clients } from '@/lib/db/schema';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { grantSignupCredits } from '@/lib/ai-credits';

const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24h to click the link
/** Never-verified self-serve accounts are purged after this many days. */
export const UNVERIFIED_PURGE_DAYS = 7;

export interface SignupResult {
  userId: number;
  clientId: number;
  verificationToken: string;
}

export class SignupError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Create a self-serve account from the email+password form. The user starts
 * unverified — the caller emails the verification link. Rejects duplicate
 * emails with a neutral-but-honest error (the address is not enumerable
 * beyond what the login form already reveals).
 */
export async function createSelfServeAccount(input: {
  name: string;
  email: string;
  password: string;
  company?: string;
}): Promise<SignupResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new SignupError('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SignupError('Enter a valid email address.');
  if (input.password.length < 8) throw new SignupError('Password must be at least 8 characters.');

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new SignupError('An account with this email already exists — try signing in.', 409);

  const passwordHash = await hash(input.password, 10);
  const verificationToken = randomBytes(32).toString('hex');

  const [user] = await db.insert(users).values({
    name,
    email,
    password: passwordHash,
    role: 'client',
    active: true,
    emailVerificationToken: verificationToken,
    emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
  }).returning({ id: users.id });

  const [client] = await db.insert(clients).values({
    userId: user.id,
    company: input.company?.trim() || null,
    billingMode: 'saas',
  }).returning({ id: clients.id });

  return { userId: user.id, clientId: client.id, verificationToken };
}

/**
 * Consume a verification token. Returns the verified user's email (for the
 * post-verify login redirect) or null when the token is unknown/expired.
 */
export async function verifyEmailToken(token: string): Promise<{ email: string } | null> {
  if (!token || token.length !== 64) return null;
  const [row] = await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpires: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(users.emailVerificationToken, token),
      gt(users.emailVerificationExpires, new Date()),
    ))
    .returning({ id: users.id, email: users.email });
  if (!row) return null;

  // Cardless free-credit grant: a verified human gets a starter AI allowance
  // so they can use the agent before subscribing (the viral / $0 door).
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.userId, row.id))
    .limit(1);
  if (client) await grantSignupCredits(client.id);

  return { email: row.email };
}

/**
 * Google OAuth path: resolve the platform user for a Google identity,
 * creating user + saas client on first sign-in. Linking rule: match by
 * googleId first, then by (already-registered) email — Google emails arrive
 * verified, so linking by email is safe and also marks the account verified.
 */
export async function findOrCreateGoogleUser(input: {
  googleSub: string;
  email: string;
  name?: string | null;
}): Promise<{ id: number; role: string } | null> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.googleSub) return null;

  const [bySub] = await db
    .select({ id: users.id, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.googleId, input.googleSub))
    .limit(1);
  if (bySub) return bySub.active ? { id: bySub.id, role: bySub.role } : null;

  const [byEmail] = await db
    .select({ id: users.id, role: users.role, active: users.active, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (byEmail) {
    if (!byEmail.active) return null;
    await db.update(users)
      .set({
        googleId: input.googleSub,
        // Google verified this address; clear any pending email-verification.
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail.id));
    return { id: byEmail.id, role: byEmail.role };
  }

  // Brand-new Google signup — random unusable password placeholder (the
  // column is NOT NULL; credentials login stays impossible until they run
  // the password-reset flow, which is fine).
  const placeholder = await hash(randomBytes(32).toString('hex'), 10);
  const [user] = await db.insert(users).values({
    name: input.name?.trim() || email.split('@')[0],
    email,
    password: placeholder,
    role: 'client',
    active: true,
    googleId: input.googleSub,
    emailVerifiedAt: new Date(),
  }).returning({ id: users.id, role: users.role });

  const [client] = await db.insert(clients).values({
    userId: user.id,
    billingMode: 'saas',
  }).returning({ id: clients.id });

  // Cardless free-credit grant — Google accounts arrive pre-verified.
  await grantSignupCredits(client.id);

  return { id: user.id, role: user.role };
}

/**
 * Purge never-verified self-serve accounts older than UNVERIFIED_PURGE_DAYS.
 * Scoped hard: only role='client' rows that still carry a verification token
 * and have never verified — invited/legacy users have neither column set and
 * are untouchable here. Cascades remove the owned client row.
 */
export async function purgeUnverifiedAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - UNVERIFIED_PURGE_DAYS * 24 * 60 * 60 * 1000);
  const purged = await db
    .delete(users)
    .where(and(
      eq(users.role, 'client'),
      isNull(users.emailVerifiedAt),
      // token still pending — distinguishes self-serve signups from invited users
      gt(users.emailVerificationToken, ''),
      lt(users.createdAt, cutoff),
    ))
    .returning({ id: users.id });
  return purged.length;
}
