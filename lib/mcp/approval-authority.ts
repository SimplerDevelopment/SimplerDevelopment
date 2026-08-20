/**
 * Who may actually DECIDE an approval (PUX-078).
 *
 * Viewing and deciding are deliberately split. Holding the link still lets an
 * external stakeholder open the real artifact — that is the flow
 * `ADR approval-preview-page-scoped-token` was written to protect, and it
 * survives. But the act that publishes content, flips a survey live or
 * activates a booking funnel now requires a signed-in user with real access to
 * the owning client.
 *
 * This reverses the "no auth on the approval flow" half of that ADR. The
 * reasoning changed: `reviewerName` was free text, so every approval in the
 * audit trail recorded a self-asserted string, and the bar now sits on live
 * product surfaces where the blast radius of a forged approval is larger.
 *
 * "Proper access" reuses the rule the portal already applies to approvals
 * (`app/api/portal/approvals/route.ts` — `role === 'owner' || role === 'admin'`)
 * rather than inventing a second, divergent notion of authority.
 */

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClientsWithRoles } from '@/lib/portal-client';

/** Membership roles permitted to decide an approval. */
const DECIDING_ROLES = new Set(['owner', 'admin']);

export type ApprovalAuthority =
  | { canDecide: true; userId: number; reviewerName: string; reviewerEmail: string | null; role: string }
  | { canDecide: false; reason: 'unauthenticated' | 'no_access' };

/**
 * Can the current session decide an approval belonging to `clientId`?
 *
 * Membership is re-read from the database rather than trusted from the session,
 * matching `getPortalClient`'s stance — a role in a stale JWT must not grant
 * authority over a client the user has since been removed from.
 */
export async function resolveApprovalAuthority(clientId: number): Promise<ApprovalAuthority> {
  const session = await auth();
  const rawId = session?.user?.id;
  if (!rawId) return { canDecide: false, reason: 'unauthenticated' };

  const userId = parseInt(String(rawId), 10);
  if (Number.isNaN(userId)) return { canDecide: false, reason: 'unauthenticated' };

  const accessible = await getPortalClientsWithRoles(userId);
  const membership = accessible.find((c) => c.id === clientId);
  if (!membership || !DECIDING_ROLES.has(membership.role)) {
    return { canDecide: false, reason: 'no_access' };
  }

  // Identity for the audit trail comes from the account, never from the request
  // body — that unverifiable free-text name is the thing this card removes.
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    canDecide: true,
    userId,
    reviewerName: row?.name?.trim() || row?.email || `User ${userId}`,
    reviewerEmail: row?.email ?? null,
    role: membership.role,
  };
}
