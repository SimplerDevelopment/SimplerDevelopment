/**
 * PUX-183 (design doc screen 42): a site's home — what is live, what is
 * waiting for approval, and the numbers. Server-renderable (no hooks); the
 * page gathers the scoped reads and passes plain data. No SSL row: the
 * domains table has no certificate field, so the card shows verification
 * only. Studio-only; the page gates on hasFlag.
 */

import Link from 'next/link';
import { siteAddress, siteStatus } from '@/lib/sites/site-status';
import { relativeTime } from '@/lib/notifications/feed';
import { sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { GhostCard } from '@/components/portal/EmptyState';

export interface SiteHomeData {
  site: { id: number; name: string; subdomain: string | null; domain: string | null; deploymentStatus: string | null; updatedAt: string | null };
  pages: { total: number; drafts: number; recent: { id: number; title: string; published: boolean; updatedAt: string }[] };
  changes: { id: number; summary: string; entityType: string; at: string }[];
  store: { products: number; ordersWeek: number; revenueWeekCents: number } | null;
  domain: { domain: string; status: string } | null;
}

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const card = 'rounded-2xl border border-border bg-card p-4';
const h2 = 'mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-foreground';

export default function SiteHome({ data }: { data: SiteHomeData }) {
  const { site, pages, changes, store, domain } = data;
  const pill = siteStatus(site.deploymentStatus);
  const address = siteAddress(site);
  const base = `/portal/websites/${site.id}`;
  const rooms = [['Pages', `${base}/entries`], ['Store', `${base}/store`], ['Media', '/portal/media'], ['Branding', '/portal/branding'], ['Settings', `${base}/settings`]] as const;
  const tiles: [string, string, string][] = [
    ['Pages', String(pages.total), `${pages.drafts} ${pages.drafts === 1 ? 'draft' : 'drafts'}`],
    ...(store ? [['Products', String(store.products), 'in the store'], ['Orders / 7d', String(store.ordersWeek), `${money(store.revenueWeekCents)} revenue`]] as [string, string, string][] : []),
    ['Changes waiting', String(changes.length), changes.length ? 'need your approval' : 'nothing pending'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-16 w-24 items-end rounded-xl bg-gradient-to-br from-[#0e7c86] to-[#134e5e] p-2" aria-hidden>
          <span className="font-display text-xl font-extrabold text-white/90">{site.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-semibold text-foreground">{site.name}</h2>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.tone}`}><span className="material-icons text-[13px]">{pill.icon}</span>{pill.label}</span>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">{address ?? 'No domain yet'}{site.updatedAt ? ` · updated ${relativeTime(site.updatedAt)}` : ''}</p>
        </div>
        <div className="flex gap-2">
          {address && site.deploymentStatus === 'active' && <a href={`https://${address}`} target="_blank" rel="noreferrer" className={sBtnGhost}><span className="material-icons text-base">open_in_new</span>Open site</a>}
          <Link href={`${base}/entries`} className={sBtnGhost}><span className="material-icons text-base">edit</span>Edit pages</Link>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border" aria-label="Site rooms">
        {rooms.map(([label, href]) => <Link key={label} href={href} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:border-foreground hover:text-foreground">{label}</Link>)}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className={card}><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{value}</p><p className="text-[11px] text-muted-foreground">{note}</p></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-label="Changes waiting">
          <h2 className={h2}><span className="material-icons text-base text-muted-foreground">rate_review</span>Changes waiting</h2>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting for your approval on this site.</p>
          ) : (
            <ul className="divide-y divide-border">
              {changes.slice(0, 5).map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="material-icons text-base text-muted-foreground">{c.entityType === 'site' ? 'language' : 'description'}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm text-foreground">{c.summary}</span><span className="text-xs text-muted-foreground">{relativeTime(c.at)}</span></span>
                  <Link href="/portal/approvals" className={i === 0 ? sBtn : sBtnGhost}>Review</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card} aria-label="Recent pages">
          <h2 className={h2}><span className="material-icons text-base text-muted-foreground">article</span>Recent pages<Link href={`${base}/entries`} className="ml-auto text-xs font-normal text-muted-foreground hover:text-foreground">See all →</Link></h2>
          {pages.recent.length === 0 ? (
            <GhostCard icon="add_circle" title="No pages yet" body="Create the first page to start the site." href={`${base}/entries`} />
          ) : (
            <ul className="divide-y divide-border">
              {pages.recent.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.published ? 'Published' : 'Draft'} · updated {relativeTime(p.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {store && (
          <section className={card} aria-label="Store">
            <h2 className={h2}><span className="material-icons text-base text-muted-foreground">storefront</span>Store</h2>
            <dl className="space-y-1.5 text-sm">
              {[['Products', String(store.products)], ['Orders this week', String(store.ordersWeek)], ['Revenue this week', money(store.revenueWeekCents)]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums text-foreground">{v}</dd></div>
              ))}
            </dl>
            <Link href={`${base}/store`} className={`${sBtnGhost} mt-3`}>Open store</Link>
          </section>
        )}
        <section className={card} aria-label="Domain">
          <h2 className={h2}><span className="material-icons text-base text-muted-foreground">dns</span>Domain</h2>
          {domain ? (
            <p className="flex items-center gap-2 text-sm"><span className="font-mono text-foreground">{domain.domain}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${domain.status === 'verified' ? 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]' : 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]'}`}>
                <span className="material-icons text-[13px]">{domain.status === 'verified' ? 'check_circle' : 'pending'}</span>{domain.status === 'verified' ? 'Verified' : domain.status === 'failed' ? 'Failed' : 'Pending'}
              </span></p>
          ) : (
            <GhostCard icon="add_circle" title="Add a domain" body="Point your own domain at this site." href={`${base}/settings`} />
          )}
        </section>
      </div>
    </div>
  );
}
