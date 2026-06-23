/**
 * ProjectArtifactsTab — list and link artifacts (websites, decks, surveys,
 * proposals, bookings, brain notes, emails, posts) onto a project.
 *
 * Mirrors the per-card artifacts UI in
 * components/portal/card-detail/_sections/CardArtifacts.tsx but is scoped to
 * the per-project page tab. Talks to /api/portal/projects/:id/artifacts and
 * /api/portal/projects/:id/artifacts/available.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Artifact {
  id: number;
  projectId: number;
  artifactType: string;
  artifactId: number;
  displayTitle: string;
  pinned: boolean;
  createdBy: number | null;
  createdAt: string;
}

interface AvailableArtifact {
  type: string;
  id: number;
  title: string;
}

const ARTIFACT_LABELS: Record<string, string> = {
  website: 'Website',
  email_campaign: 'Email Campaign',
  pitch_deck: 'Pitch Deck',
  proposal: 'Proposal',
  booking: 'Booking',
  survey: 'Survey',
  post: 'Post',
  brain_note: 'Brain Note',
};

const ARTIFACT_ICONS: Record<string, string> = {
  website: 'language',
  email_campaign: 'campaign',
  pitch_deck: 'slideshow',
  proposal: 'description',
  booking: 'calendar_month',
  survey: 'poll',
  post: 'article',
  brain_note: 'psychology',
};

function artifactUrl(type: string, id: number): string | null {
  switch (type) {
    case 'website':
      return `/portal/websites/${id}`;
    case 'email_campaign':
      return `/portal/email/campaigns/${id}`;
    case 'pitch_deck':
      return `/portal/tools/pitch-decks/${id}`;
    case 'proposal':
      return `/portal/crm/proposals/${id}`;
    case 'booking':
      return `/portal/tools/booking/${id}`;
    case 'survey':
      return `/portal/surveys/${id}`;
    case 'post':
      return `/portal/posts/${id}`;
    case 'brain_note':
      return `/portal/brain/notes/${id}`;
    default:
      return null;
  }
}

interface Props {
  projectId: number;
  canEdit: boolean;
}

export default function ProjectArtifactsTab({ projectId, canEdit }: Props) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [available, setAvailable] = useState<AvailableArtifact[]>([]);
  const [availableLoaded, setAvailableLoaded] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Initial list load.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/portal/projects/${projectId}/artifacts`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!alive) return;
        if (data?.success) setArtifacts(data.data ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Lazy-load /available whenever the picker opens or the type/search filter
  // changes. The endpoint now REQUIRES `?type=`, so empty typeFilter sends
  // `type=all` for a small browse-all sample. Selecting a chip rescopes to a
  // single bounded type query.
  useEffect(() => {
    if (!showPicker) return;
    let alive = true;
    setAvailableLoaded(false);
    const params = new URLSearchParams();
    params.set('type', typeFilter || 'all');
    const q = search.trim();
    if (q) params.set('q', q);
    fetch(`/api/portal/projects/${projectId}/artifacts/available?${params.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!alive) return;
        if (data?.success) setAvailable(data.data ?? []);
        setAvailableLoaded(true);
      })
      .catch(() => alive && setAvailableLoaded(true));
    return () => {
      alive = false;
    };
  }, [showPicker, projectId, typeFilter, search]);

  // Close picker on outside click.
  useEffect(() => {
    if (!showPicker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showPicker]);

  const sorted = useMemo(() => {
    return [...artifacts].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [artifacts]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available
      .filter(a => !typeFilter || a.type === typeFilter)
      .filter(a => !q || a.title.toLowerCase().includes(q))
      .filter(
        a => !artifacts.some(linked => linked.artifactType === a.type && linked.artifactId === a.id),
      );
  }, [available, artifacts, typeFilter, search]);

  // Type chips: show the full supported set. We can't derive from `available`
  // anymore because the picker now scopes the fetch to a single type at a
  // time (see /artifacts/available — it requires ?type=).
  const availableTypes = useMemo(
    () => Object.keys(ARTIFACT_LABELS),
    [],
  );

  async function linkArtifact(type: string, artifactId: number) {
    const res = await fetch(`/api/portal/projects/${projectId}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactType: type, artifactId }),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data?.success) return;
    // Reload the list (cheaper than threading the new row through state shape).
    const fresh = await fetch(`/api/portal/projects/${projectId}/artifacts`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    if (fresh?.success) setArtifacts(fresh.data ?? []);
    setShowPicker(false);
    setSearch('');
  }

  async function togglePin(artifactDbId: number, pinned: boolean) {
    setArtifacts(prev => prev.map(a => (a.id === artifactDbId ? { ...a, pinned } : a)));
    await fetch(`/api/portal/projects/${projectId}/artifacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactDbId, pinned }),
    }).catch(() => {});
  }

  async function unlink(artifactDbId: number) {
    const prev = artifacts;
    setArtifacts(prev.filter(a => a.id !== artifactDbId));
    const res = await fetch(`/api/portal/projects/${projectId}/artifacts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactDbId }),
    }).catch(() => null);
    if (!res || !res.ok) {
      // Roll back on failure.
      setArtifacts(prev);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 flex items-center justify-center text-muted-foreground">
        <span className="material-icons animate-spin mr-2">refresh</span>
        Loading artifacts…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header / actions */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Artifacts {artifacts.length > 0 && (
              <span className="text-sm text-muted-foreground font-normal">({artifacts.length})</span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Websites, decks, proposals, surveys, and other workspace items linked to this project.
          </p>
        </div>
        {canEdit && (
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowPicker(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">{showPicker ? 'close' : 'add'}</span>
              {showPicker ? 'Close' : 'Link artifact'}
            </button>

            {showPicker && (
              <div className="absolute right-0 mt-2 w-[28rem] max-w-[90vw] z-20 rounded-xl border border-border bg-popover shadow-lg p-3 space-y-3">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search artifacts…"
                  className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('')}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!typeFilter ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}
                  >
                    All
                  </button>
                  {availableTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTypeFilter(type)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${typeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}
                    >
                      {ARTIFACT_LABELS[type] ?? type}
                    </button>
                  ))}
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
                  {!availableLoaded ? (
                    <p className="text-xs text-muted-foreground text-center py-4 flex items-center justify-center gap-1">
                      <span className="material-icons animate-spin text-sm">refresh</span>
                      Loading…
                    </p>
                  ) : filteredAvailable.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No available artifacts
                      {typeFilter ? ` of type "${ARTIFACT_LABELS[typeFilter] ?? typeFilter}"` : ''}
                      {search ? ` matching "${search}"` : ''}.
                    </p>
                  ) : (
                    filteredAvailable.map(a => (
                      <button
                        key={`${a.type}-${a.id}`}
                        type="button"
                        onClick={() => linkArtifact(a.type, a.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                      >
                        <span className="material-icons text-base text-muted-foreground">
                          {ARTIFACT_ICONS[a.type] || 'attachment'}
                        </span>
                        <span className="flex-1 truncate">{a.title}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-auto shrink-0">
                          {ARTIFACT_LABELS[a.type] ?? a.type}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">attachment</span>
          <h3 className="mt-4 font-semibold text-foreground">No artifacts linked yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Link websites, pitch decks, proposals, or surveys so the team can find them from this project.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <span className="material-icons text-base">add</span>
              Link your first artifact
            </button>
          )}
        </div>
      )}

      {/* List */}
      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map(a => {
            const url = artifactUrl(a.artifactType, a.artifactId);
            const label = ARTIFACT_LABELS[a.artifactType] ?? a.artifactType;
            const icon = ARTIFACT_ICONS[a.artifactType] || 'attachment';
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${a.pinned ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
              >
                <span className="material-icons text-xl text-muted-foreground shrink-0">{icon}</span>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 group"
                    title="Open artifact"
                  >
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary group-hover:underline">
                      {a.displayTitle}
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
                        {label}
                      </span>
                    </p>
                  </a>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.displayTitle}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
                        {label}
                      </span>
                    </p>
                  </div>
                )}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                    title="Open in new tab"
                  >
                    <span className="material-icons text-base">open_in_new</span>
                  </a>
                )}
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => togglePin(a.id, !a.pinned)}
                      className={`p-1.5 rounded transition-colors ${a.pinned ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent'}`}
                      title={a.pinned ? 'Unpin' : 'Pin'}
                    >
                      <span className="material-icons text-base">push_pin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => unlink(a.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Unlink"
                    >
                      <span className="material-icons text-base">close</span>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
