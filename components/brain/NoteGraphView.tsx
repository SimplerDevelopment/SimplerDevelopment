'use client';

/**
 * NoteGraphView — canvas-based force-directed graph of wikilinks between
 * brainNotes for the active client. Drives the /portal/brain/knowledge/graph
 * route. Click a node to jump back to the IDE shell with that note selected.
 *
 * Design notes:
 *   - ForceGraph2D is canvas-based and breaks SSR, so it's loaded with
 *     next/dynamic + ssr: false.
 *   - Tag colors are derived from a stable string-hash → HSL so the same tag
 *     always paints the same hue across reloads.
 *   - Pinned notes get a slightly larger dot + a star ring overlay.
 *   - Search dims non-matching nodes client-side (no refetch) — only tag,
 *     orphansOnly, and includeCrm trigger a refetch.
 *   - Node ids are prefixed strings (`note:42`, `company:7`, `contact:3`,
 *     `deal:9`, `meeting:1`). Lets us mix kinds without primary-key collisions
 *     across CRM tables. See lib/brain/graph.ts for the source of truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import GraphHoverBacklinks from '@/components/brain/GraphHoverBacklinks';

// react-force-graph-2d uses canvas + window — ssr:false is required.
//
// The lib's exported component is generic over `NodeType` and infers it from
// `graphData`. With our extended GraphNode (kind/title/tags/pinned required),
// TS's strict contravariance rejects our `nodeCanvasObject` / `nodeLabel`
// / `nodePointerAreaPaint` callbacks because the lib types them against a
// wider `NodeObject<{}>`. Casting the component to a permissive React
// component type sidesteps the inference dance — we still get full type
// safety on our own callbacks (they're typed at definition).
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false }) as unknown as React.ComponentType<Record<string, unknown>>;

type GraphNodeKind = 'note' | 'company' | 'contact' | 'deal' | 'meeting';

interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  title: string;
  tags: string[];
  pinned: boolean;
  hasIncoming: boolean;
  hasOutgoing: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

// Internal shape react-force-graph mutates on each tick (x/y coords etc).
interface PositionedNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface ForceGraphInstance {
  zoomToFit: (durationMs?: number, paddingPx?: number) => void;
}

/** Stable djb2-ish hash → HSL hue. */
function tagColor(tag: string): string {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) + hash + tag.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

const FALLBACK_COLOR = 'hsl(220, 10%, 60%)';

/** Per-kind palette for non-note nodes. Notes keep tag/cluster coloring. */
const KIND_COLOR: Record<Exclude<GraphNodeKind, 'note'>, string> = {
  company: '#64748b', // slate-500
  contact: '#6366f1', // indigo-500
  deal: '#10b981',    // emerald-500
  meeting: '#f97316', // orange-500
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  note: 'Note',
  company: 'Company',
  contact: 'Contact',
  deal: 'Deal',
  meeting: 'Meeting',
};

type ColorMode = 'tag' | 'cluster';

/**
 * Asynchronous label-propagation community detection. Each node starts in its
 * own community; in random order each round, every node adopts the most
 * common community among its neighbors. Converges fast (typically < 10
 * iterations) and is parameter-free, which fits a UI toggle better than
 * Louvain (which would need a resolution slider). Isolated nodes keep their
 * starting community so they get their own unique color.
 */
function detectCommunities(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
): Map<string, string> {
  const community = new Map<string, string>();
  for (const n of nodes) community.set(n.id, n.id);

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.source === e.target) continue;
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  const ids = nodes.map((n) => n.id);
  const MAX_ITER = 20;
  // Deterministic-ish shuffle (Math.random is fine here — community IDs are
  // not user-visible, and color mapping is hash-based so it's stable).
  for (let iter = 0; iter < MAX_ITER; iter++) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    let changed = false;
    for (const id of ids) {
      const neighbors = adj.get(id);
      if (!neighbors || neighbors.length === 0) continue;
      const counts = new Map<string, number>();
      for (const n of neighbors) {
        const c = community.get(n) ?? n;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let bestC = community.get(id) ?? id;
      let bestCount = counts.get(bestC) ?? 0;
      for (const [c, count] of counts) {
        if (count > bestCount || (count === bestCount && c < bestC)) {
          bestC = c;
          bestCount = count;
        }
      }
      if (bestC !== community.get(id)) {
        community.set(id, bestC);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return community;
}

/** Hash community id → HSL. Same scheme as tagColor so the palette feels
 *  consistent when users toggle modes. */
function clusterColor(communityId: string): string {
  let hash = 5381;
  for (let i = 0; i < communityId.length; i++) {
    hash = ((hash << 5) + hash + communityId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

/** Strip `note:` prefix to recover the underlying brainNotes.id for routing. */
function noteIdFromGraphId(graphId: string): string | null {
  if (graphId.startsWith('note:')) return graphId.slice('note:'.length);
  return null;
}

export default function NoteGraphView() {
  const router = useRouter();
  const fgRef = useRef<ForceGraphInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string>('');
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [includeCrm, setIncludeCrm] = useState(false);
  const [search, setSearch] = useState('');
  const [colorMode, setColorMode] = useState<ColorMode>('tag');
  // Hovered note id (numeric, stripped of the `note:` prefix). Drives the
  // backlinks side panel. Only notes hover-trigger — CRM/meeting nodes are
  // ignored here since the panel shows note→note backlinks.
  const [hoveredNoteId, setHoveredNoteId] = useState<number | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  // Resize observer — keep the canvas filling its container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(320, Math.floor(rect.width)), h: Math.max(240, Math.floor(rect.height)) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Tag list — only fetched once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/brain/knowledge?tags=true')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && Array.isArray(j.data?.tags)) {
          setAllTags(j.data.tags as string[]);
        }
      })
      .catch(() => { /* silent — tag dropdown just stays empty */ });
    return () => { cancelled = true; };
  }, []);

  // Graph fetch — refetch when tagFilter, orphansOnly, or includeCrm change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (tagFilter) params.set('tag', tagFilter);
    if (orphansOnly) params.set('orphansOnly', 'true');
    if (includeCrm) params.set('includeCrm', 'true');
    const qs = params.toString();
    fetch(`/api/portal/brain/knowledge/graph${qs ? `?${qs}` : ''}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && j.data) {
          setGraph(j.data as GraphData);
        } else {
          setError(j?.message ?? 'Failed to load graph.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load graph.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tagFilter, orphansOnly, includeCrm]);

  // Re-fit camera on data change.
  useEffect(() => {
    if (!graph) return;
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit?.(400, 60);
    }, 250);
    return () => clearTimeout(t);
  }, [graph]);

  const fgData = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    return {
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
    };
  }, [graph]);

  // Per-node degree (in + out) — drives hub sizing so foundational notes
  // show up large at any zoom. Computed once per graph fetch.
  const degrees = useMemo(() => {
    const d = new Map<string, number>();
    if (!graph) return d;
    for (const n of graph.nodes) d.set(n.id, 0);
    for (const e of graph.edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [graph]);

  // Community detection only when the user opted into cluster coloring.
  // Memoized on the underlying graph so toggling search / camera doesn't
  // trigger a re-pass.
  const communities = useMemo(() => {
    if (!graph || colorMode !== 'cluster') return null;
    return detectCommunities(graph.nodes, graph.edges);
  }, [graph, colorMode]);

  const searchMatch = useCallback(
    (n: PositionedNode) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      if (n.title?.toLowerCase().includes(q)) return true;
      if (Array.isArray(n.tags) && n.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    },
    [search],
  );

  const handleNodeClick = useCallback(
    (node: { id?: string | number; kind?: GraphNodeKind }) => {
      if (node?.id == null) return;
      const id = String(node.id);
      // Only notes round-trip back to the IDE shell. CRM/meeting nodes are
      // visual-only here for now — clicking them is a no-op until we wire up
      // the cross-app navigation (would prefer to open in a side panel
      // anyway, see GraphHoverBacklinks parallel work).
      const noteRawId = noteIdFromGraphId(id);
      if (noteRawId != null) {
        router.push(`/portal/brain/knowledge?id=${noteRawId}`);
      }
    },
    [router],
  );

  // Hover → set hoveredNoteId for the GraphHoverBacklinks panel. Skips
  // non-note kinds (panel only knows note→note backlinks). The panel itself
  // debounces 250ms before hitting the API so flying the cursor across the
  // canvas doesn't hammer the backlinks endpoint.
  //
  // Signature matches react-force-graph-2d's (node, prev) => void contract;
  // we only care about the current node so prev is unused.
  const handleNodeHover = useCallback(
    (node: { id?: string | number; kind?: GraphNodeKind } | null) => {
      if (!node || node.id == null || node.kind !== 'note') {
        setHoveredNoteId(null);
        return;
      }
      const raw = noteIdFromGraphId(String(node.id));
      const num = raw == null ? NaN : parseInt(raw, 10);
      setHoveredNoteId(Number.isNaN(num) ? null : num);
    },
    [],
  );

  const drawNode = useCallback(
    (node: PositionedNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isNote = node.kind === 'note';

      // Color: cluster (community-detected) when toggled on, else first tag —
      // BUT only for notes. Non-note kinds use the per-kind palette so the
      // user can read entity type at a glance regardless of color mode.
      let color: string = FALLBACK_COLOR;
      if (!isNote && node.kind !== 'note') {
        color = KIND_COLOR[node.kind] ?? FALLBACK_COLOR;
      } else if (colorMode === 'cluster' && communities) {
        const cid = communities.get(node.id);
        if (cid != null) color = clusterColor(cid);
      } else if (node.tags && node.tags.length > 0) {
        color = tagColor(node.tags[0]);
      }
      // Hub sizing: degree → log-scaled radius bonus. A note with 10+ links
      // is unmistakably a hub; an orphan is a small dot. Pinned nodes still
      // get the amber ring on top.
      const degree = degrees.get(node.id) ?? 0;
      const hubBonus = Math.min(6, Math.log2(degree + 1) * 1.6);
      const baseRadius = (isNote && node.pinned ? 5 : 3) + hubBonus;
      const dimmed = !searchMatch(node);
      const alpha = dimmed ? 0.18 : 1;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';

      switch (node.kind) {
        case 'note':
          ctx.beginPath();
          ctx.arc(x, y, baseRadius, 0, 2 * Math.PI, false);
          ctx.fill();
          ctx.stroke();
          break;
        case 'company': {
          // Square — axis-aligned for legibility at small zoom.
          const s = baseRadius * 1.7;
          ctx.beginPath();
          ctx.rect(x - s / 2, y - s / 2, s, s);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'contact': {
          // Diamond — square rotated 45°.
          const s = baseRadius * 1.2;
          ctx.beginPath();
          ctx.moveTo(x, y - s);
          ctx.lineTo(x + s, y);
          ctx.lineTo(x, y + s);
          ctx.lineTo(x - s, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'deal': {
          // Equilateral-ish triangle, point up.
          const s = baseRadius * 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y - s);
          ctx.lineTo(x + s * 0.866, y + s / 2);
          ctx.lineTo(x - s * 0.866, y + s / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'meeting': {
          // Hexagon, flat top.
          const s = baseRadius * 1.3;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = x + s * Math.cos(angle);
            const py = y + s * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
      }

      // Pinned ring — only meaningful for notes (CRM entities have no pin).
      if (isNote && node.pinned) {
        ctx.beginPath();
        ctx.arc(x, y, baseRadius + 2, 0, 2 * Math.PI, false);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#f59e0b'; // amber-500
        ctx.stroke();
      }

      // Render the title only when zoomed in enough that it won't be a blob.
      if (globalScale >= 1.5 && node.title) {
        const fontSize = Math.max(8, 10 / globalScale);
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(20,20,20,0.9)';
        ctx.fillText(node.title.slice(0, 40), x, y + baseRadius + 2);
      }
      ctx.restore();
    },
    [searchMatch, colorMode, communities, degrees],
  );

  const truncated = graph?.truncated === true;
  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

  return (
    <div className="h-full w-full flex flex-col bg-background">
      <div className="border-b border-border bg-card/60 backdrop-blur-sm px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <span className="material-icons text-[14px] leading-none">hub</span>
          {nodeCount} nodes / {edgeCount} edges
        </span>

        <label className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="material-icons text-[16px]">label</span>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={orphansOnly}
            onChange={(e) => setOrphansOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          <span className="text-muted-foreground">Orphans only</span>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Show CRM companies, contacts, deals, and meetings linked to your notes.">
          <input
            type="checkbox"
            checked={includeCrm}
            onChange={(e) => setIncludeCrm(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          <span className="text-muted-foreground">Include CRM</span>
        </label>

        <label className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="material-icons text-[16px]">palette</span>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            title="Color nodes by tag (stable hue per tag) or cluster (community detection over wikilinks)"
          >
            <option value="tag">Color: tag</option>
            <option value="cluster">Color: cluster</option>
          </select>
        </label>

        <div className="relative ml-auto">
          <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[16px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dim non-matching"
            className="rounded border border-border bg-background pl-7 pr-2 py-1 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <button
          type="button"
          onClick={() => fgRef.current?.zoomToFit?.(400, 60)}
          title="Fit to view"
          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted/60"
        >
          <span className="material-icons text-[14px]">center_focus_strong</span>
          Fit
        </button>
      </div>

      {truncated && (
        <div className="border-b border-amber-300 bg-amber-50 text-amber-900 px-3 py-1.5 text-xs">
          <span className="material-icons text-[14px] align-middle mr-1">warning</span>
          Showing the first 1000 notes — refine with a tag filter to see the rest.
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
            <span className="material-icons animate-spin mr-2 text-base">progress_activity</span>
            Loading graph…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <span className="material-icons text-2xl">graph_3</span>
            <div>No notes match this filter.</div>
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef as unknown as React.MutableRefObject<unknown>}
            graphData={fgData}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeLabel={(n: PositionedNode) =>
              `${n.title} · ${KIND_LABEL[n.kind] ?? 'Node'}${n.tags?.length ? `\n#${n.tags.join(' #')}` : ''}`
            }
            linkColor={() => 'rgba(80,80,90,0.35)'}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            cooldownTicks={120}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: PositionedNode, paintColor: string, ctx: CanvasRenderingContext2D) => {
              // Approximate every shape with a circle that comfortably bounds
              // the rendered glyph — close enough for hit-testing.
              const degree = degrees.get(node.id) ?? 0;
              const hubBonus = Math.min(6, Math.log2(degree + 1) * 1.6);
              const baseRadius = (node.kind === 'note' && node.pinned ? 5 : 3) + hubBonus;
              const r = node.kind === 'note' ? Math.max(6, baseRadius + 2) : Math.max(8, baseRadius * 1.7);
              ctx.fillStyle = paintColor;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
          />
        )}
      </div>
      <GraphHoverBacklinks
        noteId={hoveredNoteId}
        onClose={() => setHoveredNoteId(null)}
        onSelectNote={(id) => router.push(`/portal/brain/knowledge?id=${id}`)}
      />
    </div>
  );
}
