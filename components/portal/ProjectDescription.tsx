'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarkdownView from './MarkdownView';
import { stripMarkdown } from '@/lib/portal-utils';

interface Props {
  projectId: number;
  title: string;
  description: string;
  canEdit: boolean;
  excerptLength?: number;
}

export default function ProjectDescription({ projectId, title, description, canEdit, excerptLength = 180 }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [saving, setSaving] = useState(false);
  // Source of truth is the `description` prop; router.refresh() after save pulls fresh data
  const value = description;

  const plain = stripMarkdown(value);
  const needsTruncation = plain.length > excerptLength;
  const excerpt = needsTruncation ? `${plain.slice(0, excerptLength).trimEnd()}…` : plain;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !editing) setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing]);

  async function save() {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    const res = await fetch(`/api/portal/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: draft }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      // router.refresh() below will pick up the new description from the server
      setEditing(false);
      router.refresh();
    }
  }

  return (
    <>
      <p className="mt-1 text-muted-foreground">
        {value
          ? excerpt
          : canEdit && <span className="italic">No description yet.</span>}
        {(needsTruncation || canEdit) && (
          <button
            type="button"
            onClick={() => { if (!value && canEdit) { setDraft(''); setEditing(true); } setOpen(true); }}
            className="ml-1 text-primary hover:underline font-medium inline-flex items-center gap-0.5"
          >
            {needsTruncation ? 'Read more' : value ? 'View' : 'Add description'}
            <span className="material-icons text-sm leading-none">chevron_right</span>
          </button>
        )}
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!editing) setOpen(false); }} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-start gap-3 p-5 border-b border-border shrink-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Project description</p>
                <h2 className="text-xl font-bold text-foreground leading-tight">{title}</h2>
              </div>
              {canEdit && !editing && (
                <button
                  onClick={() => { setDraft(value); setEditing(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors shrink-0"
                >
                  <span className="material-icons text-sm">edit</span>Edit
                </button>
              )}
              <button
                onClick={() => { if (!editing) setOpen(false); }}
                disabled={editing}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <span className="material-icons text-xl text-muted-foreground">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editing ? (
                <div className="space-y-3">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={16}
                    placeholder="Supports Markdown — **bold**, # headings, - lists, `code`, [links](url)…"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setDraft(value); }}
                      disabled={saving}
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground">Markdown supported</span>
                  </div>
                </div>
              ) : value ? (
                <MarkdownView className="text-sm text-foreground">{value}</MarkdownView>
              ) : (
                <p className="text-sm text-muted-foreground italic">No description yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
