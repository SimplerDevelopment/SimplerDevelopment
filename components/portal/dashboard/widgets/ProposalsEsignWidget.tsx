import { db } from '@/lib/db';
import { crmProposals } from '@/lib/db/schema';
import { eq, desc, count, and } from 'drizzle-orm';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-accent text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-accent text-muted-foreground',
};

export default async function ProposalsEsignWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [sentCount, acceptedCount, recentProposals] = await Promise.all([
    db
      .select({ count: count() })
      .from(crmProposals)
      .where(and(eq(crmProposals.clientId, clientId), eq(crmProposals.status, 'sent')))
      .then((r) => r[0]?.count ?? 0),

    db
      .select({ count: count() })
      .from(crmProposals)
      .where(and(eq(crmProposals.clientId, clientId), eq(crmProposals.status, 'accepted')))
      .then((r) => r[0]?.count ?? 0),

    db
      .select({
        id: crmProposals.id,
        title: crmProposals.title,
        status: crmProposals.status,
        createdAt: crmProposals.createdAt,
        sentAt: crmProposals.sentAt,
      })
      .from(crmProposals)
      .where(eq(crmProposals.clientId, clientId))
      .orderBy(desc(crmProposals.createdAt))
      .limit(3),
  ]);

  return (
    <div>
      <div className="mb-3 flex gap-6">
        <div>
          <span className="text-2xl font-bold text-foreground">{sentCount}</span>
          <p className="text-xs text-muted-foreground">awaiting signature</p>
        </div>
        <div>
          <span className="text-2xl font-bold text-foreground">{acceptedCount}</span>
          <p className="text-xs text-muted-foreground">accepted</p>
        </div>
      </div>

      {recentProposals.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No proposals yet.</p>
          <Link
            href="/portal/crm/proposals"
            className="text-xs text-primary hover:underline"
          >
            Create your first proposal
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {recentProposals.map((p) => {
            const statusLabel = STATUS_LABELS[p.status] ?? p.status;
            const statusColor =
              STATUS_COLORS[p.status] ?? 'bg-accent text-muted-foreground';
            const displayDate = p.sentAt ?? p.createdAt;
            return (
              <li key={p.id}>
                <Link
                  href="/portal/crm/proposals"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(displayDate).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}
                  >
                    {statusLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
