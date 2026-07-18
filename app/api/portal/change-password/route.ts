import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { compare, hash } from 'bcryptjs';
import { checkRateLimit, getClientIp, isAuthRateLimitDisabled } from '@/lib/security/rate-limit';
import { validatePasswordStrength, isPasswordReused, nextPasswordHistory } from '@/lib/security/password-policy';

export async function POST(req: Request) {
  // 5 requests per 15 minutes per IP — brute-force guardrail on password change
  if (!isAuthRateLimitDisabled() && !(await checkRateLimit(`${getClientIp(req)}:change-password`, 5, 15 * 60 * 1000))) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || typeof currentPassword !== 'string') {
    return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'New password is required' }, { status: 400 });
  }

  const userId = parseInt(session.user.id, 10);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      password: users.password,
      passwordHistory: users.passwordHistory,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const isValid = await compare(currentPassword, user.password);
  if (!isValid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  // Strength policy (AUTH79-003) — reject weak new passwords.
  const weak = validatePasswordStrength(newPassword, { email: user.email, name: user.name });
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  // Reuse policy (AUTH79-002) — the new password must differ from the current
  // one and any recent password.
  if (await isPasswordReused(newPassword, [user.password, ...(user.passwordHistory ?? [])])) {
    return NextResponse.json(
      { error: 'Choose a password you have not used recently.' },
      { status: 400 },
    );
  }

  const hashed = await hash(newPassword, 12);
  await db.update(users).set({
    password: hashed,
    passwordHistory: nextPasswordHistory(user.password, user.passwordHistory),
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));

  return NextResponse.json({ success: true, message: 'Password updated successfully.' });
}
