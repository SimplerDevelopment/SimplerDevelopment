import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, clientMembers, clients } from '@/lib/db/schema';
import { and, desc, eq, gt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { hashToken } from '@/lib/security/token-hash';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

// What an invite link is FOR, before the form (PUX-149, design doc screen 08):
// who invited you, to which company, as what role. Same token-hash lookup and
// the same generic error as ../accept — a guessed token learns nothing here it
// would not learn by trying to accept it, and an expired one is refused the
// same way. Read-only; accepting still goes through ../accept.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await checkRateLimit(`${getClientIp(req)}:invite-preview`, 20, 15 * 60 * 1000))) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  const { token } = await params;
  if (!token) return NextResponse.json({ success: false, error: 'Invalid or expired invitation link' }, { status: 400 });

  const inviter = alias(users, 'inviter');
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      role: clientMembers.role,
      company: clients.company,
      invitedBy: inviter.name,
    })
    .from(users)
    .innerJoin(clientMembers, eq(clientMembers.userId, users.id))
    .innerJoin(clients, eq(clients.id, clientMembers.clientId))
    .leftJoin(inviter, eq(inviter.id, clientMembers.invitedBy))
    .where(and(eq(users.inviteToken, hashToken(token)), gt(users.inviteExpiresAt, new Date())))
    .orderBy(desc(clientMembers.createdAt)) // a re-invited user: the newest membership is the one this link is for
    .limit(1);

  if (!row) return NextResponse.json({ success: false, error: 'Invalid or expired invitation link' }, { status: 400 });
  return NextResponse.json({
    success: true,
    // 'Your Team' is the same fallback the invite email uses (app/api/portal/team/route.ts).
    data: { email: row.email, name: row.name, role: row.role, company: row.company || 'Your Team', invitedBy: row.invitedBy },
  });
}
