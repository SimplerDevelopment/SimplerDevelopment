// POST /api/portal/settings/mfa/setup
// Begins TOTP enrollment: mints a fresh secret, stages it on the user row
// (still inactive — mfaEnabled stays false until they prove a code), and returns
// the secret + otpauth:// URI for the QR code. The secret is encrypted at rest
// by the encryptedText column type.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateTOTPSecret, getTOTPUri } from '@/lib/totp';
import { checkRateLimit } from '@/lib/security/rate-limit';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  // Cap secret-churn per account (each call rotates totpSecret + writes the DB).
  if (!(await checkRateLimit(`mfa-setup:${userId}`, 10, 15 * 60 * 1000))) {
    return NextResponse.json(
      { success: false, message: 'Too many requests. Please try again in a few minutes.' },
      { status: 429 },
    );
  }

  const [user] = await db
    .select({ email: users.email, mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }
  if (user.mfaEnabled) {
    return NextResponse.json(
      { success: false, message: 'Two-factor auth is already enabled. Disable it first to re-enroll.' },
      { status: 409 },
    );
  }

  const secret = generateTOTPSecret();
  try {
    await db.update(users).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(users.id, userId));
  } catch (err) {
    // totpSecret is an `encryptedText` column, so Drizzle's mapper encrypts on
    // write — and throws right here when WORKSPACE_TENANT_SECRETS_KEY is absent
    // or not 64 hex chars. Uncaught, Next answers with a body-less 500 and the
    // client's res.json() dies on "Unexpected end of JSON input", so the user
    // is shown a JSON parser error instead of a cause.
    //
    // The thrown message names the env var and its length, so it is logged and
    // NOT returned — a config detail is not something an end user should be
    // able to read off a failed 2FA setup.
    console.error('[mfa/setup] failed to stage TOTP secret', err);
    return NextResponse.json(
      { success: false, message: "Couldn't start two-factor setup. Please try again, or contact support if it keeps happening." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { secret, otpauthUri: getTOTPUri(secret, user.email) },
  });
}
