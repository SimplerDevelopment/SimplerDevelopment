'use client';

// Centralized "New Experiment" picker. Lets the user pick a target — a Page
// (post) or a Pitch deck — then names + creates the experiment without first
// having to navigate into a post/deck.
//
// POSTs to /api/portal/experiments per the polymorphic engine contract:
// `{ targetType, targetId, name }`. On success the caller is routed to the
// new experiment's detail page.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Site {
  id: number;
  name: string;
}

interface PostOption {
  id: number;
  title: string;
  siteId: number;
  siteName: string;
}

interface DeckOption {
  id: number;
  title: string;
}

type TargetType = 'page' | 'pitch_deck';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Client-side launcher pair: a button that opens the picker modal. Lets the
 * server-rendered list page stay a server component while still hosting client
 * state for the modal.
 */
export function NewExperimentLauncher({
  variant = 'primary',
  label = 'New Experiment',
}: {
  variant?: 'primary' | 'cta';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const baseClass =
    variant === 'cta'
      ? 'inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors'
      : 'flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={baseClass}>
        <span className="material-icons text-base">add</span>
        {label}
      </button>
      <NewExperimentModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function NewExperimentModal({ open, onClose }: Props) {
  const router = useRouter();

  const [targetType, setTargetType] = useState<TargetType>('page');

  const [posts, setPosts] = useState<PostOption[]>([]);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [name, setName] = useState('');
  // Track whether the user has manually edited the name; if so we stop
  // auto-syncing when the target selection changes.
  const [nameDirty, setNameDirty] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ─── Load options when opened ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');

    (async () => {
      try {
        // Pull sites first; then fetch posts per-site in parallel.
        const sitesRes = await fetch('/api/portal/cms/websites');
        const sitesJson = await sitesRes.json();
        if (!sitesJson.success) throw new Error(sitesJson.message || 'Failed to load sites');
        const sites: Site[] = sitesJson.data ?? [];

        const [postsBySite, decksJson] = await Promise.all([
          Promise.all(
            sites.map(async (site) => {
              const r = await fetch(`/api/portal/cms/websites/${site.id}/posts/picker?postType=page`);
              const j = await r.json();
              if (!j.success) return [] as PostOption[];
              return ((j.data ?? []) as Array<{ id: number; title: string }>).map(p => ({
                id: p.id,
                title: p.title,
                siteId: site.id,
                siteName: site.name,
              }));
            }),
          ),
          fetch('/api/portal/tools/pitch-decks').then(r => r.json()).catch(() => ({ success: false })),
        ]);

        if (cancelled) return;

        const flatPosts = postsBySite.flat().sort((a, b) => a.title.localeCompare(b.title));
        setPosts(flatPosts);

        const deckList: DeckOption[] = (decksJson?.data ?? []).map((d: { id: number; title: string }) => ({
          id: d.id,
          title: d.title,
        }));
        setDecks(deckList);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load targets.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // ─── Reset state on close ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) return;
    setTargetType('page');
    setSelectedTargetId(null);
    setName('');
    setNameDirty(false);
    setSubmitError('');
    setSubmitting(false);
  }, [open]);

  // ─── Auto-sync default name to the selected target ─────────────────────────
  const selectedTitle = useMemo(() => {
    if (selectedTargetId == null) return '';
    if (targetType === 'page') {
      return posts.find(p => p.id === selectedTargetId)?.title ?? '';
    }
    return decks.find(d => d.id === selectedTargetId)?.title ?? '';
  }, [targetType, selectedTargetId, posts, decks]);

  useEffect(() => {
    if (nameDirty) return;
    setName(selectedTitle ? `A/B test — ${selectedTitle}` : '');
  }, [selectedTitle, nameDirty]);

  // When the user toggles target type, clear selection (default name follows).
  function handleTargetTypeChange(next: TargetType) {
    setTargetType(next);
    setSelectedTargetId(null);
    setSubmitError('');
  }

  // ─── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTargetId == null) {
      setSubmitError('Pick a target first.');
      return;
    }
    if (!name.trim()) {
      setSubmitError('Name is required.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/portal/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId: selectedTargetId,
          name: name.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitError(json.error || json.message || 'Failed to create experiment.');
        setSubmitting(false);
        return;
      }
      const newId: number | undefined = json.data?.id;
      if (!newId) {
        setSubmitError('Experiment created but response was missing an id.');
        setSubmitting(false);
        return;
      }
      router.push(`/portal/experiments/${newId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">science</span>
            New Experiment
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target type toggle */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Target type
            </label>
            <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1">
              <button
                type="button"
                onClick={() => handleTargetTypeChange('page')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  targetType === 'page'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <span className="material-icons text-base">description</span>
                Page
              </button>
              <button
                type="button"
                onClick={() => handleTargetTypeChange('pitch_deck')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  targetType === 'pitch_deck'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <span className="material-icons text-base">slideshow</span>
                Pitch deck
              </button>
            </div>
          </div>

          {/* Target picker */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {targetType === 'page' ? 'Page' : 'Pitch deck'}
            </label>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <span className="material-icons animate-spin text-base">progress_activity</span>
                Loading...
              </div>
            ) : loadError ? (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <span className="material-icons text-base">error</span>
                {loadError}
              </div>
            ) : targetType === 'page' ? (
              posts.length === 0 ? (
                <div className="text-sm text-muted-foreground bg-background border border-border rounded-lg px-3 py-2">
                  No pages found on your sites.
                </div>
              ) : (
                <select
                  value={selectedTargetId ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setSelectedTargetId(v ? Number(v) : null);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a page...</option>
                  {posts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {p.siteName}
                    </option>
                  ))}
                </select>
              )
            ) : decks.length === 0 ? (
              <div className="text-sm text-muted-foreground bg-background border border-border rounded-lg px-3 py-2">
                No pitch decks yet.
              </div>
            ) : (
              <select
                value={selectedTargetId ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  setSelectedTargetId(v ? Number(v) : null);
                }}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select a pitch deck...</option>
                {decks.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Name
            </label>
            <input
              value={name}
              onChange={e => {
                setName(e.target.value);
                setNameDirty(true);
              }}
              placeholder="A/B test — ..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Default updates with your selection. Click to override.
            </p>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {submitError}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || selectedTargetId == null}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="material-icons animate-spin text-base">progress_activity</span>
                  Creating...
                </>
              ) : (
                <>
                  <span className="material-icons text-base">add</span>
                  Create
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
