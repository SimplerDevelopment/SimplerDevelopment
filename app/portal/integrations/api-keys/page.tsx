'use client';

/**
 * Portal → Integrations → API Keys
 *
 * Surface for managing per-client BYOK provider keys (Anthropic / OpenAI).
 * Raw keys never live in component state — the form posts directly to the
 * server, which encrypts and stores. The list view only ever sees the
 * redacted preview ("sk-ant-…AbC1").
 */

import { useEffect, useState } from 'react';

interface ByokKey {
  id: number;
  provider: 'anthropic' | 'openai';
  label: string | null;
  keyPreview: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROVIDERS: { value: 'anthropic' | 'openai'; label: string; placeholder: string; helper: string }[] = [
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-api03-…',
    helper: 'Generate at console.anthropic.com → Settings → API Keys.',
  },
  {
    value: 'openai',
    label: 'OpenAI (GPT + Embeddings)',
    placeholder: 'sk-proj-…',
    helper: 'Generate at platform.openai.com → API Keys. Used for chat AND brain embeddings.',
  },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function providerLabel(provider: string): string {
  return PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
}

export default function ByokKeysPage() {
  const [keys, setKeys] = useState<ByokKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/integrations/api-keys', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message ?? 'Failed to load keys');
      setKeys(json.data as ByokKey[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(formData: FormData) {
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const apiKey = String(formData.get('apiKey') ?? '').trim();
      const labelValue = String(formData.get('label') ?? '').trim();
      const providerValue = String(formData.get('provider') ?? '').trim();

      const res = await fetch('/api/portal/integrations/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerValue, apiKey, label: labelValue || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message ?? 'Failed to add key');
      setSuccess(`${providerLabel(providerValue)} key added.`);
      setLabel('');
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add key');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Remove this key? AI calls will fall back to platform credits (or be blocked on Starter).')) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/portal/integrations/api-keys/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message ?? 'Failed to delete key');
      setSuccess('Key removed.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key');
    }
  }

  async function handleRename(id: number, currentLabel: string | null) {
    const next = window.prompt('Label for this key (optional):', currentLabel ?? '');
    if (next === null) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/portal/integrations/api-keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: next.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message ?? 'Failed to update key');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update key');
    }
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <span className="material-icons">vpn_key</span>
          Provider API Keys (BYOK)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bring-your-own keys for Anthropic and OpenAI. When configured, the portal calls these providers
          directly with your key — usage and billing are between you and the provider. Without a key, AI
          falls back to bundled platform credits.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 flex items-start gap-2">
          <span className="material-icons text-base">error_outline</span>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-500/40 bg-green-500/5 p-3 text-sm text-green-700 flex items-start gap-2">
          <span className="material-icons text-base">check_circle</span>
          <span>{success}</span>
        </div>
      )}

      <section className="rounded-md border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-medium">Configured keys</h2>
          {!creating && (
            <button
              type="button"
              onClick={() => { setCreating(true); setSuccess(null); setError(null); }}
              className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90"
            >
              <span className="material-icons text-base">add</span>
              Add key
            </button>
          )}
        </div>

        {creating && (
          <form
            action={handleCreate}
            className="p-4 border-b border-border space-y-3 bg-muted/30"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Provider</span>
                <select
                  name="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'anthropic' | 'openai')}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Label (optional)</span>
                <input
                  name="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="prod, staging, etc."
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  maxLength={100}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">API key</span>
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                required
                placeholder={selectedProvider?.placeholder}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
              {selectedProvider && (
                <span className="text-xs text-muted-foreground mt-1 block">{selectedProvider.helper}</span>
              )}
            </label>
            <div className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="material-icons text-base">lock</span>
              <span>The raw key is encrypted on the server (AES-256-GCM) and never returned in API responses.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={adding}
                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                <span className="material-icons text-base">save</span>
                {adding ? 'Saving…' : 'Save key'}
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setError(null); }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No BYOK keys yet. AI calls use bundled platform credits.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Label</th>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-border">
                  <td className="px-4 py-2">{providerLabel(k.provider)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{k.label ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{k.keyPreview}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(k.lastUsedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleRename(k.id, k.label)}
                        title="Rename"
                        className="p-1 rounded hover:bg-muted"
                      >
                        <span className="material-icons text-base">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(k.id)}
                        title="Remove"
                        className="p-1 rounded hover:bg-red-500/10 text-red-700"
                      >
                        <span className="material-icons text-base">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-md border border-border p-4 space-y-2 text-sm">
        <h3 className="font-medium flex items-center gap-1">
          <span className="material-icons text-base">info</span>
          How BYOK billing works
        </h3>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>When a key is configured for a provider, all portal AI calls for that provider use it.</li>
          <li>Token usage is recorded on your provider invoice — not against platform AI credits.</li>
          <li>Brain embeddings reuse the OpenAI key. Add an OpenAI key to enable BYOK embeddings.</li>
          <li>Rotate by removing the old key and adding the new one. v1 keeps one active key per provider.</li>
        </ul>
      </section>
    </div>
  );
}
