import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { hashToken } from '@/lib/security/token-hash';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  // 5 requests per 15 minutes per IP — prevents token-guessing attempts
  if (!checkRateLimit(`${getClientIp(req)}:reset-password`, 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const { token, password } = await req.json();

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Reset token is required' }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Find user with valid, non-expired token
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.passwordResetToken, hashToken(token)),
        gt(users.passwordResetExpires, new Date()),
      ),
    )
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired reset link. Please request a new one.' }, { status: 400 });
  }

  // Hash new password and clear reset token
  const hashed = await hash(password, 12);
  await db.update(users).set({
    password: hashed,
    passwordResetToken: null,
    passwordResetExpires: null,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));

  return NextResponse.json({ success: true, message: 'Password has been reset. You can now sign in.' });
}
