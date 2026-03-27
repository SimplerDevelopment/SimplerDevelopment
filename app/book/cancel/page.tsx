'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

interface BookingInfo {
  id: number;
  guestName: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  pageTitle: string;
}

function CancelContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Invalid cancel link');
      setLoading(false);
      return;
    }

    fetch(`/api/public/booking/cancel?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBooking(data.data);
          if (data.data.status === 'cancelled') setCancelled(true);
        } else {
          setError(data.message || 'Booking not found');
        }
      })
      .catch(() => setError('Failed to load booking'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch('/api/public/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        setCancelled(true);
      } else {
        setError(data.message || 'Failed to cancel');
      }
    } catch {
      setError('Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center">
          <span className="material-icons text-4xl text-red-400 mb-4 block">error_outline</span>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Booking</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const startDate = new Date(booking.startTime);
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: booking.timezone,
    timeZoneName: 'short',
  }).format(startDate);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
        {cancelled ? (
          <>
            <span className="material-icons text-5xl text-green-500 mb-4 block">check_circle</span>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Cancelled</h1>
            <p className="text-gray-500 mb-6">
              Your <strong>{booking.pageTitle}</strong> appointment has been cancelled.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
              <p className="text-sm text-gray-500">Was scheduled for</p>
              <p className="text-gray-900 font-medium">{formatted}</p>
            </div>
          </>
        ) : (
          <>
            <span className="material-icons text-5xl text-yellow-500 mb-4 block">event_busy</span>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cancel Booking?</h1>
            <p className="text-gray-500 mb-6">
              Are you sure you want to cancel this appointment?
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
              <p className="text-sm text-gray-500 mb-1">{booking.pageTitle}</p>
              <p className="text-gray-900 font-medium">{formatted}</p>
              <p className="text-sm text-gray-500 mt-1">{booking.guestName}</p>
            </div>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => window.history.back()}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>}>
      <CancelContent />
    </Suspense>
  );
}
