'use client';

/**
 * Brain Glossary — detail / edit page.
 *
 * Header: term (large), status chip, category chip, owner name, Edit + Delete.
 * Body:
 *   - Definition (markdown rendered if it contains markdown syntax; plain
 *     text otherwise)
 *   - Short definition (italic line below)
 *   - Aliases (chip list with account_circle prefix)
 *   - See also (chips linking to related terms — resolved server-side via the
 *     /api/portal/brain/glossary/[id] response)
 *   - Provenance footer (created by + date + source)
 *
 * Edit mode swaps the body for the shared `<GlossaryTermForm>`.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownView from '@/components/portal/MarkdownView';
import GlossaryTermForm from '@/components/brain/GlossaryTermForm';
import type { BrainGlossaryStatus } from '@/lib/db/schema';

interface BrainGlossaryTermDTO {
  id: number;
  clientId: number;
  term: string;
  slug: string;
  definition: string;
  shortDefinition: string | null;
  aliases: string[];
  status: BrainGlossaryStatus;
  category: string | null;
  ownerId: number | null;
  relatedTermIds: number[];
  source: string;
  reviewItemId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface RelatedTermDTO {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
}

interface DetailResponse {
  success: boolean;
  data?: {
    term: BrainGlossaryTermDTO;
    relatedTerms: RelatedTermDTO[];
  };
  message?: string;
}

interface UserOption {
  id: number;
  name: string | null;
}

/** Conservative regex — anything with markdown sigils gets the renderer. */
function looksLikeMarkdown(s: string): boolean {
  return /(^|\n)\s*([#\-*>]|\d+\.)\s|\*\*|__|`|\[[^\]]+\]\([^)]+\)/.test(s);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function BrainGlossaryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const termId = parseInt(id, 10);
  const router = useRouter();

  const [data, setData] = useState<DetailResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/glossary/${termId}`);
      const json: DetailResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to load term.');
      } else {
        setData(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [termId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers all setState into async IIFE; this trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  // Load owner directory once so we can render the owner's name.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/mentionable-users');
        const json = await r.json();
        if (cancelled || !json.success) return;
        setUsers(json.data ?? []);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async () => {
    if (!data) return;
    if (!window.confirm(`Delete "${data.term.term}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/portal/brain/glossary/${termId}`, { method: 'DELETE' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        alert(json.message || 'Delete failed.');
        setDeleting(false);
        return;
      }
      router.push('/portal/brain/glossary');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load this term
          </div>
          <p>{error ?? 'Not found'}</p>
          <Link href="/portal/brain/glossary" className="inline-flex items-center gap-1 mt-3 text-xs underline">
            <span className="material-icons text-sm">arrow_back</span>
            Back to glossary
          </Link>
        </div>
      </div>
    );
  }

  const { term, relatedTerms } = data;
  const ownerName = term.ownerId
    ? users.find(u => u.id === term.ownerId)?.name ?? `User #${term.ownerId}`
    : null;
  const creatorName = term.createdBy
    ? users.find(u => u.id === term.createdBy)?.name ?? `User #${term.createdBy}`
    : 'Unknown';

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <nav className="text-xs text-muted-foreground flex items-center gap-1">
        <Link href="/portal/brain/glossary" className="hover:text-foreground inline-flex items-center gap-0.5">
          <span className="material-icons text-sm">menu_book</span>
          Glossary
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span className="truncate">{term.term}</span>
      </nav>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground break-words">{term.term}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide rounded ${
              term.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
            }`}>
              <span className="material-icons text-[12px]">{term.status === 'active' ? 'check_circle' : 'archive'}</span>
              {term.status}
            </span>
            {term.category && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-muted text-muted-foreground">
                <span className="material-icons text-[12px]">label</span>
                {term.category}
              </span>
            )}
            {ownerName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-muted text-muted-foreground">
                <span className="material-icons text-[12px]">person</span>
                {ownerName}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded bg-muted/50 text-muted-foreground" title="Stable slug">
              /{term.slug}
            </span>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
            >
              <span className="material-icons text-base">edit</span>
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {deleting
                ? <span className="material-icons text-base animate-spin">progress_activity</span>
                : <span className="material-icons text-base">delete</span>
              }
              Delete
            </button>
          </div>
        )}
      </header>

      {editing ? (
        <div className="bg-card border border-border rounded-xl p-5">
          <GlossaryTermForm
            mode="edit"
            termId={term.id}
            initial={{
              term: term.term,
              definition: term.definition,
              shortDefinition: term.shortDefinition ?? '',
              aliases: term.aliases ?? [],
              status: term.status,
              category: term.category ?? '',
              ownerId: term.ownerId,
              relatedTermIds: term.relatedTermIds ?? [],
            }}
            initialRelatedTerms={relatedTerms.map(r => ({ id: r.id, term: r.term, slug: r.slug }))}
            onSaved={() => { setEditing(false); load(); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          {/* Definition */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Definition</h2>
              {looksLikeMarkdown(term.definition) ? (
                <div className="text-sm text-foreground leading-relaxed">
                  <MarkdownView>{term.definition}</MarkdownView>
                </div>
              ) : (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{term.definition}</p>
              )}
            </div>
            {term.shortDefinition && (
              <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-3">
                {term.shortDefinition}
              </p>
            )}
          </section>

          {/* Aliases */}
          {term.aliases.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Aliases</h2>
              <div className="flex flex-wrap gap-1.5">
                {term.aliases.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/20">
                    <span className="material-icons text-[12px]">account_circle</span>
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* See also */}
          {relatedTerms.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">See also</h2>
              <div className="flex flex-wrap gap-1.5">
                {relatedTerms.map(r => (
                  <Link
                    key={r.id}
                    href={`/portal/brain/glossary/${r.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-muted text-foreground border border-border hover:bg-accent hover:border-primary/40 transition-colors"
                    title={r.shortDefinition ?? r.term}
                  >
                    <span className="material-icons text-[12px]">menu_book</span>
                    {r.term}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Provenance footer */}
          <footer className="text-[11px] text-muted-foreground pt-3 border-t border-border flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[12px]">person_add</span>
              Created by {creatorName} on {formatDate(term.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[12px]">history</span>
              Updated {formatDate(term.updatedAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-[12px]">{term.source === 'ai_suggested' ? 'auto_awesome' : 'edit_note'}</span>
              Source: {term.source === 'ai_suggested' ? 'AI suggested' : 'Manual'}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
