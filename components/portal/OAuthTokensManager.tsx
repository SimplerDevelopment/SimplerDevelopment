'use client';

import { useEffect, useState } from 'react';

interface OAuthToken {
  id: number;
  tokenPreview: string;
  scopes: string[];
  resource: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  clientName: string;
  clientUri: string | null;
  issuedToYou: boolean;
}

interface OAuthTokensManagerProps {
  heading?: string | null;
  subheading?: string | null;
}

export default function OAuthTokensManager({
  heading = 'OAuth-issued tokens',
  subheading = 'Tokens issued when you (or another team member) approved a Claude.ai connector or other OAuth client. Revoke any token here to immediately cut its access.',
}: OAuthTokensManagerProps) {
  const [tokens, setTokens] = useState<OAuthToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/oauth-tokens');
      const json = await res.json();
      if (json.success) setTokens(json.data);
      else setError(json.message ?? 'Failed to load tokens');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRevoke(id: number, clientName: string) {
    if (!confirm(`Revoke ${clientName}'s access? It will lose access immediately and need to reconnect.`)) return;
    await fetch(`/api/portal/oauth-tokens?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
        {subheading && (
          <p className="text-sm text-muted-foreground mt-1">{subheading}</p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-md border border-border">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Application</th>
              <th className="px-3 py-2 font-medium">Token</th>
              <th className="px-3 py-2 font-medium">Scopes</th>
              <th className="px-3 py-2 font-medium">Last used</th>
              <th className="px-3 py-2 font-medium">Expires</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && tokens.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  No OAuth connections yet. Connect Claude.ai using the steps above to see tokens here.
                </td>
              </tr>
            )}
            {tokens.map(t => {
              const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium flex items-center gap-2">
                      {t.clientName}
                      {!t.issuedToYou && (
                        <span title="Approved by another team member" className="material-icons text-[14px] text-muted-foreground leading-none">group</span>
                      )}
                    </div>
                    {t.clientUri && (
                      <a href={t.clientUri} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                        {t.clientUri}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2"><code className="text-xs">{t.tokenPreview}</code></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.scopes.map(s => (
                        <code key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded">{s}</code>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-3 py-2">
                    {t.revokedAt ? (
                      <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded">Revoked</span>
                    ) : expired ? (
                      <span className="text-xs px-2 py-0.5 bg-muted rounded">Expired</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!t.revokedAt && !expired && (
                      <button
                        onClick={() => handleRevoke(t.id, t.clientName)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
