'use client';

/**
 * MarkdownEditor — CodeMirror 6 source editor with live preview pane.
 *
 * Foundation component for the Brain authoring upgrade. Provides:
 *  - CodeMirror 6 markdown editing (soft-wrap, no line numbers, dark-mode aware)
 *  - Edit / split / preview mode toggle (persisted in localStorage)
 *  - Hotkeys: Cmd/Ctrl+B (bold), Cmd/Ctrl+I (italic), Cmd/Ctrl+K (link), Cmd/Ctrl+S (save)
 *  - Live markdown preview with GFM (tables, task lists, strikethrough, autolinks) + code highlighting
 *  - Mobile-friendly: split mode collapses to single pane on narrow screens
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import CodeMirror, {
  EditorView,
  keymap,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentWithTab, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { EditorSelection, type ChangeSpec } from '@codemirror/state';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  brainAutocomplete,
  defaultBrainAutocompleteFetchers,
  type BrainAutocompleteFetchers,
} from './markdown-autocomplete';

export type MarkdownEditorMode = 'edit' | 'preview' | 'split';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired on Cmd/Ctrl+S. Browser save dialog is suppressed. */
  onSave?: () => void;
  placeholder?: string;
  /** Minimum editor height in pixels. Defaults to 300. */
  minHeight?: number;
  defaultMode?: MarkdownEditorMode;
  /** Optional storage key override; defaults to `brain.editor.mode`. */
  storageKey?: string;
  className?: string;
  /**
   * Override the autocomplete data sources. Defaults to the live portal Brain
   * APIs. Pass `null` to disable autocomplete (e.g. in admin contexts that
   * have no brain).
   */
  autocompleteFetchers?: BrainAutocompleteFetchers | null;
  /**
   * Extra `react-markdown` component overrides applied on top of (and
   * overriding) the editor's defaults. Lets a caller plug in custom renderers
   * — most notably future block overrides (e.g. dataview).
   *
   * Keys here are merged into the default components map AFTER the defaults,
   * so any key you provide wins.
   */
  extraComponents?: Components;
  /**
   * Receive the underlying CodeMirror EditorView once mounted. Used by the
   * note detail page's outline panel to scroll the editor to a heading.
   * Fires with `null` on unmount.
   */
  onEditorReady?: (view: EditorView | null) => void;
}

const DEFAULT_STORAGE_KEY = 'brain.editor.mode';
const SPLIT_BREAKPOINT_PX = 640;

/** Toggle wrapping the current selection in `marker` on both sides. */
function wrapSelection(view: EditorView, marker: string): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const newSelections: ReturnType<typeof EditorSelection.range>[] = [];

  for (const range of state.selection.ranges) {
    const selected = state.sliceDoc(range.from, range.to);
    const before = state.sliceDoc(Math.max(0, range.from - marker.length), range.from);
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + marker.length));
    const alreadyWrapped = before === marker && after === marker;

    if (alreadyWrapped) {
      // Unwrap.
      changes.push({ from: range.from - marker.length, to: range.from, insert: '' });
      changes.push({ from: range.to, to: range.to + marker.length, insert: '' });
      newSelections.push(EditorSelection.range(range.from - marker.length, range.to - marker.length));
    } else {
      changes.push({ from: range.from, insert: marker });
      changes.push({ from: range.to, insert: marker });
      const newFrom = range.from + marker.length;
      const newTo = range.to + marker.length;
      newSelections.push(
        selected.length === 0
          ? EditorSelection.range(newFrom, newFrom)
          : EditorSelection.range(newFrom, newTo),
      );
    }
  }

  view.dispatch({
    changes,
    selection: EditorSelection.create(newSelections),
  });
  return true;
}

/** Wrap selection in `[selected](url)` and place cursor in the url slot. */
function wrapLink(view: EditorView): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const newSelections: ReturnType<typeof EditorSelection.range>[] = [];

  for (const range of state.selection.ranges) {
    const selected = state.sliceDoc(range.from, range.to);
    const text = selected || 'text';
    const insertion = `[${text}](url)`;
    changes.push({ from: range.from, to: range.to, insert: insertion });

    // Place cursor inside the (url) slot — between the parens.
    const urlStart = range.from + 1 + text.length + 2; // [ text ]( <- here
    const urlEnd = urlStart + 'url'.length;
    newSelections.push(EditorSelection.range(urlStart, urlEnd));
  }

  view.dispatch({
    changes,
    selection: EditorSelection.create(newSelections),
  });
  return true;
}

async function uploadImage(
  file: File | Blob,
  name: string,
): Promise<{ url: string; filename: string } | null> {
  try {
    const fd = new FormData();
    fd.append('file', file, name);
    const r = await fetch('/api/portal/media/upload', { method: 'POST', body: fd });
    const json = (await r.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { url?: string; filename?: string };
    };
    if (!r.ok || !json.success || !json.data?.url) return null;
    return { url: json.data.url, filename: json.data.filename ?? name };
  } catch {
    return null;
  }
}

function escapeMdAlt(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}

let placeholderCounter = 0;
function nextPlaceholderToken(): string {
  placeholderCounter = (placeholderCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}-${placeholderCounter.toString(36)}`;
}

/**
 * Insert a placeholder for an in-flight upload, then resolve it (replacing the
 * placeholder text in place) once the upload finishes. The placeholder embeds
 * a unique token so we can locate it on resolve even after unrelated edits.
 * Returns the length of the inserted text (placeholder + trailing) so the
 * caller can advance its cursor when batching multiple files.
 */
function insertWithPlaceholder(
  view: EditorView,
  file: File,
  pos: number,
  trailing: string,
): number {
  const baseName = file.name || 'image';
  const token = nextPlaceholderToken();
  const placeholder = `![uploading:${token}: ${escapeMdAlt(baseName)}...]()`;
  const insertion = placeholder + trailing;

  view.dispatch({
    changes: { from: pos, to: pos, insert: insertion },
    selection: EditorSelection.cursor(pos + insertion.length),
  });

  void uploadImage(file, baseName).then((result) => {
    const doc = view.state.doc.toString();
    const idx = doc.indexOf(placeholder);
    if (idx === -1) return;
    const replacement = result
      ? `![${escapeMdAlt(result.filename)}](${result.url})`
      : `![upload failed: ${escapeMdAlt(baseName)}]()`;
    view.dispatch({
      changes: { from: idx, to: idx + placeholder.length, insert: replacement },
    });
  });

  return insertion.length;
}

function handleImageFiles(view: EditorView, files: File[], at?: number): void {
  let cursor = at ?? view.state.selection.main.head;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    cursor += insertWithPlaceholder(view, file, cursor, '\n');
  }
}

function readStoredMode(key: string, fallback: MarkdownEditorMode): MarkdownEditorMode {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === 'edit' || v === 'preview' || v === 'split') return v;
  } catch {
    // localStorage may be unavailable (private mode, etc).
  }
  return fallback;
}

function writeStoredMode(key: string, mode: MarkdownEditorMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // ignore
  }
}

/** CodeMirror theme that matches the portal's dark/light system via CSS vars. */
const portalEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: '14px',
  },
  '.cm-content': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    padding: '12px',
    caretColor: 'var(--foreground)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-line': { padding: '0' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--foreground) 15%, transparent) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--foreground) 22%, transparent) !important',
  },
});

/** Markdown preview body — reuses portal aesthetic without depending on @tailwindcss/typography. */
function MarkdownPreview({
  value,
  extraComponents,
}: {
  value: string;
  extraComponents?: Components;
}) {
  if (!value.trim()) {
    return (
      <div className="text-sm text-muted-foreground italic p-4">
        Nothing to preview yet.
      </div>
    );
  }
  // Default component map (built once per render). Spread `extraComponents`
  // last so caller-supplied keys win — the dataview `code` override needs
  // this precedence to intercept ` ```dataview ` fences.
  const defaultComponents: Components = {
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-3 mb-1.5 first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="text-base font-semibold mt-3 mb-1 first:mt-0">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>,
          h6: ({ children }) => <h6 className="text-sm font-medium mt-2 mb-1 first:mt-0 text-muted-foreground">{children}</h6>,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
          li: ({ children, className }) => {
            // GFM task lists get className "task-list-item"; render their checkbox accessibly.
            if (className?.includes('task-list-item')) {
              return <li className="list-none -ml-6 flex items-start gap-2">{children}</li>;
            }
            return <li className="leading-relaxed">{children}</li>;
          },
          input: ({ type, checked, disabled }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={!!checked}
                  disabled={disabled}
                  readOnly
                  className="mt-1 h-3.5 w-3.5 accent-primary"
                />
              );
            }
            return null;
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-border pl-4 italic text-muted-foreground my-3">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) {
              return (
                <code className={`${className ?? ''} block`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-muted rounded px-1.5 py-0.5 text-[0.85em] font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-muted/70 rounded-md p-3 text-xs font-mono overflow-x-auto mb-3">
              {children}
            </pre>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through text-muted-foreground">{children}</del>,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="min-w-full text-xs border border-border">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 bg-muted font-semibold text-left">{children}</th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="max-w-full rounded-md my-2" />
          ),
  };
  const components: Components = extraComponents
    ? { ...defaultComponents, ...extraComponents }
    : defaultComponents;
  return (
    <div className="markdown-preview p-4 text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

/** Toolbar mode-toggle button. */
function ModeButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
      } ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
    >
      <span className="material-icons text-base">{icon}</span>
    </button>
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  onSave,
  placeholder = 'Markdown supported. **bold**, *italic*, `code`, ```block```, > quote, - list, [link](url)',
  minHeight = 300,
  defaultMode = 'split',
  storageKey = DEFAULT_STORAGE_KEY,
  className,
  autocompleteFetchers = defaultBrainAutocompleteFetchers,
  extraComponents,
  onEditorReady,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<MarkdownEditorMode>(defaultMode);
  const [hydrated, setHydrated] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  // Holds the latest `onSave` so the (stable) keymap can call the current callback
  // without forcing the editor to rebuild extensions on every prop change.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Stable wrapper so the keymap binding (built once, in useMemo with empty deps)
  // is never accused of "reading a ref during render". Calling this at keystroke
  // time is safe because keystroke handlers run after render has committed.
  const invokeSave = useCallback(() => {
    const cb = onSaveRef.current;
    if (cb) cb();
  }, []);

  // Hydrate persisted mode from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    queueMicrotask(() => {
      setMode(readStoredMode(storageKey, defaultMode));
      setHydrated(true);
    });
  }, [storageKey, defaultMode]);

  // Track viewport width to disable split mode on small screens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${SPLIT_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Persist mode changes.
  const handleModeChange = useCallback(
    (next: MarkdownEditorMode) => {
      setMode(next);
      writeStoredMode(storageKey, next);
    },
    [storageKey],
  );

  // Surface the EditorView upward when @uiw/react-codemirror has created it.
  // Using `onCreateEditor` (the library's lifecycle hook) avoids polling and
  // fires exactly once per mount of the underlying CodeMirror instance.
  const onEditorReadyRef = useRef(onEditorReady);
  useEffect(() => { onEditorReadyRef.current = onEditorReady; }, [onEditorReady]);
  const handleCreateEditor = useCallback((view: EditorView) => {
    onEditorReadyRef.current?.(view);
  }, []);

  const handleChange = useCallback(
    (v: string) => {
      onChange(v);
    },
    [onChange],
  );

  const extensions = useMemo(() => {
    // CodeMirror keymap callbacks fire only at keystroke time (post-render),
    // so reading the latest `onSave` via `invokeSave` is safe. The
    // `react-hooks/refs` lint rule can't model that lifecycle and flags it
    // conservatively — disable for this block.
    // eslint-disable-next-line react-hooks/refs
    const editorKeymap = keymap.of([
      {
        key: 'Mod-b',
        preventDefault: true,
        run: (view) => wrapSelection(view, '**'),
      },
      {
        key: 'Mod-i',
        preventDefault: true,
        run: (view) => wrapSelection(view, '*'),
      },
      {
        key: 'Mod-k',
        preventDefault: true,
        run: (view) => wrapLink(view),
      },
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          invokeSave();
          return true;
        },
      },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]);

    const imageDropPaste = EditorView.domEventHandlers({
      paste: (event, view) => {
        const items = event.clipboardData?.items;
        if (!items || items.length === 0) return false;
        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) imageFiles.push(f);
          }
        }
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        handleImageFiles(view, imageFiles);
        return true;
      },
      drop: (event, view) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles: File[] = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.type.startsWith('image/')) imageFiles.push(f);
        }
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
          view.state.selection.main.head;
        handleImageFiles(view, imageFiles, pos);
        return true;
      },
    });

    return [
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      EditorView.lineWrapping,
      portalEditorTheme,
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor' }),
      editorKeymap,
      imageDropPaste,
      // Obsidian-style autocomplete: [[ for notes, # for tags, @ for CRM,
      // / for slash commands. Falls back to no-op when fetchers are null
      // (e.g. admin contexts with no brain).
      ...(autocompleteFetchers ? [brainAutocomplete(autocompleteFetchers)] : []),
    ];
  }, [invokeSave, autocompleteFetchers]);

  // On narrow screens, force split → edit (preview stays available via toggle).
  const effectiveMode: MarkdownEditorMode = isNarrow && mode === 'split' ? 'edit' : mode;
  const showEditor = effectiveMode === 'edit' || effectiveMode === 'split';
  const showPreview = effectiveMode === 'preview' || effectiveMode === 'split';

  return (
    <div
      className={`mt-1 rounded-md border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary/50 ${
        className ?? ''
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="material-icons text-sm">edit_note</span>
          <span>Markdown</span>
        </div>
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60"
          role="group"
          aria-label="Editor view mode"
        >
          <ModeButton
            active={effectiveMode === 'edit'}
            onClick={() => handleModeChange('edit')}
            icon="edit"
            label="Edit only"
          />
          <ModeButton
            active={effectiveMode === 'split'}
            onClick={() => handleModeChange('split')}
            icon="vertical_split"
            label="Split view"
            disabled={isNarrow}
          />
          <ModeButton
            active={effectiveMode === 'preview'}
            onClick={() => handleModeChange('preview')}
            icon="visibility"
            label="Preview only"
          />
        </div>
      </div>

      {/* Body */}
      <div
        className="flex flex-col sm:flex-row"
        style={{ minHeight: `${minHeight}px` }}
      >
        {showEditor && (
          <div
            className={`min-w-0 flex-1 ${
              showPreview ? 'sm:border-r border-border' : ''
            }`}
          >
            {/*
              Suspense isn't needed: @uiw/react-codemirror handles its own readiness.
              We rely on `hydrated` only to prevent SSR/CSR mismatch on the mode toggle UI;
              the editor itself is fine to mount immediately.
            */}
            <CodeMirror
              ref={editorRef}
              value={value}
              onChange={handleChange}
              onCreateEditor={handleCreateEditor}
              placeholder={placeholder}
              extensions={extensions}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
                searchKeymap: false,
                // Defer to our custom keymap above — basicSetup includes its own
                // defaultKeymap/historyKeymap entries which would shadow Mod-b/i/k/s otherwise.
                defaultKeymap: false,
                historyKeymap: false,
              }}
              minHeight={`${minHeight}px`}
              theme="none"
              indentWithTab={false}
              data-testid="markdown-editor-source"
            />
          </div>
        )}
        {showPreview && (
          <div
            className="min-w-0 flex-1 overflow-y-auto"
            style={{ maxHeight: '70vh' }}
            data-testid="markdown-editor-preview"
            aria-label="Markdown preview"
          >
            <MarkdownPreview value={value} extraComponents={extraComponents} />
          </div>
        )}
      </div>

      {/* Hide the visual toggle UI before hydration to avoid a flash of the wrong mode. */}
      {!hydrated && <span className="sr-only">Loading editor preferences…</span>}
    </div>
  );
}
