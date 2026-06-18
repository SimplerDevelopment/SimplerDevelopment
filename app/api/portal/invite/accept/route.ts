import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, clientMembers } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { hashToken } from '@/lib/security/token-hash';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { syncSeatBillingSafe } from '@/lib/billing/recompute-subscription';

export async function POST(req: Request) {
  // 5 requests per 15 minutes per IP — prevents invite-token guessing
  if (!checkRateLimit(`${getClientIp(req)}:invite-accept`, 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Tokens are stored as SHA-256 hashes; hash the incoming token to look up.
  const tokenHash = hashToken(token);

  // Find user with valid, non-expired token
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.inviteToken, tokenHash),
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

  // Now an accepted seat → re-sync the seat charge on every client this user
  // belongs to (best-effort; never blocks accepting the invite).
  const memberships = await db
    .select({ clientId: clientMembers.clientId })
    .from(clientMembers)
    .where(eq(clientMembers.userId, user.id));
  for (const { clientId } of memberships) {
    await syncSeatBillingSafe(clientId);
  }

  return NextResponse.json({ success: true, email: user.email });
}
