'use client';

import { useState } from 'react';
import type { StepProps } from './types';

export function StepPowerUp({ state, setAnswers, next, persist }: StepProps) {
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'key' | 'mcp' | 'curl' | null>(null);
  const skillsDownloaded = !!state.answers.skillsDownloaded;
  const keyCreated = !!state.answers.mcpKeyCreatedId || !!generatedKey;

  const mcpEndpoint = typeof window !== 'undefined'
    ? `${window.location.origin}/api/mcp`
    : '/api/mcp';

  const mcpConfig = JSON.stringify({
    mcpServers: {
      simplerdevelopment: {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpEndpoint],
      },
    },
  }, null, 2);

  const curlInstall = 'mkdir -p ~/.claude/skills && \\\n  curl -fsSL ' +
    (typeof window !== 'undefined' ? window.location.origin : '') +
    '/api/skills/bundle | tar -xz -C ~/.claude/skills';

  const copy = (text: string, tag: 'key' | 'mcp' | 'curl') => {
    navigator.clipboard?.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 2000);
  };

  const markSkillsDownloaded = () => {
    setAnswers({ skillsDownloaded: true });
    void persist({ patch: { skillsDownloaded: true } });
  };

  const generateKey = async () => {
    setGenerating(true);
    setKeyError(null);
    try {
      const res = await fetch('/api/portal/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Claude (onboarding)', scopes: ['*'] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'Failed to generate key');
      setGeneratedKey(json.data.key);
      setAnswers({ mcpKeyCreatedId: json.data.id });
      void persist({ patch: { mcpKeyCreatedId: json.data.id } });
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed to generate key');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        SimplerDevelopment plays nicely with <strong>Claude Code</strong>, <strong>Claude Desktop</strong>,
        and any MCP-compatible client. Pair both halves below and you can draft pages, decks, emails, surveys,
        and more by chatting.
      </p>

      {/* 1. Skills */}
      <section
        data-testid="onboarding-power-skills"
        className="rounded-xl border border-border bg-background/60 p-5 space-y-3"
      >
        <header className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <span className="material-icons text-lg">extension</span>
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">1. Install the SD Skills</h3>
            <p className="text-xs text-muted-foreground">10 skills your assistant uses to author content here.</p>
          </div>
          {skillsDownloaded && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="material-icons text-sm">check_circle</span>
              Marked done
            </span>
          )}
        </header>

        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href="/api/skills/install/mac"
            download
            onClick={markSkillsDownloaded}
            data-testid="onboarding-skills-download-mac"
            className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm hover:border-primary transition-colors"
          >
            <span className="material-icons text-base text-primary">download</span>
            <span className="font-medium">macOS installer</span>
            <span className="ml-auto material-icons text-base text-muted-foreground group-hover:text-primary">arrow_forward</span>
          </a>
          <a
            href="/api/skills/install/windows"
            download
            onClick={markSkillsDownloaded}
            data-testid="onboarding-skills-download-windows"
            className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm hover:border-primary transition-colors"
          >
            <span className="material-icons text-base text-primary">download</span>
            <span className="font-medium">Windows installer</span>
            <span className="ml-auto material-icons text-base text-muted-foreground group-hover:text-primary">arrow_forward</span>
          </a>
        </div>

        <details className="rounded-md bg-muted/40 p-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Or paste a one-liner in your terminal
          </summary>
          <div className="mt-2 flex items-start gap-2">
            <pre className="flex-1 overflow-auto rounded bg-background p-2 text-[11px] font-mono whitespace-pre-wrap break-all">{curlInstall}</pre>
            <button
              type="button"
              onClick={() => { copy(curlInstall, 'curl'); markSkillsDownloaded(); }}
              data-testid="onboarding-skills-copy-curl"
              className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-primary/5"
            >
              {copied === 'curl' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </details>
      </section>

      {/* 2. MCP key */}
      <section
        data-testid="onboarding-power-mcp"
        className="rounded-xl border border-border bg-background/60 p-5 space-y-3"
      >
        <header className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            <span className="material-icons text-lg">vpn_key</span>
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">2. Connect Claude to your portal</h3>
            <p className="text-xs text-muted-foreground">Generates a personal MCP key with all scopes.</p>
          </div>
          {keyCreated && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="material-icons text-sm">check_circle</span>
              Key created
            </span>
          )}
        </header>

        {!generatedKey && (
          <button
            type="button"
            onClick={generateKey}
            disabled={generating}
            data-testid="onboarding-mcp-generate"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="material-icons text-base animate-spin">progress_activity</span>
                Generating…
              </>
            ) : (
              <>
                <span className="material-icons text-base">{keyCreated ? 'refresh' : 'add_circle'}</span>
                {keyCreated ? 'Generate another key' : 'Generate MCP key'}
              </>
            )}
          </button>
        )}
        {keyError && <p className="text-xs text-destructive" role="alert">{keyError}</p>}

        {generatedKey && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold mb-1 flex items-center gap-1">
                <span className="material-icons text-sm">warning</span> Copy this now — we won&apos;t show it again.
              </p>
              <div className="flex items-start gap-2">
                <code data-testid="onboarding-mcp-key" className="flex-1 rounded bg-background/80 p-2 font-mono text-[11px] break-all">{generatedKey}</code>
                <button
                  type="button"
                  onClick={() => copy(generatedKey, 'key')}
                  data-testid="onboarding-mcp-copy-key"
                  className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-primary/5"
                >
                  {copied === 'key' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}

        <details className="rounded-md bg-muted/40 p-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show Claude config snippet
          </summary>
          <div className="mt-2 flex items-start gap-2">
            <pre className="flex-1 overflow-auto rounded bg-background p-2 text-[11px] font-mono">{mcpConfig}</pre>
            <button
              type="button"
              onClick={() => copy(mcpConfig, 'mcp')}
              data-testid="onboarding-mcp-copy-config"
              className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-primary/5"
            >
              {copied === 'mcp' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-muted-foreground">
            Paste into <code>~/.claude/mcp-config.json</code> (Claude Code) or your client&apos;s MCP settings.
          </p>
        </details>
      </section>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => next()}
          data-testid="onboarding-power-skip"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          I&apos;ll do this later
        </button>
        <button
          type="button"
          onClick={() => next()}
          data-testid="onboarding-power-next"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          {keyCreated || skillsDownloaded ? 'All set' : 'Continue'}
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
