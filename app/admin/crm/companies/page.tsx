'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Company {
  id: number;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
  clientCompany: string | null;
  clientId: number;
  contactCount: number;
}

export default function CrmCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    fetch(`/api/admin/portal/crm/companies${params}`)
      .then(r => r.json())
      .then(d => { setCompanies(d.data ?? []); setLoading(false); });
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
            <h1 className="text-2xl font-bold text-foreground">CRM Companies</h1>
          </div>
          <p className="text-muted-foreground mt-1">All companies across every client account.</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">search</span>
            <input
              type="text"
              placeholder="Search companies..."
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
        <div className="text-center py-12 text-muted-foreground">Loading companies...</div>
      ) : companies.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">business</span>
          <h3 className="mt-4 font-semibold text-foreground">No companies found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? 'Try a different search term.' : 'No CRM companies have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Domain</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Contacts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {companies.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                          <span className="material-icons text-sm text-muted-foreground">business</span>
                        </div>
                        <span className="font-medium text-foreground">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.domain ? (
                        <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                          {c.domain}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-foreground capitalize">{c.industry ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.size ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.clientCompany ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="material-icons text-sm text-muted-foreground">people</span>
                        <span className="text-foreground font-medium">{c.contactCount}</span>
                      </div>
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
