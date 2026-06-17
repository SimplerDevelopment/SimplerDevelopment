// Billable seat count for a client. A seat is the owner plus every team member
// who has ACCEPTED their invite (cleared their invite token by setting up their
// account). An invited-but-not-yet-accepted member holds a `client_members` row
// already, but does not bill until they accept — so we exclude rows whose user
// still has an active invite token.
//
// Admin override: when `clients.billableSeatsOverride` is set, it IS the billed
// seat count (for comped / contracted-seat deals) — the derived count is
// ignored. Null = derive as below.
//
// Tenancy: every query is scoped to the passed clientId.

import { db } from '@/lib/db';
import { clients, clientMembers } from '@/lib/db/schema';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Count billable seats for a client: the owner + accepted members, deduped
 * (the owner may also have a client_members row). Returns 0 if the client
 * doesn't exist.
 */
export async function countBillableSeats(clientId: number): Promise<number> {
  const [client] = await db
    .select({ ownerId: clients.userId, seatsOverride: clients.billableSeatsOverride })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return 0;

  // Staff-set override wins (≥ 0, e.g. a contracted/comped seat count).
  if (client.seatsOverride != null && client.seatsOverride >= 0) {
    return client.seatsOverride;
  }

  const members = await db
    .select({ userId: clientMembers.userId, inviteToken: users.inviteToken })
    .from(clientMembers)
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(eq(clientMembers.clientId, clientId));

  // The owner is always a paid seat; members count once accepted.
  const seatUserIds = new Set<number>([client.ownerId]);
  for (const m of members) {
    if (m.inviteToken == null) seatUserIds.add(m.userId);
  }
  return seatUserIds.size;
}
