export const dynamic = 'force-dynamic';

// Calendar view shell — PUB-5 replaces this with the per-tenant content
// calendar that spans every Publishing card's scheduled_for date.
export default function PublishingCalendarPage() {
  return (
    <section className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
      <span className="material-symbols-outlined text-4xl text-gray-400">calendar_month</span>
      <h2 className="mt-2 text-lg font-medium">Calendar view</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        PUB-5 will adapt components/content-calendar/ContentCalendar.tsx here.
      </p>
    </section>
  );
}
