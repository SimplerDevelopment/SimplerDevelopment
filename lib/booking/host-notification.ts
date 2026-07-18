import { db } from '@/lib/db';
import { clients, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Resolve who should receive the "new booking" host notification.
 *
 * Prefers the staff member assigned to the booking (`assignedTo`); falls back
 * to the client account owner only when the booking is unassigned. Previously
 * the booking POST route always emailed the account owner and never told the
 * assigned staff member about their booking.
 */
export async function resolveHostNotificationEmail(
  clientId: number,
  assignedTo: number | null,
): Promise<string | null> {
  if (assignedTo) {
    const [staff] = await db.select({ email: users.email }).from(users)
      .where(eq(users.id, assignedTo)).limit(1);
    if (staff?.email) return staff.email;
  }
  const [client] = await db.select({ userId: clients.userId }).from(clients)
    .where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;
  const [owner] = await db.select({ email: users.email }).from(users)
    .where(eq(users.id, client.userId)).limit(1);
  return owner?.email ?? null;
}
