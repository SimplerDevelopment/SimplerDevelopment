'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AnalyticsData {
  totalRevenue: number;
  bookingRevenue: number;
  addOnRevenue: number;
  bookingCount: number;
  cancelledCount: number;
  totalGuests: number;
  averageBookingValue: number;
  byDay: { date: string; revenue: number; bookings: number; guests: number }[];
  byPage: { pageId: number; title: string; revenue: number; bookings: number }[];
  topAddOns: { name: string; revenue: number; count: number }[];
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BookingAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/tools/booking/analytics?startDate=${startDate}&endDate=${endDate}`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const maxDayRevenue = data ? Math.max(...data.byDay.map(d => d.revenue), 1) : 1;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Booking Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue and booking insights</p>
        </div>
        <Link href="/portal/tools/booking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <span className="material-icons text-lg">arrow_back</span>
          Back to Bookings
        </Link>
      </div>

      {/* Date range filter */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-4">
        <span className="material-icons text-muted-foreground">date_range</span>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="text-sm bg-background border border-border rounded-lg px-3 py-1.5" />
        <span className="text-muted-foreground">to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="text-sm bg-background border border-border rounded-lg px-3 py-1.5" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted-foreground/20 border-t-primary" />
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-muted-foreground">Failed to load analytics</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue', value: formatCents(data.totalRevenue), icon: 'payments' },
              { label: 'Bookings', value: String(data.bookingCount), icon: 'calendar_month' },
              { label: 'Total Guests', value: String(data.totalGuests), icon: 'groups' },
              { label: 'Avg. Value', value: formatCents(data.averageBookingValue), icon: 'trending_up' },
            ].map(card => (
              <div key={card.label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <span className="material-icons text-base">{card.icon}</span>
                  <span className="text-xs">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Revenue breakdown */}
          {data.addOnRevenue > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Revenue Breakdown</h3>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Booking Revenue</p>
                  <p className="text-lg font-semibold">{formatCents(data.bookingRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Add-on Revenue</p>
                  <p className="text-lg font-semibold">{formatCents(data.addOnRevenue)}</p>
                </div>
                {data.cancelledCount > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                    <p className="text-lg font-semibold text-red-500">{data.cancelledCount}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Revenue by day chart */}
          {data.byDay.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Daily Revenue</h3>
              <div className="flex items-end gap-1 h-40">
                {data.byDay.map(day => (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: ${formatCents(day.revenue)} (${day.bookings} bookings)`}>
                    <div
                      className="w-full rounded-t-sm bg-primary/80 min-h-[2px] transition-all"
                      style={{ height: `${(day.revenue / maxDayRevenue) * 100}%` }}
                    />
                    {data.byDay.length <= 14 && (
                      <span className="text-[9px] text-muted-foreground">{day.date.slice(5)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revenue by booking page */}
          {data.byPage.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">By Booking Page</h3>
              <div className="space-y-2">
                {data.byPage.map(page => (
                  <div key={page.pageId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{page.title}</p>
                      <p className="text-xs text-muted-foreground">{page.bookings} bookings</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatCents(page.revenue)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top add-ons */}
          {data.topAddOns.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">Top Add-ons</h3>
              <div className="space-y-2">
                {data.topAddOns.map(addOn => (
                  <div key={addOn.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{addOn.name}</p>
                      <p className="text-xs text-muted-foreground">{addOn.count} sold</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatCents(addOn.revenue)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
