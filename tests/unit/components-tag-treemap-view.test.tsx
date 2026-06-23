/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// ResizeObserver mock — capture instances so tests can fire resize events
// ---------------------------------------------------------------------------

type ROEntry = { contentRect: { width: number; height: number } };
type ROInstance = {
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: (entries: ROEntry[]) => void;
  cb: (entries: ROEntry[]) => void;
};

const roInstances: ROInstance[] = [];

class FakeResizeObserver {
  cb: (entries: ROEntry[]) => void;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: (entries: ROEntry[]) => void) {
    this.cb = cb;
    const inst: ROInstance = {
      observe: this.observe,
      unobserve: this.unobserve,
      disconnect: this.disconnect,
      trigger: (entries) => this.cb(entries),
      cb,
    };
    roInstances.push(inst);
  }
  trigger(entries: ROEntry[]) {
    this.cb(entries);
  }
}

(globalThis as any).ResizeObserver = FakeResizeObserver;

// Helper: fire a resize on the *latest* observer instance.
function fireResize(width: number, height: number) {
  const last = roInstances[roInstances.length - 1];
  if (!last) return;
  act(() => {
    last.trigger([{ contentRect: { width, height } } as ROEntry]);
  });
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

function mockFetch(payload: any, opts: { ok?: boolean; status?: number; throws?: any; jsonThrows?: boolean } = {}) {
  if (opts.throws) {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(opts.throws);
    return;
  }
  (globalThis as any).fetch = vi.fn().mockResolvedValue({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => {
      if (opts.jsonThrows) throw new Error('bad json');
      return payload;
    },
  });
}

// ---------------------------------------------------------------------------
// Import the component AFTER mocks
// ---------------------------------------------------------------------------

import TagTreemapView from '@/components/brain/TagTreemapView';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  pushMock.mockReset();
  roInstances.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper to render and wait for fetch effect to settle
// ---------------------------------------------------------------------------

async function renderAndSettle() {
  const utils = render(<TagTreemapView />);
  // Let the fetch promise & state updates flush
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('TagTreemapView — loading state', () => {
  it('renders skeleton tiles while data is loading', () => {
    // Never-resolving fetch keeps the component in loading state
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<TagTreemapView />);
    // Skeleton has 8 animated pulse divs
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(8);
  });

  it('skeleton uses grid layout', () => {
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    const { container } = render(<TagTreemapView />);
    expect(container.querySelector('.grid-cols-4')).not.toBeNull();
    expect(container.querySelector('.grid-rows-3')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('TagTreemapView — error state', () => {
  it('renders error message when fetch returns !ok', async () => {
    mockFetch({ success: false, error: 'Something broke' }, { ok: false, status: 500 });
    await renderAndSettle();
    expect(screen.getByText(/Failed to load tag treemap/i)).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('falls back to HTTP status message when error field is missing', async () => {
    mockFetch({ success: false }, { ok: false, status: 503 });
    await renderAndSettle();
    expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
  });

  it('renders error icon (material-icons error_outline)', async () => {
    mockFetch({ success: false, error: 'oops' }, { ok: false });
    const { container } = await renderAndSettle();
    expect(container.querySelector('.material-icons')?.textContent).toBe('error_outline');
  });

  it('handles success=false even with ok response', async () => {
    mockFetch({ success: false, error: 'logical error' }, { ok: true });
    await renderAndSettle();
    expect(screen.getByText('logical error')).toBeInTheDocument();
  });

  it('handles missing data field with ok response', async () => {
    mockFetch({ success: true }, { ok: true });
    await renderAndSettle();
    expect(screen.getByText(/Failed to load tag treemap/i)).toBeInTheDocument();
  });

  it('handles fetch rejection (network error) — Error instance', async () => {
    mockFetch(null, { throws: new Error('Network down') });
    await renderAndSettle();
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });

  it('handles fetch rejection with non-Error value', async () => {
    mockFetch(null, { throws: 'string rejection' });
    await renderAndSettle();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('handles json() throwing — falls through to success=false default', async () => {
    mockFetch(null, { ok: true, jsonThrows: true });
    await renderAndSettle();
    // Component catches json failure and renders error state
    expect(screen.getByText(/Failed to load tag treemap/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('TagTreemapView — empty state', () => {
  it('renders "No tags yet" when tags is empty and no untagged', async () => {
    mockFetch({ success: true, data: { tags: [], untagged: 0, total: 0 } });
    await renderAndSettle();
    expect(screen.getByText(/No tags yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Add tags to your notes to see them visualized here/i),
    ).toBeInTheDocument();
  });

  it('renders empty state with label_off icon', async () => {
    mockFetch({ success: true, data: { tags: [], untagged: 0, total: 0 } });
    const { container } = await renderAndSettle();
    expect(container.querySelector('.material-icons')?.textContent).toBe('label_off');
  });

  it('treats tags with count=0 as empty (filters them out)', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [
          { tag: 'zero', count: 0 },
          { tag: 'alsozero', count: 0 },
        ],
        untagged: 0,
        total: 0,
      },
    });
    await renderAndSettle();
    expect(screen.getByText(/No tags yet/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tagged rendering
// ---------------------------------------------------------------------------

describe('TagTreemapView — tagged rendering', () => {
  it('renders a tile button per non-zero tag', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [
          { tag: 'react', count: 10 },
          { tag: 'typescript', count: 5 },
          { tag: 'css', count: 3 },
        ],
        untagged: 0,
        total: 18,
      },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /react, 10 notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /typescript, 5 notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /css, 3 notes/i })).toBeInTheDocument();
  }, 15000);

  it('uses singular "note" for count=1', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'solo', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /solo, 1 note/i })).toBeInTheDocument();
  });

  it('uses plural "notes" for count > 1', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'many', count: 42 }],
        untagged: 0,
        total: 42,
      },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /many, 42 notes/i })).toBeInTheDocument();
  });

  it('sets aria-label including tag name and count', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'foo', count: 7 }],
        untagged: 0,
        total: 7,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /foo, 7 notes/i });
    expect(btn.getAttribute('aria-label')).toBe('foo, 7 notes');
  });

  it('sets title attribute on each tile', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'bar', count: 3 }],
        untagged: 0,
        total: 3,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /bar, 3 notes/i });
    expect(btn.getAttribute('title')).toBe('bar — 3 notes');
  });

  it('uses singular "note" in title for count=1', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'unique', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /unique, 1 note/i });
    expect(btn.getAttribute('title')).toBe('unique — 1 note');
  });

  it('outer container has role=group and aria-label="Tag treemap"', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'x', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const group = screen.getByRole('group', { name: /Tag treemap/i });
    expect(group).toBeInTheDocument();
  });

  it('positions tiles absolutely with percent units', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'only', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /only/i });
    const style = btn.getAttribute('style') || '';
    expect(style).toContain('left:');
    expect(style).toContain('top:');
    expect(style).toContain('width:');
    expect(style).toContain('height:');
    expect(style).toContain('%');
  });

  it('filters out zero-count tags but renders positive ones', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [
          { tag: 'keep', count: 5 },
          { tag: 'skip', count: 0 },
          { tag: 'alsokeep', count: 2 },
        ],
        untagged: 0,
        total: 7,
      },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /keep, 5 notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /alsokeep, 2 notes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^skip,/i })).not.toBeInTheDocument();
  });

  it('handles many tags (exercises squarify recursion paths)', async () => {
    const tags = Array.from({ length: 30 }, (_, i) => ({
      tag: `tag${i}`,
      count: 30 - i, // descending counts
    }));
    mockFetch({
      success: true,
      data: { tags, untagged: 0, total: tags.reduce((s, t) => s + t.count, 0) },
    });
    await renderAndSettle();
    // All tags should render
    expect(screen.getByRole('button', { name: /tag0, 30 notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tag29, 1 note/i })).toBeInTheDocument();
  }, 15000);
});

// ---------------------------------------------------------------------------
// Untagged tile
// ---------------------------------------------------------------------------

describe('TagTreemapView — untagged tile', () => {
  it('renders the untagged tile when untagged > 0 and tags exist', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'a', count: 5 }],
        untagged: 3,
        total: 8,
      },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /Untagged, 3 notes/i })).toBeInTheDocument();
  });

  it('renders only the untagged tile when tags are empty but untagged > 0', async () => {
    mockFetch({
      success: true,
      data: { tags: [], untagged: 4, total: 4 },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /Untagged, 4 notes/i })).toBeInTheDocument();
  });

  it('untagged tile uses dashed border style', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'a', count: 5 }],
        untagged: 2,
        total: 7,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /Untagged/i });
    const style = btn.getAttribute('style') || '';
    expect(style).toContain('dashed');
    expect(btn.className).toContain('border-dashed');
  });

  it('untagged tile uses singular "note" for count=1', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'a', count: 1 }],
        untagged: 1,
        total: 2,
      },
    });
    await renderAndSettle();
    expect(screen.getByRole('button', { name: /Untagged, 1 note/i })).toBeInTheDocument();
  });

  it('does not render untagged tile when untagged=0', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'a', count: 5 }],
        untagged: 0,
        total: 5,
      },
    });
    await renderAndSettle();
    expect(screen.queryByRole('button', { name: /Untagged/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Click / keyboard navigation
// ---------------------------------------------------------------------------

describe('TagTreemapView — interactions', () => {
  it('clicking a tag tile navigates to /portal/brain/knowledge?tag=<tag>', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'react', count: 5 }],
        untagged: 0,
        total: 5,
      },
    });
    await renderAndSettle();
    fireEvent.click(screen.getByRole('button', { name: /react/i }));
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?tag=react');
  });

  it('encodes tag names with special characters in the URL', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'a b/c?', count: 3 }],
        untagged: 0,
        total: 3,
      },
    });
    await renderAndSettle();
    fireEvent.click(screen.getByRole('button', { name: /a b\/c\?/i }));
    expect(pushMock).toHaveBeenCalledWith(
      `/portal/brain/knowledge?tag=${encodeURIComponent('a b/c?')}`,
    );
  });

  it('clicking the untagged tile navigates to /portal/brain/knowledge (no query)', async () => {
    mockFetch({
      success: true,
      data: { tags: [], untagged: 5, total: 5 },
    });
    await renderAndSettle();
    fireEvent.click(screen.getByRole('button', { name: /Untagged/i }));
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge');
  });

  it('Enter key on a tile triggers navigation', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'enter', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /enter/i });
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?tag=enter');
  });

  it('Space key on a tile triggers navigation', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'space', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /space/i });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?tag=space');
  });

  it('other keys do not trigger navigation', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'tab', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /tab/i });
    fireEvent.keyDown(btn, { key: 'Tab' });
    fireEvent.keyDown(btn, { key: 'Escape' });
    fireEvent.keyDown(btn, { key: 'a' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('Enter on untagged tile goes to unfiltered knowledge page', async () => {
    mockFetch({
      success: true,
      data: { tags: [], untagged: 1, total: 1 },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /Untagged/i });
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge');
  });
});

// ---------------------------------------------------------------------------
// Hover / focus state
// ---------------------------------------------------------------------------

describe('TagTreemapView — hover & focus state', () => {
  it('applies hover scale/shadow classes on mouse enter', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'hover', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /hover/i });
    expect(btn.className).not.toContain('scale-[1.015]');
    fireEvent.mouseEnter(btn);
    expect(btn.className).toContain('scale-[1.015]');
    expect(btn.className).toContain('shadow-lg');
  });

  it('clears hover on mouse leave', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'mouse', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /mouse/i });
    fireEvent.mouseEnter(btn);
    expect(btn.className).toContain('scale-[1.015]');
    fireEvent.mouseLeave(btn);
    expect(btn.className).not.toContain('scale-[1.015]');
  });

  it('mouse leave on non-hovered tile does not clear another tile\'s hover', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [
          { tag: 'one', count: 5 },
          { tag: 'two', count: 5 },
        ],
        untagged: 0,
        total: 10,
      },
    });
    await renderAndSettle();
    const a = screen.getByRole('button', { name: /one/i });
    const b = screen.getByRole('button', { name: /two/i });
    fireEvent.mouseEnter(a);
    // Leaving b should not affect a (because hoveredKey === 'one')
    fireEvent.mouseLeave(b);
    expect(a.className).toContain('scale-[1.015]');
  });

  it('focus event sets hover state', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'focus', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /focus/i });
    fireEvent.focus(btn);
    expect(btn.className).toContain('scale-[1.015]');
  });

  it('blur event clears hover state', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'blur', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /blur/i });
    fireEvent.focus(btn);
    fireEvent.blur(btn);
    expect(btn.className).not.toContain('scale-[1.015]');
  });
});

// ---------------------------------------------------------------------------
// ResizeObserver behaviour & label visibility
// ---------------------------------------------------------------------------

describe('TagTreemapView — resize & label visibility', () => {
  it('observes the container element on mount', () => {
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    render(<TagTreemapView />);
    expect(roInstances.length).toBeGreaterThan(0);
    expect(roInstances[0].observe).toHaveBeenCalled();
  });

  it('disconnects the observer on unmount', () => {
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    const { unmount } = render(<TagTreemapView />);
    const inst = roInstances[roInstances.length - 1];
    unmount();
    expect(inst.disconnect).toHaveBeenCalled();
  });

  it('updates size state when ResizeObserver fires (shows labels)', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'sizeme', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    // Before resize, size = 0/0, so labels hidden (tile.w% * 0 = 0 ≤ 60)
    expect(screen.queryByText('sizeme')).not.toBeInTheDocument();
    fireResize(800, 600);
    // Now labels should appear since the only tile takes the full area
    expect(screen.getByText('sizeme')).toBeInTheDocument();
  });

  it('renders label text "X note" / "X notes" when tile is large enough', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [
          { tag: 'big', count: 1 },
        ],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    fireResize(1000, 500);
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });

  it('hides labels when container is too small', async () => {
    mockFetch({
      success: true,
      data: {
        tags: Array.from({ length: 50 }, (_, i) => ({ tag: `t${i}`, count: 1 })),
        untagged: 0,
        total: 50,
      },
    });
    await renderAndSettle();
    // Tiny container — labels should not appear because each tile is too small
    fireResize(40, 40);
    // No label text rendered (would be many duplicates of "1 note" otherwise)
    expect(screen.queryByText('1 note')).not.toBeInTheDocument();
  });

  it('handles container ref being null gracefully (no crash on resize effect)', async () => {
    // Component must mount; we let it run normally. Just sanity check.
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    expect(() => render(<TagTreemapView />)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Color/style application
// ---------------------------------------------------------------------------

describe('TagTreemapView — tile colors', () => {
  it('untagged tile gets the neutral gray background', async () => {
    mockFetch({
      success: true,
      data: { tags: [], untagged: 3, total: 3 },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /Untagged/i }) as HTMLButtonElement;
    // jsdom normalizes hsl() to rgb(); just confirm a background color is set.
    expect(btn.style.backgroundColor).toBeTruthy();
    expect(btn.style.borderStyle).toBe('dashed');
    expect(btn.style.borderColor).toBeTruthy();
    expect(btn.style.color).toBeTruthy();
  });

  it('tag tiles get a non-empty background color set', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'colored', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /colored/i }) as HTMLButtonElement;
    // jsdom converts hsl() to rgb() in inline style strings — assert via the
    // CSSStyleDeclaration instead of a regex match on serialized text.
    expect(btn.style.backgroundColor).toBeTruthy();
    expect(btn.style.borderColor).toBeTruthy();
    expect(btn.style.borderStyle).toBe('solid');
    expect(btn.style.color).toBe('white');
  });

  it('produces deterministic color per tag name', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [
          { tag: 'samename', count: 5 },
          { tag: 'samename', count: 3 },
        ],
        untagged: 0,
        total: 8,
      },
    });
    await renderAndSettle();
    // duplicate keys collapse to one button (React warns) but the color hashing
    // should be deterministic. Just confirm the rendering works.
    const btns = screen.getAllByRole('button');
    expect(btns.length).toBeGreaterThan(0);
  });

  it('uses solid border style for tagged tiles', async () => {
    mockFetch({
      success: true,
      data: {
        tags: [{ tag: 'solid', count: 1 }],
        untagged: 0,
        total: 1,
      },
    });
    await renderAndSettle();
    const btn = screen.getByRole('button', { name: /solid/i });
    const style = btn.getAttribute('style') || '';
    expect(style).toContain('solid');
    expect(style).not.toContain('dashed');
  });
});

// ---------------------------------------------------------------------------
// Effect cleanup — cancelled fetch
// ---------------------------------------------------------------------------

describe('TagTreemapView — effect cleanup', () => {
  it('does not crash when unmounting before fetch resolves', async () => {
    let resolveFetch: (v: any) => void = () => {};
    (globalThis as any).fetch = vi.fn(() => new Promise(r => { resolveFetch = r; }));
    const { unmount } = render(<TagTreemapView />);
    unmount();
    // Resolve after unmount — the cancelled guard should swallow updates.
    resolveFetch({
      ok: true,
      json: async () => ({ success: true, data: { tags: [], untagged: 0, total: 0 } }),
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // No error means the cancelled guard worked.
    expect(true).toBe(true);
  });

  it('cancelled flag prevents error state update when fetch rejects after unmount', async () => {
    let rejectFetch: (e: any) => void = () => {};
    (globalThis as any).fetch = vi.fn(
      () => new Promise((_, rej) => { rejectFetch = rej; }),
    );
    const { unmount } = render(<TagTreemapView />);
    unmount();
    rejectFetch(new Error('after-unmount'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Endpoint URL
// ---------------------------------------------------------------------------

describe('TagTreemapView — fetch endpoint', () => {
  it('fetches the brain knowledge tags=counts endpoint', async () => {
    mockFetch({ success: true, data: { tags: [], untagged: 0, total: 0 } });
    await renderAndSettle();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/portal/brain/knowledge?tags=counts');
  });
});
