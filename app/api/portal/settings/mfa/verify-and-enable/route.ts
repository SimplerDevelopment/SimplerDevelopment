// POST /api/portal/settings/mfa/verify-and-enable  { code }
// Confirms the user can generate a valid code from the staged secret, then flips
// mfaEnabled=true so the code becomes mandatory at login.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyTOTP } from '@/lib/totp';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  const [user] = await db
    .select({ totpSecret: users.totpSecret, mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }
  if (user.mfaEnabled) {
    return NextResponse.json({ success: false, message: 'Two-factor auth is already enabled.' }, { status: 409 });
  }
  if (!user.totpSecret) {
    return NextResponse.json(
      { success: false, message: 'Start setup first, then enter a code.' },
      { status: 400 },
    );
  }
  if (!verifyTOTP(user.totpSecret, code)) {
    return NextResponse.json(
      { success: false, message: 'That code is not valid. Check your authenticator app and try again.' },
      { status: 400 },
    );
  }

  await db.update(users).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId));

  return NextResponse.json({ success: true, data: { mfaEnabled: true } });
}
