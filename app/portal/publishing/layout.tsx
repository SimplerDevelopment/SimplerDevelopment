import Link from 'next/link';
import { getPublishingSession } from '@/lib/publishing/active-client';
import PublishingTabs from '@/components/portal/publishing/PublishingTabs';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import { sBtn } from '@/components/portal/portal-ui';

export const dynamic = 'force-dynamic';

export default async function PublishingLayout({ children }: { children: React.ReactNode }) {
  // Resolving the session here both gates access (redirect on missing
  // client/session) and bootstraps the per-client Publishing project so every
  // sub-route can assume the board exists.
  const session = await getPublishingSession();
  const canManage =
    session.isStaff || session.role === 'owner' || session.role === 'admin';
  // PUX-176 (design doc screen 35): the room's one teal is New piece. Flag off is today's header.
  const studio = hasFlag(await getPortalClient(session.userId), 'portal-redesign');

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          {/* This is the page-level h1 for every /portal/publishing/** route
              (bypasses <PortalPageHeader/>) — child route content must start
              its own headings at h2, not h3, or the outline skips a level. */}
          {studio && <p className="font-mono text-[10.5px] uppercase tracking-[.08em] text-muted-foreground">Grow · Reach</p>}
          <h1 className={studio ? 'font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground' : 'text-2xl font-semibold'}>Publishing</h1>
          <p className={studio ? 'mt-1 text-sm text-muted-foreground' : 'text-sm text-gray-600 dark:text-gray-400 mt-1'}>
            {studio ? 'Every piece of content, every channel, from idea to published.' : 'One workflow for every outbound channel — website, email, social, decks, surveys, and bookings.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/publishing/board?new=1"
            className={studio ? sBtn : 'inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700'}
          >
            <span className="material-icons text-base">add</span>
            {studio ? 'New piece' : 'New card'}
          </Link>
        </div>
      </header>
      <PublishingTabs canManage={canManage} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
