'use client';

import { useState, useEffect } from 'react';

interface Revision {
  id: number;
  title: string;
  trigger: 'autosave' | 'manual' | 'publish';
  createdAt: string;
}

interface RevisionHistoryProps {
  siteId: number;
  postId: number;
  open: boolean;
  onClose: () => void;
  onRevert: () => void;
}

export default function RevisionHistory({ siteId, postId, open, onClose, onRevert }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/portal/cms/websites/${siteId}/posts/${postId}/revisions`)
      .then(r => r.json())
      .then(res => { if (res.success) setRevisions(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, siteId, postId]);

  const handleRevert = async (revisionId: number) => {
    setReverting(revisionId);
    try {
      const res = await fetch(`/api/portal/cms/websites/${siteId}/posts/${postId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionId }),
      });
      const data = await res.json();
      if (data.success) {
        onRevert();
        onClose();
      }
    } catch {
      // ignore
    } finally {
      setReverting(null);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const triggerIcon = (trigger: string) => {
    switch (trigger) {
      case 'publish': return 'public';
      case 'autosave': return 'autorenew';
      default: return 'save';
    }
  };

  const triggerLabel = (trigger: string) => {
    switch (trigger) {
      case 'publish': return 'Published';
      case 'autosave': return 'Autosaved';
      default: return 'Saved';
    }
  };

  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 z-40 h-full w-80 border-l border-border bg-background shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="material-icons text-lg">history</span>
          <h3 className="text-sm font-semibold">Revision History</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent transition-colors"
        >
          <span className="material-icons text-lg">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-icons text-2xl animate-spin text-muted-foreground">progress_activity</span>
          </div>
        ) : revisions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <span className="material-icons text-3xl mb-2">history</span>
            <p className="text-sm">No revisions yet</p>
            <p className="text-xs mt-1">Changes will appear here as you edit</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {revisions.map((rev, i) => (
              <div
                key={rev.id}
                className={`px-4 py-3 hover:bg-accent/50 transition-colors ${
                  rev.trigger === 'publish' ? 'bg-green-500/5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`material-icons text-base mt-0.5 shrink-0 ${
                      rev.trigger === 'publish' ? 'text-green-600' : 'text-muted-foreground'
                    }`}>
                      {triggerIcon(rev.trigger)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${
                          rev.trigger === 'publish' ? 'text-green-600' : 'text-muted-foreground'
                        }`}>
                          {triggerLabel(rev.trigger)}
                        </span>
                        {i === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            Latest
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {rev.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {formatTime(rev.createdAt)}
                      </p>
                    </div>
                  </div>
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRevert(rev.id)}
                      disabled={reverting !== null}
                      className="shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {reverting === rev.id ? (
                        <span className="material-icons text-xs animate-spin">progress_activity</span>
                      ) : (
                        'Restore'
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
