'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { obPrimaryBtn, obGhostBtn, obQuietLink, obPanel } from '../ob-styles';

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
    <div className="space-y-5">
      <p className="text-[14px] text-muted-foreground leading-relaxed">
        SimplerDevelopment plays nicely with <strong>Claude Code</strong>, <strong>Claude Desktop</strong>,
        and any MCP-compatible client. Pair both halves below and you can draft pages, decks, emails, surveys,
        and more by chatting.
      </p>

      {/* Two-column panels */}
      <div className="grid gap-[18px] sm:grid-cols-2">

        {/* 1. Skills panel */}
        <section
          data-testid="onboarding-power-skills"
          className={obPanel + ' space-y-3'}
        >
          <header className="flex items-center gap-2">
            <span className="material-icons text-[18px] text-primary">download</span>
            <h3 className="text-[14.5px] font-extrabold tracking-[-0.01em] flex-1">Install SD Skills</h3>
            {skillsDownloaded && (
              <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="material-icons text-[14px]">check_circle</span>
                Done
              </span>
            )}
          </header>
          <p className="text-[12.5px] text-muted-foreground leading-[1.45] mt-0">
            One installer adds every SimplerDevelopment skill to your assistant.
          </p>

          <div className="flex gap-2.5">
            <a
              href="/api/skills/install/mac"
              download
              onClick={markSkillsDownloaded}
              data-testid="onboarding-skills-download-mac"
              className={obGhostBtn + ' flex-1 justify-center'}
            >
              <span className="material-icons text-[18px]">laptop_mac</span>
              macOS
            </a>
            <a
              href="/api/skills/install/windows"
              download
              onClick={markSkillsDownloaded}
              data-testid="onboarding-skills-download-windows"
              className={obGhostBtn + ' flex-1 justify-center'}
            >
              <span className="material-icons text-[18px]">desktop_windows</span>
              Windows
            </a>
          </div>

          <details className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
              Or paste a one-liner in your terminal
            </summary>
            <div className="mt-2 flex items-start gap-2">
              <pre className="flex-1 overflow-auto rounded-lg bg-[#0e0d0c] text-[#e7e5e4] p-2.5 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed">{curlInstall}</pre>
              <button
                type="button"
                onClick={() => { copy(curlInstall, 'curl'); markSkillsDownloaded(); }}
                data-testid="onboarding-skills-copy-curl"
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold hover:border-foreground/20"
              >
                {copied === 'curl' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </details>
        </section>

        {/* 2. MCP key panel */}
        <section
          data-testid="onboarding-power-mcp"
          className={obPanel + ' space-y-3'}
        >
          <header className="flex items-center gap-2">
            <span className="material-icons text-[18px] text-primary">vpn_key</span>
            <h3 className="text-[14.5px] font-extrabold tracking-[-0.01em] flex-1">Connect Claude</h3>
            {keyCreated && (
              <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="material-icons text-[14px]">check_circle</span>
                Key created
              </span>
            )}
          </header>
          <p className="text-[12.5px] text-muted-foreground leading-[1.45] mt-0">
            Generate an MCP key and drop it into your config.
          </p>

          {!generatedKey && (
            <button
              type="button"
              onClick={generateKey}
              disabled={generating}
              data-testid="onboarding-mcp-generate"
              className={obPrimaryBtn}
            >
              {generating ? (
                <>
                  <span className="material-icons text-[18px] animate-spin">progress_activity</span>
                  Generating…
                </>
              ) : (
                <>
                  <span className="material-icons text-[18px]">{keyCreated ? 'refresh' : 'add_circle'}</span>
                  {keyCreated ? 'Generate another key' : 'Generate MCP key'}
                </>
              )}
            </button>
          )}
          {keyError && <p className="text-xs text-destructive" role="alert">{keyError}</p>}

          {generatedKey && (
            <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-[var(--portal-surface-2,hsl(var(--muted)))] px-3.5 py-2.5 font-mono text-[13px]">
              <span className="material-icons text-[18px] text-emerald-500">check_circle</span>
              <code data-testid="onboarding-mcp-key" className="flex-1 break-all text-[12px]">{generatedKey}</code>
              <button
                type="button"
                onClick={() => copy(generatedKey, 'key')}
                data-testid="onboarding-mcp-copy-key"
                className="ml-auto shrink-0 text-[13px] font-semibold text-primary hover:text-primary/80"
              >
                {copied === 'key' ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {!generatedKey && (
            <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-3 dark:border-amber-700 dark:bg-amber-950/30">
              <p className="flex items-center gap-1 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
                <span className="material-icons text-[14px]">warning</span>
                Copy immediately — we won&apos;t show it again.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Claude config code block */}
      <div className="relative rounded-[13px] bg-[#0e0d0c] px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-[#e7e5e4] overflow-auto">
        <button
          type="button"
          onClick={() => copy(mcpConfig, 'mcp')}
          data-testid="onboarding-mcp-copy-config"
          className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/15"
        >
          <span className="material-icons text-[13px]">content_copy</span>
          {copied === 'mcp' ? 'Copied' : 'Copy'}
        </button>
        <pre className="whitespace-pre-wrap break-all">{mcpConfig}</pre>
        <p className="mt-2 text-[11px] text-[#94a3b8]">
          Paste into <code>~/.claude/mcp-config.json</code> (Claude Code) or your client&apos;s MCP settings.
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => next()}
          data-testid="onboarding-power-skip"
          className={obQuietLink}
        >
          I&apos;ll do this later
        </button>
        <button
          type="button"
          onClick={() => next()}
          data-testid="onboarding-power-next"
          className={obPrimaryBtn}
        >
          {keyCreated || skillsDownloaded ? 'All set' : 'Finish setup'}
          <span className="material-icons text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
