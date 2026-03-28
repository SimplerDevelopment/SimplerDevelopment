import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClientsWithRoles } from '@/lib/portal-client';
import { getActiveClientId } from '@/lib/active-client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id, 10);
  const clients = await getPortalClientsWithRoles(userId);
  const activeClientId = await getActiveClientId();

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
