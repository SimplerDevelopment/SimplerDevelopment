import Link from 'next/link';
import { getPublishingSession } from '@/lib/publishing/active-client';
import PublishingTabs from '@/components/portal/publishing/PublishingTabs';

export const dynamic = 'force-dynamic';

export default async function PublishingLayout({ children }: { children: React.ReactNode }) {
  // Resolving the session here both gates access (redirect on missing
  // client/session) and bootstraps the per-client Publishing project so every
  // sub-route can assume the board exists.
  const session = await getPublishingSession();
  const canManage =
    session.isStaff || session.role === 'owner' || session.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Publishing</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            One workflow for every outbound channel — website, email, social,
            decks, surveys, and bookings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/publishing/board?new=1"
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New card
          </Link>
        </div>
      </header>
      <PublishingTabs canManage={canManage} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
