import { getPublishingSession } from '@/lib/publishing/active-client';

export const dynamic = 'force-dynamic';

// Board view shell — PUB-4 replaces this body with the polymorphic kanban
// over the per-client publishing project's columns + cards.
export default async function PublishingBoardPage() {
  const session = await getPublishingSession();
  return (
    <section>
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-gray-400">view_kanban</span>
        <h2 className="mt-2 text-lg font-medium">Board view</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {session.project.columns.length === 6
            ? `Publishing project ready (id ${session.project.id}). Columns: ${session.project.columns.map((c) => c.name).join(' · ')}.`
            : `Publishing project is bootstrapping (${session.project.columns.length}/6 columns).`}
        </p>
        <p className="mt-3 text-xs text-gray-500">
          PUB-4 will replace this shell with the kanban board.
        </p>
      </div>
    </section>
  );
}
