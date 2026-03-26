'use client';

import { useState, useEffect, useCallback } from 'react';

interface DomainRecord {
  id: number;
  domain: string;
  isPrimary: boolean;
  status: string;
  dnsProvider: string | null;
  dnsConfigured: boolean;
  dnsConfiguredAt: Date | string | null;
  verifiedAt: Date | string | null;
}

interface DnsInstruction {
  type: string;
  host: string;
  value: string;
  notes?: string;
}

interface ProviderInfo {
  id: number;
  provider: string;
}

interface VerifyResult {
  domain: string;
  verified: boolean;
  misconfigured: boolean;
  dnsRecords: DnsInstruction[];
  status: string;
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

  // Per-domain state
  const [verifying, setVerifying] = useState<Record<number, boolean>>({});
  const [verifyResults, setVerifyResults] = useState<Record<number, VerifyResult>>({});
  const [configuring, setConfiguring] = useState<Record<number, boolean>>({});
  const [removing, setRemoving] = useState<Record<number, boolean>>({});
  const [dnsInstructions, setDnsInstructions] = useState<DnsInstruction[] | null>(null);

  // Provider state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [showProviderSetup, setShowProviderSetup] = useState(false);
  const [providerForm, setProviderForm] = useState({ provider: 'godaddy' as 'godaddy' | 'cloudflare', apiKey: '', apiSecret: '' });
  const [savingProvider, setSavingProvider] = useState(false);

  const hasGoDaddy = providers.some(p => p.provider === 'godaddy');
  const hasCloudflare = providers.some(p => p.provider === 'cloudflare');

  const loadProviders = useCallback(async () => {
    const res = await fetch('/api/portal/dns-providers');
    const json = await res.json();
    if (json.success) setProviders(json.data);
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

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
    setDnsInstructions(null);

    try {
      const res = await fetch(`/api/portal/websites/${siteId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Domain ${json.data.domain} added.`);
        setDnsInstructions(json.data.dnsInstructions);
        setNewDomain('');
        await refreshDomains();
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

  const handleAutoConfigure = async (domainId: number, provider: string) => {
    setConfiguring(prev => ({ ...prev, [domainId]: true }));
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/portal/websites/${siteId}/domains/${domainId}/auto-configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(json.message);
        await refreshDomains();
      } else if (json.code === 'NO_CREDENTIALS') {
        setShowProviderSetup(true);
        setProviderForm(prev => ({ ...prev, provider: provider as 'godaddy' | 'cloudflare' }));
        setError(json.message);
      } else {
        setError(json.message);
      }
    } finally {
      setConfiguring(prev => ({ ...prev, [domainId]: false }));
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

  const handleSaveProvider = async () => {
    setSavingProvider(true);
    setError('');

    try {
      const res = await fetch('/api/portal/dns-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerForm),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(json.message);
        setShowProviderSetup(false);
        setProviderForm({ provider: 'godaddy', apiKey: '', apiSecret: '' });
        await loadProviders();
      } else {
        setError(json.message);
      }
    } finally {
      setSavingProvider(false);
    }
  };

  const handleRemoveProvider = async (provider: string) => {
    const res = await fetch(`/api/portal/dns-providers?provider=${provider}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setSuccess('Provider removed.');
      await loadProviders();
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-icons text-muted-foreground text-lg">public</span>
          <h3 className="font-semibold text-sm text-foreground">Custom Domains</h3>
        </div>
        <button
          onClick={() => setShowProviderSetup(!showProviderSetup)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
        >
          <span className="material-icons text-sm">key</span>
          DNS Providers
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Connect custom domains to this website. Add your DNS provider API keys for 1-click configuration, or manually update DNS records.
      </p>

      {/* DNS Provider Setup */}
      {showProviderSetup && (
        <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">DNS Provider API Keys</h4>
            <button onClick={() => setShowProviderSetup(false)} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>

          {/* Connected providers */}
          {providers.length > 0 && (
            <div className="space-y-2">
              {providers.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="material-icons text-green-600 text-base">check_circle</span>
                    <span className="text-sm font-medium">{p.provider === 'godaddy' ? 'GoDaddy' : 'Cloudflare'}</span>
                    <span className="text-xs text-muted-foreground">Connected</span>
                  </div>
                  <button
                    onClick={() => handleRemoveProvider(p.provider)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add provider form */}
          {(!hasGoDaddy || !hasCloudflare) && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {!hasGoDaddy && (
                  <button
                    onClick={() => setProviderForm(p => ({ ...p, provider: 'godaddy' }))}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      providerForm.provider === 'godaddy'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    GoDaddy
                  </button>
                )}
                {!hasCloudflare && (
                  <button
                    onClick={() => setProviderForm(p => ({ ...p, provider: 'cloudflare' }))}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      providerForm.provider === 'cloudflare'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Cloudflare
                  </button>
                )}
              </div>

              <input
                value={providerForm.apiKey}
                onChange={e => setProviderForm(p => ({ ...p, apiKey: e.target.value }))}
                placeholder={providerForm.provider === 'godaddy' ? 'GoDaddy API Key' : 'Cloudflare API Token'}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono outline-none focus:border-primary transition-colors"
              />

              {providerForm.provider === 'godaddy' && (
                <input
                  value={providerForm.apiSecret}
                  onChange={e => setProviderForm(p => ({ ...p, apiSecret: e.target.value }))}
                  placeholder="GoDaddy API Secret"
                  type="password"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono outline-none focus:border-primary transition-colors"
                />
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {providerForm.provider === 'godaddy'
                    ? 'Get your API key at developer.godaddy.com'
                    : 'Create a token at dash.cloudflare.com with DNS edit permissions'}
                </p>
                <button
                  onClick={handleSaveProvider}
                  disabled={savingProvider || !providerForm.apiKey || (providerForm.provider === 'godaddy' && !providerForm.apiSecret)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingProvider ? 'Verifying...' : 'Connect'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Domain Input */}
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

      {/* Messages */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* DNS Instructions (shown after adding a domain) */}
      {dnsInstructions && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">DNS Records to Add</p>
          <DnsTable records={dnsInstructions} />
          <p className="text-xs text-muted-foreground">
            Add these records at your domain registrar, or use the 1-click buttons below. DNS changes may take up to 48 hours to propagate.
          </p>
        </div>
      )}

      {/* Domain List */}
      {domains.length > 0 && (
        <div className="space-y-3">
          {domains.map(d => (
            <div key={d.id} className="bg-background border border-border rounded-lg p-4 space-y-3">
              {/* Domain header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{d.domain}</span>
                  {d.isPrimary && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary rounded">
                      Primary
                    </span>
                  )}
                  <StatusBadge status={d.status} dnsConfigured={d.dnsConfigured} />
                </div>
                <div className="flex items-center gap-1">
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

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Verify */}
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

                {/* 1-Click GoDaddy */}
                {hasGoDaddy && d.status !== 'verified' && (
                  <button
                    onClick={() => handleAutoConfigure(d.id, 'godaddy')}
                    disabled={configuring[d.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1b1b1b] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">{configuring[d.id] ? 'hourglass_empty' : 'bolt'}</span>
                    {configuring[d.id] ? 'Configuring...' : '1-Click GoDaddy'}
                  </button>
                )}

                {/* 1-Click Cloudflare */}
                {hasCloudflare && d.status !== 'verified' && (
                  <button
                    onClick={() => handleAutoConfigure(d.id, 'cloudflare')}
                    disabled={configuring[d.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f38020] text-white rounded-lg text-xs font-medium hover:bg-[#e07018] transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">{configuring[d.id] ? 'hourglass_empty' : 'bolt'}</span>
                    {configuring[d.id] ? 'Configuring...' : '1-Click Cloudflare'}
                  </button>
                )}

                {/* Show provider setup if no providers connected */}
                {!hasGoDaddy && !hasCloudflare && d.status !== 'verified' && (
                  <button
                    onClick={() => setShowProviderSetup(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <span className="material-icons text-sm">add</span>
                    Connect DNS Provider for 1-Click Setup
                  </button>
                )}
              </div>

              {/* DNS configured indicator */}
              {d.dnsConfigured && d.dnsProvider && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="material-icons text-sm text-green-600">dns</span>
                  DNS configured via {d.dnsProvider === 'godaddy' ? 'GoDaddy' : 'Cloudflare'}
                  {d.dnsConfiguredAt && ` on ${new Date(d.dnsConfiguredAt).toLocaleDateString()}`}
                </p>
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
                      : 'DNS not yet verified'}
                  </div>
                  {verifyResults[d.id].dnsRecords.length > 0 && !verifyResults[d.id].verified && (
                    <DnsTable records={verifyResults[d.id].dnsRecords} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {domains.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No custom domains configured. Add one above.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status, dnsConfigured }: { status: string; dnsConfigured: boolean }) {
  if (status === 'verified') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
        <span className="material-icons text-[10px]">check</span>
        Verified
      </span>
    );
  }
  if (dnsConfigured) {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
        <span className="material-icons text-[10px]">dns</span>
        DNS Set
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
      <span className="material-icons text-[10px]">schedule</span>
      Pending
    </span>
  );
}

function DnsTable({ records }: { records: Array<{ type: string; host: string; value: string }> }) {
  return (
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
          {records.map((record, i) => (
            <tr key={i}>
              <td className="px-3 py-2 font-mono text-xs">{record.type}</td>
              <td className="px-3 py-2 font-mono text-xs">{record.host}</td>
              <td className="px-3 py-2 font-mono text-xs break-all">{record.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
