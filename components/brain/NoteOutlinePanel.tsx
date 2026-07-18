'use client';

/**
 * NoteOutlinePanel — auto-TOC of headings in the current markdown body.
 *
 * Pure client-side: parses `body` for ATX headings (`^#{1,6} (.+)$`) and
 * renders them as a nested list indented by level. Clicking a heading scrolls
 * the editor to that heading (when the EditorView is available) and falls
 * back to a no-op when the editor isn't mounted yet.
 *
 * We intentionally don't try to be clever about `setext` headings or
 * front-matter — the brain editor is plain markdown today, and ATX-only
 * keeps the parse simple and correct.
 */

import { useMemo } from 'react';
import type { EditorView } from '@codemirror/view';

interface OutlineEntry {
  level: number;
  text: string;
  /** Zero-based line number in the source body. */
  line: number;
}

export interface NoteOutlinePanelProps {
  body: string;
  /** Imperative handle into the underlying CodeMirror EditorView. */
  getEditorView?: () => EditorView | null;
}

/** Skip lines inside fenced code blocks — `# foo` inside ``` is not a heading. */
function parseHeadings(src: string): OutlineEntry[] {
  const lines = src.split('\n');
  const out: OutlineEntry[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    // Track triple-backtick / triple-tilde fences.
    if (!inFence) {
      const m = /^(```+|~~~+)/.exec(trimmed);
      if (m) {
        inFence = true;
        fenceMarker = m[1][0];
        continue;
      }
    } else {
      if (new RegExp(`^${fenceMarker}{3,}`).test(trimmed)) {
        inFence = false;
      }
      continue;
    }
    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(raw);
    if (m) {
      out.push({ level: m[1].length, text: m[2].trim(), line: i });
    }
  }
  return out;
}

export default function NoteOutlinePanel({ body, getEditorView }: NoteOutlinePanelProps) {
  const headings = useMemo(() => parseHeadings(body), [body]);

  if (headings.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        No headings yet. Add <code className="px-1 py-0.5 rounded bg-muted text-foreground">#</code> headings to your note to build an outline.
      </div>
    );
  }

  // Normalize so the smallest heading level becomes the first indent step.
  const minLevel = Math.min(...headings.map((h) => h.level));

  const jumpTo = (entry: OutlineEntry) => {
    const view = getEditorView?.();
    if (!view) return;
    try {
      const linePos = view.state.doc.line(entry.line + 1);
      view.dispatch({
        selection: { anchor: linePos.from, head: linePos.from },
        effects: [],
        scrollIntoView: true,
      });
      view.focus();
    } catch {
      // Out of range (e.g. body changed between parse and click) — silently ignore.
    }
  };

  return (
    <nav aria-label="Note outline" className="p-3">
      <ul className="space-y-0.5 text-sm">
        {headings.map((h, idx) => {
          const indent = (h.level - minLevel) * 12;
          return (
            <li key={`${idx}-${h.line}`}>
              <button
                type="button"
                onClick={() => jumpTo(h)}
                className="w-full text-left px-2 py-1 rounded hover:bg-accent text-foreground/90 hover:text-foreground transition-colors truncate"
                style={{ paddingLeft: `${8 + indent}px` }}
                title={h.text}
              >
                <span className={`mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums`}>
                  H{h.level}
                </span>
                {h.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
