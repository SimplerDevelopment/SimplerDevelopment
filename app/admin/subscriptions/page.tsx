'use client';

import { useState, useEffect } from 'react';
import { formatCents } from '@/lib/portal-utils';

interface Subscription {
  id: number;
  clientName: string;
  company: string | null;
  serviceName: string;
  serviceCategory: string;
  price: number;
  billingCycle: string;
  status: string;
  renewalDate: string | null;
  createdAt: string;
}

const STATUS_TABS = ['all', 'active', 'pending', 'suspended', 'cancelled'] as const;

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700';
    case 'pending': return 'bg-yellow-100 text-yellow-700';
    case 'suspended': return 'bg-orange-100 text-orange-700';
    case 'cancelled': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function categoryColor(category: string) {
  switch (category) {
    case 'domain': return 'bg-blue-100 text-blue-700';
    case 'hosting': return 'bg-purple-100 text-purple-700';
    case 'development': return 'bg-indigo-100 text-indigo-700';
    case 'maintenance': return 'bg-teal-100 text-teal-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/admin/portal/subscriptions')
      .then(r => r.json())
      .then(d => { setSubscriptions(d.data ?? []); setLoading(false); });
  }, []);

  const filtered = statusFilter === 'all'
    ? subscriptions
    : subscriptions.filter(s => s.status === statusFilter);

  const activeCount = subscriptions.filter(s => s.status === 'active').length;
  const suspendedCount = subscriptions.filter(s => s.status === 'suspended').length;

  const mrr = subscriptions
    .filter(s => s.status === 'active' && s.billingCycle === 'monthly')
    .reduce((sum, s) => sum + s.price, 0);

  const annualRevenue = subscriptions
    .filter(s => s.status === 'active' && s.billingCycle === 'annually')
    .reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>
        <p className="text-muted-foreground mt-1">Manage client service subscriptions.</p>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">MRR</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCents(mrr)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Annual Revenue</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCents(annualRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Suspended</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{suspendedCount}</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              statusFilter === tab
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin text-3xl">progress_activity</span>
          <p className="mt-2">Loading subscriptions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">subscriptions</span>
          <h3 className="mt-4 font-semibold text-foreground">No subscriptions found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter !== 'all' ? `No ${statusFilter} subscriptions.` : 'No client subscriptions yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Billing</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Renewal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(sub => (
                <tr key={sub.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{sub.company ?? sub.clientName}</td>
                  <td className="px-4 py-3 text-foreground">{sub.serviceName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColor(sub.serviceCategory)}`}>
                      {sub.serviceCategory}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatCents(sub.price)}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{sub.billingCycle}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(sub.status)}`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString() : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/portal-services`}
                      className="text-primary hover:underline text-xs font-medium"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
