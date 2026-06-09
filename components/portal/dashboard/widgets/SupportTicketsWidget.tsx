import { db } from '@/lib/db';
import { supportTickets } from '@/lib/db/schema';
import { eq, and, ne, count, desc } from 'drizzle-orm';
import Link from 'next/link';
import { ticketStatusColor } from '@/lib/portal';

export default async function SupportTicketsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [countResult, recent] = await Promise.all([
    db
      .select({ count: count() })
      .from(supportTickets)
      .where(and(eq(supportTickets.clientId, clientId), ne(supportTickets.status, 'closed'))),
    db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.clientId, clientId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(3),
  ]);

  const openCount = countResult[0]?.count ?? 0;

  return (
    <div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-foreground">{openCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">open ticket{openCount !== 1 ? 's' : ''}</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No tickets yet.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((t) => (
            <li key={t.id}>
              <Link
                href={`/portal/tickets/${t.id}`}
                className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    #{t.number} {t.subject}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${ticketStatusColor(t.status)}`}
                >
                  {t.status.replace('_', ' ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
