/**
 * Obsidian-style autocomplete for the Brain MarkdownEditor.
 *
 * Four trigger characters dispatch to different sources:
 *   `[[` — fuzzy notes by title, inserts `[[Title]]`
 *   `#`  — fuzzy tags, inserts `#tag ` (only when preceded by space/newline/doc-start)
 *   `@`  — fuzzy CRM hits (contact/company/deal), inserts `[Name](url)`
 *   `/`  — static command palette at start-of-line (insert markdown stubs)
 *
 * Network calls are debounced via in-flight de-dup + a 60 s success cache so that
 * rapid keystrokes don't hammer the API. Failures fall through silently — the
 * autocomplete simply shows nothing.
 *
 * The popup styling rides on a CodeMirror theme block scoped to `.cm-tooltip-autocomplete`
 * so it visually matches the portal modal/popup aesthetic (matches CmdKPalette).
 */

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BrainAutocompleteFetchers {
  /** Fetch note titles matching `query`. Should return at most ~10 items. */
  fetchNotes: (query: string) => Promise<NoteSuggestion[]>;
  /** Fetch tags. Caller is expected to filter client-side; we do too. */
  fetchTags: (query: string) => Promise<TagSuggestion[]>;
  /** Fetch CRM hits (contacts/companies/deals) matching `query`. */
  fetchCrm: (query: string) => Promise<CrmSuggestion[]>;
}

export interface NoteSuggestion {
  title: string;
  /** Optional preview/snippet to show under the title. */
  detail?: string;
}

export interface TagSuggestion {
  tag: string;
  count?: number;
}

export interface CrmSuggestion {
  type: 'contact' | 'company' | 'deal';
  title: string;
  url: string;
  /** Optional sub-line, e.g. company affiliation or deal stage. */
  detail?: string;
}

/** Build the autocompletion extension to plug into CodeMirror. */
export function brainAutocomplete(opts: BrainAutocompleteFetchers): Extension {
  return [
    autocompletion({
      override: [
        wikilinkSource(opts.fetchNotes),
        tagSource(opts.fetchTags),
        crmSource(opts.fetchCrm),
        slashCommandSource(opts.fetchNotes),
      ],
      activateOnTyping: true,
      closeOnBlur: true,
      maxRenderedOptions: 12,
      icons: false,
    }),
    autocompleteTheme,
  ];
}

// ---------------------------------------------------------------------------
// Default fetchers — wire to the portal Brain APIs.
// ---------------------------------------------------------------------------

/**
 * Default fetchers that hit the live `/api/portal/brain/*` endpoints. Use these
 * as the `opts` passed to `brainAutocomplete` from inside a portal page.
 */
export const defaultBrainAutocompleteFetchers: BrainAutocompleteFetchers = {
  fetchNotes: cachedFetch('notes', async (query) => {
    const params = new URLSearchParams({ limit: '10' });
    if (query) params.set('search', query);
    const r = await fetch(`/api/portal/brain/knowledge?${params.toString()}`, {
      credentials: 'include',
    });
    if (!r.ok) return [];
    const json = (await r.json().catch(() => null)) as
      | { success?: boolean; data?: { items?: { title?: unknown; body?: unknown }[] } }
      | null;
    const items = json?.data?.items ?? [];
    return items
      .map((n): NoteSuggestion | null =>
        typeof n.title === 'string' && n.title.trim()
          ? {
              title: n.title,
              detail: typeof n.body === 'string'
                ? truncate(n.body.replace(/\s+/g, ' ').trim(), 60)
                : undefined,
            }
          : null,
      )
      .filter((x): x is NoteSuggestion => x !== null);
  }),
  fetchTags: cachedFetch('tags', async (query) => {
    const r = await fetch('/api/portal/brain/knowledge?tags=true', {
      credentials: 'include',
    });
    if (!r.ok) return [];
    const json = (await r.json().catch(() => null)) as
      | { success?: boolean; data?: { tags?: unknown } }
      | null;
    const tags = Array.isArray(json?.data?.tags) ? (json!.data!.tags as unknown[]) : [];
    const out: TagSuggestion[] = [];
    const lower = query.toLowerCase();
    for (const t of tags) {
      if (typeof t !== 'string' || !t) continue;
      if (lower && !t.toLowerCase().includes(lower)) continue;
      out.push({ tag: t });
      if (out.length >= 20) break;
    }
    return out;
  }),
  fetchCrm: cachedFetch('crm', async (query) => {
    if (!query.trim()) return [];
    const params = new URLSearchParams({
      q: query,
      types: 'contact,company,deal',
      limit: '10',
    });
    const r = await fetch(`/api/portal/brain/search?${params.toString()}`, {
      credentials: 'include',
    });
    if (!r.ok) return [];
    const json = (await r.json().catch(() => null)) as
      | {
          success?: boolean;
          data?: {
            hits?: {
              type?: unknown;
              title?: unknown;
              url?: unknown;
              contextName?: unknown;
              status?: unknown;
            }[];
          };
        }
      | null;
    const hits = json?.data?.hits ?? [];
    return hits
      .map((h): CrmSuggestion | null => {
        const type = h.type;
        if (type !== 'contact' && type !== 'company' && type !== 'deal') return null;
        if (typeof h.title !== 'string' || typeof h.url !== 'string') return null;
        const detailParts: string[] = [];
        if (typeof h.contextName === 'string' && h.contextName) detailParts.push(h.contextName);
        if (typeof h.status === 'string' && h.status) detailParts.push(h.status);
        return {
          type,
          title: h.title,
          url: h.url,
          detail: detailParts.join(' · ') || undefined,
        };
      })
      .filter((x): x is CrmSuggestion => x !== null);
  }),
};

// ---------------------------------------------------------------------------
// Source: [[wikilink]] — fuzzy notes by title
// ---------------------------------------------------------------------------

/**
 * `[[` triggers anywhere. We capture from the most recent `[[` back to the
 * cursor as the query, and on selection insert `[[Title]]`. We also detect
 * the "embed" form `![[` (used by the slash-command Embed Note action) and
 * preserve the leading `!`.
 */
function wikilinkSource(
  fetchNotes: (q: string) => Promise<NoteSuggestion[]>,
) {
  return async function wikilinkComplete(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    // Look back up to 64 chars for the most recent `[[` not yet closed by `]]`
    // or terminated by a newline.
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = ctx.state.sliceDoc(line.from, ctx.pos);
    const openIdx = before.lastIndexOf('[[');
    if (openIdx === -1) return null;
    const between = before.slice(openIdx + 2);
    if (between.includes(']]')) return null;
    if (between.includes('\n')) return null;
    // Don't fire for absurdly long queries — most likely the user typed `[[`
    // ages ago and is now on a different line of thought.
    if (between.length > 80) return null;

    const query = between.trim();
    const isEmbed = openIdx > 0 && before[openIdx - 1] === '!';
    // Range we'll replace: from the `[[` (or `![[`) through the cursor.
    const replaceFrom = line.from + (isEmbed ? openIdx - 1 : openIdx);

    if (!ctx.explicit && !query && between === '') {
      // Just typed `[[` with no query yet — show top notes anyway.
    }

    const notes = await fetchNotes(query).catch(() => []);
    if (notes.length === 0 && !ctx.explicit) {
      return { from: replaceFrom, options: [], filter: false };
    }

    const options: Completion[] = notes.map((n) => ({
      label: n.title,
      detail: n.detail,
      type: 'text',
      apply: (view, _completion, _from, to) => {
        const inserted = isEmbed ? `![[${n.title}]]` : `[[${n.title}]]`;
        view.dispatch({
          changes: { from: replaceFrom, to, insert: inserted },
          selection: { anchor: replaceFrom + inserted.length },
        });
      },
    }));

    return {
      from: replaceFrom,
      options,
      // Server already filtered fuzzy-by-title; let CM filter again so
      // typing more refines without a network roundtrip.
      filter: true,
    };
  };
}

// ---------------------------------------------------------------------------
// Source: #tag — fuzzy tags
// ---------------------------------------------------------------------------

/**
 * `#` only triggers when preceded by whitespace, newline, or doc-start. This
 * keeps it from firing inside markdown headings (`# Heading`) and inside
 * URLs / fragments. We capture `#xxx` until whitespace.
 */
function tagSource(fetchTags: (q: string) => Promise<TagSuggestion[]>) {
  return async function tagComplete(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    // Match a tag-like token at the cursor: `#word`. Word is letters, digits,
    // dash, underscore, slash. Stop at whitespace.
    const m = ctx.matchBefore(/(^|\s)#[\w/-]*/);
    if (!m) return null;
    // Compute the actual `#` position. matchBefore returns from (which may
    // include the preceding space) and the matched text.
    const match = m.text;
    const hashOffset = match.indexOf('#');
    const fromHash = m.from + hashOffset;
    // Guard: if the line starts with `#` followed by space (heading), we
    // would have matched `#` at position 0. Bail so we don't hijack headings.
    const line = ctx.state.doc.lineAt(ctx.pos);
    if (fromHash === line.from) {
      const afterHash = ctx.state.sliceDoc(fromHash + 1, Math.min(line.to, fromHash + 7));
      // `# `, `## `, `### ` etc. → markdown heading. Don't autocomplete.
      if (/^#{0,5}\s/.test(afterHash)) return null;
    }
    const query = ctx.state.sliceDoc(fromHash + 1, ctx.pos);
    if (!ctx.explicit && query.length === 0) return null;

    const tags = await fetchTags(query).catch(() => []);
    if (tags.length === 0) return null;

    const options: Completion[] = tags.map((t) => ({
      label: `#${t.tag}`,
      detail: typeof t.count === 'number' ? `${t.count}` : undefined,
      type: 'keyword',
      apply: (view, _completion, _from, to) => {
        const inserted = `#${t.tag} `;
        view.dispatch({
          changes: { from: fromHash, to, insert: inserted },
          selection: { anchor: fromHash + inserted.length },
        });
      },
    }));

    return { from: fromHash, options, filter: true };
  };
}

// ---------------------------------------------------------------------------
// Source: @mention — fuzzy CRM
// ---------------------------------------------------------------------------

/**
 * `@` only triggers when preceded by whitespace or doc-start. Inserts a
 * markdown link `[Name](url)` so the rendered preview produces a clickable
 * deep-link to the CRM record.
 */
function crmSource(fetchCrm: (q: string) => Promise<CrmSuggestion[]>) {
  return async function crmComplete(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    const m = ctx.matchBefore(/(^|\s)@[\w .'-]*/);
    if (!m) return null;
    const atOffset = m.text.indexOf('@');
    const fromAt = m.from + atOffset;
    const query = ctx.state.sliceDoc(fromAt + 1, ctx.pos);
    // Require at least 1 char of query — `@` alone with no input would
    // otherwise spam the search endpoint.
    if (!ctx.explicit && query.length < 1) return null;
    if (query.length > 60) return null;

    const hits = await fetchCrm(query).catch(() => []);
    if (hits.length === 0) return null;

    const options: Completion[] = hits.map((h) => ({
      label: `@${h.title}`,
      detail: h.detail ? `${h.type} · ${h.detail}` : h.type,
      type: 'class',
      apply: (view, _completion, _from, to) => {
        const inserted = `[${h.title}](${h.url})`;
        view.dispatch({
          changes: { from: fromAt, to, insert: inserted },
          selection: { anchor: fromAt + inserted.length },
        });
      },
    }));

    return { from: fromAt, options, filter: true };
  };
}

// ---------------------------------------------------------------------------
// Source: /command — static command palette at start-of-line
// ---------------------------------------------------------------------------

interface SlashCommand {
  /** Visible label in the popup. */
  label: string;
  /** One-line description shown beside the label. */
  detail: string;
  /** Material icon name (rendered via the popup theme — we encode it in `info`). */
  icon: string;
  /**
   * Apply handler. Receives the `view` and the range from the leading `/` to
   * the cursor — the source replaces that range with the chosen stub.
   */
  apply: (
    view: EditorView,
    range: { from: number; to: number },
    fetchers: { fetchNotes: (q: string) => Promise<NoteSuggestion[]> },
  ) => void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: 'Heading 1',
    detail: 'Large section title',
    icon: 'title',
    apply: (view, { from, to }) => insertLinePrefix(view, from, to, '# '),
  },
  {
    label: 'Heading 2',
    detail: 'Subsection title',
    icon: 'title',
    apply: (view, { from, to }) => insertLinePrefix(view, from, to, '## '),
  },
  {
    label: 'Heading 3',
    detail: 'Smaller subsection',
    icon: 'title',
    apply: (view, { from, to }) => insertLinePrefix(view, from, to, '### '),
  },
  {
    label: 'Bulleted list',
    detail: 'Unordered list item',
    icon: 'format_list_bulleted',
    apply: (view, { from, to }) => insertLinePrefix(view, from, to, '- '),
  },
  {
    label: 'Numbered list',
    detail: 'Ordered list item',
    icon: 'format_list_numbered',
    apply: (view, { from, to }) => insertLinePrefix(view, from, to, '1. '),
  },
  {
    label: 'Task list',
    detail: 'Unchecked todo item',
    icon: 'check_box_outline_blank',
    apply: (view, { from, to }) => insertLinePrefix(view, from, to, '- [ ] '),
  },
  {
    label: 'Table',
    detail: '3-column starter table',
    icon: 'table_chart',
    apply: (view, { from, to }) => {
      const insert = '| Column A | Column B | Column C |\n| --- | --- | --- |\n| | | |';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    },
  },
  {
    label: 'Code block',
    detail: 'Fenced code with language',
    icon: 'code',
    apply: (view, { from, to }) => {
      const insert = '```\n\n```';
      // Place cursor inside the block (after the first ``` and newline).
      const inner = from + 4;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: inner },
      });
    },
  },
  {
    label: 'Callout',
    detail: 'Note-style blockquote',
    icon: 'format_quote',
    apply: (view, { from, to }) => {
      const insert = '> [!note]\n> ';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    },
  },
  {
    label: 'Divider',
    detail: 'Horizontal rule',
    icon: 'horizontal_rule',
    apply: (view, { from, to }) => {
      const insert = '---\n';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    },
  },
  {
    label: 'Embed note',
    detail: 'Insert ![[ to pick a note',
    icon: 'subject',
    apply: (view, { from, to }) => {
      // Replace `/...` with `![[` so the wikilink completer takes over.
      const insert = '![[';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    },
  },
];

function slashCommandSource(
  fetchNotes: (q: string) => Promise<NoteSuggestion[]>,
) {
  return function slashComplete(ctx: CompletionContext): CompletionResult | null {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = ctx.state.sliceDoc(line.from, ctx.pos);
    // Only trigger when the line begins with `/` (allowing leading whitespace
    // for prettier behavior inside indented contexts) and the rest of the line
    // up to the cursor is the slash query.
    const m = /^(\s*)\/([\w-]*)$/.exec(before);
    if (!m) return null;
    const slashCol = m[1].length;
    const fromSlash = line.from + slashCol;
    const query = m[2].toLowerCase();

    const filtered = query
      ? SLASH_COMMANDS.filter((c) => c.label.toLowerCase().includes(query))
      : SLASH_COMMANDS;
    if (filtered.length === 0) return null;

    const options: Completion[] = filtered.map((cmd) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: 'function',
      apply: (view, _completion, _from, to) => {
        cmd.apply(view, { from: fromSlash, to }, { fetchNotes });
      },
    }));

    return { from: fromSlash, options, filter: true };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace the slash-command range with `prefix`, keeping any existing trailing
 * content on the line untouched. Cursor lands after `prefix`.
 */
function insertLinePrefix(view: EditorView, from: number, to: number, prefix: string): void {
  view.dispatch({
    changes: { from, to, insert: prefix },
    selection: { anchor: from + prefix.length },
  });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, Math.max(0, n - 1))}…`;
}

/**
 * Memoize an async fetch by query for 60 s and de-dupe in-flight calls. Keeps
 * the autocomplete responsive while the user is typing.
 */
function cachedFetch<T>(
  ns: string,
  fn: (query: string) => Promise<T[]>,
): (query: string) => Promise<T[]> {
  const TTL = 60_000;
  const cache = new Map<string, { at: number; data: T[] }>();
  const inflight = new Map<string, Promise<T[]>>();
  return async (query: string) => {
    const key = `${ns}::${query}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL) return hit.data;
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = (async () => {
      try {
        const data = await fn(query);
        cache.set(key, { at: Date.now(), data });
        return data;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  };
}

// ---------------------------------------------------------------------------
// Theme — match portal modal/popup aesthetic (cf. components/CmdKPalette.tsx)
// ---------------------------------------------------------------------------

const autocompleteTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    background: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
    padding: '4px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    fontSize: '13px',
    color: 'var(--foreground)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    maxHeight: '300px',
    minWidth: '260px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '6px 10px',
    borderRadius: '6px',
    color: 'var(--foreground)',
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    lineHeight: '1.35',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
    color: 'var(--foreground)',
  },
  '.cm-completionLabel': {
    fontWeight: '500',
  },
  '.cm-completionDetail': {
    color: 'var(--muted-foreground, #888)',
    fontStyle: 'normal',
    fontSize: '11px',
    marginLeft: 'auto',
    paddingLeft: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '50%',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--primary, #0070f3)',
    fontWeight: '600',
  },
});
