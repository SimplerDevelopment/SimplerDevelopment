/**
 * PUX-182 (design doc screen 41): a site as a card — a colour scene standing
 * in for a photograph (no screenshot column exists on client_websites and
 * capturing one is a human decision, PUX-150), the status pill, the numbers
 * an owner checks (pages, last updated — there is no visits rollup in the
 * codebase to draw from), and Open / Edit pages as quiet actions.
 * Studio-only; the server page gates on hasFlag. No hooks — renders on the server.
 */

import Link from 'next/link';
import { siteAddress, siteStatus } from '@/lib/sites/site-status';
import { relativeTime } from '@/lib/notifications/feed';
import { sBtnGhost } from '@/components/portal/portal-ui';

export interface SiteCardRow { id: number; name: string; subdomain: string | null; domain: string | null; deploymentStatus: string | null; updatedAt: Date | string | null; pageCount: number }

const SCENES = ['from-[#0e7c86] to-[#134e5e]', 'from-[#b8860b] to-[#7a5a05]', 'from-[#2e6b4a] to-[#173b28]', 'from-[#3b4a7a] to-[#1d2747]'];

export default function SiteCard({ site }: { site: SiteCardRow }) {
  const pill = siteStatus(site.deploymentStatus);
  const address = siteAddress(site);
  const scene = SCENES[site.id % SCENES.length];
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className={`flex h-28 items-end bg-gradient-to-br ${scene} p-4`} aria-hidden>
        <span className="font-display text-3xl font-extrabold text-white/90">{site.name.charAt(0).toUpperCase()}</span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[15px] font-semibold text-foreground">{site.name}</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">{address ?? 'No domain yet'}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.tone}`}>
            <span className={`material-icons text-[13px] ${site.deploymentStatus === 'provisioning' ? 'animate-spin' : ''}`}>{pill.icon}</span>{pill.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {site.pageCount} {site.pageCount === 1 ? 'page' : 'pages'}
          {site.deploymentStatus !== 'active' && site.pageCount > 0 ? ' not published yet' : ''}
          {site.updatedAt ? ` · updated ${relativeTime(typeof site.updatedAt === 'string' ? site.updatedAt : site.updatedAt.toISOString())}` : ''}
        </p>
        <div className="flex gap-2">
          <Link href={`/portal/websites/${site.id}`} className={sBtnGhost}>Open</Link>
          <Link href={`/portal/websites/${site.id}/entries`} className={sBtnGhost}>Edit pages</Link>
        </div>
      </div>
    </article>
  );
}
