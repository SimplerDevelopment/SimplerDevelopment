'use client';

import { useState } from 'react';

interface DomainRecord {
  id: number;
  domain: string;
  isPrimary: boolean;
  status: string;
  verifiedAt: Date | string | null;
}

interface DnsRecord {
  type: string;
  host: string;
  value: string;
}

interface VerifyResult {
  verified: boolean;
  misconfigured: boolean;
  dnsRecords: DnsRecord[];
}

export default function CustomDomainForm({
  siteId,
  initialDomains,
}: {
  siteId: number;
  initialDomains: DomainRecord[];
}) {
  const [domains, setDomains] = useState<DomainRecord[]>(initialDomains);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verifying, setVerifying] = useState<Record<number, boolean>>({});
  const [verifyResults, setVerifyResults] = useState<Record<number, VerifyResult>>({});
  const [removing, setRemoving] = useState<Record<number, boolean>>({});
  const [showDns, setShowDns] = useState<Record<number, boolean>>({});

  const refreshDomains = async () => {
    const res = await fetch(`/api/portal/websites/${siteId}/domains`);
    const json = await res.json();
    if (json.success) setDomains(json.data);
  };

  const handleAddDomain = async () => {
    if (!newDomain) return;
    setAdding(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/portal/websites/${siteId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Domain ${json.data.domain} added.`);
        setNewDomain('');
        await refreshDomains();
        // Auto-show DNS records for the new domain
        setShowDns(prev => ({ ...prev, [json.data.id]: true }));
      } else {
        setError(json.message || 'Failed to add domain.');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domainId: number) => {
    setRemoving(prev => ({ ...prev, [domainId]: true }));
    setError('');

    try {
      const res = await fetch(`/api/portal/websites/${siteId}/domains/${domainId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDomains(prev => prev.filter(d => d.id !== domainId));
        setSuccess('Domain removed.');
      } else {
        setError(json.message);
      }
    } finally {
      setRemoving(prev => ({ ...prev, [domainId]: false }));
    }
  };

  const handleVerify = async (domainId: number) => {
    setVerifying(prev => ({ ...prev, [domainId]: true }));
    setError('');

    try {
      const res = await fetch(`/api/portal/websites/${siteId}/domains/${domainId}/verify`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setVerifyResults(prev => ({ ...prev, [domainId]: json.data }));
        if (json.data.verified && !json.data.misconfigured) {
          await refreshDomains();
        }
      } else {
        setError(json.message);
      }
    } finally {
      setVerifying(prev => ({ ...prev, [domainId]: false }));
    }
  };

  const handleSetPrimary = async (domainId: number) => {
    const res = await fetch(`/api/portal/websites/${siteId}/domains/${domainId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPrimary: true }),
    });
    const json = await res.json();
    if (json.success) await refreshDomains();
    else setError(json.message);
  };

  const DNS_RECORDS: DnsRecord[] = [
    { type: 'A', host: '@', value: '76.76.21.21' },
    { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com' },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <span className="material-icons text-muted-foreground text-lg">public</span>
        <h3 className="font-semibold text-sm text-foreground">Custom Domains</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Connect custom domains to this website. You&apos;ll need to update DNS records at your registrar.
      </p>

      {/* Add Domain */}
      <div className="flex gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg flex-1 focus-within:border-primary transition-colors">
          <span className="material-icons text-muted-foreground text-base">language</span>
          <input
            value={newDomain}
            onChange={e => setNewDomain(e.target.value.replace(/^https?:\/\//, ''))}
            placeholder="yoursite.com"
            className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
            onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
          />
        </div>
        <button
          onClick={handleAddDomain}
          disabled={adding || !newDomain}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {adding ? 'Adding...' : 'Add Domain'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* Domain List */}
      {domains.length > 0 ? (
        <div className="space-y-3">
          {domains.map(d => (
            <div key={d.id} className="bg-background border border-border rounded-lg p-4 space-y-3">
              {/* Domain header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sm font-medium text-foreground truncate">{d.domain}</span>
                  {d.isPrimary && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary rounded">
                      Primary
                    </span>
                  )}
                  {d.status === 'verified' ? (
                    <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                      <span className="material-icons text-[10px]">check</span>
                      Verified
                    </span>
                  ) : (
                    <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                      <span className="material-icons text-[10px]">schedule</span>
                      Pending
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!d.isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(d.id)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Set as primary"
                    >
                      <span className="material-icons text-base">star_outline</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(d.id)}
                    disabled={removing[d.id]}
                    className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Remove domain"
                  >
                    <span className="material-icons text-base">
                      {removing[d.id] ? 'hourglass_empty' : 'delete_outline'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleVerify(d.id)}
                  disabled={verifying[d.id]}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <span className={`material-icons text-sm ${verifying[d.id] ? 'animate-spin' : ''}`}>
                    {verifying[d.id] ? 'refresh' : 'verified'}
                  </span>
                  {verifying[d.id] ? 'Checking...' : 'Verify DNS'}
                </button>
                <button
                  onClick={() => setShowDns(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <span className="material-icons text-sm">dns</span>
                  {showDns[d.id] ? 'Hide' : 'Show'} DNS Records
                </button>
              </div>

              {/* DNS Records */}
              {showDns[d.id] && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Add these records at your domain registrar
                  </p>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Host</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {DNS_RECORDS.map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.host}</td>
                            <td className="px-3 py-2 font-mono text-xs break-all">{r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    DNS changes may take up to 48 hours to propagate.
                  </p>
                </div>
              )}

              {/* Verify results */}
              {verifyResults[d.id] && (
                <div className="space-y-2">
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${
                    verifyResults[d.id].verified && !verifyResults[d.id].misconfigured ? 'text-green-600' : 'text-amber-600'
                  }`}>
                    <span className="material-icons text-sm">
                      {verifyResults[d.id].verified && !verifyResults[d.id].misconfigured ? 'check_circle' : 'warning'}
                    </span>
                    {verifyResults[d.id].verified && !verifyResults[d.id].misconfigured
                      ? 'DNS verified and working'
                      : 'DNS not yet verified — check your records above'}
                  </div>
                  {verifyResults[d.id].dnsRecords.length > 0 && !verifyResults[d.id].verified && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current DNS Records Detected</p>
                      <div className="border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Host</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {verifyResults[d.id].dnsRecords.map((r, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                                <td className="px-3 py-2 font-mono text-xs">{r.host}</td>
                                <td className="px-3 py-2 font-mono text-xs break-all">{r.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">
          No custom domains configured. Add one above.
        </p>
      )}
    </div>
  );
}
