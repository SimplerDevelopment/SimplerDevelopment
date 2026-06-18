import { db } from '@/lib/db';
import { emailLists, emailSubscribers, emailCampaigns } from '@/lib/db/schema';
import { eq, and, count, desc, sql } from 'drizzle-orm';
import Link from 'next/link';

export default async function EmailPerformanceWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // First resolve this client's list ids (listId-keyed tables pattern)
  const listRows = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(eq(emailLists.clientId, clientId));

  const listIds = listRows.map((r) => r.id);

  let activeSubCount = 0;
  let sentCampaignCount = 0;
  let recentCampaigns: {
    id: number;
    name: string;
    subject: string;
    sentAt: Date | null;
    totalRecipients: number;
    totalOpened: number;
    totalSent: number;
  }[] = [];

  if (listIds.length > 0) {
    const inFilter = sql`${emailSubscribers.listId} IN (${sql.join(
      listIds.map((id) => sql`${id}`),
      sql`, `,
    )})`;
    const campaignInFilter = sql`${emailCampaigns.listId} IN (${sql.join(
      listIds.map((id) => sql`${id}`),
      sql`, `,
    )})`;

    [activeSubCount, sentCampaignCount, recentCampaigns] = await Promise.all([
      db
        .select({ count: count() })
        .from(emailSubscribers)
        .where(sql`${inFilter} AND ${emailSubscribers.status} = 'active'`)
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: count() })
        .from(emailCampaigns)
        .where(sql`${campaignInFilter} AND ${emailCampaigns.status} = 'sent'`)
        .then((r) => r[0]?.count ?? 0),
      db
        .select({
          id: emailCampaigns.id,
          name: emailCampaigns.name,
          subject: emailCampaigns.subject,
          sentAt: emailCampaigns.sentAt,
          totalRecipients: emailCampaigns.totalRecipients,
          totalOpened: emailCampaigns.totalOpened,
          totalSent: emailCampaigns.totalSent,
        })
        .from(emailCampaigns)
        .where(and(sql`${campaignInFilter}`, eq(emailCampaigns.status, 'sent')))
        .orderBy(desc(emailCampaigns.sentAt))
        .limit(3),
    ]);
  }

  return (
    <div>
      <div className="mb-3 flex gap-6">
        <div>
          <span className="text-2xl font-bold text-foreground">{activeSubCount.toLocaleString()}</span>
          <p className="text-xs text-muted-foreground">active subscriber{activeSubCount !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <span className="text-2xl font-bold text-foreground">{sentCampaignCount.toLocaleString()}</span>
          <p className="text-xs text-muted-foreground">sent campaign{sentCampaignCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {recentCampaigns.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No campaigns sent yet.</p>
          <Link
            href="/portal/email"
            className="text-xs text-primary hover:underline"
          >
            Create your first campaign
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {recentCampaigns.map((c) => {
            const openRate =
              c.totalSent > 0
                ? Math.round((c.totalOpened / c.totalSent) * 100)
                : null;
            return (
              <li key={c.id}>
                <Link
                  href="/portal/email"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.sentAt
                        ? new Date(c.sentAt).toLocaleDateString()
                        : '—'}{' '}
                      · {c.totalRecipients.toLocaleString()} recipients
                    </p>
                  </div>
                  {openRate !== null && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-muted-foreground">
                      {openRate}% open
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
