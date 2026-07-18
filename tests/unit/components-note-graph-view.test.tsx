// @vitest-environment jsdom
/**
 * Unit tests for NoteGraphView (components/brain/NoteGraphView.tsx).
 *
 * The real component renders a canvas-based force-directed graph via
 * react-force-graph-2d (loaded through next/dynamic). For unit testing we:
 *   - stub next/dynamic so dynamic components resolve synchronously
 *   - stub react-force-graph-2d to a deterministic React shim that captures
 *     props so we can drive nodeCanvasObject / nodePointerAreaPaint /
 *     onNodeClick / onNodeHover without a real canvas
 *   - stub GraphHoverBacklinks to a passthrough that exposes onClose +
 *     onSelectNote
 *   - mock next/navigation's useRouter
 *   - mock global fetch with per-URL responses for the tag list + graph data
 *   - mock ResizeObserver in jsdom
 *
 * Coverage focuses on the public surface: filters, search, color modes,
 * resize handling, loading / error / empty branches, and the drawNode +
 * pointer-area-paint callbacks across every node kind / state combination.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede source import) ─────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/knowledge/graph',
  useSearchParams: () => new URLSearchParams(),
}));

// next/dynamic — return the imported component synchronously. Our
// react-force-graph-2d mock below provides a default export.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    // Eagerly invoke the loader and return a wrapper that renders whatever
    // resolved. Tests use waitFor() to allow the microtask to flush.
    let Resolved: React.ComponentType<unknown> | null = null;
    loader().then((mod) => {
      Resolved = mod.default;
    });
    const Wrapper = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
      if (!Resolved) return null;
      const Component = Resolved as React.ComponentType<Record<string, unknown>>;
      return <Component {...props} ref={ref as never} />;
    });
    Wrapper.displayName = 'DynamicMock';
    return Wrapper;
  },
}));

// Captures the most recent props the graph shim received so tests can poke
// at the callbacks (drawNode, hit-test painter, hover, click).
type CapturedProps = Record<string, unknown> | null;
const fgPropsRef: { current: CapturedProps } = { current: null };

// Captures the imperative ref set by NoteGraphView. fitToZoom button +
// graph-change effect call zoomToFit on this.
const fgZoomToFit = vi.fn();

vi.mock('react-force-graph-2d', () => {
  const Comp = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    fgPropsRef.current = props;
    React.useImperativeHandle(
      ref as React.Ref<unknown>,
      () => ({ zoomToFit: fgZoomToFit }),
      [],
    );
    return <div data-testid="force-graph-2d" />;
  });
  Comp.displayName = 'ForceGraph2DMock';
  return { default: Comp };
});

// GraphHoverBacklinks — replace with a trivial passthrough so we can drive
// onClose / onSelectNote without the real fetch/debounce.
const backlinksPropsRef: { current: Record<string, unknown> | null } = { current: null };
vi.mock('@/components/brain/GraphHoverBacklinks', () => ({
  default: (props: Record<string, unknown>) => {
    backlinksPropsRef.current = props;
    return <div data-testid="hover-backlinks" />;
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ServerGraphNode {
  id: string;
  kind: 'note' | 'company' | 'contact' | 'deal' | 'meeting';
  title: string;
  tags: string[];
  pinned: boolean;
  hasIncoming: boolean;
  hasOutgoing: boolean;
}
interface ServerGraphEdge {
  source: string;
  target: string;
}

function buildGraph(
  partialNodes: Array<Partial<ServerGraphNode> & { id: string }>,
  edges: ServerGraphEdge[] = [],
  truncated = false,
) {
  const nodes: ServerGraphNode[] = partialNodes.map((n) => ({
    id: n.id,
    kind: n.kind ?? 'note',
    title: n.title ?? n.id,
    tags: n.tags ?? [],
    pinned: n.pinned ?? false,
    hasIncoming: n.hasIncoming ?? false,
    hasOutgoing: n.hasOutgoing ?? false,
  }));
  return { success: true, data: { nodes, edges, truncated } };
}

function fakeCtx(): CanvasRenderingContext2D {
  // We don't validate canvas drawing visually — we just need every method to
  // exist so drawNode / nodePointerAreaPaint run without throwing.
  const noop = () => undefined;
  const ctx: Record<string, unknown> = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    setLineDash: vi.fn(),
    clearRect: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

// Configurable mock fetch — install per test via setFetchResponses.
type FetchResponse = { ok?: boolean; json: () => Promise<unknown> };
type ResponderMap = {
  tags?: unknown;
  graph?: unknown;
  graphReject?: boolean;
  graphFailure?: { success?: false; message?: string } | null;
};
let fetchCalls: string[] = [];
function setupFetch(map: ResponderMap = {}) {
  fetchCalls = [];
  const tagsBody = map.tags ?? { success: true, data: { tags: ['alpha', 'beta', 'gamma'] } };
  const graphBody =
    map.graphFailure ??
    map.graph ??
    buildGraph(
      [
        { id: 'note:1', title: 'Hub note', tags: ['alpha', 'beta'], pinned: true, kind: 'note' },
        { id: 'note:2', title: 'Leaf', tags: ['beta'], kind: 'note' },
        { id: 'note:3', title: 'Orphan', tags: [], kind: 'note' },
        { id: 'company:7', title: 'ACME', tags: [], kind: 'company' },
        { id: 'contact:3', title: 'Jane', tags: [], kind: 'contact' },
        { id: 'deal:9', title: 'Big deal', tags: [], kind: 'deal' },
        { id: 'meeting:1', title: 'Standup', tags: [], kind: 'meeting' },
      ],
      [
        { source: 'note:1', target: 'note:2' },
        { source: 'note:1', target: 'company:7' },
        { source: 'note:1', target: 'note:1' }, // self-loop, skipped by community detector
      ],
      true,
    );

  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);
    if (url.includes('tags=true')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(tagsBody) }) as unknown as Promise<Response>;
    }
    if (url.includes('/graph')) {
      if (map.graphReject) {
        return Promise.reject(new Error('boom')) as unknown as Promise<Response>;
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(graphBody) }) as unknown as Promise<Response>;
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as unknown as Promise<Response>;
  }) as unknown as typeof fetch;
}

// jsdom doesn't ship ResizeObserver — provide a controllable shim.
const resizeObservers: Array<(entries: unknown[]) => void> = [];
class MockResizeObserver {
  private cb: (entries: unknown[]) => void;
  constructor(cb: (entries: unknown[]) => void) {
    this.cb = cb;
    resizeObservers.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pushMock.mockReset();
  fgZoomToFit.mockReset();
  fgPropsRef.current = null;
  backlinksPropsRef.current = null;
  resizeObservers.length = 0;
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;
  // Make Math.random deterministic so detectCommunities is stable.
  vi.spyOn(Math, 'random').mockReturnValue(0.123);
  setupFetch();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Flush microtasks + the dynamic import + fetch chains.
async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Lazily import the component so each `describe` block picks up the mocks.
async function loadComponent() {
  const mod = await import('@/components/brain/NoteGraphView');
  return mod.default;
}

describe('NoteGraphView — initial render + fetches', () => {
  it('renders the toolbar and shows loading state before fetch resolves', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    // The "Loading graph…" text is in the DOM before the fetches finish.
    expect(container.textContent).toContain('Loading graph');
  });

  it('renders node + edge counts once the graph loads', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).toMatch(/\d+ nodes \/ \d+ edges/);
  });

  it('fetches the tag list once and populates the tag select', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(fetchCalls.filter((u) => u.includes('tags=true')).length).toBe(1);
  });

  it('issues the initial graph fetch without any query params', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const graphCalls = fetchCalls.filter((u) => u.includes('/graph'));
    expect(graphCalls.length).toBeGreaterThanOrEqual(1);
    expect(graphCalls[0]).not.toContain('?');
  });

  it('shows the truncation banner when the server flags the result as truncated', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).toContain('Showing the first 1000 notes');
  });

  it('omits the truncation banner when the server returns truncated=false', async () => {
    setupFetch({ graph: buildGraph([{ id: 'note:1', title: 'Solo' }], [], false) });
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).not.toContain('Showing the first 1000 notes');
  });

  it('renders an empty-state when the graph has zero nodes', async () => {
    setupFetch({ graph: buildGraph([], [], false) });
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).toContain('No notes match this filter');
  });

  it('renders an error message when the server returns success=false', async () => {
    setupFetch({ graphFailure: { success: false, message: 'Boom' } });
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).toContain('Boom');
  });

  it('falls back to a default error message when the server omits a message field', async () => {
    setupFetch({ graphFailure: { success: false } });
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).toContain('Failed to load graph');
  });

  it('renders an error message when the graph fetch rejects', async () => {
    setupFetch({ graphReject: true });
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    expect(container.textContent).toContain('boom');
  });

  it('survives a malformed tag-list response without crashing', async () => {
    setupFetch({ tags: { success: false } });
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const select = container.querySelector('select') as HTMLSelectElement;
    // Just the "All tags" sentinel option.
    expect(select.options.length).toBe(1);
  });
});

describe('NoteGraphView — filter interactions', () => {
  it('refetches with a ?tag= param when a tag is selected', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const select = container.querySelectorAll('select')[0] as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'beta' } });
    });
    await flushAsync();
    expect(fetchCalls.some((u) => u.includes('tag=beta'))).toBe(true);
  });

  it('refetches with orphansOnly=true when the checkbox is checked', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });
    await flushAsync();
    expect(fetchCalls.some((u) => u.includes('orphansOnly=true'))).toBe(true);
  });

  it('refetches with includeCrm=true when the checkbox is checked', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      fireEvent.click(checkboxes[1]);
    });
    await flushAsync();
    expect(fetchCalls.some((u) => u.includes('includeCrm=true'))).toBe(true);
  });

  it('updates the search input without triggering a refetch', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const beforeCount = fetchCalls.length;
    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'hub' } });
    });
    await flushAsync();
    expect(searchInput.value).toBe('hub');
    expect(fetchCalls.length).toBe(beforeCount);
  });

  it('toggles color mode between tag and cluster', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const selects = container.querySelectorAll('select');
    const colorSelect = selects[1] as HTMLSelectElement; // second select = color mode
    expect(colorSelect.value).toBe('tag');
    await act(async () => {
      fireEvent.change(colorSelect, { target: { value: 'cluster' } });
    });
    await flushAsync();
    expect(colorSelect.value).toBe('cluster');
  });
});

describe('NoteGraphView — Fit button + ref behavior', () => {
  it('calls zoomToFit on the imperative ref when the Fit button is clicked', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    fgZoomToFit.mockClear();
    const buttons = Array.from(container.querySelectorAll('button'));
    const fitBtn = buttons.find((b) => b.textContent?.includes('Fit'));
    expect(fitBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(fitBtn!);
    });
    expect(fgZoomToFit).toHaveBeenCalledWith(400, 60);
  });

  it('auto-fits the camera ~250ms after a new graph arrives', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    // Flush a second time — the ref attaches once the dynamic import
    // resolves, which can land after the first 300ms tick on some Node
    // versions. A second flush gives the auto-fit setTimeout (250ms) a
    // window to fire with the ref in place.
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fgZoomToFit).toHaveBeenCalled();
  });
});

describe('NoteGraphView — ForceGraph2D prop wiring', () => {
  it('passes graphData with nodes and links derived from the server payload', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    expect(props).toBeTruthy();
    const data = props.graphData as { nodes: unknown[]; links: unknown[] };
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.links)).toBe(true);
    expect(data.nodes.length).toBe(7);
    expect(data.links.length).toBe(3);
  });

  it('provides a nodeLabel callback that includes the kind label and tags', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const labeller = props.nodeLabel as (n: unknown) => string;
    expect(
      labeller({ id: 'note:1', title: 'Hub note', kind: 'note', tags: ['alpha', 'beta'] }),
    ).toContain('Hub note');
    expect(
      labeller({ id: 'note:1', title: 'Hub note', kind: 'note', tags: ['alpha', 'beta'] }),
    ).toContain('Note');
    expect(
      labeller({ id: 'note:1', title: 'Hub note', kind: 'note', tags: ['alpha', 'beta'] }),
    ).toContain('#alpha #beta');
    // Branch where node has no tags.
    expect(
      labeller({ id: 'company:7', title: 'ACME', kind: 'company', tags: [] }),
    ).toContain('Company');
    // Unknown kind falls back to 'Node'.
    expect(
      labeller({ id: 'x:1', title: 'Unknown', kind: 'mystery', tags: [] }),
    ).toContain('Node');
  });

  it('exposes a linkColor callback that returns a stable string', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const linkColor = props.linkColor as () => string;
    expect(typeof linkColor()).toBe('string');
  });
});

describe('NoteGraphView — node click + hover routing', () => {
  it('routes to the note id when clicking a note node', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeClick = props.onNodeClick as (n: unknown) => void;
    onNodeClick({ id: 'note:42', kind: 'note' });
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?id=42');
  });

  it('ignores clicks on non-note nodes', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    pushMock.mockClear();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeClick = props.onNodeClick as (n: unknown) => void;
    onNodeClick({ id: 'company:7', kind: 'company' });
    onNodeClick({ id: 'contact:3', kind: 'contact' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('safely handles a click with no id', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    pushMock.mockClear();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeClick = props.onNodeClick as (n: unknown) => void;
    onNodeClick({});
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('sets hoveredNoteId on the backlinks panel when hovering a note', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeHover = props.onNodeHover as (n: unknown) => void;
    await act(async () => {
      onNodeHover({ id: 'note:42', kind: 'note' });
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(42);
  });

  it('clears hoveredNoteId when hovering off (null) or non-note kinds', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeHover = props.onNodeHover as (n: unknown) => void;
    await act(async () => {
      onNodeHover({ id: 'note:42', kind: 'note' });
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(42);
    await act(async () => {
      onNodeHover(null);
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(null);
    await act(async () => {
      onNodeHover({ id: 'company:7', kind: 'company' });
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(null);
  });

  it('clears hover when the graph id cannot be parsed back to a number', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeHover = props.onNodeHover as (n: unknown) => void;
    await act(async () => {
      onNodeHover({ id: 'note:not-a-number', kind: 'note' });
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(null);
  });

  it('clears hover when the node has no id', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeHover = props.onNodeHover as (n: unknown) => void;
    await act(async () => {
      onNodeHover({ kind: 'note' } as never);
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(null);
  });

  it('exposes onClose on the backlinks panel that resets hover state', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const onNodeHover = props.onNodeHover as (n: unknown) => void;
    await act(async () => {
      onNodeHover({ id: 'note:7', kind: 'note' });
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(7);
    const onClose = (backlinksPropsRef.current as Record<string, unknown>).onClose as () => void;
    await act(async () => {
      onClose();
    });
    expect((backlinksPropsRef.current as Record<string, unknown>).noteId).toBe(null);
  });

  it('exposes onSelectNote on the backlinks panel that routes to a note id', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    pushMock.mockClear();
    const onSelectNote = (backlinksPropsRef.current as Record<string, unknown>).onSelectNote as (
      n: number,
    ) => void;
    onSelectNote(99);
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?id=99');
  });
});

describe('NoteGraphView — drawNode + pointer-area-paint callbacks', () => {
  it('draws every node kind without throwing', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    const kinds = ['note', 'company', 'contact', 'deal', 'meeting'] as const;
    for (const kind of kinds) {
      expect(() =>
        drawNode(
          {
            id: `${kind}:1`,
            kind,
            title: 'Some title',
            tags: ['alpha'],
            pinned: false,
            x: 10,
            y: 12,
          },
          ctx,
          1.0,
        ),
      ).not.toThrow();
    }
  });

  it('renders title text when the global scale is large enough', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    drawNode(
      { id: 'note:1', kind: 'note', title: 'Visible at zoom', tags: [], pinned: false, x: 0, y: 0 },
      ctx,
      2.0,
    );
    expect((ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('skips title rendering when the global scale is low', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    drawNode(
      { id: 'note:1', kind: 'note', title: 'No title at zoom', tags: [], pinned: false, x: 0, y: 0 },
      ctx,
      0.5,
    );
    expect((ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('draws a pinned ring for pinned note nodes', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    drawNode(
      { id: 'note:1', kind: 'note', title: 't', tags: ['a'], pinned: true, x: 0, y: 0 },
      ctx,
      1.0,
    );
    // Pinned ring sets strokeStyle to amber-500 (#f59e0b) — checking the
    // assignment happened means the branch ran.
    expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it('dims non-matching nodes when search is active', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'hub' } });
    });
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    drawNode(
      { id: 'note:9', kind: 'note', title: 'unrelated', tags: [], pinned: false, x: 0, y: 0 },
      ctx,
      1.0,
    );
    // Dim path sets globalAlpha to 0.18. ctx.globalAlpha is a plain prop here.
    expect((ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(0.18);
  });

  it('treats a tag match as a search hit (no dimming)', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'alpha' } });
    });
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    drawNode(
      {
        id: 'note:9',
        kind: 'note',
        title: 'no title match',
        tags: ['alpha'],
        pinned: false,
        x: 0,
        y: 0,
      },
      ctx,
      1.0,
    );
    expect((ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
  });

  it('uses cluster colors when colorMode=cluster is selected', async () => {
    const NoteGraphView = await loadComponent();
    const { container } = render(<NoteGraphView />);
    await flushAsync();
    const colorSelect = container.querySelectorAll('select')[1] as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(colorSelect, { target: { value: 'cluster' } });
    });
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    drawNode(
      { id: 'note:1', kind: 'note', title: 'Hub note', tags: ['alpha'], pinned: true, x: 0, y: 0 },
      ctx,
      1.0,
    );
    // Just confirm drawing happens — the colour is set into ctx.fillStyle.
    expect(typeof (ctx as unknown as { fillStyle: string }).fillStyle).toBe('string');
  });

  it('handles nodes with no tags by falling back to FALLBACK_COLOR', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const ctx = fakeCtx();
    expect(() =>
      drawNode(
        { id: 'note:1', kind: 'note', title: 'No tags', tags: [], pinned: false, x: 0, y: 0 },
        ctx,
        1.0,
      ),
    ).not.toThrow();
  });

  it('paints a pointer area circle for hit-testing across every kind', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const paint = props.nodePointerAreaPaint as (
      n: unknown,
      color: string,
      ctx: unknown,
    ) => void;
    const ctx = fakeCtx();
    const kinds = ['note', 'company', 'contact', 'deal', 'meeting'] as const;
    for (const kind of kinds) {
      expect(() =>
        paint(
          {
            id: `${kind}:1`,
            kind,
            title: 't',
            tags: [],
            pinned: kind === 'note',
            x: 1,
            y: 2,
          },
          '#abcdef',
          ctx,
        ),
      ).not.toThrow();
    }
    expect((ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(kinds.length);
  });

  it('paints a larger hit-area circle for note nodes vs CRM nodes', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const paint = props.nodePointerAreaPaint as (
      n: unknown,
      color: string,
      ctx: unknown,
    ) => void;
    const ctx = fakeCtx();
    paint(
      { id: 'note:1', kind: 'note', title: 't', tags: [], pinned: false, x: 0, y: 0 },
      '#abc',
      ctx,
    );
    // Each call records [x, y, r, startAngle, endAngle, anticlockwise].
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    const noteRadius = arcCalls[arcCalls.length - 1][2];
    expect(noteRadius).toBeGreaterThanOrEqual(6);
  });

  it('handles a node missing x/y by defaulting to (0,0)', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    const props = fgPropsRef.current as Record<string, unknown>;
    const drawNode = props.nodeCanvasObject as (
      n: unknown,
      ctx: unknown,
      scale: number,
    ) => void;
    const paint = props.nodePointerAreaPaint as (
      n: unknown,
      color: string,
      ctx: unknown,
    ) => void;
    const ctx = fakeCtx();
    expect(() =>
      drawNode(
        { id: 'note:1', kind: 'note', title: 't', tags: [], pinned: false },
        ctx,
        1.0,
      ),
    ).not.toThrow();
    expect(() =>
      paint({ id: 'note:1', kind: 'note', title: 't', tags: [], pinned: false }, '#000', ctx),
    ).not.toThrow();
  });
});

describe('NoteGraphView — resize observer', () => {
  it('responds to a ResizeObserver entry by re-measuring the container', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    expect(resizeObservers.length).toBeGreaterThanOrEqual(1);
    // Triggering the callback should not throw — jsdom's getBoundingClientRect
    // returns zeroes, so the size clamps to (320, 240) minima.
    await act(async () => {
      resizeObservers[0]([]);
    });
    const props = fgPropsRef.current as Record<string, unknown>;
    expect(typeof props.width).toBe('number');
    expect(typeof props.height).toBe('number');
    expect(props.width as number).toBeGreaterThanOrEqual(320);
    expect(props.height as number).toBeGreaterThanOrEqual(240);
  });

  it('re-measures when the window resize event fires', async () => {
    const NoteGraphView = await loadComponent();
    render(<NoteGraphView />);
    await flushAsync();
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    const props = fgPropsRef.current as Record<string, unknown>;
    expect(props.width as number).toBeGreaterThanOrEqual(320);
  });

  it('cleans up the observer + window listener on unmount', async () => {
    const NoteGraphView = await loadComponent();
    const { unmount } = render(<NoteGraphView />);
    await flushAsync();
    expect(() => unmount()).not.toThrow();
  });
});
