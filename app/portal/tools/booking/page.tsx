import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { bookingPages, bookings, googleCalendarTokens, zoomTokens } from '@/lib/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import Link from 'next/link';

export default async function BookingPagesListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const pages = await db
    .select()
    .from(bookingPages)
    .where(eq(bookingPages.clientId, client.id))
    .orderBy(desc(bookingPages.updatedAt));

  // Count upcoming bookings per page
  const now = new Date();
  const upcomingCounts = await db
    .select({
      bookingPageId: bookings.bookingPageId,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.status, 'confirmed'),
        gte(bookings.startTime, now)
      )
    )
    .groupBy(bookings.bookingPageId);

  const countMap = new Map(upcomingCounts.map((c) => [c.bookingPageId, c.count]));

  // Check Google Calendar connection
  const calTokens = await db
    .select()
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.clientId, client.id))
    .limit(1);
  const isCalendarConnected = calTokens.length > 0;

  const zmTokens = await db
    .select()
    .from(zoomTokens)
    .where(eq(zoomTokens.clientId, client.id))
    .limit(1);
  const isZoomConnected = zmTokens.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Booking Pages</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create scheduling pages so clients can book time with you
          </p>
        </div>
        <Link
          href="/portal/tools/booking/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-lg">add</span>
          New Booking Page
        </Link>
      </div>

      {/* Google Calendar Status */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="material-icons text-xl text-primary">event</span>
          <div>
            <p className="text-sm font-medium text-foreground">Google Calendar</p>
            <p className="text-xs text-muted-foreground">
              {isCalendarConnected
                ? 'Connected — new bookings sync to your calendar automatically'
                : 'Connect to sync bookings and check for conflicts'}
            </p>
          </div>
        </div>
        {isCalendarConnected ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="material-icons text-sm">check_circle</span>
              Connected
            </span>
            <form action="/api/portal/tools/booking/google/disconnect" method="POST">
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <a
            href="/api/portal/tools/booking/google/auth"
            className="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-icons text-lg">link</span>
            Connect
          </a>
        )}
      </div>

      {/* Zoom Status */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="material-icons text-xl text-primary">video_camera_front</span>
          <div>
            <p className="text-sm font-medium text-foreground">Zoom</p>
            <p className="text-xs text-muted-foreground">
              {isZoomConnected
                ? 'Connected — Zoom meetings are auto-created for bookings'
                : 'Connect to automatically create Zoom meetings for bookings'}
            </p>
          </div>
        </div>
        {isZoomConnected ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="material-icons text-sm">check_circle</span>
              Connected
            </span>
            <form action="/api/portal/tools/booking/zoom/disconnect" method="POST">
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <a
            href="/api/portal/tools/booking/zoom/auth"
            className="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-icons text-lg">link</span>
            Connect
          </a>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { href: '/portal/tools/booking/calendar', icon: 'calendar_month', label: 'Calendar', desc: 'Combined view' },
          { href: '/portal/tools/booking/analytics', icon: 'bar_chart', label: 'Analytics', desc: 'Revenue & insights' },
          { href: '/portal/tools/booking/checkin', icon: 'qr_code_scanner', label: 'Check-in', desc: 'Scan & manage' },
          { href: '/portal/tools/booking/quotes', icon: 'request_quote', label: 'Quotes', desc: 'Custom pricing' },
          { href: '/portal/tools/gift-certificates', icon: 'card_giftcard', label: 'Gift Certs', desc: 'Manage certificates' },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="bg-card border border-border rounded-xl p-3 hover:border-primary/50 hover:shadow-sm transition-all group text-center"
          >
            <span className="material-icons text-xl text-muted-foreground group-hover:text-primary transition-colors">{action.icon}</span>
            <p className="text-sm font-medium text-foreground mt-1">{action.label}</p>
            <p className="text-xs text-muted-foreground">{action.desc}</p>
          </Link>
        ))}
      </div>

      {/* Booking Pages List */}
      {pages.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <span className="material-icons text-5xl text-muted-foreground/50">calendar_month</span>
          <h2 className="text-lg font-semibold text-foreground">No booking pages yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first booking page to let clients schedule meetings with you.
            Set your availability, duration, and custom questions.
          </p>
          <Link
            href="/portal/tools/booking/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-lg">add_circle</span>
            Create Your First Booking Page
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => {
            const upcoming = countMap.get(page.id) || 0;
            return (
              <Link
                key={page.id}
                href={`/portal/tools/booking/${page.id}`}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="material-icons text-xl"
                      style={{ color: page.color || '#2563eb' }}
                    >
                      calendar_month
                    </span>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {page.title}
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      page.active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {page.active ? 'active' : 'inactive'}
                  </span>
                </div>
                {page.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{page.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">timer</span>
                    {page.duration} min
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">link</span>
                    /book/{page.slug}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">event_upcoming</span>
                    {upcoming} upcoming
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Tips */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <span className="material-icons text-primary mt-0.5">tips_and_updates</span>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Tips</p>
          <p>
            Connect Google Calendar to automatically check for conflicts and add new bookings to your calendar.
            Share your booking link with clients or embed it on your website.
          </p>
        </div>
      </div>
    </div>
  );
}
