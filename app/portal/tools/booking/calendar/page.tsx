'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface CalendarBooking {
  id: number;
  bookingPageId: number;
  guestName: string;
  guestEmail: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  assignedTo: number | null;
  groupSize: number;
  total: number;
  pageTitle: string;
  pageColor: string;
  assignedMember: { name: string; color: string } | null;
}

interface StaffMember {
  userId: number;
  name: string;
  color: string;
}

type ViewMode = 'week' | 'day';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  const today = new Date();

  function getBookingsForDay(day: Date) {
    return bookings.filter(b => isSameDay(new Date(b.startTime), day));
  }

  function getBookingPosition(booking: CalendarBooking) {
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    const topOffset = ((startMins - 7 * 60) / 60) * 64; // 64px per hour
    const height = ((endMins - startMins) / 60) * 64;
    return { top: Math.max(0, topOffset), height: Math.max(height, 20) };
  }

  function getBookingColor(booking: CalendarBooking) {
    if (booking.assignedMember?.color) return booking.assignedMember.color;
    return booking.pageColor || '#2563eb';
  }

  const displayDays = viewMode === 'week' ? weekDays : [currentDate];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/portal/tools/booking"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <span className="material-icons text-lg">arrow_back</span>
            Back to Booking Pages
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Combined Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View all bookings across staff members
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <span className="material-icons">chevron_left</span>
          </button>
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors">
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
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">All Members</option>
              {members.map(m => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          )}

          {/* View toggle */}
          <div className="flex bg-muted rounded-lg p-0.5">
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

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid border-b border-border" style={{ gridTemplateColumns: `60px repeat(${displayDays.length}, 1fr)` }}>
            <div className="border-r border-border" />
            {displayDays.map((day, i) => {
              const isToday = isSameDay(day, today);
              const dayBookings = getBookingsForDay(day);
              return (
                <div
                  key={i}
                  className={`px-2 py-3 text-center border-r border-border last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}
                >
                  <div className="text-xs text-muted-foreground">
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {day.getDate()}
                  </div>
                  {dayBookings.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="relative overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${displayDays.length}, 1fr)` }}>
              {/* Time labels */}
              <div className="border-r border-border">
                {HOURS.map(hour => (
                  <div key={hour} className="h-16 flex items-start justify-end pr-2 pt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {displayDays.map((day, dayIdx) => {
                const dayBookings = getBookingsForDay(day);
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={dayIdx}
                    className={`relative border-r border-border last:border-r-0 ${isToday ? 'bg-primary/[0.02]' : ''}`}
                  >
                    {/* Hour lines */}
                    {HOURS.map(hour => (
                      <div key={hour} className="h-16 border-b border-border/50" />
                    ))}

                    {/* Bookings */}
                    {dayBookings.map(booking => {
                      const pos = getBookingPosition(booking);
                      const color = getBookingColor(booking);
                      return (
                        <button
                          key={booking.id}
                          onClick={() => setSelectedBooking(selectedBooking?.id === booking.id ? null : booking)}
                          className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-left overflow-hidden transition-opacity hover:opacity-90 cursor-pointer"
                          style={{
                            top: pos.top,
                            height: pos.height,
                            backgroundColor: color + '20',
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <div className="text-xs font-medium truncate" style={{ color }}>
                            {booking.guestName}
                          </div>
                          {pos.height > 30 && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {formatTime(new Date(booking.startTime))} — {booking.pageTitle}
                            </div>
                          )}
                          {pos.height > 46 && booking.assignedMember && (
                            <div className="text-[10px] truncate" style={{ color: booking.assignedMember.color }}>
                              <span className="material-icons text-[10px] align-middle">person</span> {booking.assignedMember.name}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Booking detail panel */}
      {selectedBooking && (
        <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Booking Details</h2>
              <button onClick={() => setSelectedBooking(null)} className="p-1 hover:bg-muted rounded-lg">
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
                className="inline-flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors w-full justify-center"
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
