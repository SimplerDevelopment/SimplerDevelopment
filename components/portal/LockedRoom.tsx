// "A room you haven't bought" (PUX-146, design doc screen 06). Rendered by a
// billing-gated route when the client lacks the domain: the feature explains
// itself where it would live — in the client's vocabulary, with the price it
// bills at today, and one teal button that lands exactly where the sidebar's
// lock popover always did. Replaces a redirect to the catalog, never a 404.
//
// Facts come from domain-catalog.ts (same source as the sidebar popover: name,
// price, first three features); the pitch and preview labels from
// locked-room-copy.ts. The site name in the pitch is the client's primary
// verified domain, else their subdomain, else "your site" — looked up here,
// scoped to the client, and dropped silently if the lookup fails.

import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientWebsites, websiteDomains } from '@/lib/db/schema';
import { getDomainByKey } from '@/lib/billing/domain-catalog';
import { LOCKED_ROOM_COPY } from '@/lib/billing/locked-room-copy';
import { Ghost } from '@/components/portal/EmptyState';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';

async function primarySiteName(clientId: number): Promise<string | null> {
  try {
    const [site] = await db
      .select({ id: clientWebsites.id, subdomain: clientWebsites.subdomain })
      .from(clientWebsites)
      .where(eq(clientWebsites.clientId, clientId))
      .orderBy(asc(clientWebsites.id))
      .limit(1);
    if (!site) return null;
    const [dom] = await db
      .select({ domain: websiteDomains.domain })
      .from(websiteDomains)
      .where(and(eq(websiteDomains.websiteId, site.id), eq(websiteDomains.isPrimary, true), eq(websiteDomains.status, 'verified')))
      .limit(1);
    return dom?.domain ?? (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null);
  } catch (err) {
    console.error('[locked-room] primary site lookup failed — pitch falls back to "your site":', err);
    return null;
  }
}

export default async function LockedRoom({ domainKey, clientId }: { domainKey: string; clientId: number }) {
  const d = getDomainByKey(domainKey);
  if (!d) return null; // the test guarantees this for every gated nav key; a stray key renders nothing rather than a broken sell
  const copy = LOCKED_ROOM_COPY[domainKey];
  const site = await primarySiteName(clientId);
  const pitch = copy ? copy.pitch(site) : d.tagline;
  const preview = copy?.preview ?? [d.name, 'Preview'];
  const price = Math.round(d.monthlyPriceCents / 100); // same rounding the sidebar popover uses

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PortalPageHeader eyebrow="Not on your plan" title={d.name} />
      <section className="grid items-center gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            <span className="material-icons text-[13px]">{d.icon}</span>Locked
          </span>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">{pitch}</h2>
          <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">{d.tagline}</p>
          <ul className="my-3 space-y-1.5 text-xs text-foreground">
            {d.features.slice(0, 3).map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="material-icons text-[15px] text-[var(--portal-ok)]">check_circle</span>{f}
              </li>
            ))}
          </ul>
          <div className="font-display text-xl font-semibold text-foreground">
            ${price}<small className="ml-1 font-sans text-xs font-normal text-muted-foreground">/month</small>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <Link href={`/portal/settings/billing/plans?highlight=${d.key}`} className={sBtn}>
              Add to plan<span className="material-icons text-base">arrow_forward</span>
            </Link>
            <Link href={`/portal/tickets/new?subject=${encodeURIComponent(`Question about ${d.name}`)}`} className={sBtnGhost}>
              Ask us about it
            </Link>
          </div>
        </div>
        <Ghost label={`${d.name} · preview`} className="min-h-[220px] p-4">
          <div className="flex gap-2.5">
            {preview.map((label) => (
              <div key={label} className="flex-1 rounded-xl border border-border bg-background p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="font-display text-xl font-semibold text-foreground">—</div>
              </div>
            ))}
          </div>
        </Ghost>
      </section>
    </div>
  );
}
