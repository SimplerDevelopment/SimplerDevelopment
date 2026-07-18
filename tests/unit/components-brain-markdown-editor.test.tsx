// @vitest-environment jsdom
import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — keep CodeMirror, the markdown renderer, and the autocomplete module
// as lightweight stand-ins. We're testing MarkdownEditor's *own* behaviour
// (mode toggle, persistence, narrow-screen fallback, toolbar UI, keymap wiring
// + paste/drop handler wiring + image upload placeholder flow). The actual
// CodeMirror runtime is irrelevant here.
// ---------------------------------------------------------------------------

// Capture the latest extensions array passed to the mocked CodeMirror so we
// can introspect what MarkdownEditor wired up. Tests pull `__capturedKeymap`
// (the keymap.of payload) + `__capturedDomHandlers` (EditorView.domEventHandlers)
// off `globalThis` rather than a closure to keep the mock factory side-effect
// free at module-eval time.
type KeymapEntry = {
  key?: string;
  preventDefault?: boolean;
  run?: (view: any) => boolean | void;
};

vi.mock('@codemirror/state', () => {
  const EditorSelection = {
    range: (anchor: number, head: number) => ({ anchor, head, _kind: 'range' }),
    cursor: (pos: number) => ({ anchor: pos, head: pos, _kind: 'cursor' }),
    create: (ranges: any[]) => ({ ranges, _kind: 'sel' }),
  };
  return { EditorSelection };
});

vi.mock('@codemirror/commands', () => ({
  indentWithTab: { __tag: 'indentWithTab' },
  defaultKeymap: [{ __tag: 'defaultKeymap-entry' }],
  historyKeymap: [{ __tag: 'historyKeymap-entry' }],
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: (cfg?: any) => ({ __tag: 'markdown', cfg }),
  markdownLanguage: { __tag: 'markdownLanguage' },
}));

vi.mock('@uiw/react-codemirror', () => {
  // EditorView with the static helpers MarkdownEditor uses.
  const captureDomHandlers = (h: any) => {
    (globalThis as any).__capturedDomHandlers = h;
    return { __tag: 'domEventHandlers', handlers: h };
  };

  const EditorView: any = function () {};
  EditorView.theme = (spec: any) => ({ __tag: 'theme', spec });
  EditorView.lineWrapping = { __tag: 'lineWrapping' };
  EditorView.contentAttributes = {
    of: (attrs: any) => ({ __tag: 'contentAttributes', attrs }),
  };
  EditorView.domEventHandlers = (h: any) => captureDomHandlers(h);

  const keymap = {
    of: (entries: KeymapEntry[]) => {
      (globalThis as any).__capturedKeymap = entries;
      return { __tag: 'keymap', entries };
    },
  };

  // CodeMirror component — render a textarea so we have a real DOM element
  // and call onCreateEditor with a stub EditorView so MarkdownEditor's
  // surfacing-to-parent path runs. Also forward any data-testid.
  const CodeMirror = React.forwardRef<any, any>(function CodeMirror(
    props: any,
    ref: any,
  ) {
    const { value, onChange, onCreateEditor, placeholder, ...rest } = props;
    const calledRef = React.useRef(false);
    React.useEffect(() => {
      if (calledRef.current) return;
      calledRef.current = true;
      const fakeView = (globalThis as any).__makeFakeView?.() ?? {
        state: {
          doc: { length: (value ?? '').length, toString: () => value ?? '' },
          selection: { ranges: [{ from: 0, to: 0, head: 0 }], main: { head: 0 } },
          sliceDoc: () => '',
        },
        dispatch: vi.fn(),
        posAtCoords: () => 0,
      };
      onCreateEditor?.(fakeView);
      if (ref && typeof ref === 'object') ref.current = { view: fakeView };
    }, [onCreateEditor, value, ref]);

    return React.createElement('textarea', {
      'data-testid': rest['data-testid'] ?? 'cm-textarea',
      value: value ?? '',
      placeholder,
      onChange: (e: any) => onChange?.(e.target.value),
    });
  });

  return {
    __esModule: true,
    default: CodeMirror,
    EditorView,
    keymap,
  };
});

vi.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children, components }: any) => {
    (globalThis as any).__lastMarkdownComponents = components;
    return React.createElement(
      'div',
      { 'data-testid': 'react-markdown' },
      typeof children === 'string' ? children : null,
    );
  },
}));

vi.mock('remark-gfm', () => ({ __esModule: true, default: { __tag: 'gfm' } }));
vi.mock('rehype-highlight', () => ({
  __esModule: true,
  default: { __tag: 'highlight' },
}));

vi.mock('@/components/brain/markdown-autocomplete', () => ({
  brainAutocomplete: (fetchers: any) => ({ __tag: 'brainAutocomplete', fetchers }),
  defaultBrainAutocompleteFetchers: { __tag: 'defaultFetchers' },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import MarkdownEditor from '@/components/brain/MarkdownEditor';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type FakeDoc = {
  length: number;
  toString: () => string;
};

type FakeRange = { from: number; to: number; head: number };

function makeFakeView(opts: {
  text?: string;
  ranges?: FakeRange[];
}): {
  view: any;
  dispatch: ReturnType<typeof vi.fn>;
  getText: () => string;
} {
  let text = opts.text ?? '';
  const ranges: FakeRange[] = opts.ranges ?? [
    { from: 0, to: text.length, head: text.length },
  ];
  const dispatch = vi.fn((tx: any) => {
    if (tx?.changes) {
      const changes = Array.isArray(tx.changes) ? tx.changes : [tx.changes];
      // Apply naïvely in order — good enough for our assertions about
      // the *sequence* of dispatched edits, not full doc reconciliation.
      // Sort descending by `from` so trailing inserts don't shift earlier
      // offsets. Pure inserts (no `to`) treated as `to = from`.
      const sorted = [...changes].sort(
        (a: any, b: any) => (b.from ?? 0) - (a.from ?? 0),
      );
      for (const ch of sorted) {
        const from = ch.from ?? 0;
        const to = ch.to ?? from;
        const insert = ch.insert ?? '';
        text = text.slice(0, from) + insert + text.slice(to);
      }
    }
  });
  const view: any = {
    get state() {
      return {
        doc: { length: text.length, toString: () => text } as FakeDoc,
        selection: { ranges, main: { head: ranges[0]?.head ?? 0 } },
        sliceDoc: (from: number, to: number) => text.slice(from, to),
      };
    },
    dispatch,
    posAtCoords: vi.fn(() => 5),
  };
  return { view, dispatch, getText: () => text };
}

function setViewport(width: number) {
  // jsdom's matchMedia stub respects whatever we install. We install a stub
  // that resolves the `max-width: <n>px` query against `width`.
  (window as any).__viewportWidth = width;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const m = /max-width:\s*(\d+)px/.exec(query);
      const max = m ? parseInt(m[1], 10) : Infinity;
      const listeners: Array<(e: any) => void> = [];
      return {
        matches: width <= max,
        media: query,
        addEventListener: (_: string, cb: any) => listeners.push(cb),
        removeEventListener: (_: string, cb: any) => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      };
    },
  });
}

beforeAll(() => {
  // Default viewport: wide so split mode is allowed.
  setViewport(1024);
});

beforeEach(() => {
  // Clear any per-test fake view + clipboards.
  delete (globalThis as any).__makeFakeView;
  delete (globalThis as any).__capturedKeymap;
  delete (globalThis as any).__capturedDomHandlers;
  delete (globalThis as any).__lastMarkdownComponents;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Toolbar / mode toggle
// ---------------------------------------------------------------------------

describe('MarkdownEditor — toolbar & mode toggle', () => {
  it('renders the markdown toolbar label and all three mode buttons', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit only/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Split view/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Preview only/ }),
    ).toBeInTheDocument();
  });

  it('defaults to split mode and shows both editor and preview panes', () => {
    render(<MarkdownEditor value="hello" onChange={() => {}} />);
    expect(screen.getByTestId('markdown-editor-source')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
  });

  it('honours `defaultMode="edit"` and hides the preview pane', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="edit" />);
    expect(screen.getByTestId('markdown-editor-source')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-editor-preview')).not.toBeInTheDocument();
  });

  it('honours `defaultMode="preview"` and hides the editor pane', () => {
    render(
      <MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />,
    );
    expect(screen.queryByTestId('markdown-editor-source')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
  });

  it('clicking "Edit only" switches the active pane and persists the choice', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="split" />);
    fireEvent.click(screen.getByRole('button', { name: /Edit only/ }));
    expect(screen.queryByTestId('markdown-editor-preview')).not.toBeInTheDocument();
    expect(localStorage.getItem('brain.editor.mode')).toBe('edit');
  });

  it('clicking "Preview only" switches the active pane', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="split" />);
    fireEvent.click(screen.getByRole('button', { name: /Preview only/ }));
    expect(screen.queryByTestId('markdown-editor-source')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
    expect(localStorage.getItem('brain.editor.mode')).toBe('preview');
  });

  it('clicking "Split view" restores both panes', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="edit" />);
    fireEvent.click(screen.getByRole('button', { name: /Split view/ }));
    expect(screen.getByTestId('markdown-editor-source')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
    expect(localStorage.getItem('brain.editor.mode')).toBe('split');
  });

  it('sets aria-pressed on the active mode button', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="edit" />);
    expect(
      screen.getByRole('button', { name: /Edit only/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /Preview only/ }).getAttribute('aria-pressed'),
    ).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Persistence (localStorage)
// ---------------------------------------------------------------------------

describe('MarkdownEditor — persistence', () => {
  it('hydrates mode from localStorage on mount', () => {
    localStorage.setItem('brain.editor.mode', 'preview');
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="edit" />);
    // After hydration the effect runs synchronously; preview-only means
    // the source pane is unmounted.
    expect(screen.queryByTestId('markdown-editor-source')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
  });

  it('respects a custom `storageKey`', () => {
    localStorage.setItem('custom.mode.key', 'edit');
    render(
      <MarkdownEditor
        value="x"
        onChange={() => {}}
        defaultMode="split"
        storageKey="custom.mode.key"
      />,
    );
    expect(screen.queryByTestId('markdown-editor-preview')).not.toBeInTheDocument();
  });

  it('ignores garbage localStorage values and keeps the default', () => {
    localStorage.setItem('brain.editor.mode', 'lolwut');
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="split" />);
    expect(screen.getByTestId('markdown-editor-source')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
  });

  it('writes to the custom storageKey when the user clicks a mode', () => {
    render(
      <MarkdownEditor
        value="x"
        onChange={() => {}}
        defaultMode="split"
        storageKey="my.key"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit only/ }));
    expect(localStorage.getItem('my.key')).toBe('edit');
  });
});

// ---------------------------------------------------------------------------
// Narrow viewport behaviour
// ---------------------------------------------------------------------------

describe('MarkdownEditor — narrow viewport', () => {
  afterEach(() => setViewport(1024));

  it('forces split-mode into edit-only on narrow screens', () => {
    setViewport(400);
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="split" />);
    expect(screen.getByTestId('markdown-editor-source')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-editor-preview')).not.toBeInTheDocument();
  });

  it('disables the Split button on narrow screens', () => {
    setViewport(400);
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="split" />);
    const splitBtn = screen.getByRole('button', { name: /Split view/ });
    expect(splitBtn).toBeDisabled();
  });

  it('still lets the user pick preview-only on narrow screens', () => {
    setViewport(400);
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="split" />);
    fireEvent.click(screen.getByRole('button', { name: /Preview only/ }));
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-editor-source')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Preview rendering — exercise the custom react-markdown component map
// ---------------------------------------------------------------------------

describe('MarkdownEditor — preview & components map', () => {
  it('renders an empty-state notice when value is blank', () => {
    render(<MarkdownEditor value="   " onChange={() => {}} defaultMode="preview" />);
    expect(screen.getByText(/Nothing to preview yet/i)).toBeInTheDocument();
  });

  it('passes markdown body to the (mocked) react-markdown', () => {
    render(
      <MarkdownEditor
        value="# Hello"
        onChange={() => {}}
        defaultMode="preview"
      />,
    );
    expect(screen.getByTestId('react-markdown')).toHaveTextContent('# Hello');
  });

  it('exposes a full components map covering headings, paragraphs, lists, etc.', () => {
    render(
      <MarkdownEditor value="# x" onChange={() => {}} defaultMode="preview" />,
    );
    const components = (globalThis as any).__lastMarkdownComponents;
    for (const tag of [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'a', 'ul', 'ol', 'li', 'input',
      'blockquote', 'hr', 'code', 'pre',
      'strong', 'em', 'del', 'table', 'th', 'td', 'img',
    ]) {
      expect(components[tag]).toBeTypeOf('function');
    }
  });

  it('components.h1 renders an <h1> with children', () => {
    render(
      <MarkdownEditor value="# x" onChange={() => {}} defaultMode="preview" />,
    );
    const { h1, h2, h3, h4, h5, h6 } = (globalThis as any).__lastMarkdownComponents;
    const out = render(
      <div>
        {h1({ children: 'A' })}
        {h2({ children: 'B' })}
        {h3({ children: 'C' })}
        {h4({ children: 'D' })}
        {h5({ children: 'E' })}
        {h6({ children: 'F' })}
      </div>,
    );
    expect(out.container.querySelector('h1')?.textContent).toBe('A');
    expect(out.container.querySelector('h2')?.textContent).toBe('B');
    expect(out.container.querySelector('h3')?.textContent).toBe('C');
    expect(out.container.querySelector('h4')?.textContent).toBe('D');
    expect(out.container.querySelector('h5')?.textContent).toBe('E');
    expect(out.container.querySelector('h6')?.textContent).toBe('F');
  });

  it('components.a renders an external-safe link', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />);
    const { a } = (globalThis as any).__lastMarkdownComponents;
    const out = render(a({ href: 'https://example.com', children: 'go' }));
    const anchor = out.container.querySelector('a')!;
    expect(anchor.getAttribute('href')).toBe('https://example.com');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('components.li with task-list-item className renders without bullet', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />);
    const { li } = (globalThis as any).__lastMarkdownComponents;
    const out = render(li({ className: 'task-list-item', children: 'todo' }));
    const node = out.container.querySelector('li')!;
    expect(node.className).toContain('list-none');
  });

  it('components.li without task-list-item className renders default bullet', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />);
    const { li } = (globalThis as any).__lastMarkdownComponents;
    const out = render(li({ children: 'item' }));
    const node = out.container.querySelector('li')!;
    expect(node.className).toContain('leading-relaxed');
  });

  it('components.input renders a checkbox only for type=checkbox', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />);
    const { input } = (globalThis as any).__lastMarkdownComponents;
    const checkbox = render(input({ type: 'checkbox', checked: true })).container.querySelector(
      'input',
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute('type')).toBe('checkbox');
    // Non-checkbox returns null.
    const out = render(<div>{input({ type: 'text' })}</div>);
    expect(out.container.querySelector('input')).toBeNull();
  });

  it('components.code distinguishes block vs inline by className', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />);
    const { code } = (globalThis as any).__lastMarkdownComponents;
    const block = render(code({ className: 'language-ts', children: 'x' })).container.querySelector(
      'code',
    );
    expect(block?.className).toContain('block');
    const inline = render(code({ className: '', children: 'x' })).container.querySelector('code');
    expect(inline?.className).toContain('bg-muted');
  });

  it('components.img passes only string src through and falls back to empty alt', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} defaultMode="preview" />);
    const { img } = (globalThis as any).__lastMarkdownComponents;
    const okImg = render(img({ src: 'http://x/y.png' })).container.querySelector('img');
    expect(okImg?.getAttribute('src')).toBe('http://x/y.png');
    expect(okImg?.getAttribute('alt')).toBe('');
    const badImg = render(img({ src: 12345 })).container.querySelector('img');
    expect(badImg?.getAttribute('src')).toBeNull();
  });

  it('extraComponents override the defaults (e.g. dataview code fence)', () => {
    const Override: any = ({ children }: any) =>
      React.createElement('span', { 'data-testid': 'override-code' }, children);
    render(
      <MarkdownEditor
        value="```dataview\nx\n```"
        onChange={() => {}}
        defaultMode="preview"
        extraComponents={{ code: Override }}
      />,
    );
    const { code } = (globalThis as any).__lastMarkdownComponents;
    expect(code).toBe(Override);
  });
});

// ---------------------------------------------------------------------------
// Keymap wiring (Mod-b / Mod-i / Mod-k / Mod-s)
// ---------------------------------------------------------------------------

describe('MarkdownEditor — keymap', () => {
  it('registers the four hotkeys plus history/default chains', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} />);
    const entries = (globalThis as any).__capturedKeymap as KeymapEntry[];
    const keys = entries.map((e) => e.key).filter(Boolean);
    expect(keys).toEqual(expect.arrayContaining(['Mod-b', 'Mod-i', 'Mod-k', 'Mod-s']));
  });

  it('Mod-b wraps the current selection in **bold** markers', () => {
    render(<MarkdownEditor value="hello world" onChange={() => {}} />);
    const { view, dispatch } = makeFakeView({
      text: 'hello world',
      ranges: [{ from: 0, to: 5, head: 5 }],
    });
    const modB = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-b',
    )!;
    expect(modB.run!(view)).toBe(true);
    // We expect two inserts of '**' (one at `from`, one at `to`).
    const inserted = dispatch.mock.calls[0][0].changes.map((c: any) => c.insert);
    expect(inserted).toEqual(['**', '**']);
  });

  it('Mod-i wraps the current selection in *italic* markers', () => {
    render(<MarkdownEditor value="abc" onChange={() => {}} />);
    const { view, dispatch } = makeFakeView({
      text: 'abc',
      ranges: [{ from: 0, to: 3, head: 3 }],
    });
    const modI = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-i',
    )!;
    expect(modI.run!(view)).toBe(true);
    const inserted = dispatch.mock.calls[0][0].changes.map((c: any) => c.insert);
    expect(inserted).toEqual(['*', '*']);
  });

  it('Mod-b unwraps an already-bold selection', () => {
    // selection = 'X', surrounded by '**' on each side
    const text = '**X**';
    render(<MarkdownEditor value={text} onChange={() => {}} />);
    const { view, dispatch } = makeFakeView({
      text,
      ranges: [{ from: 2, to: 3, head: 3 }],
    });
    const modB = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-b',
    )!;
    modB.run!(view);
    // Two deletions (insert: '') of length 2 each.
    const changes = dispatch.mock.calls[0][0].changes;
    expect(changes.every((c: any) => c.insert === '')).toBe(true);
    expect(changes).toHaveLength(2);
  });

  it('Mod-k wraps the selection in a markdown link with `url` placeholder', () => {
    render(<MarkdownEditor value="abc" onChange={() => {}} />);
    const { view, dispatch } = makeFakeView({
      text: 'abc',
      ranges: [{ from: 0, to: 3, head: 3 }],
    });
    const modK = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-k',
    )!;
    expect(modK.run!(view)).toBe(true);
    expect(dispatch.mock.calls[0][0].changes[0].insert).toBe('[abc](url)');
  });

  it('Mod-k inserts "text" placeholder when no selection', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const { view, dispatch } = makeFakeView({
      text: '',
      ranges: [{ from: 0, to: 0, head: 0 }],
    });
    const modK = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-k',
    )!;
    modK.run!(view);
    expect(dispatch.mock.calls[0][0].changes[0].insert).toBe('[text](url)');
  });

  it('Mod-s calls onSave when provided', () => {
    const onSave = vi.fn();
    render(<MarkdownEditor value="x" onChange={() => {}} onSave={onSave} />);
    const modS = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-s',
    )!;
    expect(modS.run!({})).toBe(true);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('Mod-s without onSave is a no-op but still returns true', () => {
    render(<MarkdownEditor value="x" onChange={() => {}} />);
    const modS = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-s',
    )!;
    expect(modS.run!({})).toBe(true);
  });

  it('latest onSave wins after a re-render (ref kept up to date)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <MarkdownEditor value="x" onChange={() => {}} onSave={first} />,
    );
    rerender(<MarkdownEditor value="x" onChange={() => {}} onSave={second} />);
    const modS = (globalThis as any).__capturedKeymap.find(
      (e: KeymapEntry) => e.key === 'Mod-s',
    )!;
    modS.run!({});
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Image paste / drop handlers
// ---------------------------------------------------------------------------

describe('MarkdownEditor — image paste/drop', () => {
  function setFetchOk(payload: any) {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
  }
  function setFetchFail() {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
  }

  it('wires up paste + drop DOM handlers on the editor', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    expect(typeof h.paste).toBe('function');
    expect(typeof h.drop).toBe('function');
  });

  it('paste with no clipboardData returns false (no-op)', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const { view } = makeFakeView({ text: '' });
    expect(h.paste({} as any, view)).toBe(false);
  });

  it('paste with no image items returns false', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const { view } = makeFakeView({ text: '' });
    const event = {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
      preventDefault: vi.fn(),
    };
    expect(h.paste(event as any, view)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('paste with an image item inserts a placeholder and prevents default', () => {
    // No fetch hookup — keeps the upload promise pending so the placeholder
    // survives long enough to be observable.
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const { view, dispatch, getText } = makeFakeView({ text: '' });
    const file = new File([new Uint8Array([1, 2, 3])], 'p.png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
      preventDefault: vi.fn(),
    };
    expect(h.paste(event as any, view)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
    expect(getText()).toContain('![uploading:');
  });

  it('paste followed by upload success replaces the placeholder with the final URL', async () => {
    setFetchOk({ success: true, data: { url: '/uploaded/cat.png', filename: 'cat.png' } });
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const fv = makeFakeView({ text: '' });
    const file = new File([new Uint8Array([0])], 'cat.png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault: vi.fn(),
    };
    await act(async () => {
      h.paste(event as any, fv.view);
      // flush promise microtasks for the fetch().then()
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fv.getText()).toContain('![cat.png](/uploaded/cat.png)');
  });

  it('paste followed by upload failure replaces the placeholder with an error marker', async () => {
    setFetchFail();
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const fv = makeFakeView({ text: '' });
    const file = new File([new Uint8Array([0])], 'oops.png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault: vi.fn(),
    };
    await act(async () => {
      h.paste(event as any, fv.view);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fv.getText()).toContain('upload failed: oops.png');
  });

  it('paste when fetch throws produces an error marker (network catch path)', async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('boom'));
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const fv = makeFakeView({ text: '' });
    const file = new File([new Uint8Array([0])], 'net.png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault: vi.fn(),
    };
    await act(async () => {
      h.paste(event as any, fv.view);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fv.getText()).toContain('upload failed: net.png');
  });

  it('paste escapes square brackets in the filename when building the alt text', async () => {
    setFetchOk({ success: true, data: { url: '/uploaded/x.png', filename: 'a]b].png' } });
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const fv = makeFakeView({ text: '' });
    const file = new File([new Uint8Array([0])], 'a]b].png', { type: 'image/png' });
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault: vi.fn(),
    };
    await act(async () => {
      h.paste(event as any, fv.view);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Both the placeholder alt (before upload finishes) and final alt should be escaped.
    expect(fv.getText()).toContain('a\\]b\\]');
  });

  it('drop with no files returns false', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const { view } = makeFakeView({ text: '' });
    expect(h.drop({} as any, view)).toBe(false);
  });

  it('drop with non-image files returns false (no preventDefault)', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const { view } = makeFakeView({ text: '' });
    const textFile = new File(['hi'], 'a.txt', { type: 'text/plain' });
    const event = {
      dataTransfer: { files: [textFile] },
      preventDefault: vi.fn(),
      clientX: 10,
      clientY: 20,
    };
    expect(h.drop(event as any, view)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('drop with image files inserts a placeholder and uses posAtCoords', () => {
    setFetchOk({ success: true, data: { url: '/u/x.png', filename: 'x.png' } });
    render(<MarkdownEditor value="" onChange={() => {}} />);
    const h = (globalThis as any).__capturedDomHandlers;
    const fv = makeFakeView({ text: 'abcdefghij' });
    const file = new File([new Uint8Array([0])], 'x.png', { type: 'image/png' });
    const event = {
      dataTransfer: { files: [file] },
      preventDefault: vi.fn(),
      clientX: 50,
      clientY: 75,
    };
    expect(h.drop(event as any, fv.view)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(fv.view.posAtCoords).toHaveBeenCalledWith({ x: 50, y: 75 });
    expect(fv.getText()).toContain('![uploading:');
  });
});

// ---------------------------------------------------------------------------
// CodeMirror lifecycle / onEditorReady
// ---------------------------------------------------------------------------

describe('MarkdownEditor — editor lifecycle', () => {
  it('fires onEditorReady with the underlying view on mount', () => {
    const ready = vi.fn();
    render(<MarkdownEditor value="x" onChange={() => {}} onEditorReady={ready} />);
    expect(ready).toHaveBeenCalled();
    expect(ready.mock.calls[0][0]).toBeTruthy();
  });

  it('forwards onChange when CodeMirror reports a new value', () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);
    const ta = screen.getByTestId('markdown-editor-source') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'updated' } });
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('disables the autocomplete extension when fetchers=null', () => {
    render(
      <MarkdownEditor
        value=""
        onChange={() => {}}
        autocompleteFetchers={null}
      />,
    );
    // Just assert it doesn't crash; the keymap captured proves the editor built.
    expect((globalThis as any).__capturedKeymap).toBeTruthy();
  });

  it('accepts custom minHeight and applies it to the body container style', () => {
    const { container } = render(
      <MarkdownEditor value="x" onChange={() => {}} minHeight={555} />,
    );
    const styled = container.querySelector('[style*="min-height: 555px"]');
    expect(styled).not.toBeNull();
  });

  it('applies a custom className to the outer wrapper', () => {
    const { container } = render(
      <MarkdownEditor value="x" onChange={() => {}} className="custom-wrapper" />,
    );
    expect(container.querySelector('.custom-wrapper')).not.toBeNull();
  });
});
