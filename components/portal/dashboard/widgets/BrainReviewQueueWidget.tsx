import Link from 'next/link';
import { getDashboardSummary } from '@/lib/brain/dashboard';

export default async function BrainReviewQueueWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const data = await getDashboardSummary(clientId);
  const pendingCount = data.counts.pendingReviewItems;
  const items = data.needsReviewMeetings.slice(0, 3);

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{pendingCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          pending review item{pendingCount !== 1 ? 's' : ''}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          Nothing waiting for review.{' '}
          <Link href="/portal/brain/communications/new" className="text-primary hover:underline">
            Add a note
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id}>
              <Link
                href={`/portal/brain/communications/${m.id}/review`}
                className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0 flex items-start gap-2">
                  <span className="material-icons text-base text-blue-500 shrink-0 mt-0.5">
                    reviews
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.meetingDate ?? m.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {m.pendingReviewItems > 0 && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {m.pendingReviewItems}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <Link
            href="/portal/brain/review"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-icons text-sm">arrow_forward</span>
            View all pending reviews
          </Link>
        </div>
      )}
    </div>
  );
}
