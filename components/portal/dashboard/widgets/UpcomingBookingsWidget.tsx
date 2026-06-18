import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq, and, count, asc, sql } from 'drizzle-orm';
import Link from 'next/link';

export default async function UpcomingBookingsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [countResult, upcoming] = await Promise.all([
    db
      .select({ count: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, clientId),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.startTime} > NOW()`,
        ),
      ),
    db
      .select({
        id: bookings.id,
        guestName: bookings.guestName,
        startTime: bookings.startTime,
        bookingPageId: bookings.bookingPageId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, clientId),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.startTime} > NOW()`,
        ),
      )
      .orderBy(asc(bookings.startTime))
      .limit(5),
  ]);

  const upcomingCount = countResult[0]?.count ?? 0;

  return (
    <div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-foreground">{upcomingCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          upcoming booking{upcomingCount !== 1 ? 's' : ''}
        </span>
      </div>
      {upcoming.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No upcoming bookings.</p>
          <Link
            href="/portal/tools/booking"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">add_circle_outline</span>
            Set up booking pages
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((b) => (
            <li key={b.id}>
              <Link
                href={`/portal/tools/booking`}
                className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{b.guestName}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.startTime).toLocaleString()}
                  </p>
                </div>
                <span className="material-icons text-base text-muted-foreground shrink-0">
                  chevron_right
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
