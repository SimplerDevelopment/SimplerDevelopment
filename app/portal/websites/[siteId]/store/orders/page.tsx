'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/utils/money';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pInput, sBtn } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import OrdersStudioTable from '@/components/portal/store/OrdersStudioTable';
import { ORDER_CHIPS, chipStatusParam } from '@/lib/store/order-chips';

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  status: string;
  itemCount: number;
  createdAt: string;
  paymentStatus?: string | null; // PUX-209: the route returns the full row
  paidAt?: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export default function OrdersListPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();
  const base = `/api/portal/websites/${siteId}/store`;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // PUX-209: chips reuse statusFilter as a comma list; selection feeds the one teal, Mark fulfilled.
  const studio = useFeatureFlag('portal-redesign');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`${base}/orders?${params}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [base, page, statusFilter, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is a useCallback reused across dep changes; setLoading(true) is intentional and does not cascade
    load();
  }, [load]);

  const toggle = (id: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  const markFulfilled = async () => {
    // ponytail: no bulk route exists; the per-order PUT also writes history, timestamps, emails and events, so it is called once per order.
    setBulkBusy(true);
    try {
      for (const id of selected) {
        await fetch(`${base}/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'shipped', statusNote: 'Marked fulfilled' }) });
      }
      setSelected(new Set());
      load();
    } finally {
      setBulkBusy(false);
    }
  };

  const tabs = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Shipped', value: 'shipped' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Store"
        title="Orders"
        subtitle="View and manage customer orders."
      />

      {studio ? (
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Order state">
          {[{ key: 'all', label: 'All' }, ...ORDER_CHIPS].map((c) => {
            const value = c.key === 'all' ? 'all' : chipStatusParam(c.key);
            const on = statusFilter === value;
            return (
              <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => { setStatusFilter(value); setPage(1); setSelected(new Set()); }}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
                {c.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground">Abandoned checkouts aren&apos;t recorded — an order appears once checkout completes.</span>
        </div>
      ) : (
        <>
      {/* Status Tabs */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              statusFilter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

        </>
      )}

      {studio && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3" aria-label="Bulk actions">
          <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
          <button type="button" onClick={markFulfilled} disabled={bulkBusy} className={`${sBtn} disabled:opacity-50`}>{bulkBusy ? 'Marking…' : 'Mark fulfilled'}</button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="material-icons text-muted-foreground text-lg absolute left-3 top-1/2 -translate-y-1/2">
          search
        </span>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by order number, customer name or email..."
          className={`${pInput} pl-10`}
        />
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground/40 mb-2">receipt_long</span>
          <h2 className="font-semibold text-foreground mb-1">No orders found</h2>
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Orders will appear here when customers make purchases.'}
          </p>
        </div>
      ) : studio ? (
        <OrdersStudioTable rows={orders} selected={selected} onToggle={toggle} onToggleAll={toggleAll} onOpen={(o) => router.push(`/portal/websites/${siteId}/store/orders/${o.id}`)} footer={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'} on this page`} />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Order #</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Items</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/portal/websites/${siteId}/store/orders/${order.id}`)}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="text-primary font-medium">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{order.customerName}</p>
                      <p className="text-xs text-muted-foreground">{order.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{order.itemCount}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{formatMoney(order.totalCents)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[order.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30"
          >
            <span className="material-icons text-lg">chevron_left</span>
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30"
          >
            <span className="material-icons text-lg">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
