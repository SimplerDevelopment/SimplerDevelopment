'use client';

import { useEffect, useState } from 'react';

interface ApiKey {
  id: number;
  name: string;
  keyPreview: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const SCOPE_OPTIONS = [
  { value: '*', label: 'Full access (all portal actions)' },
  { value: 'projects:*', label: 'Projects (read + write)' },
  { value: 'tickets:*', label: 'Tickets (read + write)' },
  { value: 'crm:*', label: 'CRM (read + write)' },
  { value: 'email:*', label: 'Email campaigns' },
  { value: 'sites:*', label: 'Websites & pages' },
  { value: 'media:*', label: 'Media library' },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['*']);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/portal/api-keys');
    const json = await res.json();
    if (json.success) setKeys(json.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setError(null);
    if (!name.trim()) { setError('Name required'); return; }
    const res = await fetch('/api/portal/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scopes: selectedScopes }),
    });
    const json = await res.json();
    if (!json.success) { setError(json.message ?? 'Failed to create key'); return; }
    setNewKey(json.data.key);
    setName('');
    setSelectedScopes(['*']);
    setShowCreate(false);
    load();
  }

  async function handleRevoke(id: number) {
    if (!confirm('Revoke this API key? Clients using it will lose access immediately.')) return;
    await fetch(`/api/portal/api-keys?id=${id}`, { method: 'DELETE' });
    load();
  }

  function toggleScope(scope: string) {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Use these keys to authenticate the SimplerDevelopment MCP server. Connect from Claude
            Desktop, Claude Code, or any MCP-compatible client to control your portal programmatically.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(v => !v); setNewKey(null); setError(null); }}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
        >
          <span className="material-icons text-base">add</span>
          New key
        </button>
      </div>

      {newKey && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <span className="material-icons text-base">warning</span>
            Save this key now — it won&apos;t be shown again
          </div>
          <code className="block w-full p-2 bg-background border border-border rounded text-xs break-all">
            {newKey}
          </code>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
            >
              Copy
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
            >
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Claude Desktop – personal"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Scopes</label>
            <div className="space-y-1">
              {SCOPE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(opt.value)}
                    onChange={() => toggleScope(opt.value)}
                  />
                  <code className="text-xs px-1.5 py-0.5 bg-muted rounded">{opt.value}</code>
                  <span className="text-muted-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
            >
              Generate key
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 border border-border rounded-md text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Scopes</th>
              <th className="px-3 py-2 font-medium">Last used</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && keys.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No API keys yet</td></tr>
            )}
            {keys.map(k => (
              <tr key={k.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{k.name}</td>
                <td className="px-3 py-2"><code className="text-xs">{k.keyPreview}</code></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map(s => (
                      <code key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded">{s}</code>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-3 py-2">
                  {k.revokedAt ? (
                    <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded">Revoked</span>
                  ) : k.active ? (
                    <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">Active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-muted rounded">Inactive</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {k.active && !k.revokedAt && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border p-4 space-y-2 text-sm">
        <h3 className="font-medium">Connect to Claude</h3>
        <p className="text-muted-foreground">MCP endpoint:</p>
        <code className="block p-2 bg-muted rounded text-xs break-all">
          {typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp'}
        </code>
        <p className="text-muted-foreground mt-2">
          Send your API key in the <code className="text-xs">Authorization: Bearer sd_mcp_…</code> header.
          See the <a href="/docs/mcp" className="text-primary underline">docs</a> for setup instructions.
        </p>
      </div>
    </div>
  );
}
