'use client';

import { useState, useEffect } from 'react';
import { formatCents } from '@/lib/portal-utils';

interface Summary {
  totalBalance: number;
  totalMonthlyGrants: number;
  payAsYouGoClients: number;
}

interface ClientBalance {
  clientId: number;
  company: string | null;
  clientName: string;
  balance: number;
  monthlyGrant: number;
  payAsYouGo: boolean;
}

interface LedgerEntry {
  id: number;
  clientId: number;
  company: string | null;
  clientName: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

interface CreditPackage {
  id: number;
  name: string;
  tokens: number;
  price: number;
  active: boolean;
}

function ledgerTypeColor(type: string) {
  switch (type) {
    case 'grant': return 'bg-green-100 text-green-700';
    case 'usage': return 'bg-blue-100 text-blue-700';
    case 'purchase': return 'bg-purple-100 text-purple-700';
    case 'refund': return 'bg-orange-100 text-orange-700';
    case 'expiry': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

export default function AdminAiCreditsPage() {
  const [summary, setSummary] = useState<Summary>({ totalBalance: 0, totalMonthlyGrants: 0, payAsYouGoClients: 0 });
  const [balances, setBalances] = useState<ClientBalance[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'ledger'>('overview');

  useEffect(() => {
    fetch('/api/admin/portal/ai-credits')
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setSummary(d.data.summary);
          setBalances(d.data.balances ?? []);
          setLedger(d.data.ledger ?? []);
          setPackages(d.data.packages ?? []);
        }
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Credits</h1>
        <p className="text-muted-foreground mt-1">Monitor AI credit balances and usage across all clients.</p>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Total Pool Balance</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(summary.totalBalance)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Monthly Grants</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(summary.totalMonthlyGrants)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Pay-as-you-go Clients</p>
          <p className="text-2xl font-bold text-foreground mt-1">{Number(summary.payAsYouGoClients)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'overview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('ledger')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'ledger' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Ledger
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin text-3xl">progress_activity</span>
          <p className="mt-2">Loading AI credits...</p>
        </div>
      ) : tab === 'overview' ? (
        <div className="space-y-6">
          {/* Client balances table */}
          {balances.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">account_balance_wallet</span>
              <h3 className="mt-4 font-semibold text-foreground">No credit balances</h3>
              <p className="text-sm text-muted-foreground mt-1">No clients have AI credit balances yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">Client Balances</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly Grant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Pay-as-you-go</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {balances.map(b => (
                    <tr key={b.clientId} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{b.company ?? b.clientName}</td>
                      <td className="px-4 py-3 text-foreground">{formatNumber(b.balance)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatNumber(b.monthlyGrant)}</td>
                      <td className="px-4 py-3">
                        {b.payAsYouGo ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Enabled</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`/admin/clients`}
                          className="text-primary hover:underline text-xs font-medium"
                        >
                          View Client
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Packages section */}
          {packages.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground mb-3">Credit Packages</h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {packages.map(pkg => (
                  <div key={pkg.id} className="bg-card border border-border rounded-xl p-5 space-y-2">
                    <h3 className="font-semibold text-foreground">{pkg.name}</h3>
                    <p className="text-2xl font-bold text-foreground">{formatNumber(pkg.tokens)} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
                    <p className="text-sm text-muted-foreground">{formatCents(pkg.price)}</p>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${pkg.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {pkg.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Ledger table */}
          {ledger.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">receipt_long</span>
              <h3 className="mt-4 font-semibold text-foreground">No transactions</h3>
              <p className="text-sm text-muted-foreground mt-1">No AI credit transactions recorded yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-foreground">Recent Transactions</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.map(entry => (
                    <tr key={entry.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{entry.company ?? entry.clientName}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ledgerTypeColor(entry.type)}`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-medium ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {entry.amount >= 0 ? '+' : ''}{formatNumber(entry.amount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.description ?? '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Packages section */}
          {packages.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground mb-3">Credit Packages</h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {packages.map(pkg => (
                  <div key={pkg.id} className="bg-card border border-border rounded-xl p-5 space-y-2">
                    <h3 className="font-semibold text-foreground">{pkg.name}</h3>
                    <p className="text-2xl font-bold text-foreground">{formatNumber(pkg.tokens)} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
                    <p className="text-sm text-muted-foreground">{formatCents(pkg.price)}</p>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${pkg.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {pkg.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
