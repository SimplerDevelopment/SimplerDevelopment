'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
}

interface Domain {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  region: string;
  records?: DnsRecord[];
  openTracking?: boolean;
  clickTracking?: boolean;
}

const statusColor: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  not_started: 'bg-gray-100 text-gray-600',
  partially_verified: 'bg-blue-100 text-blue-700',
  partially_failed: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
};

const statusIcon: Record<string, string> = {
  verified: 'check_circle',
  pending: 'hourglass_empty',
  not_started: 'radio_button_unchecked',
  partially_verified: 'incomplete_circle',
  partially_failed: 'warning',
  failed: 'cancel',
};

const recordStatusColor: Record<string, string> = {
  verified: 'text-green-500',
  not_started: 'text-muted-foreground',
  pending: 'text-yellow-500',
  failed: 'text-red-500',
};

export default function EmailDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Selected domain for detail view
  const [selected, setSelected] = useState<Domain | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);

  useEffect(() => {
    loadDomains();
  }, []);

  async function loadDomains() {
    setLoading(true);
    const data = await fetch('/api/admin/email/domains').then(r => r.json());
    setDomains(data.data ?? []);
    setLoading(false);
  }

  async function openDomain(domain: Domain) {
    setSelected(domain);
    setDetailLoading(true);
    const data = await fetch(`/api/admin/email/domains/${domain.id}`).then(r => r.json());
    if (data.success) setSelected(data.data);
    setDetailLoading(false);
  }

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    const res = await fetch('/api/admin/email/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDomain }),
    });
    const data = await res.json();
    setAdding(false);
    if (!data.success) { setAddError(data.message ?? 'Failed'); return; }
    setNewDomain('');
    setShowAddForm(false);
    await loadDomains();
    // Auto-open the new domain to show DNS records
    openDomain(data.data);
  }

  async function verifyDomain(id: string) {
    setVerifying(true);
    const res = await fetch(`/api/admin/email/domains/${id}/verify`, { method: 'POST' });
    const data = await res.json();
    setVerifying(false);
    if (!data.success) { alert(data.message); return; }
    // Refresh domain detail
    const updated = await fetch(`/api/admin/email/domains/${id}`).then(r => r.json());
    if (updated.success) {
      setSelected(updated.data);
      setDomains(prev => prev.map(d => d.id === id ? { ...d, status: updated.data.status } : d));
    }
  }

  async function toggleTracking(id: string, field: 'openTracking' | 'clickTracking', value: boolean) {
    setTrackingSaving(true);
    const res = await fetch(`/api/admin/email/domains/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    setTrackingSaving(false);
    if (!data.success) { alert(data.message); return; }
    setSelected(prev => prev ? { ...prev, [field]: value } : prev);
  }

  async function deleteDomain(id: string, name: string) {
    if (!confirm(`Remove domain "${name}" from Resend? This cannot be undone.`)) return;
    await fetch(`/api/admin/email/domains/${id}`, { method: 'DELETE' });
    setDomains(prev => prev.filter(d => d.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/email" className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sending Domains</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Verify domains to send email from your own address.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          Add Domain
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={addDomain} className="bg-card border border-border rounded-lg p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Add a Domain</h3>
          <p className="text-sm text-muted-foreground">
            Enter the domain you want to send from (e.g. <code className="bg-muted px-1 rounded text-xs">yourdomain.com</code>).
            We&apos;ll generate the DNS records you need to add.
          </p>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-3">
            <input
              required
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={adding}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {adding ? 'Adding…' : 'Add Domain'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Domain list */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Domains</h2>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : domains.length === 0 ? (
            <div className="p-10 text-center">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">domain</span>
              <p className="text-sm text-muted-foreground">No domains added yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {domains.map(domain => (
                <div
                  key={domain.id}
                  onClick={() => openDomain(domain)}
                  className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-accent transition-colors ${selected?.id === domain.id ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`material-icons text-base ${domain.status === 'verified' ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {statusIcon[domain.status] ?? 'help_outline'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{domain.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor[domain.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {domain.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteDomain(domain.id, domain.name); }}
                    className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 ml-2"
                  >
                    <span className="material-icons text-base">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Domain detail */}
        <div className="lg:col-span-3 space-y-4">
          {!selected ? (
            <div className="bg-card border border-border rounded-lg p-10 text-center">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">dns</span>
              <p className="text-sm text-muted-foreground">Select a domain to view DNS records and settings.</p>
            </div>
          ) : detailLoading ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground text-lg">{selected.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[selected.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {selected.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">ID: {selected.id}</p>
                  </div>
                  {selected.status !== 'verified' && (
                    <button
                      onClick={() => verifyDomain(selected.id)}
                      disabled={verifying}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <span className="material-icons text-base">{verifying ? 'hourglass_empty' : 'verified'}</span>
                      {verifying ? 'Checking…' : 'Verify Now'}
                    </button>
                  )}
                </div>
              </div>

              {/* DNS Records */}
              {selected.records && selected.records.length > 0 && (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">DNS Records</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Add these to your domain registrar, then click Verify Now.</p>
                    </div>
                    {selected.status !== 'verified' && (
                      <div className="flex items-center gap-1.5 text-xs text-yellow-600 bg-yellow-50 px-2.5 py-1.5 rounded-md">
                        <span className="material-icons text-sm">warning</span>
                        Pending DNS
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                          <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selected.records.map((record, i) => (
                          <tr key={i} className="hover:bg-accent/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{record.type}</span>
                              <p className="text-muted-foreground mt-0.5">{record.record}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-foreground break-all">{record.name}</code>
                                <button onClick={() => copyToClipboard(record.name)}
                                  className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title="Copy">
                                  <span className="material-icons text-sm">content_copy</span>
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-foreground break-all line-clamp-2">{record.value}</code>
                                <button onClick={() => copyToClipboard(record.value)}
                                  className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title="Copy">
                                  <span className="material-icons text-sm">content_copy</span>
                                </button>
                              </div>
                              {record.priority !== undefined && (
                                <p className="text-muted-foreground mt-0.5">Priority: {record.priority}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`material-icons text-base ${recordStatusColor[record.status] ?? 'text-muted-foreground'}`}
                                title={record.status}>
                                {record.status === 'verified' ? 'check_circle' : record.status === 'failed' ? 'cancel' : 'radio_button_unchecked'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3 bg-muted/20 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      DNS changes can take up to 72 hours to propagate. Click &quot;Verify Now&quot; after adding the records.
                    </p>
                  </div>
                </div>
              )}

              {/* Tracking Settings */}
              {selected.status === 'verified' && (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Tracking Settings</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Track opens and clicks. Pixel and link URLs will use your domain.
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {[
                      { key: 'openTracking' as const, label: 'Open Tracking', description: 'Track when recipients open your emails via a 1×1 pixel.' },
                      { key: 'clickTracking' as const, label: 'Click Tracking', description: 'Wrap links to track when recipients click them.' },
                    ].map(({ key, label, description }) => (
                      <div key={key} className="flex items-center justify-between px-5 py-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        </div>
                        <button
                          onClick={() => toggleTracking(selected.id, key, !selected[key])}
                          disabled={trackingSaving}
                          className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${selected[key] ? 'bg-primary' : 'bg-border'}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${selected[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions for unverified */}
              {selected.status !== 'verified' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-2">
                  <div className="flex items-center gap-2 text-blue-800">
                    <span className="material-icons text-base">info</span>
                    <p className="text-sm font-medium">Next steps</p>
                  </div>
                  <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                    <li>Copy each DNS record above and add it to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)</li>
                    <li>Wait for DNS to propagate — usually a few minutes, up to 72 hours</li>
                    <li>Click <strong>Verify Now</strong> to check if the records are live</li>
                    <li>Once verified, enable open/click tracking and set this domain as your From address in campaigns</li>
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
