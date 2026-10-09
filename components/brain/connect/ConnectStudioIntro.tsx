'use client';

/**
 * PUX-202 (design doc screen 66): what Connect AI sells, said plainly —
 * the pitch, the tool catalogue grouped by room (TOOL_DOMAINS, drift-tested
 * against lib/mcp/tools/), the real scope groups as chips, and approvals
 * named as the safety net. Studio-only; the page gates on the flag.
 */

import Link from 'next/link';
import { SCOPE_GROUPS } from '@/components/portal/McpApiKeysManager';
import { toolDomainsByRoom } from '@/lib/mcp/tool-domains';

export default function ConnectStudioIntro() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] p-6" aria-label="What this is for">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--studio-gold-ink)]">Connect AI</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">Talk to your business from Claude.</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Ask about a deal, draft a page, book a slot, move a card — from Claude.ai, Claude Desktop, Claude Code or ChatGPT, with exactly the permissions you hand out below. Claude.ai on the web needs no key at all; it signs in with OAuth.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5" aria-label="What it can do">
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">What it can do</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {toolDomainsByRoom().map(([room, domains]) => (
              <div key={room} className="flex gap-3">
                <dt className="w-16 shrink-0 font-medium text-foreground">{room}</dt>
                <dd className="text-muted-foreground">{domains.map((d) => d.label).join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5" aria-label="Scopes">
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Scopes you can grant</h3>
          <div className="mt-3 space-y-2">
            {SCOPE_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="text-xs font-medium text-foreground">{g.label}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {g.scopes.map((s) => <span key={s.value} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{s.value}</span>)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
        <span className="material-icons text-base text-[var(--studio-gold-ink)]">verified_user</span>
        <span><strong className="text-foreground">Approvals keep this safe.</strong> A key marked as requiring approval doesn&apos;t write straight to your site — its change is staged as a pending item, and the key that staged it can never approve it. You decide in <Link href="/portal/approvals" className="underline hover:text-foreground">Approvals</Link>.</span>
      </p>
    </div>
  );
}
