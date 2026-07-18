'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Contact {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  status: string;
  source: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  companyName: string | null;
  clientCompany: string | null;
  clientId: number;
}

function contactStatusColor(status: string): string {
  const map: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    customer: 'bg-purple-100 text-purple-700',
    inactive: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

export default function CrmContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    fetch(`/api/admin/portal/crm/contacts${params}`)
      .then(r => r.json())
      .then(d => { setContacts(d.data ?? []); setLoading(false); });
  }, [search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-muted-foreground hover:text-foreground transition-colors">
              <span className="material-icons text-sm">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">CRM Contacts</h1>
          </div>
          <p className="text-muted-foreground mt-1">All contacts across every client account.</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">search</span>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">person_off</span>
          <h3 className="mt-4 font-semibold text-foreground">No contacts found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? 'Try a different search term.' : 'No CRM contacts have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Contacted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-primary">
                            {c.firstName[0]}{c.lastName?.[0] ?? ''}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{c.firstName} {c.lastName ?? ''}</p>
                          {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email ?? '-'}</td>
                    <td className="px-4 py-3 text-foreground">{c.companyName ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.clientCompany ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${contactStatusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{c.source ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
