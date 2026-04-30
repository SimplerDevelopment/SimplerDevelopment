'use client';

import McpApiKeysManager from '@/components/portal/McpApiKeysManager';
import OAuthTokensManager from '@/components/portal/OAuthTokensManager';

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <McpApiKeysManager />

      <OAuthTokensManager />

      <div className="rounded-md border border-border p-4 space-y-2 text-sm">
        <h3 className="font-medium">Connect to Claude</h3>
        <p className="text-muted-foreground">MCP endpoint:</p>
        <code className="block p-2 bg-muted rounded text-xs break-all">
          {typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp'}
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
