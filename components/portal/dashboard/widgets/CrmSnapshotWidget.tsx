import { db } from '@/lib/db';
import { crmContacts, crmCompanies, crmDeals } from '@/lib/db/schema';
import { and, eq, count, sql } from 'drizzle-orm';
import Link from 'next/link';
import { formatCents } from '@/lib/portal';

export default async function CrmSnapshotWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [contactsResult, companiesResult, dealsResult, openPipelineResult] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(crmContacts)
        .where(eq(crmContacts.clientId, clientId))
        .then((r) => r[0]?.count ?? 0),

      db
        .select({ count: count() })
        .from(crmCompanies)
        .where(eq(crmCompanies.clientId, clientId))
        .then((r) => r[0]?.count ?? 0),

      db
        .select({ count: count() })
        .from(crmDeals)
        .where(eq(crmDeals.clientId, clientId))
        .then((r) => r[0]?.count ?? 0),

      db
        .select({
          totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)::int`,
        })
        .from(crmDeals)
        .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.status, 'open')))
        .then((r) => r[0]?.totalValue ?? 0),
    ]);

  const stats = [
    { label: 'Contacts', value: contactsResult, href: '/portal/crm' },
    { label: 'Companies', value: companiesResult, href: '/portal/crm/companies' },
    { label: 'Deals', value: dealsResult, href: '/portal/crm/deals' },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex flex-col items-center p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{s.value.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </Link>
        ))}
      </div>

      {openPipelineResult > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-1">Open pipeline</p>
          <p className="text-lg font-semibold text-foreground">
            {formatCents(openPipelineResult)}
          </p>
        </div>
      )}

      {contactsResult === 0 && companiesResult === 0 && dealsResult === 0 && (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No CRM data yet.</p>
          <Link href="/portal/crm" className="text-xs text-primary hover:underline">
            Go to CRM
          </Link>
        </div>
      )}
    </div>
  );
}
