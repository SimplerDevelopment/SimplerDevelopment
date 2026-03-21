import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export { formatCents, invoiceStatusColor, ticketStatusColor, priorityColor } from '@/lib/portal-utils';

export function invoiceStatusLabel(status: string) {
  if (status === 'sent') return 'Owed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Returns the client record for the current session user, or null if not a client. */
export async function getPortalClient() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  return client ?? null;
}

/** Returns true if the current session user is staff (admin or employee). */
export async function isPortalStaff(): Promise<boolean> {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  return role === 'admin' || role === 'employee';
}

