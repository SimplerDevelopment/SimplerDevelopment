'use client';

import { useEffect, useState } from 'react';

interface ApiKey {
  id: number;
  name: string;
  keyPreview: string;
  scopes: string[];
  active: boolean;
  requireCmsApproval: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ScopeOption {
  value: string;
  label: string;
}

interface ScopeGroup {
  label: string;
  description?: string;
  scopes: ScopeOption[];
}

const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: 'Content',
    scopes: [
      { value: 'sites:read', label: 'Read websites & pages' },
      { value: 'sites:write', label: 'Write websites & pages' },
      { value: 'media:read', label: 'Read media library' },
      { value: 'media:write', label: 'Upload to media library' },
      { value: 'decks:read', label: 'Read pitch decks' },
      { value: 'decks:write', label: 'Write pitch decks' },
      { value: 'email:read', label: 'Read email campaigns' },
      { value: 'email:write', label: 'Write email campaigns' },
      { value: 'email:send', label: 'Send email campaigns' },
    ],
  },
  {
    label: 'Work management',
    scopes: [
      { value: 'projects:read', label: 'Read projects & cards' },
      { value: 'projects:write', label: 'Write projects & cards' },
      { value: 'tickets:read', label: 'Read support tickets' },
      { value: 'tickets:write', label: 'Write support tickets' },
    ],
  },
  {
    label: 'CRM & engagement',
    scopes: [
      { value: 'crm:read', label: 'Read contacts & deals' },
      { value: 'crm:write', label: 'Write contacts & deals' },
      { value: 'bookings:read', label: 'Read bookings' },
      { value: 'bookings:write', label: 'Write bookings' },
      { value: 'surveys:read', label: 'Read surveys' },
      { value: 'surveys:write', label: 'Write surveys' },
    ],
  },
  {
    label: 'Commerce',
    scopes: [
      { value: 'store:read', label: 'Read store (products, orders, customers)' },
      { value: 'store:write', label: 'Write store' },
      { value: 'services:read', label: 'Read services' },
      { value: 'services:write', label: 'Write services' },
    ],
  },
  {
    label: 'Configuration',
    scopes: [
      { value: 'branding:read', label: 'Read branding' },
      { value: 'branding:write', label: 'Write branding' },
      { value: 'team:read', label: 'Read team members' },
      { value: 'team:write', label: 'Invite & manage team' },
      { value: 'profile:read', label: 'Read my profile' },
      { value: 'profile:write', label: 'Update my profile' },
      { value: 'integrations:read', label: 'Read integrations (Google Workspace)' },
      { value: 'integrations:write', label: 'Disconnect integrations' },
      { value: 'automations:read', label: 'Read automations' },
      { value: 'automations:write', label: 'Write automations' },
      { value: 'billing:read', label: 'Read billing' },
      { value: 'ai:read', label: 'Read AI usage & features' },
    ],
  },
  {
    label: 'Approvals',
    description: 'Required to approve or reject staged changes created by other keys.',
    scopes: [
      { value: 'approvals:manage', label: 'Approve / reject staged changes' },
    ],
  },
];

interface McpApiKeysManagerProps {
  heading?: string | null;
  subheading?: string | null;
}

export default function McpApiKeysManager({
  heading = 'API Keys',
  subheading = 'Use these keys to authenticate the SimplerDevelopment MCP server. Connect from Claude Desktop, Claude Code, ChatGPT, or any MCP-compatible client to control your portal programmatically.',
}: McpApiKeysManagerProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [fullAccess, setFullAccess] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [requireCmsApproval, setRequireCmsApproval] = useState(false);
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
    const scopes = fullAccess ? ['*'] : selectedScopes;
    if (scopes.length === 0) { setError('Pick at least one scope'); return; }
    const res = await fetch('/api/portal/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scopes, requireCmsApproval }),
    });
    const json = await res.json();
    if (!json.success) { setError(json.message ?? 'Failed to create key'); return; }
    setNewKey(json.data.key);
    setName('');
    setFullAccess(true);
    setSelectedScopes([]);
    setRequireCmsApproval(false);
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
          {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
          {subheading && (
            <p className="text-sm text-muted-foreground mt-1">{subheading}</p>
          )}
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
        <div className="rounded-md border border-border p-4 space-y-4">
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
            <label className="block text-sm font-medium mb-2">Scopes</label>
            <label className="flex items-start gap-2 text-sm p-2 rounded border border-border bg-muted/30">
              <input
                type="checkbox"
                checked={fullAccess}
                onChange={e => setFullAccess(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <code className="text-xs px-1.5 py-0.5 bg-background border border-border rounded">*</code>
                  <span className="font-medium">Full access</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Grant every action across the portal. Uncheck to pick specific scopes.
                </p>
              </div>
            </label>

            {!fullAccess && (
              <div className="mt-3 space-y-4">
                {SCOPE_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      {group.label}
                    </div>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mb-2">{group.description}</p>
                    )}
                    <div className="space-y-1">
                      {group.scopes.map(opt => (
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
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">CMS approval</label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireCmsApproval}
                onChange={e => setRequireCmsApproval(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">Require approval for CMS writes</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Staged writes to posts, decks, proposals, and email campaigns will wait for an
                  admin to approve them before taking effect. Reads are unaffected.
                </p>
              </div>
            </label>
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
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 font-medium">Last used</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && keys.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No API keys yet</td></tr>
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
                <td className="px-3 py-2">
                  {k.requireCmsApproval ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded">
                      <span className="material-icons text-[14px] leading-none">verified_user</span>
                      Requires approval
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Direct</span>
                  )}
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
    </div>
  );
}
