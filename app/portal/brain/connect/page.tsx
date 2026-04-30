'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

const BRAIN_SCOPES = ['brain:read', 'brain:write', 'brain:approve'] as const;
const MCP_ROUTE_PATH = '/api/mcp';

function hasBrainScope(key: ApiKey): boolean {
  if (!key.active || key.revokedAt) return false;
  if (key.scopes.includes('*')) return true;
  if (key.scopes.includes('brain:*')) return true;
  return BRAIN_SCOPES.some((s) => key.scopes.includes(s));
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function BrainConnectPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; message: string }
    | { ok: false; message: string }
    | null
  >(null);

  const [origin, setOrigin] = useState<string>('https://app.simplerdevelopment.com');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const load = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const r = await fetch('/api/portal/api-keys');
      const json = await r.json();
      if (json.success) setKeys(json.data as ApiKey[]);
    } catch {
      /* network — surface via empty state */
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const brainKeys = useMemo(() => keys.filter(hasBrainScope), [keys]);
  const isConnected = brainKeys.length > 0;

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setNewKey(null);
    setCopiedKey(false);
    try {
      const stamp = new Date().toLocaleDateString();
      const r = await fetch('/api/portal/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Claude Desktop – Brain (${stamp})`,
          scopes: [...BRAIN_SCOPES],
          requireCmsApproval: false,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setGenerateError(json.message ?? 'Failed to generate key.');
        return;
      }
      setNewKey(json.data.key as string);
      await load();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/portal/brain/search?q=test');
      const json = await r.json().catch(() => ({}));
      if (r.ok && json?.success) {
        setTestResult({
          ok: true,
          message: 'Brain is reachable from this browser session.',
        });
      } else {
        setTestResult({
          ok: false,
          message: json?.message ?? `Request failed (${r.status})`,
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setTesting(false);
    }
  }

  const claudeConfig = useMemo(() => {
    const endpoint = `${origin}${MCP_ROUTE_PATH}`;
    return JSON.stringify(
      {
        mcpServers: {
          'simplerdevelopment-brain': {
            command: 'npx',
            args: [
              '-y',
              'mcp-remote',
              endpoint,
              '--header',
              'Authorization:Bearer YOUR_KEY',
            ],
          },
        },
      },
      null,
      2,
    );
  }, [origin]);

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(claudeConfig);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/portal/brain" className="hover:underline">
            Brain
          </Link>
          <span className="material-icons text-base">chevron_right</span>
          <span>Connect Claude Desktop</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Connect Claude Desktop to Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate an API key, paste a one-line config into Claude Desktop, and your Brain&apos;s
          knowledge, meetings, tasks, and CRM become available as MCP tools.
        </p>
      </div>

      {/* Section A — Status */}
      <section className="rounded-md border border-border p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="material-icons text-base">power</span>
              Connection status
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Brain is connected as soon as you have at least one active API key with brain scopes.
            </p>
          </div>
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-700 dark:text-green-400">
              <span className="material-icons text-base">check_circle</span>
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
              <span className="material-icons text-base">cancel</span>
              Not connected
            </span>
          )}
        </div>

        {loadingKeys ? (
          <p className="text-sm text-muted-foreground">Loading keys…</p>
        ) : brainKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No API keys with brain scopes yet. Generate one below to get started.
          </p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Scopes</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {brainKeys.map((k) => (
                  <tr key={k.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{k.name}</td>
                    <td className="px-3 py-2">
                      <code className="text-xs">{k.keyPreview}</code>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <code key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded">
                            {s}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(k.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Manage all keys (including non-brain ones) in{' '}
          <Link href="/portal/settings/api-keys" className="text-primary underline">
            Settings &raquo; API Keys
          </Link>
          .
        </p>
      </section>

      {/* Section B — Generate key */}
      <section className="rounded-md border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-base">vpn_key</span>
            Generate API key
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Creates a new portal API key with{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">brain:read</code>,{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">brain:write</code>, and{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">brain:approve</code> scopes —
            exactly what Claude Desktop needs to use the Brain MCP server.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          <span className="material-icons text-base">
            {generating ? 'hourglass_top' : 'add'}
          </span>
          {generating ? 'Generating…' : 'Generate API key for Claude Desktop'}
        </button>

        {generateError && (
          <p className="text-sm text-destructive">{generateError}</p>
        )}

        {newKey && (
          <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
              <span className="material-icons text-base">warning</span>
              Save this key now — you won&apos;t see it again
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
              For security we only show the full key on creation. Subsequent visits will show only
              the last-4 preview. If you lose it, just generate a new one and revoke the old key in{' '}
              <Link href="/portal/settings/api-keys" className="underline">
                Settings &raquo; API Keys
              </Link>
              .
            </p>
            <code className="block w-full p-2 bg-background border border-border rounded text-xs break-all font-mono">
              {newKey}
            </code>
            <div className="flex gap-2">
              <button
                onClick={copyKey}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-muted"
              >
                <span className="material-icons text-sm">
                  {copiedKey ? 'check' : 'content_copy'}
                </span>
                {copiedKey ? 'Copied' : 'Copy key'}
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
      </section>

      {/* Section C — Claude Desktop config */}
      <section className="rounded-md border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-base">settings</span>
            Claude Desktop config
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste this into{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">
              ~/.claude/claude_desktop_config.json
            </code>
            . Replace{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">YOUR_KEY</code> with the API key
            you generated above.
          </p>
        </div>

        <div className="relative">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 text-xs font-mono leading-relaxed">
            {claudeConfig}
          </pre>
          <button
            onClick={copyConfig}
            className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs px-2 py-1 bg-background border border-border rounded hover:bg-muted"
          >
            <span className="material-icons text-sm">
              {copiedConfig ? 'check' : 'content_copy'}
            </span>
            {copiedConfig ? 'Copied' : 'Copy'}
          </button>
        </div>

        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>
            Paste the JSON above into{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">
              ~/.claude/claude_desktop_config.json
            </code>{' '}
            (create the file if it doesn&apos;t exist) and replace{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">YOUR_KEY</code> with your key.
          </li>
          <li>Restart Claude Desktop.</li>
          <li>
            Brain tools appear automatically. Try{' '}
            <code className="text-xs px-1 py-0.5 bg-muted rounded">/mcp</code> in Claude Desktop to
            verify <code className="text-xs px-1 py-0.5 bg-muted rounded">simplerdevelopment-brain</code>{' '}
            is listed.
          </li>
        </ol>
      </section>

      {/* Section D — Test connection */}
      <section className="rounded-md border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-icons text-base">network_check</span>
            Test connection
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirms your portal session has access to the Brain backend. Note: this tests the
            <em> backend</em>, not Claude Desktop&apos;s outbound connection — but if it passes,
            your account and Brain are healthy.
          </p>
        </div>

        <button
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          <span className="material-icons text-base">
            {testing ? 'hourglass_top' : 'play_arrow'}
          </span>
          {testing ? 'Testing…' : 'Test connection'}
        </button>

        {testResult && testResult.ok && (
          <div className="rounded-md border border-green-400 bg-green-50 dark:bg-green-950/20 p-3 text-sm flex items-start gap-2 text-green-800 dark:text-green-300">
            <span className="material-icons text-base">check_circle</span>
            <span>{testResult.message}</span>
          </div>
        )}
        {testResult && !testResult.ok && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2 text-destructive">
            <span className="material-icons text-base">error</span>
            <span>{testResult.message}</span>
          </div>
        )}
      </section>
    </div>
  );
}
