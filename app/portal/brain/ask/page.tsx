'use client';

import { useState } from 'react';
import McpApiKeysManager from '@/components/portal/McpApiKeysManager';

type ClientId = 'claude-desktop' | 'claude-code' | 'chatgpt';

const TABS: { id: ClientId; label: string; icon: string }[] = [
  { id: 'claude-desktop', label: 'Claude Desktop', icon: 'desktop_windows' },
  { id: 'claude-code',    label: 'Claude Code',    icon: 'terminal' },
  { id: 'chatgpt',        label: 'ChatGPT',        icon: 'smart_toy' },
];

export default function ConnectAiPage() {
  const [tab, setTab] = useState<ClientId>('claude-desktop');
  const [origin, setOrigin] = useState('https://simplerdevelopment.com');

  if (typeof window !== 'undefined' && origin === 'https://simplerdevelopment.com' && window.location.origin !== origin) {
    setOrigin(window.location.origin);
  }

  const endpoint = `${origin}/api/mcp`;

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">cable</span>
          Connect AI to your portal
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Hook Claude Desktop, Claude Code, ChatGPT, or any MCP-compatible client up to your portal
          via <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" className="text-primary hover:underline">Model Context Protocol</a>.
          The AI can read and write across CRM, content, pitch decks, email, projects, and more —
          scoped to whatever permissions you grant the API key.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">MCP endpoint</h2>
        <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-2">
          <code className="text-xs flex-1 break-all">{endpoint}</code>
          <button
            onClick={() => navigator.clipboard.writeText(endpoint)}
            className="shrink-0 text-xs px-2 py-1 border border-border rounded hover:bg-background"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Streamable HTTP transport in stateless mode. Authenticate with{' '}
          <code className="text-[11px] px-1 py-0.5 bg-muted rounded">Authorization: Bearer sd_mcp_…</code>.
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Setup instructions</h2>
          <p className="text-sm text-muted-foreground">Pick your client and follow the steps. You&apos;ll need an API key from the section below.</p>
        </div>

        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'claude-desktop' && <ClaudeDesktopInstructions endpoint={endpoint} />}
        {tab === 'claude-code' && <ClaudeCodeInstructions endpoint={endpoint} />}
        {tab === 'chatgpt' && <ChatGptInstructions endpoint={endpoint} />}
      </section>

      <section>
        <McpApiKeysManager
          heading="Manage API keys"
          subheading="Generate a key for each client (Claude Desktop, ChatGPT, etc.). Keep the secret value safe — it's shown once. Revoke any key here if you lose access."
        />
      </section>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-x-auto">
        <code>{children}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-xs px-2 py-0.5 border border-border rounded bg-background hover:bg-muted"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function ClaudeDesktopInstructions({ endpoint }: { endpoint: string }) {
  const config = `{
  "mcpServers": {
    "simplerdevelopment": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${endpoint}",
        "--header",
        "Authorization: Bearer sd_mcp_your_key_here"
      ]
    }
  }
}`;
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          <span className="font-medium">Generate an API key</span> in the section below — name it something like{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">Claude Desktop</code>.
        </li>
        <li>
          <span className="font-medium">Open the Claude Desktop config</span> file:
          <ul className="list-disc ml-5 mt-1 text-muted-foreground space-y-0.5">
            <li>macOS: <code className="text-xs px-1 py-0.5 bg-muted rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
            <li>Windows: <code className="text-xs px-1 py-0.5 bg-muted rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
          </ul>
        </li>
        <li>
          <span className="font-medium">Add the SimplerDevelopment MCP server</span> (replace{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">sd_mcp_your_key_here</code> with the key you generated):
          <div className="mt-2"><CodeBlock>{config}</CodeBlock></div>
        </li>
        <li>
          <span className="font-medium">Restart Claude Desktop</span>. Tools will appear in the tools menu — try
          asking <em>&quot;What&apos;s in my CRM pipeline?&quot;</em> or <em>&quot;Draft a pitch deck for Acme.&quot;</em>
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        The <code className="text-[11px] px-1 py-0.5 bg-muted rounded">mcp-remote</code> bridge translates the
        Streamable HTTP endpoint into the stdio transport that Claude Desktop expects. No additional install — npx pulls it on demand.
      </p>
    </div>
  );
}

function ClaudeCodeInstructions({ endpoint }: { endpoint: string }) {
  const command = `claude mcp add --transport http simplerdevelopment \\
  ${endpoint} \\
  --header "Authorization: Bearer sd_mcp_your_key_here"`;
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          <span className="font-medium">Generate an API key</span> below — name it{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">Claude Code</code>.
        </li>
        <li>
          <span className="font-medium">Add the MCP server</span> from your terminal:
          <div className="mt-2"><CodeBlock>{command}</CodeBlock></div>
        </li>
        <li>
          <span className="font-medium">Verify</span> with <code className="text-xs px-1 py-0.5 bg-muted rounded">claude mcp list</code>.
          The <code className="text-xs px-1 py-0.5 bg-muted rounded">simplerdevelopment</code> server should appear and respond.
        </li>
        <li>
          In any Claude Code session, type <code className="text-xs px-1 py-0.5 bg-muted rounded">/mcp</code> to see available tools.
        </li>
      </ol>
    </div>
  );
}

function ChatGptInstructions({ endpoint }: { endpoint: string }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        ChatGPT supports MCP servers as <strong>Connectors</strong> on Pro / Team / Enterprise plans.
        Configuration is done in ChatGPT settings, not on this page.
      </p>
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          <span className="font-medium">Generate an API key</span> below — name it{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">ChatGPT</code>.
        </li>
        <li>
          In ChatGPT, open <span className="font-medium">Settings → Connectors</span> (or{' '}
          <span className="font-medium">Beta features → MCP</span> depending on your plan), and choose{' '}
          <span className="font-medium">Add custom connector</span>.
        </li>
        <li>
          Configure the connector:
          <ul className="list-disc ml-5 mt-1 text-muted-foreground space-y-0.5">
            <li>Name: <code className="text-xs px-1 py-0.5 bg-muted rounded">SimplerDevelopment</code></li>
            <li>Server URL: <code className="text-xs px-1 py-0.5 bg-muted rounded">{endpoint}</code></li>
            <li>Auth: <span className="font-medium">Bearer token</span></li>
            <li>Token: <code className="text-xs px-1 py-0.5 bg-muted rounded">sd_mcp_your_key_here</code></li>
          </ul>
        </li>
        <li>
          <span className="font-medium">Save and enable the connector</span>. New conversations will have access to
          all the SimplerDevelopment tools your key&apos;s scopes allow.
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        ChatGPT&apos;s connector UI changes as MCP support rolls out. If your account doesn&apos;t expose
        custom connectors yet, the Claude Desktop or Claude Code routes work today.
      </p>
    </div>
  );
}
