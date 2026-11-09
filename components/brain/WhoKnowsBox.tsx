'use client';

/**
 * PUX-163 (design doc screen 22): "Who knows" is the search box.
 *
 * Wraps the existing GET /api/portal/brain/who-knows?query= route — the same
 * whoKnows() that backs the brain_who_knows MCP tool. It matches expertise-tag
 * names and descriptions, never people's names, so the name search beside it
 * keeps that job. Studio-only: the caller gates on useFeatureFlag('portal-redesign').
 */

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { WhoKnowsResult } from '@/lib/brain/people';
import { sBtnGhost } from '@/components/portal/portal-ui';

export default function WhoKnowsBox({ className = '' }: { className?: string }) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<WhoKnowsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) { setAsked(''); setResult(null); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/who-knows?query=${encodeURIComponent(query)}&limit=10`);
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.message || 'Could not search expertise.');
      setResult(json.data as WhoKnowsResult);
      setAsked(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  function clear() { setQ(''); setAsked(''); setResult(null); }

  const n = result?.people.length ?? 0;
  return (
    <div className={className}>
      <form onSubmit={ask} role="search" className="relative">
        <span className="material-icons pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--studio-gold)]">auto_awesome</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Who knows about…?"
          aria-label="Who knows about"
          className="w-full rounded-2xl border border-[var(--studio-gold-line)] bg-card py-3 pl-11 pr-24 font-display text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:ring-4 focus:ring-[var(--studio-gold-soft)]"
        />
        <button type="submit" disabled={busy} className={`${sBtnGhost} absolute right-2 top-1/2 -translate-y-1/2 disabled:opacity-50`}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {result && asked && (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              {n === 0
                ? `Nobody is tagged for “${asked}” yet.`
                : `${n} ${n === 1 ? 'person knows' : 'people know'} about “${asked}”`}
            </p>
            <button type="button" onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          </div>
          {result.tagMatches.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Matched expertise: {result.tagMatches.map((t) => t.name).join(', ')}</p>
          )}
          {n === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Tag someone&apos;s expertise on their person page and they&apos;ll show up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {result.people.map((p) => (
                <li key={p.personId}>
                  <Link href={`/portal/brain/people/${p.personId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
                    <span className="text-sm font-medium text-foreground">{p.fullName}</span>
                    {p.title && <span className="truncate text-xs text-muted-foreground">{p.title}</span>}
                    <span className="ml-auto flex flex-wrap justify-end gap-1">
                      {p.matchedTags.map((t) => (
                        <span key={t.id} className="rounded-full bg-[var(--studio-gold-surface)] px-2 py-0.5 text-[11px] text-[var(--studio-gold-ink)]">{t.name}</span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
