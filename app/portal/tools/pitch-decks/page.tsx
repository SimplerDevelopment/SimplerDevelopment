'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pCardPad, pSelect, pSectionTitle } from '@/components/portal/portal-ui';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PitchDeck {
  id: number;
  title: string;
  description: string | null;
  status: string;
  slides: unknown[];
  updatedAt: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const deckStatusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PitchDecksPage() {
  const router = useRouter();

  const [decks, setDecks] = useState<PitchDeck[]>([]);
  const [loading, setLoading] = useState(true);

  // Search / filter / sort
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [sort, setSort] = useState<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc'>('updated-desc');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const fetchDecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/tools/pitch-decks');
      const d = await res.json();
      setDecks(d.data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => { await fetchDecks(); })();
  }, [fetchDecks]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Derived: filter + sort decks client-side. The list is bounded by tenant
  // size and almost always small, so server-side params would be overkill.
  const filteredDecks = (() => {
    const q = search.trim().toLowerCase();
    const filtered = decks.filter(deck => {
      if (statusFilter !== 'all' && deck.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${deck.title} ${deck.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'updated-desc': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'updated-asc':  return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'title-asc':    return a.title.localeCompare(b.title);
        case 'title-desc':   return b.title.localeCompare(a.title);
        default: return 0;
      }
    });
    return sorted;
  })();

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleDelete(deckId: number) {
    setDeleteError('');
    try {
      const res = await fetch(`/api/portal/tools/pitch-decks/${deckId}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) {
        setDeleteError(d.message ?? 'Failed to delete deck.');
        return;
      }
      setDecks(prev => prev.filter(deck => deck.id !== deckId));
      setDeletingId(null);
    } catch {
      setDeleteError('Failed to delete deck.');
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="CRM"
        title="Pitch Decks"
        subtitle="Create and send AI-powered pitch decks to clients"
        actions={
          <button
            onClick={() => router.push('/portal/tools/pitch-decks/new')}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            New Deck
          </button>
        }
      />

      <DomainGetStarted domainKey="pitch-decks" />

      {/* Toolbar — search, status filter, sort, create button. Hidden until
          we know there's at least one deck so the empty-state stays clean. */}
      {!loading && decks.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <span className="material-icons text-base text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search decks by title or description..."
              className="w-full rounded-xl border border-border bg-card pl-10 pr-9 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <span className="material-icons text-base">close</span>
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {(['all', 'draft', 'published', 'archived'] as const).map(status => {
              const count = status === 'all'
                ? decks.length
                : decks.filter(d => d.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
                  }`}
                >
                  {status[0].toUpperCase() + status.slice(1)}
                  <span className={`ml-1.5 text-[10px] ${
                    statusFilter === status ? 'opacity-80' : 'opacity-60'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Sort dropdown */}
          <select
            aria-label="Sort decks by"
            value={sort}
            onChange={e => setSort(e.target.value as typeof sort)}
            className={`${pSelect} w-auto`}
          >
            <option value="updated-desc">Last updated (newest)</option>
            <option value="updated-asc">Last updated (oldest)</option>
            <option value="title-asc">Title A → Z</option>
            <option value="title-desc">Title Z → A</option>
          </select>

          {/* Create */}
          <button
            onClick={() => router.push('/portal/tools/pitch-decks/new')}
            className={`${pBtnPrimary} shrink-0`}
          >
            <span className="material-icons text-base">add</span>
            New Deck
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading pitch decks...
        </div>
      ) : decks.length === 0 ? (
        <div className={`${pCard} p-10 text-center space-y-4`}>
          <span className="material-icons text-5xl text-muted-foreground/50">slideshow</span>
          <h2 className={pSectionTitle}>No pitch decks yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first AI-powered pitch deck. Enter a prompt describing what you need and optionally
            provide your website URL to automatically brand the deck.
          </p>
          <button
            onClick={() => router.push('/portal/tools/pitch-decks/new')}
            className={pBtnPrimary}
          >
            <span className="material-icons text-lg">auto_awesome</span>
            Create Your First Deck
          </button>
        </div>
      ) : filteredDecks.length === 0 ? (
        <div className={`${pCard} p-10 text-center space-y-3`}>
          <span className="material-icons text-4xl text-muted-foreground/50">search_off</span>
          <h2 className={pSectionTitle}>No decks match your filters</h2>
          <p className="text-muted-foreground text-sm">
            {search && <>No deck titles or descriptions contain &ldquo;<span className="font-medium">{search}</span>&rdquo;. </>}
            {statusFilter !== 'all' && <>No <span className="font-medium">{statusFilter}</span> decks. </>}
            Adjust your search or filters above.
          </p>
          <button
            onClick={() => { setSearchInput(''); setStatusFilter('all'); }}
            className={pBtnGhost}
          >
            <span className="material-icons text-sm">refresh</span>
            Reset filters
          </button>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            Showing {filteredDecks.length} of {decks.length} {decks.length === 1 ? 'deck' : 'decks'}
            {(search || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchInput(''); setStatusFilter('all'); }}
                className="ml-2 underline hover:text-foreground transition-colors"
              >
                clear filters
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredDecks.map((deck) => {
              const slides = Array.isArray(deck.slides) ? deck.slides : [];
              return (
                <div
                  key={deck.id}
                  onClick={() => router.push(`/portal/tools/pitch-decks/${deck.id}`)}
                  className={`${pCard} p-5 hover:border-foreground/20 hover:shadow-sm transition-all group cursor-pointer`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-primary text-xl">slideshow</span>
                      <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {deck.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${deckStatusColor[deck.status] || deckStatusColor.draft}`}>
                        {deck.status}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteError(''); setDeletingId(deck.id); }}
                        className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete deck"
                      >
                        <span className="material-icons text-base">delete</span>
                      </button>
                    </div>
                  </div>
                  {deck.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{deck.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="material-icons text-sm">layers</span>
                      {slides.length} slide{slides.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-icons text-sm">schedule</span>
                      {new Date(deck.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Delete Deck Dialog ─────────────────────────────────────────────── */}
      {deletingId !== null && (() => {
        const deck = decks.find(d => d.id === deletingId);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`${pCardPad} max-w-md w-full space-y-4`}>
              <h2 className={`${pSectionTitle} flex items-center gap-2`}>
                <span className="material-icons text-destructive">delete_forever</span>
                Delete Pitch Deck
              </h2>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete{' '}
                <strong className="text-foreground">{deck?.title ?? 'this deck'}</strong>? This cannot be undone.
              </p>
              {deleteError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <span className="material-icons text-base">error</span>
                  {deleteError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setDeletingId(null); setDeleteError(''); }}
                  className={pBtnGhost}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deletingId)}
                  className="px-4 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-medium hover:bg-destructive/90 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
