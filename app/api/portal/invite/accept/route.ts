import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { hash } from 'bcryptjs';

export async function POST(req: Request) {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Find user with valid, non-expired token
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.inviteToken, token),
        gt(users.inviteExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired invitation link' }, { status: 400 });
  }

  // Set password and clear token
  const hashedPassword = await hash(password, 12);
  await db
    .update(users)
    .set({
      password: hashedPassword,
      inviteToken: null,
      inviteExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ success: true, email: user.email });
}
