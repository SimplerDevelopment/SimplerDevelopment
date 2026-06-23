/**
 * Bookings tab — split into "Upcoming" (status=confirmed and start in the
 * future) and "Past & Cancelled" (everything else). Each upcoming row has
 * an inline reassign dropdown and a cancel button.
 */
'use client';

import type { Booking, PageMember } from '../_lib/types';

interface BookingsPanelProps {
  bookingsList: Booking[];
  pageMembers: PageMember[];
  onCancel: (bookingId: number) => void;
  onReassign: (bookingId: number, userId: number | null) => void;
}

export function BookingsPanel({
  bookingsList,
  pageMembers,
  onCancel,
  onReassign,
}: BookingsPanelProps) {
  const now = new Date();
  const upcomingBookings = bookingsList
    .filter((b) => b.status === 'confirmed' && new Date(b.startTime) >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastBookings = bookingsList
    .filter((b) => b.status !== 'confirmed' || new Date(b.startTime) < now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return (
    <div className="space-y-6">
      {/* Upcoming */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-icons text-primary">event_upcoming</span>
          <h2 className="text-sm font-medium text-foreground">
            Upcoming ({upcomingBookings.length})
          </h2>
        </div>
        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No upcoming bookings</p>
        ) : (
          <div className="divide-y divide-border">
            {upcomingBookings.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{b.guestName}</p>
                  <p className="text-xs text-muted-foreground">{b.guestEmail}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(b.startTime).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {new Date(b.startTime).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {' - '}
                    {new Date(b.endTime).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  {b.assignedTo &&
                    (() => {
                      const member = pageMembers.find((m) => m.userId === b.assignedTo);
                      return member ? (
                        <p className="text-xs mt-0.5 flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: member.color || '#6b7280' }}
                          />
                          <span className="text-muted-foreground">
                            {member.displayName || member.userName}
                          </span>
                        </p>
                      ) : null;
                    })()}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {pageMembers.length > 0 && (
                    <select
                      value={b.assignedTo || ''}
                      onChange={(e) => {
                        const newAssignedTo = e.target.value ? parseInt(e.target.value) : null;
                        onReassign(b.id, newAssignedTo);
                      }}
                      className="px-2 py-1 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Unassigned</option>
                      {pageMembers
                        .filter((m) => m.active)
                        .map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.displayName || m.userName}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    onClick={() => onCancel(b.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <span className="material-icons text-sm">cancel</span>
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-icons text-muted-foreground">history</span>
          <h2 className="text-sm font-medium text-foreground">
            Past & Cancelled ({pastBookings.length})
          </h2>
        </div>
        {pastBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No past bookings</p>
        ) : (
          <div className="divide-y divide-border">
            {pastBookings.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{b.guestName}</p>
                  <p className="text-xs text-muted-foreground">{b.guestEmail}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(b.startTime).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {new Date(b.startTime).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    b.status === 'cancelled'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : b.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : b.status === 'no_show'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {b.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
