'use client';

import { useEffect, useRef, useState } from 'react';

interface CustomCodeModalProps {
  open: boolean;
  initialCss: string;
  initialJs: string;
  onClose: () => void;
  onApply: (css: string, js: string) => void;
}

export function CustomCodeModal({ open, initialCss, initialJs, onClose, onApply }: CustomCodeModalProps) {
  const [tab, setTab] = useState<'css' | 'js'>('css');
  const [css, setCss] = useState(initialCss);
  const [js, setJs] = useState(initialJs);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const dirty = css !== initialCss || js !== initialJs;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-4xl h-[80vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-icons text-primary">code</span>
            <h2 className="text-sm font-semibold text-foreground">Custom CSS &amp; JavaScript</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors"
            title="Close"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-2 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setTab('css')}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              tab === 'css' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            CSS
          </button>
          <button
            type="button"
            onClick={() => setTab('js')}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              tab === 'js' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            JavaScript
          </button>
          <div className="ml-auto text-xs text-muted-foreground pb-1">
            {tab === 'css'
              ? 'Scoped to .block-content — use :root selectors to escape.'
              : 'Runs after DOM ready on the public page (not in the editor chrome).'}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-4">
          {tab === 'css' ? (
            <textarea
              value={css}
              onChange={(e) => setCss(e.target.value)}
              spellCheck={false}
              placeholder={'/* Write custom CSS for this page */\n.block-content .hero-title {\n  letter-spacing: -0.02em;\n}'}
              className="w-full h-full resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          ) : (
            <textarea
              value={js}
              onChange={(e) => setJs(e.target.value)}
              spellCheck={false}
              placeholder={'// Custom JS runs once after DOMContentLoaded on the published page.\n// document.querySelector(".block-content").classList.add("loaded");'}
              className="w-full h-full resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          )}
        </div>

        <div className="flex items-center justify-between px-5 h-14 border-t border-border shrink-0">
          <div className="text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes — Apply to save with the next page save.' : 'No changes.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(css, js);
                onClose();
              }}
              disabled={!dirty}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="material-icons text-base">check</span>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
