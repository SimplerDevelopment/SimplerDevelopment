// Publishing Command Center — server-side helper that resolves the active
// client + user role for the current session, then ensures the per-client
// Publishing project is bootstrapped. Returns the project handle plus the
// caller's role so downstream pages can render the right affordances without
// each one re-resolving identity.

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getActiveClientId } from '@/lib/active-client';
import { getOrCreatePublishingProject, type PublishingProject } from './bootstrap';
import { resolveClientRole } from './permissions';

export interface PublishingSession {
  userId: number;
  clientId: number;
  isStaff: boolean;
  role: 'owner' | 'admin' | 'member' | 'viewer' | null;
  project: PublishingProject;
}

/** Resolves the active publishing session. Redirects to login if no session,
 *  or to the portal dashboard if no client is resolvable. Bootstraps the
 *  Publishing project on first call per client. */
export async function getPublishingSession(): Promise<PublishingSession> {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string }).role;
  const isStaff = role === 'admin' || role === 'employee';

  let clientId: number | null = null;
  if (isStaff) {
    clientId = await getActiveClientId();
  } else {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.userId, userId))
      .limit(1);
    if (client) clientId = client.id;
  }
  if (clientId === null) redirect('/portal/dashboard');

  const project = await getOrCreatePublishingProject(clientId, userId);
  const memberRole = isStaff ? null : await resolveClientRole(userId, clientId);

  return { userId, clientId, isStaff, role: memberRole, project };
}
