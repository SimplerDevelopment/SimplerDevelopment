// @vitest-environment node
/**
 * Unit tests for `components/brain/markdown-autocomplete.ts` — the Obsidian-
 * style autocomplete used by the Brain MarkdownEditor.
 *
 * Strategy:
 *   - Use the real `EditorState` + `CompletionContext` from CodeMirror so we
 *     drive the four completion sources exactly the way the editor does.
 *   - Stub `EditorView` with a `dispatch` spy so we can assert the `apply`
 *     callbacks emit the right `changes` + `selection` payloads when a user
 *     accepts a suggestion.
 *   - Mock global `fetch` to cover the default fetchers' response parsing.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

import {
  brainAutocomplete,
  defaultBrainAutocompleteFetchers,
  type BrainAutocompleteFetchers,
  type NoteSuggestion,
  type TagSuggestion,
  type CrmSuggestion,
} from '@/components/brain/markdown-autocomplete';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a CompletionContext positioned at the *end* of `doc` (or at `pos` if
 * supplied). `explicit=false` matches what CM passes during typing.
 */
function makeCtx(doc: string, opts: { explicit?: boolean; pos?: number } = {}): CompletionContext {
  const state = EditorState.create({ doc });
  const pos = opts.pos ?? doc.length;
  return new CompletionContext(state, pos, opts.explicit ?? false);
}

interface MockDispatch {
  from: number;
  to: number;
  insert: string;
  selectionAnchor: number;
}

/**
 * Make a fake EditorView with a `dispatch` spy that captures the change spec.
 * The real source code only ever calls `view.dispatch({changes:{...}, selection:{anchor}})`.
 */
function makeView(): { view: any; dispatched: MockDispatch[] } {
  const dispatched: MockDispatch[] = [];
  const view: any = {
    dispatch: (spec: any) => {
      const changes = spec?.changes ?? {};
      const selection = spec?.selection ?? {};
      dispatched.push({
        from: changes.from,
        to: changes.to,
        insert: changes.insert,
        selectionAnchor: selection.anchor,
      });
    },
  };
  return { view, dispatched };
}

// Fetcher stubs
const passthroughFetchers: BrainAutocompleteFetchers = {
  fetchNotes: async () => [],
  fetchTags: async () => [],
  fetchCrm: async () => [],
};

// ---------------------------------------------------------------------------
// brainAutocomplete (top-level extension factory)
// ---------------------------------------------------------------------------

describe('brainAutocomplete()', () => {
  it('returns an Extension array (autocompletion + theme)', () => {
    const ext = brainAutocomplete(passthroughFetchers);
    expect(Array.isArray(ext)).toBe(true);
    expect((ext as unknown[]).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// wikilink source — `[[query`
// ---------------------------------------------------------------------------

describe('wikilink source', () => {
  async function runWikilink(
    doc: string,
    notes: NoteSuggestion[],
    opts: { explicit?: boolean } = {},
  ) {
    const fetchNotes = vi.fn().mockResolvedValue(notes);
    const ext = brainAutocomplete({
      ...passthroughFetchers,
      fetchNotes,
    });
    // Pull the wikilink source out of the extension by re-creating the source
    // via brainAutocomplete — but we can just call the source through a
    // CompletionContext using the public re-exported behavior. Simpler: use
    // brainAutocomplete's internals indirectly via the fetcher spy by hand.
    return { ext, fetchNotes };
  }

  // We don't actually exercise the extension flattening; we run the sources
  // by reconstructing brainAutocomplete and pulling the `override` array out
  // of the autocompletion config. Easier: call them by re-importing — but
  // they're private. So we test through brainAutocomplete by examining the
  // first element's spec. Below tests use a *direct* approach: construct
  // brainAutocomplete and walk into the autocomplete extension via the
  // CompletionContext + the underlying source array.
  //
  // To keep this maintainable, we extract the sources lazily by introspecting
  // the autocompletion extension's internal config. CodeMirror stores the
  // override array on the Facet, but reaching it is fragile. Instead, we
  // re-import the module and reach into it via the autocompletion config
  // by invoking the source directly through a private trick: we call the
  // four sources by *creating our own brainAutocomplete and reaching into
  // the autocompletion config*. The autocompletion factory returns an
  // Extension whose StateField uses the override; not exposed.
  //
  // Pragmatic path: re-call the sources as constructed inside the module
  // via the **fetchers** spy. Each source is reachable by triggering the
  // right doc/pos pattern through brainAutocomplete's array — but
  // brainAutocomplete doesn't expose the sources individually.
  //
  // Solution: We re-derive the sources by re-importing the module's
  // private helpers via a small wrapper. Since the sources aren't exported,
  // we test them indirectly through the fetcher being called with the right
  // query *and* by asserting the apply callback when invoked manually.

  it('captures fetcher wiring via brainAutocomplete()', () => {
    const fetchNotes = vi.fn();
    const ext = brainAutocomplete({
      ...passthroughFetchers,
      fetchNotes,
    });
    expect(Array.isArray(ext)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// We need direct access to the sources. Since they're not exported, drive
// them via a thin re-implementation pattern: hijack the autocompletion call.
// Approach: import the module and re-read its sources from `brainAutocomplete`
// return value by walking into the `@codemirror/autocomplete` config facets
// would be brittle. Instead, we test the SOURCES through the only public
// route — by constructing a doc + CompletionContext and feeding into
// brainAutocomplete via a manual cycle.
//
// Final practical strategy: brainAutocomplete returns an Extension that is
// `[autocompletion({override: [...]}), theme]`. The autocompletion call
// returns a CodeMirror Extension whose shape is `{extension: ...}`. We
// instead test sources by reaching into them via the closure exposed at
// module construction time — and we can do this because the override list
// is stored on the returned Extension via the autocompletion's facet
// computation. Easier still: shape-of-extension introspection is messy.
//
// FINAL: keep tests SIMPLE and READABLE by mocking @codemirror/autocomplete's
// `autocompletion` to capture the override list and let us call the four
// sources directly.
// ---------------------------------------------------------------------------

// Re-mock + reimport so we can intercept `autocompletion` and grab `override`.
vi.mock('@codemirror/autocomplete', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codemirror/autocomplete')>();
  return {
    ...actual,
    autocompletion: (cfg: any) => {
      // Stash the config on a module-level capture
      (globalThis as any).__lastAutocompletionConfig = cfg;
      return actual.autocompletion(cfg);
    },
  };
});

async function getSources(fetchers: BrainAutocompleteFetchers) {
  // Re-import to ensure mock is active
  (globalThis as any).__lastAutocompletionConfig = null;
  const mod = await import('@/components/brain/markdown-autocomplete');
  mod.brainAutocomplete(fetchers);
  const cfg = (globalThis as any).__lastAutocompletionConfig;
  expect(cfg).toBeTruthy();
  expect(Array.isArray(cfg.override)).toBe(true);
  expect(cfg.override.length).toBe(4);
  const [wikilink, tag, crm, slash] = cfg.override;
  return { wikilink, tag, crm, slash };
}

// ---------------------------------------------------------------------------
// WIKILINK source — directly tested
// ---------------------------------------------------------------------------

describe('wikilinkSource', () => {
  it('returns null when no `[[` precedes cursor', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('hello world'));
    expect(res).toBeNull();
    expect(fetchNotes).not.toHaveBeenCalled();
  });

  it('returns null when the bracket pair is already closed', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    // `[[Foo]]` — bracket already closed.
    const res = await wikilink(makeCtx('intro [[Foo]] more'));
    expect(res).toBeNull();
  });

  it('returns null when a newline appears between `[[` and cursor', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    // Bracket on first line, cursor on second line — wikilinkSource scans only
    // the current line (lineAt), so the second line has no `[[` at all.
    // To exercise the explicit \n branch, put `[[` and `\n` on the same line
    // is impossible since \n delimits the line — but we can also exercise
    // via a doc with `[[\n` on the same physical line via CR. Skip — the
    // primary newline behavior is implicitly covered by lineAt slicing.
    const res = await wikilink(makeCtx('[[\nfoo'));
    expect(res).toBeNull();
  });

  it('returns null when query exceeds 80 chars', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const longQuery = 'a'.repeat(90);
    const res = await wikilink(makeCtx(`[[${longQuery}`));
    expect(res).toBeNull();
  });

  it('returns empty options (filter:false) when fetcher returns nothing and not explicit', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('[[foo'));
    expect(res).not.toBeNull();
    expect(res!.options).toEqual([]);
    expect((res as any).filter).toBe(false);
    expect(fetchNotes).toHaveBeenCalledWith('foo');
  });

  it('still returns results array when explicit even if fetcher empty', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('[[foo', { explicit: true }));
    expect(res).not.toBeNull();
    // Explicit + 0 results: code falls through and builds the normal options
    // (which will be []). filter is true in this branch.
    expect((res as any).filter).toBe(true);
  });

  it('builds completions from fetched notes and computes from-range', async () => {
    const notes: NoteSuggestion[] = [
      { title: 'Foo', detail: 'a note about Foo' },
      { title: 'Foo Bar', detail: undefined },
    ];
    const fetchNotes = vi.fn().mockResolvedValue(notes);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('hello [[fo'));
    expect(res).not.toBeNull();
    // `hello ` is 6 chars; `[[` starts at 6 → from = 6.
    expect(res!.from).toBe(6);
    expect(res!.options).toHaveLength(2);
    expect(res!.options[0]).toMatchObject({
      label: 'Foo',
      detail: 'a note about Foo',
      type: 'text',
    });
    expect(typeof res!.options[0].apply).toBe('function');
  });

  it('recognises the `![[` embed form and preserves the `!` in apply()', async () => {
    const notes: NoteSuggestion[] = [{ title: 'Foo', detail: undefined }];
    const fetchNotes = vi.fn().mockResolvedValue(notes);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('![[fo'));
    expect(res).not.toBeNull();
    // `!` is at index 0, `[[` starts at 1 → since embed, from = 0.
    expect(res!.from).toBe(0);
    const { view, dispatched } = makeView();
    (res!.options[0].apply as any)(view, res!.options[0], res!.from, 5);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].from).toBe(0);
    expect(dispatched[0].insert).toBe('![[Foo]]');
    expect(dispatched[0].selectionAnchor).toBe('![[Foo]]'.length);
  });

  it('apply() inserts `[[Title]]` for non-embed and advances cursor', async () => {
    const notes: NoteSuggestion[] = [{ title: 'My Note', detail: undefined }];
    const fetchNotes = vi.fn().mockResolvedValue(notes);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('[[my'));
    expect(res).not.toBeNull();
    const { view, dispatched } = makeView();
    (res!.options[0].apply as any)(view, res!.options[0], res!.from, 4);
    expect(dispatched[0].from).toBe(0);
    expect(dispatched[0].to).toBe(4);
    expect(dispatched[0].insert).toBe('[[My Note]]');
    expect(dispatched[0].selectionAnchor).toBe('[[My Note]]'.length);
  });

  it('swallows fetcher rejections — returns empty when fetch throws', async () => {
    const fetchNotes = vi.fn().mockRejectedValue(new Error('boom'));
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    const res = await wikilink(makeCtx('[[foo'));
    expect(res).not.toBeNull();
    expect(res!.options).toEqual([]);
  });

  it('trims whitespace from the query before passing to fetcher', async () => {
    const fetchNotes = vi.fn().mockResolvedValue([]);
    const { wikilink } = await getSources({ ...passthroughFetchers, fetchNotes });
    await wikilink(makeCtx('[[   foo bar   '));
    expect(fetchNotes).toHaveBeenCalledWith('foo bar');
  });
});

// ---------------------------------------------------------------------------
// TAG source — `#tag`
// ---------------------------------------------------------------------------

describe('tagSource', () => {
  it('returns null when there is no tag-like token before cursor', async () => {
    const fetchTags = vi.fn();
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx('plain text'));
    expect(res).toBeNull();
    expect(fetchTags).not.toHaveBeenCalled();
  });

  it('bails on markdown headings (`# Heading`)', async () => {
    const fetchTags = vi.fn();
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    // Line starts with `#` followed by space → heading. matchBefore matches
    // `#` at line.from, after-hash is ` `, regex `^#{0,5}\s` succeeds → null.
    const res = await tag(makeCtx('# '));
    expect(res).toBeNull();
  });

  it('bails on markdown headings level 2 (`## `)', async () => {
    const fetchTags = vi.fn();
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx('## '));
    expect(res).toBeNull();
  });

  it('returns null when query is empty and not explicit', async () => {
    const fetchTags = vi.fn().mockResolvedValue([{ tag: 'foo' }]);
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx(' #'));
    expect(res).toBeNull();
    expect(fetchTags).not.toHaveBeenCalled();
  });

  it('fires for empty query when explicit', async () => {
    const fetchTags = vi.fn().mockResolvedValue([{ tag: 'foo' }]);
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx(' #', { explicit: true }));
    expect(res).not.toBeNull();
    expect(fetchTags).toHaveBeenCalledWith('');
  });

  it('returns null when fetcher returns no tags', async () => {
    const fetchTags = vi.fn().mockResolvedValue([]);
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx('something #fo'));
    expect(res).toBeNull();
  });

  it('builds tag options with `#` prefix and count detail', async () => {
    const tags: TagSuggestion[] = [
      { tag: 'foo', count: 12 },
      { tag: 'bar' },
    ];
    const fetchTags = vi.fn().mockResolvedValue(tags);
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx('text #fo'));
    expect(res).not.toBeNull();
    expect(res!.options[0]).toMatchObject({
      label: '#foo',
      detail: '12',
      type: 'keyword',
    });
    expect(res!.options[1].detail).toBeUndefined();
  });

  it('apply() inserts `#tag ` with trailing space', async () => {
    const fetchTags = vi.fn().mockResolvedValue([{ tag: 'project' }]);
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx('hello #pr'));
    expect(res).not.toBeNull();
    const { view, dispatched } = makeView();
    (res!.options[0].apply as any)(view, res!.options[0], res!.from, 9);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].insert).toBe('#project ');
    expect(dispatched[0].selectionAnchor).toBe(res!.from + '#project '.length);
  });

  it('fires at doc start (`^` branch of regex)', async () => {
    const fetchTags = vi.fn().mockResolvedValue([{ tag: 'foo' }]);
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    // Doc starts with `#xx` but the heading regex sees `xx` after hash, not
    // whitespace, so it proceeds.
    const res = await tag(makeCtx('#xx'));
    expect(res).not.toBeNull();
    expect(fetchTags).toHaveBeenCalledWith('xx');
  });

  it('swallows fetcher rejections', async () => {
    const fetchTags = vi.fn().mockRejectedValue(new Error('nope'));
    const { tag } = await getSources({ ...passthroughFetchers, fetchTags });
    const res = await tag(makeCtx(' #foo'));
    // Empty array after catch → returns null (tags.length === 0 branch).
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CRM source — `@mention`
// ---------------------------------------------------------------------------

describe('crmSource', () => {
  it('returns null when no `@token` precedes cursor', async () => {
    const fetchCrm = vi.fn();
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx('plain'));
    expect(res).toBeNull();
    expect(fetchCrm).not.toHaveBeenCalled();
  });

  it('requires at least 1 char of query when not explicit', async () => {
    const fetchCrm = vi.fn();
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx(' @'));
    expect(res).toBeNull();
    expect(fetchCrm).not.toHaveBeenCalled();
  });

  it('fires on empty `@` if explicit', async () => {
    const fetchCrm = vi.fn().mockResolvedValue([]);
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx(' @', { explicit: true }));
    expect(res).toBeNull(); // empty hits, but fetcher was called
    expect(fetchCrm).toHaveBeenCalledWith('');
  });

  it('bails on very long queries (>60)', async () => {
    const fetchCrm = vi.fn();
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const longQ = 'a'.repeat(65);
    const res = await crm(makeCtx(` @${longQ}`));
    expect(res).toBeNull();
    expect(fetchCrm).not.toHaveBeenCalled();
  });

  it('returns null when fetcher returns no hits', async () => {
    const fetchCrm = vi.fn().mockResolvedValue([]);
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx(' @al'));
    expect(res).toBeNull();
  });

  it('builds completion with `@Title` label and type+detail combined', async () => {
    const hits: CrmSuggestion[] = [
      { type: 'contact', title: 'Alice', url: '/c/alice', detail: 'Acme Inc' },
      { type: 'deal', title: 'Big Deal', url: '/d/1' },
    ];
    const fetchCrm = vi.fn().mockResolvedValue(hits);
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx(' @al'));
    expect(res).not.toBeNull();
    expect(res!.options[0]).toMatchObject({
      label: '@Alice',
      detail: 'contact · Acme Inc',
      type: 'class',
    });
    expect(res!.options[1].detail).toBe('deal');
  });

  it('apply() inserts `[Name](url)` markdown link', async () => {
    const hits: CrmSuggestion[] = [
      { type: 'contact', title: 'Alice', url: 'https://crm/a/1' },
    ];
    const fetchCrm = vi.fn().mockResolvedValue(hits);
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx('hi @al'));
    expect(res).not.toBeNull();
    const { view, dispatched } = makeView();
    (res!.options[0].apply as any)(view, res!.options[0], res!.from, 7);
    expect(dispatched[0].insert).toBe('[Alice](https://crm/a/1)');
    expect(dispatched[0].selectionAnchor).toBe(res!.from + '[Alice](https://crm/a/1)'.length);
  });

  it('swallows fetcher rejections', async () => {
    const fetchCrm = vi.fn().mockRejectedValue(new Error('nope'));
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx(' @foo'));
    expect(res).toBeNull(); // empty array after catch → no hits → null
  });

  it('matches at doc start via `^` regex branch', async () => {
    const fetchCrm = vi.fn().mockResolvedValue([
      { type: 'contact', title: 'Bob', url: '/b' },
    ]);
    const { crm } = await getSources({ ...passthroughFetchers, fetchCrm });
    const res = await crm(makeCtx('@bo'));
    expect(res).not.toBeNull();
    expect(fetchCrm).toHaveBeenCalledWith('bo');
  });
});

// ---------------------------------------------------------------------------
// SLASH command source — `/cmd`
// ---------------------------------------------------------------------------

describe('slashCommandSource', () => {
  it('returns null when the line does not start with `/`', async () => {
    const { slash } = await getSources(passthroughFetchers);
    expect(slash(makeCtx('hello /'))).toBeNull();
  });

  it('returns null when the line is `/foo` but contains other chars after slash', async () => {
    const { slash } = await getSources(passthroughFetchers);
    // The regex allows `\w-` only after slash; `/foo bar` has a space so no
    // match.
    expect(slash(makeCtx('/foo bar'))).toBeNull();
  });

  it('returns the full command palette when the query is empty', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const res = slash(makeCtx('/'));
    expect(res).not.toBeNull();
    expect(res!.options.length).toBeGreaterThanOrEqual(11);
    expect(res!.from).toBe(0);
  });

  it('filters by case-insensitive substring on label', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const res = slash(makeCtx('/HEAD'));
    expect(res).not.toBeNull();
    expect(res!.options.length).toBe(3);
    for (const o of res!.options) {
      expect(o.label.toLowerCase()).toContain('head');
    }
  });

  it('returns null when nothing matches the query', async () => {
    const { slash } = await getSources(passthroughFetchers);
    expect(slash(makeCtx('/zzznomatch'))).toBeNull();
  });

  it('honors leading whitespace and offsets from-position accordingly', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const res = slash(makeCtx('   /head'));
    expect(res).not.toBeNull();
    expect(res!.from).toBe(3);
  });

  it('applies Heading 1 prefix when accepted', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const res = slash(makeCtx('/Heading 1'.replace(/ /g, ''))); // /Heading1
    // Better: just take the all-commands case and locate Heading 1.
    const all = slash(makeCtx('/'));
    expect(all).not.toBeNull();
    const h1 = all!.options.find((o) => o.label === 'Heading 1')!;
    const { view, dispatched } = makeView();
    (h1.apply as any)(view, h1, all!.from, 1);
    expect(dispatched[0].insert).toBe('# ');
    expect(dispatched[0].selectionAnchor).toBe(all!.from + 2);
  });

  it('applies Heading 2 prefix', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const h2 = all!.options.find((o) => o.label === 'Heading 2')!;
    const { view, dispatched } = makeView();
    (h2.apply as any)(view, h2, all!.from, 1);
    expect(dispatched[0].insert).toBe('## ');
  });

  it('applies Heading 3 prefix', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const h3 = all!.options.find((o) => o.label === 'Heading 3')!;
    const { view, dispatched } = makeView();
    (h3.apply as any)(view, h3, all!.from, 1);
    expect(dispatched[0].insert).toBe('### ');
  });

  it('applies Bulleted list prefix `- `', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const bul = all!.options.find((o) => o.label === 'Bulleted list')!;
    const { view, dispatched } = makeView();
    (bul.apply as any)(view, bul, all!.from, 1);
    expect(dispatched[0].insert).toBe('- ');
  });

  it('applies Numbered list prefix `1. `', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const num = all!.options.find((o) => o.label === 'Numbered list')!;
    const { view, dispatched } = makeView();
    (num.apply as any)(view, num, all!.from, 1);
    expect(dispatched[0].insert).toBe('1. ');
  });

  it('applies Task list prefix `- [ ] `', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const task = all!.options.find((o) => o.label === 'Task list')!;
    const { view, dispatched } = makeView();
    (task.apply as any)(view, task, all!.from, 1);
    expect(dispatched[0].insert).toBe('- [ ] ');
  });

  it('applies a Table starter block', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const t = all!.options.find((o) => o.label === 'Table')!;
    const { view, dispatched } = makeView();
    (t.apply as any)(view, t, all!.from, 1);
    expect(dispatched[0].insert).toContain('| Column A | Column B | Column C |');
    expect(dispatched[0].insert.split('\n')).toHaveLength(3);
    expect(dispatched[0].selectionAnchor).toBe(all!.from + dispatched[0].insert.length);
  });

  it('applies a Code block and positions cursor inside the fences', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const c = all!.options.find((o) => o.label === 'Code block')!;
    const { view, dispatched } = makeView();
    (c.apply as any)(view, c, all!.from, 1);
    expect(dispatched[0].insert).toBe('```\n\n```');
    // Cursor positioned after first ``` + \n → from + 4
    expect(dispatched[0].selectionAnchor).toBe(all!.from + 4);
  });

  it('applies a Callout block', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const ca = all!.options.find((o) => o.label === 'Callout')!;
    const { view, dispatched } = makeView();
    (ca.apply as any)(view, ca, all!.from, 1);
    expect(dispatched[0].insert).toBe('> [!note]\n> ');
    expect(dispatched[0].selectionAnchor).toBe(all!.from + '> [!note]\n> '.length);
  });

  it('applies a Divider rule', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const div = all!.options.find((o) => o.label === 'Divider')!;
    const { view, dispatched } = makeView();
    (div.apply as any)(view, div, all!.from, 1);
    expect(dispatched[0].insert).toBe('---\n');
  });

  it('applies Embed note (rewrites `/` → `![[`)', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    const em = all!.options.find((o) => o.label === 'Embed note')!;
    const { view, dispatched } = makeView();
    (em.apply as any)(view, em, all!.from, 1);
    expect(dispatched[0].insert).toBe('![[');
    expect(dispatched[0].selectionAnchor).toBe(all!.from + 3);
  });

  it('completion options expose label/detail/type=function and an apply fn', async () => {
    const { slash } = await getSources(passthroughFetchers);
    const all = slash(makeCtx('/'));
    for (const opt of all!.options) {
      expect(opt.type).toBe('function');
      expect(typeof opt.label).toBe('string');
      expect(typeof opt.detail).toBe('string');
      expect(typeof opt.apply).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// defaultBrainAutocompleteFetchers — exercises the fetch + cache + parse path
// ---------------------------------------------------------------------------

describe('defaultBrainAutocompleteFetchers', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  // ---- fetchNotes ---------------------------------------------------------

  it('fetchNotes builds the URL with `search` when query non-empty', async () => {
    const captured: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      captured.push(String(url));
      return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;
    await defaultBrainAutocompleteFetchers.fetchNotes('foo bar');
    expect(captured[0]).toMatch(/\/api\/portal\/brain\/knowledge\?/);
    expect(captured[0]).toContain('limit=10');
    expect(captured[0]).toContain('search=foo+bar');
  });

  it('fetchNotes omits `search` when query is empty', async () => {
    const captured: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      captured.push(String(url));
      return new Response(JSON.stringify({ data: { items: [] } }), { status: 200 });
    }) as any;
    await defaultBrainAutocompleteFetchers.fetchNotes('');
    expect(captured[0]).not.toContain('search=');
    expect(captured[0]).toContain('limit=10');
  });

  it('fetchNotes returns [] on non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchNotes('q');
    expect(res).toEqual([]);
  });

  it('fetchNotes returns [] on invalid JSON', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('<<not json>>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchNotes('q');
    expect(res).toEqual([]);
  });

  it('fetchNotes filters out items without string title and truncates body', async () => {
    const items = [
      { title: 'A', body: 'a   short   body' },
      { title: '   ', body: 'whitespace-only-title-should-be-dropped' },
      { title: 'B', body: 'x'.repeat(120) },
      { notitle: true },
      { title: 'C' }, // no body
    ];
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { items } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchNotes('any-A');
    // 'A', 'B', 'C' kept; whitespace-only and missing-title dropped.
    expect(res.map((n) => n.title)).toEqual(['A', 'B', 'C']);
    expect(res[0].detail).toBe('a short body'); // whitespace collapsed
    expect(res[1].detail!.endsWith('…')).toBe(true);
    expect(res[1].detail!.length).toBe(60);
    expect(res[2].detail).toBeUndefined();
  });

  it('fetchNotes handles missing data.items gracefully', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchNotes('q-missing');
    expect(res).toEqual([]);
  });

  // ---- fetchTags ----------------------------------------------------------

  it('fetchTags hits the `?tags=true` endpoint and filters client-side', async () => {
    const captured: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      captured.push(String(url));
      return new Response(
        JSON.stringify({ data: { tags: ['foo', 'foobar', 'baz', 123, '', 'Foozle'] } }),
        { status: 200 },
      );
    }) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchTags('foo');
    expect(captured[0]).toContain('/api/portal/brain/knowledge?tags=true');
    // Case-insensitive substring filter: 'foo', 'foobar', 'Foozle'.
    expect(res.map((t) => t.tag)).toEqual(['foo', 'foobar', 'Foozle']);
  });

  it('fetchTags returns all tags (capped at 20) when query empty', async () => {
    const tags = Array.from({ length: 30 }, (_, i) => `t${i}`);
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: { tags } }), { status: 200 }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchTags('');
    expect(res).toHaveLength(20);
    expect(res[0]).toEqual({ tag: 't0' });
  });

  it('fetchTags returns [] when response not OK', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x', { status: 500 })) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchTags('foo-500');
    expect(res).toEqual([]);
  });

  it('fetchTags returns [] when data.tags is missing or not an array', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: { tags: 'not-array' } }), { status: 200 }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchTags('foo-tags-missing');
    expect(res).toEqual([]);
  });

  it('fetchTags handles JSON parse failure', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('garbage', { status: 200 }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchTags('foo-tags-garbage');
    expect(res).toEqual([]);
  });

  // ---- fetchCrm -----------------------------------------------------------

  it('fetchCrm short-circuits when query is blank', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = fetchSpy as any;
    const res = await defaultBrainAutocompleteFetchers.fetchCrm('   ');
    expect(res).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchCrm builds the right query string', async () => {
    const captured: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      captured.push(String(url));
      return new Response(JSON.stringify({ data: { hits: [] } }), { status: 200 });
    }) as any;
    await defaultBrainAutocompleteFetchers.fetchCrm('alice');
    expect(captured[0]).toContain('/api/portal/brain/search?');
    expect(captured[0]).toContain('q=alice');
    expect(captured[0]).toContain('types=contact%2Ccompany%2Cdeal');
    expect(captured[0]).toContain('limit=10');
  });

  it('fetchCrm filters out hits with unknown type or non-string title/url', async () => {
    const hits = [
      { type: 'contact', title: 'Alice', url: '/a' },
      { type: 'company', title: 'Acme', url: '/c', contextName: 'parent', status: 'active' },
      { type: 'deal', title: 'D', url: '/d', contextName: 'Big Co' },
      { type: 'deal', title: 'D2', url: '/d2', status: 'won' },
      { type: 'unknown', title: 'X', url: '/x' },
      { type: 'contact', title: 42, url: '/n' }, // non-string title dropped
      { type: 'contact', title: 'Y', url: null }, // non-string url dropped
    ];
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: { hits } }), { status: 200 }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchCrm('q-crm-1');
    expect(res).toHaveLength(4);
    expect(res[0]).toEqual({ type: 'contact', title: 'Alice', url: '/a', detail: undefined });
    expect(res[1].detail).toBe('parent · active');
    expect(res[2].detail).toBe('Big Co');
    expect(res[3].detail).toBe('won');
  });

  it('fetchCrm returns [] on non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x', { status: 500 })) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchCrm('q-crm-500');
    expect(res).toEqual([]);
  });

  it('fetchCrm returns [] when JSON is bad', async () => {
    globalThis.fetch = vi.fn(async () => new Response('garbage', { status: 200 })) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchCrm('q-crm-bad');
    expect(res).toEqual([]);
  });

  it('fetchCrm handles missing data.hits gracefully', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as any;
    const res = await defaultBrainAutocompleteFetchers.fetchCrm('q-crm-miss');
    expect(res).toEqual([]);
  });

  // ---- cache + dedupe semantics ------------------------------------------

  it('caches successful fetches for the same query (single fetch for repeat calls)', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { items: [{ title: 'cached' }] } }), { status: 200 }),
    );
    globalThis.fetch = fetchSpy as any;
    const a = await defaultBrainAutocompleteFetchers.fetchNotes('cached-q');
    const b = await defaultBrainAutocompleteFetchers.fetchNotes('cached-q');
    expect(a).toEqual(b);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('de-dupes in-flight calls so a parallel request awaits the same promise', async () => {
    let resolve!: (v: any) => void;
    const fetchSpy = vi.fn(() => new Promise((r) => (resolve = r)));
    globalThis.fetch = fetchSpy as any;
    const p1 = defaultBrainAutocompleteFetchers.fetchNotes('inflight-q');
    const p2 = defaultBrainAutocompleteFetchers.fetchNotes('inflight-q');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ data: { items: [] } }), { status: 200 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
  });
});
