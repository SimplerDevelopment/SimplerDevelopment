'use client';

/**
 * HtmlTemplateEditor — CodeMirror 6 source editor for the html-render block's
 * template. Inline by default at a manageable height; a "Expand" button opens
 * the same editor in a full-screen modal for serious authoring sessions.
 *
 * Both views share the same `value`/`onChange` so edits flow through immediately
 * — no "save modal to apply" step. Closing the modal just hides the chrome,
 * the underlying state is already up to date.
 *
 * HTML syntax highlighting is provided by `@codemirror/lang-html`. Other
 * basic-setup defaults match the project's MarkdownEditor (no line numbers,
 * no fold gutter, etc.).
 */

import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html as htmlLang } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';

interface HtmlTemplateEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Inline editor height (px). Defaults to 320. */
  inlineHeight?: number;
}

export function HtmlTemplateEditor({ value, onChange, inlineHeight = 320 }: HtmlTemplateEditorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline px-1.5 py-0.5"
          title="Open template editor in a full-screen modal"
        >
          <span className="material-icons text-sm">open_in_full</span>
          Expand
        </button>
      </div>

      <Editor value={value} onChange={onChange} height={`${inlineHeight}px`} />

      {expanded && (
        <ExpandedEditorModal onClose={() => setExpanded(false)}>
          <Editor value={value} onChange={onChange} height="100%" />
        </ExpandedEditorModal>
      )}
    </div>
  );
}

function Editor({ value, onChange, height }: { value: string; onChange: (v: string) => void; height: string }) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[htmlLang(), EditorView.lineWrapping]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        searchKeymap: true,
      }}
      height={height}
      theme="none"
      // The CodeMirror default font is monospace already; keep our chrome-tuned
      // border/focus ring on the wrapper via className.
      className="rounded border border-border overflow-hidden text-xs focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
    />
  );
}

function ExpandedEditorModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Escape-to-close + click-outside via the backdrop layer.
  return (
    <div
      role="dialog"
      aria-label="HTML template editor"
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-stretch justify-center p-6"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="relative flex-1 max-w-6xl rounded-lg border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">code</span>
            <h2 className="text-sm font-semibold text-foreground">HTML template</h2>
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              Esc or click outside to close — edits save automatically
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
            title="Close (Esc)"
          >
            <span className="material-icons text-sm">close_fullscreen</span>
            Collapse
          </button>
        </header>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
