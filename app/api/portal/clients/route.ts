import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClientsWithRoles } from '@/lib/portal-client';
import { getActiveClientId } from '@/lib/active-client';
import { resolvePortalFromCurrentRequest } from '@/lib/mcp-auth';

export async function GET() {
  // Accept either a NextAuth cookie session (portal browser) or a bearer
  // token (mobile / API). Bearer tokens are bound to a single client at
  // issuance time, so they pin the active workspace to that client.
  const bearer = await resolvePortalFromCurrentRequest();
  let userId: number;
  let bearerClientId: number | null = null;
  if (bearer) {
    userId = bearer.userId;
    bearerClientId = bearer.client.id;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = parseInt(session.user.id, 10);
  }
  const clients = await getPortalClientsWithRoles(userId);
  const activeClientId = bearerClientId ?? (await getActiveClientId());

  // Determine effective active client
  const effectiveId = activeClientId && clients.some(c => c.id === activeClientId)
    ? activeClientId
    : clients[0]?.id ?? null;

  return NextResponse.json({
    clients: clients.map(c => ({
      id: c.id,
      company: c.company,
      role: c.role,
      website: c.website,
    })),
    activeClientId: effectiveId,
  });
}
