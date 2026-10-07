import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClientsWithRoles } from '@/lib/portal-client';
import { getActiveClientId } from '@/lib/active-client';
import { resolvePortalFromCurrentRequest, hasScope } from '@/lib/mcp-auth';

export async function GET() {
  // Accept either a NextAuth cookie session (portal browser) or a bearer
  // token (mobile / API). Bearer tokens are bound to a single client at
  // issuance time, so they pin the active workspace to that client.
  const bearer = await resolvePortalFromCurrentRequest();
  let userId: number;
  let bearerClientId: number | null = null;
  if (bearer) {
    // Profile consent is required even when the token can access another resource.
    if (!hasScope(bearer.scopes, 'profile:read')) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'oauth.scope.insufficient',
          keyId: bearer.keyId,
          required_scope: 'profile:read',
          granted_scopes: bearer.scopes,
          clientId: bearer.client.id,
          userId: bearer.userId,
          enforced: true,
        }),
      );
      return NextResponse.json({ error: 'insufficient_scope', required_scope: 'profile:read' }, { status: 403 });
    }
    userId = bearer.userId;
    bearerClientId = bearer.client.id;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = parseInt(session.user.id, 10);
  }
  const allClients = await getPortalClientsWithRoles(userId);
  const clients = bearer ? allClients.filter((client) => bearer.allowedClientIds?.includes(client.id)) : allClients;
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
