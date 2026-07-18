import { db } from '@/lib/db';
import { supportTickets } from '@/lib/db/schema';
import { eq, and, ne, count } from 'drizzle-orm';
import MetricBlock from './MetricBlock';

export default async function MetricOpenTicketsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [result] = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(and(eq(supportTickets.clientId, clientId), ne(supportTickets.status, 'closed')));

  return (
    <MetricBlock
      icon="support_agent"
      color="text-orange-600"
      value={result?.count ?? 0}
      label="Open Tickets"
    />
  );
}
