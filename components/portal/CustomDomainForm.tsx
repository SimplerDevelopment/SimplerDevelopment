'use client';

import { useState } from 'react';

interface DnsInstruction {
  type: string;
  host: string;
  value: string;
  notes: string;
}

export default function CustomDomainForm({ siteId, currentDomain }: { siteId: number; currentDomain?: string | null }) {
  const [domain, setDomain] = useState(currentDomain || '');
  const [saving, setSaving] = useState(false);
  const [dnsInstructions, setDnsInstructions] = useState<DnsInstruction[] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async () => {
    if (!domain) return;
    setSaving(true);
    setError('');
    setSuccess('');
    setDnsInstructions(null);

    try {
      const res = await fetch(`/api/portal/websites/${siteId}/domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customDomain: domain }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Domain ${json.data.domain} added to your project.`);
        setDnsInstructions(json.data.dnsInstructions);
      } else {
        setError(json.message || 'Failed to add domain.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="material-icons text-muted-foreground text-lg">public</span>
        <h3 className="font-semibold text-sm text-foreground">Custom Domain</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Connect your own domain to this website. You&apos;ll need to update your DNS records.
      </p>
      <div className="flex gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg flex-1 focus-within:border-primary transition-colors">
          <span className="material-icons text-muted-foreground text-base">language</span>
          <input
            value={domain}
            onChange={e => setDomain(e.target.value.replace(/^https?:\/\//, ''))}
            placeholder="yoursite.com"
            className="bg-transparent outline-none flex-1 text-sm text-foreground font-mono"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || !domain}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Adding...' : 'Add Domain'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {dnsInstructions && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">DNS Records to Add</p>
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
                {dnsInstructions.map((record, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">{record.type}</td>
                    <td className="px-3 py-2 font-mono text-xs">{record.host}</td>
                    <td className="px-3 py-2 font-mono text-xs">{record.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Add these records at your domain registrar. DNS changes may take up to 48 hours to propagate.
          </p>
        </div>
      )}
    </div>
  );
}
