'use client';

/**
 * Portal → Integrations → API Keys
 *
 * Surface for managing per-client BYOK provider keys (Anthropic / OpenAI).
 * Raw keys never live in component state — the form posts directly to the
 * server, which encrypts and stores. The list view only ever sees the
 * redacted preview ("sk-ant-…AbC1").
 *
 * Eligibility: BYOK is a Scale-tier feature. On mount we fetch
 * /api/portal/billing/byok-status and gate the add/edit UI on
 * data.byokEligible. Non-eligible clients see an upgrade prompt instead.
 * Fail-closed: while loading (byokEligible === null) we treat as ineligible.
 */

import { useEffect, useState } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pSectionTitle } from '@/components/portal/portal-ui';

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
  // null = still loading (fail-closed); true/false = resolved
  const [byokEligible, setByokEligible] = useState<boolean | null>(null);

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

  async function fetchByokStatus() {
    try {
      const res = await fetch('/api/portal/billing/byok-status', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success && typeof json.data?.byokEligible === 'boolean') {
        setByokEligible(json.data.byokEligible);
      } else {
        // Non-200 or unexpected shape → fail-closed
        setByokEligible(false);
      }
    } catch {
      setByokEligible(false);
    }
  }

  useEffect(() => {
    // Defer the initial loads to a microtask so the synchronous setState()
    // prefixes inside refresh()/fetchByokStatus() don't execute in the effect
    // body (satisfies react-hooks/set-state-in-effect — state is updated from
    // the async fetch results, not synchronously on mount).
    void Promise.resolve().then(() => Promise.all([refresh(), fetchByokStatus()]));
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
    if (!window.confirm('Remove this key? AI calls will fall back to platform credits.')) return;
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

  // Treat null (still loading) the same as false — fail-closed.
  const canManageKeys = byokEligible === true;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Integrations"
        title="Provider API Keys (BYOK)"
        subtitle="Bring-your-own keys for Anthropic and OpenAI. When configured, the portal calls these providers directly with your key — usage and billing are between you and the provider. Without a key, AI falls back to bundled platform credits."
      />

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 flex items-start gap-2">
          <span className="material-icons text-base">error_outline</span>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-3 text-sm text-green-700 flex items-start gap-2">
          <span className="material-icons text-base">check_circle</span>
          <span>{success}</span>
        </div>
      )}

      {/* Upgrade notice — shown when not eligible (including while loading) */}
      {!canManageKeys && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center text-center">
          <span className="material-icons text-5xl text-muted-foreground mb-3">workspace_premium</span>
          <h3 className="font-semibold text-foreground mb-1">Bring your own AI key is a Scale feature</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            On the Scale plan you connect your own Anthropic and OpenAI keys and pay providers directly
            at cost — token usage appears on your provider invoice, not against platform AI credits.
            Upgrade to Scale to unlock BYOK.
          </p>
          <a
            href="/portal/settings/billing/plans"
            className={`mt-4 ${pBtnPrimary}`}
          >
            <span className="material-icons text-base">workspace_premium</span>
            View plans
          </a>
        </div>
      )}

      <section className={pCard}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className={pSectionTitle}>Configured keys</h2>
          {/* Add key button only available on Scale */}
          {canManageKeys && !creating && (
            <button
              type="button"
              onClick={() => { setCreating(true); setSuccess(null); setError(null); }}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">add</span>
              Add key
            </button>
          )}
        </div>

        {canManageKeys && creating && (
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
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
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
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
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
                className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 font-mono"
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
                className={pBtnPrimary}
              >
                <span className="material-icons text-base">save</span>
                {adding ? 'Saving…' : 'Save key'}
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setError(null); }}
                className={pBtnGhost}
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
                      {/* Rename only available on Scale — hide for downgraded clients */}
                      {canManageKeys && (
                        <button
                          type="button"
                          onClick={() => handleRename(k.id, k.label)}
                          title="Rename"
                          className="p-1 rounded-lg hover:bg-muted"
                        >
                          <span className="material-icons text-base">edit</span>
                        </button>
                      )}
                      {/* Delete always available so downgraded clients can clean up */}
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

      <section className={`${pCard} p-5 space-y-2 text-sm`}>
        <h3 className={`${pSectionTitle} flex items-center gap-1 mb-1`}>
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
