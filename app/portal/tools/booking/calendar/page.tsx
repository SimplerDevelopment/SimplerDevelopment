'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnSoft, pBtnGhost } from '@/components/portal/portal-ui';
import { WeekGrid, getWeekDays } from '@/components/portal/booking/WeekGrid';
import type { CalendarBooking } from '@/app/portal/tools/booking/_lib/types';

interface StaffMember {
  userId: number;
  name: string;
  color: string;
}

type ViewMode = 'week' | 'day';

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function CombinedCalendarPage() {
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);

  const fetchCalendar = useCallback(async () => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === 'week') {
      start.setDate(start.getDate() - start.getDay());
      end.setDate(start.getDate() + 7);
    } else {
      end.setDate(end.getDate() + 1);
    }

    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (selectedMember) params.set('memberId', String(selectedMember));

    try {
      const res = await fetch(`/api/portal/tools/booking/calendar?${params}`);
      const data = await res.json();
      if (data.success) {
        setBookings(data.data.bookings);
        setMembers(data.data.members);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode, selectedMember]);

  useEffect(() => {
    setLoading(true);
    fetchCalendar();
  }, [fetchCalendar]);

  function navigate(dir: -1 | 1) {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (viewMode === 'week' ? 7 * dir : dir));
      return d;
    });
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  const weekDays = getWeekDays(currentDate);

  const displayDays = viewMode === 'week' ? weekDays : [currentDate];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <Link
        href="/portal/tools/booking"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-lg">arrow_back</span>
        Back to Booking Pages
      </Link>
      <PortalPageHeader
        eyebrow="Booking"
        title="Combined Calendar"
        subtitle="View all bookings across staff members"
      />

      {/* Controls */}
      <div className="flex items-center justify-between bg-card border border-border rounded-2xl p-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <span className="material-icons">chevron_left</span>
          </button>
          <button onClick={goToday} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/15">
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <span className="material-icons">chevron_right</span>
          </button>
          <span className="text-sm font-semibold text-foreground ml-2">
            {viewMode === 'week'
              ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            }
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Member filter */}
          {members.length > 0 && (
            <select
              value={selectedMember || ''}
              onChange={e => setSelectedMember(e.target.value ? parseInt(e.target.value) : null)}
              className="appearance-none rounded-xl border border-border bg-card px-3.5 py-2 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              <option value="">All Members</option>
              {members.map(m => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          )}

          {/* View toggle */}
          <div className="flex bg-muted rounded-xl p-0.5">
            {(['week', 'day'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Member legend */}
      {members.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {members.map(m => (
            <button
              key={m.userId}
              onClick={() => setSelectedMember(selectedMember === m.userId ? null : m.userId)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedMember === m.userId
                  ? 'border-current ring-1'
                  : selectedMember === null
                  ? 'border-border'
                  : 'border-border opacity-40'
              }`}
              style={{ color: m.color, borderColor: selectedMember === m.userId ? m.color : undefined }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.name}
            </button>
          ))}
          {selectedMember && (
            <button
              onClick={() => setSelectedMember(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      <WeekGrid
        days={displayDays}
        bookings={bookings}
        loading={loading}
        selectedBookingId={selectedBooking?.id ?? null}
        onSelectBooking={setSelectedBooking}
      />

      {/* Booking detail panel */}
      {selectedBooking && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Booking Details</h2>
              <button onClick={() => setSelectedBooking(null)} className="p-1 hover:bg-muted rounded-xl">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">Guest</span>
                <p className="text-sm font-medium text-foreground">{selectedBooking.guestName}</p>
                <p className="text-xs text-muted-foreground">{selectedBooking.guestEmail}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground">Service</span>
                <p className="text-sm font-medium text-foreground">{selectedBooking.pageTitle}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground">Time</span>
                <p className="text-sm text-foreground">
                  {new Date(selectedBooking.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-sm text-foreground">
                  {formatTime(new Date(selectedBooking.startTime))} — {formatTime(new Date(selectedBooking.endTime))}
                </p>
              </div>

              {selectedBooking.assignedMember && (
                <div>
                  <span className="text-xs text-muted-foreground">Assigned To</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBooking.assignedMember.color }} />
                    <span className="text-sm font-medium text-foreground">{selectedBooking.assignedMember.name}</span>
                  </div>
                </div>
              )}

              {selectedBooking.groupSize > 1 && (
                <div>
                  <span className="text-xs text-muted-foreground">Group Size</span>
                  <p className="text-sm text-foreground">{selectedBooking.groupSize} guests</p>
                </div>
              )}

              {selectedBooking.total > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Total</span>
                  <p className="text-sm font-medium text-foreground">${(selectedBooking.total / 100).toFixed(2)}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedBooking.status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : selectedBooking.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {selectedBooking.status}
                </span>
              </div>

              <Link
                href={`/portal/tools/booking/${selectedBooking.bookingPageId}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm disabled:opacity-50 w-full"
              >
                <span className="material-icons text-lg">open_in_new</span>
                View Booking Page
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
