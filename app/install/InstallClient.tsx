'use client';

import { useState } from 'react';

const SKILLS = [
  ['sd-init', 'Bootstrap your tenant'],
  ['sd-create-page', 'Draft CMS pages'],
  ['sd-create-deck', 'Draft pitch decks'],
  ['sd-create-email', 'Draft email campaigns'],
  ['sd-create-survey', 'Draft surveys + intake forms'],
  ['sd-create-booking-page', 'Build booking pages'],
  ['sd-create-website', 'Compose a multi-page site'],
  ['sd-build-html-embed', 'Author single-file HTML embeds'],
  ['sd-learn', 'Capture per-project feedback'],
  ['html-render-block', 'Edit HTML-render block JSON'],
] as const;

const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "simplerdevelopment": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<your-tenant>.simplerdevelopment.com/api/mcp"
      ]
    }
  }
}`;

const MANUAL_CURL = `mkdir -p ~/.claude/skills && \\
  curl -fsSL https://simplerdevelopment.com/api/skills/bundle \\
  | tar -xz -C ~/.claude/skills`;

export function InstallClient() {
  const [copied, setCopied] = useState<'config' | 'curl' | null>(null);

  const copy = (text: string, tag: 'config' | 'curl') => {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 2000);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <header className="mb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            SimplerDevelopment
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Install the Claude skills
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            One-click installer for the SimplerDevelopment skills bundle. After installing,
            you can draft pages, decks, emails, surveys, and full multi-page sites directly
            from Claude Desktop or Claude Code.
          </p>
        </header>

        <section className="mb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            1. Download the installer
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="/installers/SimplerDevelopmentSkills.pkg"
              className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
              download
            >
              <span className="material-symbols-outlined text-3xl text-primary">
                computer
              </span>
              <span className="text-lg font-semibold">macOS</span>
              <span className="text-sm text-muted-foreground">
                Download <code className="rounded bg-muted px-1 py-0.5 text-xs">SimplerDevelopmentSkills.pkg</code>,
                then double-click in Finder to install.
              </span>
              <span className="mt-2 text-xs text-muted-foreground">
                Signed + notarized by Apple. No admin password needed.
              </span>
            </a>

            <a
              href="/api/skills/install/windows"
              className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
              download
            >
              <span className="material-symbols-outlined text-3xl text-primary">
                desktop_windows
              </span>
              <span className="text-lg font-semibold">Windows</span>
              <span className="text-sm text-muted-foreground">
                Download <code className="rounded bg-muted px-1 py-0.5 text-xs">install-sd-skills.bat</code>,
                then double-click in Explorer.
              </span>
              <span className="mt-2 text-xs text-muted-foreground">
                Requires Windows 10 build 17063+ (April 2018) for built-in curl + tar.
              </span>
            </a>
          </div>

          <details className="mt-6 rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Other options (advanced)
            </summary>
            <div className="mt-3 space-y-4 text-sm">
              <div>
                <p className="font-medium">macOS shell-script installer</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fallback if the .pkg doesn&apos;t work for you. Download{' '}
                  <a className="underline" href="/api/skills/install/mac" download>
                    install-sd-skills.command
                  </a>
                  , then right-click → Open in Finder (unsigned — Gatekeeper prompts).
                </p>
              </div>
              <div>
                <p className="font-medium">Linux / manual install (curl one-liner)</p>
                <div className="mt-1 rounded bg-muted p-3 font-mono text-xs">
                  <pre className="overflow-x-auto whitespace-pre">{MANUAL_CURL}</pre>
                  <button
                    onClick={() => copy(MANUAL_CURL, 'curl')}
                    className="mt-2 text-xs text-primary hover:underline"
                    type="button"
                  >
                    {copied === 'curl' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </details>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            2. Configure Claude Desktop
          </h2>
          <p className="mb-4 text-sm">
            Open <code className="rounded bg-muted px-1 py-0.5 text-xs">claude_desktop_config.json</code>{' '}
            (Settings → Developer → Edit Config in Claude Desktop) and add the{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">simplerdevelopment</code>{' '}
            entry under <code className="rounded bg-muted px-1 py-0.5 text-xs">mcpServers</code>.
          </p>
          <div className="rounded-lg border border-border bg-card p-4">
            <pre className="overflow-x-auto text-xs">{MCP_CONFIG_SNIPPET}</pre>
            <button
              onClick={() => copy(MCP_CONFIG_SNIPPET, 'config')}
              className="mt-3 inline-flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              type="button"
            >
              <span className="material-symbols-outlined text-base">
                {copied === 'config' ? 'check' : 'content_copy'}
              </span>
              {copied === 'config' ? 'Copied' : 'Copy snippet'}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Replace <code className="rounded bg-muted px-1 py-0.5">&lt;your-tenant&gt;</code> with
            your tenant subdomain. Your account manager has it if you don&apos;t.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            3. Restart Claude and run sd-init
          </h2>
          <p className="text-sm">
            Quit and reopen Claude Desktop. In any conversation, say{' '}
            <span className="rounded bg-muted px-2 py-1 font-mono text-xs">Run sd-init</span>.
            Claude will OAuth into your portal, pull your brand profile + site list, and
            write a <code className="rounded bg-muted px-1 py-0.5 text-xs">.sd/config.json</code>{' '}
            into your working directory. After that, every other skill below is ready.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            What you get
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {SKILLS.map(([name, desc]) => (
              <li key={name} className="flex items-start gap-3 rounded border border-border bg-card p-3">
                <code className="font-mono text-xs font-semibold">{name}</code>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Plus the shared design-principles doc and the full client quickstart, both
            installed alongside the skills under{' '}
            <code className="rounded bg-muted px-1 py-0.5">~/.claude/skills/</code>.
          </p>
        </section>

        <footer className="border-t border-border pt-8 text-xs text-muted-foreground">
          Trouble installing? See{' '}
          <a className="underline hover:text-foreground" href="/contact">
            contact support
          </a>{' '}
          or open{' '}
          <code className="rounded bg-muted px-1 py-0.5">~/.claude/skills/CLIENT_QUICKSTART.md</code>{' '}
          after install for the full guide.
        </footer>
      </div>
    </main>
  );
}
