/**
 * PUX-197 (design doc screen 56): installed apps as cards that keep their
 * real navItems caption and Open target, an "Available" ghost that opens a
 * prefilled ticket (apps are agency-provisioned — no self-serve install),
 * and a miniature of where apps sit in the rail. Studio-only.
 */
import Link from 'next/link';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';
import { GhostCard } from '@/components/portal/EmptyState';
import { sBtnGhost } from '@/components/portal/portal-ui';

const ASK = '/portal/tickets/new?subject=' + encodeURIComponent('Add an app to my account');

export default function AppsStudio({ apps }: { apps: UserAppNavMeta[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
      <div className="space-y-4">
        {apps.length === 0 ? (
          <GhostCard icon="extension" title="No apps installed yet" body="Apps are added by your account manager at Simpler Development. Ask, and it appears in the rail." href={ASK} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {apps.map((app) => (
              <article key={app.slug} className="rounded-2xl border border-border bg-card p-5" aria-label={app.name}>
                <div className="flex items-start gap-3">
                  <span className="material-icons text-3xl text-foreground/80">{app.icon || 'apps'}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display font-extrabold tracking-[-0.01em] text-foreground">{app.name}</h2>
                    {app.navItems.length > 0 && <p className="mt-1 truncate text-xs text-muted-foreground">{app.navItems.map((n) => n.label).join(' · ')}</p>}
                  </div>
                </div>
                <Link href={`/portal/apps/${app.slug}`} className={`${sBtnGhost} mt-4`}>Open<span className="material-icons text-base">arrow_forward</span></Link>
              </article>
            ))}
          </div>
        )}
        {apps.length > 0 && <GhostCard icon="add_circle" title="Available on request" body="More apps are provisioned by your account manager — ask and it appears here." href={ASK} />}
      </div>
      <aside className="rounded-2xl border border-border bg-[var(--studio-rail,#0f1b2d)] p-3 text-[11px] text-white/80" aria-label="Where apps live">
        <p className="px-1.5 text-[9px] font-semibold uppercase tracking-[.1em] text-white/50">Account</p>
        <ul className="mt-1 space-y-0.5">
          <li className="rounded px-1.5 py-1 text-white/90"><span className="material-icons mr-1 align-[-3px] text-xs">apps</span>Apps</li>
          {apps.map((app) => (
            <li key={app.slug} className="pl-4">
              <span className="material-icons mr-1 align-[-3px] text-xs">{app.icon || 'apps'}</span>{app.name}
              {app.navItems.length > 0 && <span className="block pl-5 text-white/50">{app.navItems.map((n) => n.label).join(' · ')}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1.5 text-[10px] text-white/50">Each app&apos;s pages join the rail under Account, exactly like this.</p>
      </aside>
    </div>
  );
}
