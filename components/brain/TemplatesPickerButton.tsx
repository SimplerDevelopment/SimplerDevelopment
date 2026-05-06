'use client';

/**
 * TemplatesPickerButton — split-button replacement for the plain "+ New" note
 * button. The left half triggers the standard create flow; the right chevron
 * opens a popover listing user templates that, when clicked, create a note
 * via POST /api/portal/brain/knowledge/from-template/[id].
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface BrainNoteTemplate {
  id: number;
  name: string;
  body: string;
  trigger: string;
  defaultTags: string[] | null;
}

interface CreatedNote {
  id: number;
  title: string;
}

export interface TemplatesPickerButtonProps {
  onCreate: () => void;
  onTemplateApplied: (note: CreatedNote) => void;
}

export default function TemplatesPickerButton({ onCreate, onTemplateApplied }: TemplatesPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BrainNoteTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const loadTemplates = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/templates?enabled=true');
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `HTTP ${r.status}`);
        setItems([]);
        return;
      }
      setItems(json.data?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setItems([]);
    }
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && items === null) {
        void loadTemplates();
      }
      return next;
    });
  }, [items, loadTemplates]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleApplyTemplate = useCallback(async (templateId: number) => {
    setApplyingId(templateId);
    try {
      const r = await fetch(`/api/portal/brain/knowledge/from-template/${templateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json().catch(() => ({}));
      if (r.ok && json.success && json.data) {
        setOpen(false);
        onTemplateApplied(json.data as CreatedNote);
      } else {
        setError(json.message || `HTTP ${r.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setApplyingId(null);
    }
  }, [onTemplateApplied]);

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onCreate}
        title="New note"
        aria-label="New note"
        className="h-8 inline-flex items-center justify-center rounded-l-md border border-r-0 border-border text-foreground hover:bg-accent px-2"
      >
        <span className="material-icons text-base">add</span>
      </button>
      <button
        type="button"
        onClick={toggle}
        title="New note from template"
        aria-label="New note from template"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`h-8 w-6 inline-flex items-center justify-center rounded-r-md border border-border transition-colors ${
          open ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent'
        }`}
      >
        <span className="material-icons text-base">arrow_drop_down</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border border-border bg-popover shadow-lg"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs font-medium text-foreground">Start from template</div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {items === null && (
              <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="material-icons animate-spin text-sm">progress_activity</span>
                Loading templates…
              </div>
            )}
            {items !== null && error && (
              <div className="px-3 py-3 text-xs text-destructive">
                Failed to load: {error}
              </div>
            )}
            {items !== null && !error && items.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground italic">
                No templates yet. Create one in Templates to get started.
              </div>
            )}
            {items !== null && items.length > 0 && (
              <ul className="py-1">
                {items.map((tpl) => {
                  const tags = tpl.defaultTags ?? [];
                  const isApplying = applyingId === tpl.id;
                  return (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isApplying}
                        onClick={() => handleApplyTemplate(tpl.id)}
                        className="w-full text-left px-3 py-2 hover:bg-accent disabled:opacity-60 disabled:cursor-wait flex items-start gap-2"
                      >
                        <span className="material-icons text-sm text-muted-foreground mt-0.5">
                          {isApplying ? 'progress_activity' : 'description'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-foreground truncate">{tpl.name}</span>
                          {tags.length > 0 && (
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {tags.slice(0, 4).map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
                                >
                                  {t}
                                </span>
                              ))}
                              {tags.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>
                              )}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border">
            <Link
              href="/portal/brain/templates"
              className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              <span>Manage templates</span>
              <span className="material-icons text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
