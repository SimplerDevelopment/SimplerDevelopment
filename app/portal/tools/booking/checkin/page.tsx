'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCardPad, pSectionTitle } from '@/components/portal/portal-ui';

interface BookingItem {
  id: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: string;
  endTime: string;
  groupSize: number;
  status: string;
  paymentStatus: string;
  checkinCode: string | null;
  checkedInAt: string | null;
  pageTitle: string;
  isCheckedIn: boolean;
}

interface CheckinResult {
  bookingId: number;
  guestName: string;
  groupSize: number;
  pageTitle: string;
  checkedInAt: string;
}

export default function BookingCheckinPage() {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [summary, setSummary] = useState<{ total: number; checkedIn: number; pending: number; totalGuests: number } | null>(null);
  const [loadingToday, setLoadingToday] = useState(true);

  useEffect(() => {
    fetch('/api/portal/tools/booking/checkin/today')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setBookings(json.data.bookings);
          setSummary(json.data.summary);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingToday(false));
  }, [result]); // Refetch after check-in

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/portal/tools/booking/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        setCode('');
      } else {
        setError(data.message);
      }
    } catch {
      setError('Failed to process check-in');
    } finally {
      setChecking(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Booking"
        title="Check-in"
        subtitle="Scan or enter a booking code"
        actions={
          <Link href="/portal/tools/booking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <span className="material-icons text-lg">arrow_back</span>
            Back
          </Link>
        }
      />

      {/* Check-in input */}
      <div className={`${pCardPad}`}>
        <form onSubmit={handleCheckin} className="flex gap-3">
          <div className="flex-1 relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">qr_code_scanner</span>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Enter check-in code (e.g. BK-A3F9)"
              className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl text-foreground text-lg font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>
          <button type="submit" disabled={!code.trim() || checking}
            className={pBtnPrimary}>
            {checking ? 'Checking...' : 'Check In'}
          </button>
        </form>

        {error && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <span className="material-icons text-lg">error</span>
            {error}
          </div>
        )}

        {result && (
          <div className="mt-3 flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <span className="material-icons text-2xl text-green-600">check_circle</span>
            </div>
            <div>
              <p className="font-semibold text-green-800 dark:text-green-300">{result.guestName} checked in</p>
              <p className="text-sm text-green-600 dark:text-green-400">
                {result.pageTitle}{result.groupSize > 1 ? ` (${result.groupSize} guests)` : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Today's summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{summary.checkedIn}/{summary.total}</p>
            <p className="text-xs text-muted-foreground">Checked In</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{summary.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{summary.totalGuests}</p>
            <p className="text-xs text-muted-foreground">Total Guests</p>
          </div>
        </div>
      )}

      {/* Today's bookings */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className={pSectionTitle}>Today&apos;s Bookings</h2>
        </div>
        {loadingToday ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-muted-foreground/20 border-t-primary" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <span className="material-icons text-3xl block mb-2">event_available</span>
            No bookings today
          </div>
        ) : (
          <div className="divide-y divide-border">
            {bookings.map(b => (
              <div key={b.id} className={`flex items-center gap-3 px-4 py-3 ${b.isCheckedIn ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${b.isCheckedIn ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                  <span className={`material-icons text-base ${b.isCheckedIn ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {b.isCheckedIn ? 'check' : 'person'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {b.guestName}
                    {b.groupSize > 1 && <span className="text-muted-foreground font-normal"> ({b.groupSize} guests)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(b.startTime)} - {formatTime(b.endTime)} &middot; {b.pageTitle}
                  </p>
                </div>
                {b.checkinCode && (
                  <span className="text-xs font-mono bg-background border border-border rounded px-2 py-1">{b.checkinCode}</span>
                )}
                {b.isCheckedIn ? (
                  <span className="text-xs text-green-600 font-medium">Checked in</span>
                ) : (
                  <button
                    onClick={() => { setCode(b.checkinCode || String(b.id)); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Check in
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
