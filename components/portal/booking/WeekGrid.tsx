'use client';

// Extracted verbatim from app/portal/tools/booking/calendar/page.tsx (PUX-181) — the booking home renders the same week.

import type { CalendarBooking } from '@/app/portal/tools/booking/_lib/types';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getBookingsForDay(bookings: CalendarBooking[], day: Date) {
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

interface WeekGridProps {
  days: Date[];
  bookings: CalendarBooking[];
  loading: boolean;
  selectedBookingId: number | null;
  onSelectBooking: (b: CalendarBooking | null) => void;
  today?: Date;
  /** PUX-181: optional second line inside a block (e.g. "6 / 10" or "Sold out"). Undefined → output identical to before. */
  blockLabel?: (b: CalendarBooking) => string | null;
}

export function WeekGrid({
  days,
  bookings,
  loading,
  selectedBookingId,
  onSelectBooking,
  today = new Date(),
  blockLabel,
}: WeekGridProps) {
  const displayDays = days;

  return (
    <>
      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden -mx-4 sm:mx-0">
          <div className="overflow-x-auto">
          {/* Day headers */}
          <div className="grid border-b border-border min-w-[640px]" style={{ gridTemplateColumns: `60px repeat(${displayDays.length}, 1fr)` }}>
            <div className="border-r border-border" />
            {displayDays.map((day, i) => {
              const isToday = isSameDay(day, today);
              const dayBookings = getBookingsForDay(bookings, day);
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
            <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `60px repeat(${displayDays.length}, 1fr)` }}>
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
                const dayBookings = getBookingsForDay(bookings, day);
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
                      const extraLabel = blockLabel?.(booking);
                      return (
                        <button
                          key={booking.id}
                          onClick={() => onSelectBooking(selectedBookingId === booking.id ? null : booking)}
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
                          {extraLabel != null && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {extraLabel}
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
        </div>
      )}
    </>
  );
}

export default WeekGrid;
