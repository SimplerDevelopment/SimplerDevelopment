import Link from 'next/link';
import { db } from '@/lib/db';
import { clients, clientMembers } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

export default async function AgencyStatusWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [agencyRow, memberCountResult] = await Promise.all([
    db
      .select({
        customDomain: clients.customDomain,
        customDomainVerifiedAt: clients.customDomainVerifiedAt,
        whiteLabelEnabled: clients.whiteLabelEnabled,
        agencyName: clients.agencyName,
        agencyLogoUrl: clients.agencyLogoUrl,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1),
    db
      .select({ count: count() })
      .from(clientMembers)
      .where(eq(clientMembers.clientId, clientId)),
  ]);

  const agency = agencyRow[0];
  const memberCount = memberCountResult[0]?.count ?? 0;

  const hasDomain = !!agency?.customDomain;
  const isVerified = !!agency?.customDomainVerifiedAt;
  const hasBranding = !!agency?.agencyName;

  const checkItems = [
    {
      label: 'Custom domain',
      icon: 'dns',
      done: hasDomain && isVerified,
      detail: hasDomain
        ? agency.customDomain
        : null,
      badge: hasDomain
        ? isVerified
          ? { text: 'Verified', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
          : { text: 'Pending', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' }
        : { text: 'Not set', color: 'bg-muted text-muted-foreground' },
    },
    {
      label: 'Agency branding',
      icon: 'palette',
      done: hasBranding,
      detail: agency?.agencyName ?? null,
      badge: hasBranding
        ? { text: 'Configured', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
        : { text: 'Not set', color: 'bg-muted text-muted-foreground' },
    },
    {
      label: 'White-label mode',
      icon: 'campaign',
      done: !!agency?.whiteLabelEnabled,
      detail: null,
      badge: agency?.whiteLabelEnabled
        ? { text: 'Enabled', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
        : { text: 'Off', color: 'bg-muted text-muted-foreground' },
    },
  ];

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{memberCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          team member{memberCount !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-2">
        {checkItems.map((item) => (
          <li key={item.label}>
            <Link
              href="/portal/agency"
              className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span
                  className={`material-icons text-base shrink-0 ${
                    item.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  }`}
                >
                  {item.done ? 'check_circle' : item.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  {item.detail && (
                    <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${item.badge.color}`}
              >
                {item.badge.text}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-3 pt-3 border-t border-border">
        <Link
          href="/portal/agency"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons text-sm">arrow_forward</span>
          Manage agency settings
        </Link>
      </div>
    </div>
  );
}
