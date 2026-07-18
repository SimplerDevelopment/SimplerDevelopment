'use client';

import { useEffect, useState } from 'react';
import McpApiKeysManager from '@/components/portal/McpApiKeysManager';
import OAuthClientsManager from '@/components/portal/OAuthClientsManager';
import OAuthTokensManager from '@/components/portal/OAuthTokensManager';
import { BYOK_PROVIDER_LABELS } from '@/lib/billing/domain-catalog';
import { pCard } from '@/components/portal/portal-ui';

interface ByokStatusData {
  billingMode: string;
  required: string[];
  connected: string[];
  missing: string[];
}

function ByokChecklist() {
  const [data, setData] = useState<ByokStatusData | null>(null);

  useEffect(() => {
    fetch('/api/portal/billing/byok-status')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setData(res.data);
      })
      .catch(() => {});
  }, []);

  if (!data || data.billingMode !== 'byok') return null;

  const allConnected = data.missing.length === 0;

  return (
    <div className="bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 font-medium text-sm text-amber-900 dark:text-amber-200">
        <span className="material-icons text-base">vpn_key</span>
        Required keys for your plan
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-300">
        Your account is on BYOK billing — connect these keys to use the corresponding features.
      </p>
      {allConnected ? (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          All required keys are connected.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {data.required.map((provider) => {
            const isConnected = data.connected.includes(provider);
            return (
              <li key={provider} className="flex items-center gap-2 text-sm">
                {isConnected ? (
                  <span className="material-icons text-base text-green-600">check_circle</span>
                ) : (
                  <span className="material-icons text-base text-amber-500">warning</span>
                )}
                <span className={isConnected ? 'text-foreground' : 'text-amber-800 dark:text-amber-300'}>
                  {BYOK_PROVIDER_LABELS[provider] ?? provider}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ApiKeysPage() {
  // Resolve the MCP endpoint origin after mount. Reading window.location during
  // render makes SSR ('/api/mcp') and the client's first paint ('<origin>/api/mcp')
  // disagree → React #418 hydration text mismatch. Default to '' so both render
  // '/api/mcp', then fill in the origin client-side.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="space-y-6">
      <ByokChecklist />

      <McpApiKeysManager />

      <OAuthTokensManager />

      <OAuthClientsManager />

      <div className={`${pCard} p-4 space-y-2 text-sm`}>
        <h3 className="font-display font-extrabold tracking-[-0.01em]">Connect to Claude</h3>
        <p className="text-muted-foreground">MCP endpoint:</p>
        <code className="block p-2 bg-muted rounded text-xs break-all">
          {origin}/api/mcp
        </code>
        <p className="text-muted-foreground mt-2">
          Claude.ai web users can paste this URL into <strong>Settings → Connectors → Add custom connector</strong> with no API key.
          For Claude Desktop, Claude Code, and ChatGPT, generate a key above and send it as{' '}
          <code className="text-xs">Authorization: Bearer sd_mcp_…</code>.
          See the <a href="/portal/brain/ask" className="text-primary underline">Connect AI</a> page for full setup instructions.
        </p>
      </div>
    </div>
  );
}
