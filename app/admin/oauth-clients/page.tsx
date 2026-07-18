'use client';

import { useEffect, useState } from 'react';

type AuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post';

interface OAuthClientRow {
  id: number;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: AuthMethod;
  clientSecretPreview: string | null;
  clientSecretCreatedAt: string | null;
  clientSecretRotatedAt: string | null;
  createdAt: string;
}

interface CreatedClient {
  client_id: string;
  client_secret: string;
  client_secret_preview: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: AuthMethod;
  created_at: string;
}

interface RotatedSecret {
  client_id: string;
  client_secret: string;
  client_secret_preview: string;
  client_secret_rotated_at: string;
}

function methodLabel(m: AuthMethod): string {
  if (m === 'none') return 'Public (PKCE)';
  if (m === 'client_secret_basic') return 'Confidential — Basic';
  return 'Confidential — Post';
}

export default function AdminOAuthClientsPage() {
  const [clients, setClients] = useState<OAuthClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    client_name: '',
    redirect_uris: '',
    token_endpoint_auth_method: 'client_secret_basic' as AuthMethod,
    client_uri: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdSecret, setCreatedSecret] = useState<CreatedClient | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<RotatedSecret | null>(null);

  async function load() {
    const res = await fetch('/api/admin/oauth-clients');
    const data = await res.json();
    if (data.success) setClients(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const redirectUris = form.redirect_uris
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);
    const res = await fetch('/api/admin/oauth-clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: form.client_name,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: form.token_endpoint_auth_method,
        client_uri: form.client_uri || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed'); return; }
    setCreatedSecret(data.data as CreatedClient);
    setShowForm(false);
    setForm({ client_name: '', redirect_uris: '', token_endpoint_auth_method: 'client_secret_basic', client_uri: '' });
    await load();
  }

  async function rotateSecret(row: OAuthClientRow) {
    if (!confirm(`Rotate secret for "${row.clientName}"? The old secret will stop working immediately.`)) return;
    const res = await fetch(`/api/admin/oauth-clients/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate_secret' }),
    });
    const data = await res.json();
    if (!data.success) { alert(data.message ?? 'Rotation failed'); return; }
    setRotatedSecret(data.data as RotatedSecret);
    await load();
  }

  async function deleteClient(row: OAuthClientRow) {
    if (!confirm(`Delete OAuth client "${row.clientName}"? All issued tokens will be invalidated.`)) return;
    const res = await fetch(`/api/admin/oauth-clients/${row.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) { alert(data.message ?? 'Delete failed'); return; }
    await load();
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">OAuth Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Issue and manage OAuth credentials for server-to-server integrations.
            Public PKCE clients (Claude Desktop, Cursor, etc.) register themselves
            via <code className="text-xs bg-muted px-1 py-0.5 rounded">/oauth/register</code> and don&apos;t appear here unless created manually.
          </p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <span className="material-icons text-sm align-middle mr-1">add</span>
          New confidential client
        </button>
      </div>

      {createdSecret && (
        <div className="rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="material-icons text-amber-600">warning</span>
            <div className="flex-1">
              <div className="font-semibold text-foreground">
                Copy the client_secret now — it will not be shown again
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                After you close this banner, only its SHA-256 hash remains. Use the rotate action if you lose it.
              </p>
            </div>
            <button
              onClick={() => setCreatedSecret(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <span className="material-icons text-sm">close</span>
            </button>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">client_id</dt>
            <dd className="font-mono flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded">{createdSecret.client_id}</code>
              <button onClick={() => copyToClipboard(createdSecret.client_id)} className="text-xs underline">Copy</button>
            </dd>
            <dt className="text-muted-foreground">client_secret</dt>
            <dd className="font-mono flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded break-all">{createdSecret.client_secret}</code>
              <button onClick={() => copyToClipboard(createdSecret.client_secret)} className="text-xs underline whitespace-nowrap">Copy</button>
            </dd>
          </dl>
        </div>
      )}

      {rotatedSecret && (
        <div className="rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="material-icons text-amber-600">warning</span>
            <div className="flex-1">
              <div className="font-semibold text-foreground">New client_secret — copy it now</div>
              <p className="text-xs text-muted-foreground mt-1">
                The previous secret is invalid as of {new Date(rotatedSecret.client_secret_rotated_at).toLocaleString()}.
              </p>
            </div>
            <button onClick={() => setRotatedSecret(null)} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-sm">close</span>
            </button>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">client_id</dt>
            <dd className="font-mono"><code className="bg-muted px-2 py-1 rounded">{rotatedSecret.client_id}</code></dd>
            <dt className="text-muted-foreground">client_secret</dt>
            <dd className="font-mono flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded break-all">{rotatedSecret.client_secret}</code>
              <button onClick={() => copyToClipboard(rotatedSecret.client_secret)} className="text-xs underline whitespace-nowrap">Copy</button>
            </dd>
          </dl>
        </div>
      )}

      {showForm && (
        <form onSubmit={createClient} className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client name</label>
            <input
              type="text"
              required
              value={form.client_name}
              onChange={e => setForm({ ...form, client_name: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. n8n production"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Redirect URIs</label>
            <textarea
              required
              rows={3}
              value={form.redirect_uris}
              onChange={e => setForm({ ...form, redirect_uris: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              placeholder="https://your-integration.example.com/oauth/callback"
            />
            <p className="text-xs text-muted-foreground mt-1">One per line. Must use https, http://localhost, or a native scheme.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Token endpoint auth method</label>
            <select
              value={form.token_endpoint_auth_method}
              onChange={e => setForm({ ...form, token_endpoint_auth_method: e.target.value as AuthMethod })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="client_secret_basic">client_secret_basic (Authorization: Basic)</option>
              <option value="client_secret_post">client_secret_post (request body)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Client URI (optional)</label>
            <input
              type="url"
              value={form.client_uri}
              onChange={e => setForm({ ...form, client_uri: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="https://your-integration.example.com"
            />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create client & reveal secret'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">client_id</th>
              <th className="px-4 py-2 font-medium">Auth method</th>
              <th className="px-4 py-2 font-medium">Secret</th>
              <th className="px-4 py-2 font-medium">Redirect URIs</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && clients.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No OAuth clients yet.</td></tr>
            )}
            {clients.map(c => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{c.clientName}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.clientId}</td>
                <td className="px-4 py-2 text-xs">{methodLabel(c.tokenEndpointAuthMethod)}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {c.clientSecretPreview ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-xs">
                  <ul className="space-y-0.5">
                    {c.redirectUris.map(u => <li key={u} className="font-mono break-all">{u}</li>)}
                  </ul>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {c.tokenEndpointAuthMethod !== 'none' && (
                      <button
                        onClick={() => rotateSecret(c)}
                        className="text-xs rounded border border-border px-2 py-1 hover:bg-muted"
                        title="Rotate client_secret"
                      >
                        Rotate
                      </button>
                    )}
                    <button
                      onClick={() => deleteClient(c)}
                      className="text-xs rounded border border-destructive text-destructive px-2 py-1 hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
