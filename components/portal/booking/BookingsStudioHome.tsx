'use client';

/**
 * PUX-181 (design doc screen 40): the week is the room's home. The calendar
 * page's WeekGrid at the top with a capacity fraction / "Sold out" on each
 * block (lib/booking/slot-capacity), today's check-ins as a note under it
 * (GET /api/portal/tools/booking/checkin/today — the check-in page's own
 * source), and the booking pages as a side column. "Block a day" is absent
 * on purpose: no such action exists in the portal (only a date-overrides
 * route), and the doc's "sells out 9 days early" stat has no source.
 * Studio-only; the server page gates on hasFlag.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import WeekGrid from '@/components/portal/booking/WeekGrid';
import type { CalendarBooking } from '@/app/portal/tools/booking/_lib/types';
import { capacityLabel, slotKey, slotUsage } from '@/lib/booking/slot-capacity';
import { GhostCard } from '@/components/portal/EmptyState';
import { sBtnGhost } from '@/components/portal/portal-ui';

export interface BookingPageRow { id: number; title: string; bookingType: string; groupCapacity: number | null; active: boolean; duration: number | null; upcoming: number }
interface CheckinSummary { total: number; checkedIn: number; pending: number; totalGuests: number }

export default function BookingsStudioHome({ days, bookings, pages }: { days: string[]; bookings: CalendarBooking[]; pages: BookingPageRow[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checkins, setCheckins] = useState<CheckinSummary | null>(null);
  const capacity = new Map(pages.map((p) => [p.id, p.bookingType === 'group' ? p.groupCapacity : null]));
  const usage = slotUsage(bookings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/tools/booking/checkin/today');
        const j = await r.json();
        if (!cancelled && r.ok && j.success) setCheckins(j.data.summary as CheckinSummary);
      } catch { /* the note just stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="space-y-4">
        <WeekGrid
          days={days.map((d) => new Date(d))}
          bookings={bookings}
          loading={false}
          selectedBookingId={selected}
          onSelectBooking={(b) => setSelected(b?.id ?? null)}
          blockLabel={(b) => capacityLabel(usage.get(slotKey(b.bookingPageId, b.startTime)) ?? 0, capacity.get(b.bookingPageId))}
        />
        {checkins && checkins.total > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
            <span className="material-icons text-[var(--portal-ok)]">check_circle</span>
            <span className="flex-1 text-foreground"><b>{checkins.checkedIn} of {checkins.total} checked in today</b>{checkins.pending > 0 && <span className="text-muted-foreground"> · {checkins.pending} still to arrive ({checkins.totalGuests} guests)</span>}</span>
            <Link href="/portal/tools/booking/checkin" className={sBtnGhost}>Open check-in</Link>
          </div>
        )}
      </div>
      <aside className="space-y-2" aria-label="Booking pages">
        <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold text-foreground"><span className="material-icons text-base text-muted-foreground">calendar_month</span>Booking pages<span className="ml-auto text-xs font-normal text-muted-foreground">{pages.length}</span></h2>
        {pages.length === 0 ? (
          <GhostCard icon="calendar_month" title="No booking pages yet" body="Create one and it lands here with its week." href="/portal/tools/booking/new" />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {pages.map((p) => (
              <li key={p.id}>
                <Link href={`/portal/tools/booking/${p.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-accent/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{p.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.duration ? `${p.duration} min` : 'Custom'}{p.bookingType === 'group' && p.groupCapacity ? ` · cap. ${p.groupCapacity}` : ''}{p.upcoming ? ` · ${p.upcoming} upcoming` : ''}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${p.active ? 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]' : 'bg-muted text-muted-foreground'}`}>{p.active ? 'Live' : 'Draft'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
