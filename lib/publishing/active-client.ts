// Publishing Command Center — server-side helper that resolves the active
// client + user role for the current session, then ensures the per-client
// Publishing project is bootstrapped. Returns the project handle plus the
// caller's role so downstream pages can render the right affordances without
// each one re-resolving identity.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { getOrCreatePublishingProject, type PublishingProject } from './bootstrap';
import { resolveClientRole } from './permissions';

/** True when `error` is the control-flow error thrown by next/navigation's
 *  `redirect()`. Route handlers that wrap getPublishingSession() in try/catch
 *  must re-throw these so Next emits the intended 307 instead of swallowing it
 *  into a 500. */
export function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

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

  // Resolve the active client the same way the rest of the portal does —
  // staff active-client cookie, then team membership, then ownership (see
  // getPortalClient). This lets a client *member* (not only the owner) reach
  // the publishing surface and hit the permission gate, instead of being hard
  // redirected because a narrow cookie/ownership-only lookup found nothing.
  const activeClient = await getPortalClient(userId);
  const clientId = activeClient?.id ?? null;
  if (clientId === null) redirect('/portal/dashboard');

  const project = await getOrCreatePublishingProject(clientId, userId);
  const memberRole = isStaff ? null : await resolveClientRole(userId, clientId);

  return { userId, clientId, isStaff, role: memberRole, project };
}
