'use client';

/**
 * WebhooksPanel — manage per-survey outbound webhooks (HOOK-01).
 *
 * List + create form + per-row inline edit. Reads delivery rows on demand and
 * surfaces the most recent attempt's status badge so a misconfigured endpoint
 * is visible without leaving the page.
 *
 * Phase 4 (HOOK-02) will swap the dispatcher to BullMQ; this UI is unaffected.
 */

import { useCallback, useEffect, useState } from 'react';

interface SurveyWebhook {
  id: number;
  surveyId: number;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  lastFiredAt: string | null;
  lastStatus: number | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Delivery {
  id: number;
  webhookId: number;
  event: string;
  attempt: number;
  status: 'success' | 'failed' | 'pending';
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  createdAt: string;
}

const ALL_EVENTS = [
  { key: 'response.submitted', label: 'Response submitted' },
] as const;

interface Props {
  surveyId: string;
}

export default function WebhooksPanel({ surveyId }: Props) {
  const [hooks, setHooks] = useState<SurveyWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedSecret, setSavedSecret] = useState<{ id: number; secret: string } | null>(null);

  // New-hook form state
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>(['response.submitted']);
  const [creating, setCreating] = useState(false);

  // Per-row delivery panel
  const [openDeliveriesFor, setOpenDeliveriesFor] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/webhooks`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load webhooks');
      setHooks(json.data as SurveyWebhook[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createWebhook() {
    if (!newUrl.trim()) {
      setError('URL is required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents, enabled: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create webhook');
      const created = json.data as SurveyWebhook;
      // Show the secret once on creation — subsequent reads redact it.
      if (created.secret) setSavedSecret({ id: created.id, secret: created.secret });
      setNewUrl('');
      setNewEvents(['response.submitted']);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(hook: SurveyWebhook) {
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/webhooks/${hook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !hook.enabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to update webhook');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteWebhook(hook: SurveyWebhook) {
    if (!confirm(`Delete webhook for ${hook.url}? This also clears its delivery history.`)) return;
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/webhooks/${hook.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to delete webhook');
      if (openDeliveriesFor === hook.id) setOpenDeliveriesFor(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadDeliveries(hookId: number) {
    if (openDeliveriesFor === hookId) {
      setOpenDeliveriesFor(null);
      setDeliveries([]);
      return;
    }
    setDeliveriesLoading(true);
    setOpenDeliveriesFor(hookId);
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/webhooks/${hookId}/deliveries?limit=20`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load deliveries');
      setDeliveries(json.data as Delivery[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeliveries([]);
    } finally {
      setDeliveriesLoading(false);
    }
  }

  function lastDeliveryBadge(hook: SurveyWebhook) {
    if (!hook.lastFiredAt) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span className="material-icons text-sm">schedule</span>
          Never fired
        </span>
      );
    }
    const success = hook.lastStatus !== null && hook.lastStatus >= 200 && hook.lastStatus < 300;
    const cls = success
      ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
      : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20';
    const icon = success ? 'check_circle' : 'error';
    const label = hook.lastStatus !== null ? `HTTP ${hook.lastStatus}` : 'No response';
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cls}`}>
        <span className="material-icons text-sm">{icon}</span>
        {label}
      </span>
    );
  }

  function toggleEventInForm(key: string) {
    setNewEvents((prev) => prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]);
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="material-icons text-primary mt-0.5">webhook</span>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Webhooks</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Receive HMAC-signed POST requests when responses are submitted. Failures retry 3 times
              with backoff (1s, 4s, 16s). The signature header is{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">X-SD-Signature: sha256=…</code>.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <span className="material-icons text-lg">error</span>
            {error}
            <button onClick={() => setError('')} className="ml-auto">
              <span className="material-icons text-lg">close</span>
            </button>
          </div>
        )}

        {savedSecret && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-300 space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <span className="material-icons text-lg">key</span>
              Save this secret — it will not be shown again
            </div>
            <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 p-2 rounded break-all font-mono">
              {savedSecret.secret}
            </code>
            <button
              type="button"
              onClick={() => setSavedSecret(null)}
              className="text-xs underline"
            >
              I&apos;ve saved it
            </button>
          </div>
        )}

        {/* Create form */}
        <div className="space-y-3 pt-2 border-t border-border">
          <label className="block text-sm font-medium text-foreground">Add a webhook</label>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/webhooks/survey"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap gap-3">
            {ALL_EVENTS.map((evt) => (
              <label key={evt.key} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newEvents.includes(evt.key)}
                  onChange={() => toggleEventInForm(evt.key)}
                />
                {evt.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={createWebhook}
            disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-icons text-base">add</span>
            {creating ? 'Adding…' : 'Add webhook'}
          </button>
        </div>
      </div>

      {/* Existing hooks */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {loading && (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <span className="material-icons animate-spin text-base">progress_activity</span>
            Loading…
          </div>
        )}
        {!loading && hooks.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No webhooks configured yet.</div>
        )}
        {!loading && hooks.map((h) => (
          <div key={h.id} className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className={`material-icons text-base mt-0.5 ${h.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                {h.enabled ? 'sensors' : 'sensors_off'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground break-all">{h.url}</div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {(h.events ?? []).map((e) => (
                    <span key={e} className="px-2 py-0.5 rounded bg-muted">{e}</span>
                  ))}
                  {lastDeliveryBadge(h)}
                  {h.failureCount > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                      {h.failureCount} consecutive failure{h.failureCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => loadDeliveries(h.id)}
                  className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                  title="Recent deliveries"
                >
                  <span className="material-icons text-base">history</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleEnabled(h)}
                  className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                  title={h.enabled ? 'Disable' : 'Enable'}
                >
                  <span className="material-icons text-base">{h.enabled ? 'pause' : 'play_arrow'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteWebhook(h)}
                  className="px-2 py-1 text-xs rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                  title="Delete"
                >
                  <span className="material-icons text-base">delete</span>
                </button>
              </div>
            </div>

            {openDeliveriesFor === h.id && (
              <div className="mt-3 ml-7 border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b border-border">
                  Recent deliveries
                </div>
                {deliveriesLoading && (
                  <div className="p-3 text-xs text-muted-foreground">Loading…</div>
                )}
                {!deliveriesLoading && deliveries.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">No deliveries recorded yet.</div>
                )}
                {!deliveriesLoading && deliveries.map((d) => {
                  const ok = d.status === 'success';
                  return (
                    <div key={d.id} className="px-3 py-2 text-xs flex items-center gap-2 border-b border-border last:border-b-0">
                      <span className={`material-icons text-sm ${ok ? 'text-green-600' : 'text-red-600'}`}>
                        {ok ? 'check_circle' : 'error'}
                      </span>
                      <span className="font-mono">{new Date(d.createdAt).toLocaleString()}</span>
                      <span className="text-muted-foreground">attempt {d.attempt}</span>
                      <span className="text-muted-foreground">{d.event}</span>
                      <span className="ml-auto font-mono">
                        {d.statusCode !== null ? `HTTP ${d.statusCode}` : (d.error ?? '—')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
