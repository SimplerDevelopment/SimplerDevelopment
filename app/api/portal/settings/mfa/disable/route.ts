// POST /api/portal/settings/mfa/disable  { password }
// Turns off TOTP MFA. Re-verifies the account password first so a hijacked
// *session* (without the password) can't strip the second factor.
import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  const [user] = await db
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }
  if (!password || !(await compare(password, user.password))) {
    return NextResponse.json({ success: false, message: 'Password is incorrect.' }, { status: 400 });
  }

  await db
    .update(users)
    .set({ mfaEnabled: false, totpSecret: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return NextResponse.json({ success: true, data: { mfaEnabled: false } });
}
