'use client';

// Custom reactflow@11 node renderers for the Dev Paths canvas — one per
// node `kind`, styled after docs/design/path-visualizations-mockup-v3.html's
// glass-card language (screen), pill shapes (job/service), dashed pill
// (test), dotted border (infra), and TABLE tag (schema). Inline SVG glyphs
// only — no icon font needed on the canvas itself.
//
// Every shape uses one target Handle (left) and one source Handle (right):
// lanes run left-to-right (UI -> API -> Jobs/Infra -> Data), so edges mostly
// flow that direction; reactflow still routes fine when an edge instead runs
// vertically between lanes.

import { Handle, Position, type NodeProps } from 'reactflow';
import { claimVisual, nodeAnimationClassName, ringSegments, STATUS_INFO, THEME, type PathVizNodeAnimation } from './pathviz-theme';
import type { PathVizClaim, PathVizNode } from './types';

export interface PathVizNodeData {
  node: PathVizNode;
  claims: PathVizClaim[];
  /** ScreenNode only — child `component` nodes rendered as chips inside. */
  children?: PathVizNode[];
  childClaims?: Map<number, PathVizClaim[]>;
  onSelectChild?: (nodeId: number) => void;
  /** Phase 5 live/replay animation hints — set by PathChartCanvas from usePathVizLiveReplay.ts's `animationHints`. */
  mounted?: boolean;
  animation?: PathVizNodeAnimation;
}

/** Every node renderer below appends this to its base className. */
function animationClasses(mounted: boolean | undefined, animation: PathVizNodeAnimation): string {
  return `${mounted ? ' pv-mount' : ''} ${nodeAnimationClassName(animation) ? ` ${nodeAnimationClassName(animation)}` : ''}`;
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function claimOutlineCss(claims: PathVizClaim[]): React.CSSProperties {
  const visual = claimVisual(claims);
  if (!visual) return {};
  return {
    outline: `2px ${visual.outlineStyle} ${visual.outlineColor}`,
    outlineOffset: 3,
  };
}

function ClaimTag({ claims }: { claims: PathVizClaim[] }) {
  const visual = claimVisual(claims);
  if (!visual) return null;
  return (
    <div
      data-testid="pathviz-claim-tag"
      className="absolute -top-2.5 left-2.5 text-[8.5px] font-mono px-1.5 py-0.5 rounded-full border whitespace-nowrap z-10"
      style={{
        borderColor: visual.outlineColor,
        color: visual.contested ? visual.outlineColor : THEME.ink2,
        background: THEME.panel2,
      }}
    >
      {visual.contested ? `CONTESTED · ${visual.tagLabel}` : visual.tagLabel}
    </div>
  );
}

function StatusRing({ status }: { status: PathVizNode['status'] }) {
  const info = STATUS_INFO[status];
  const segments = ringSegments(status);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-[2px]">
        {segments.map((seg, i) => (
          <span
            key={i}
            className="w-[5px] h-[5px] rounded-[1px] inline-block"
            style={{ background: seg.lit ? seg.hex : THEME.line }}
          />
        ))}
      </div>
      <span className="text-[8px] font-mono uppercase tracking-wide" style={{ color: info.hex }}>
        {info.label}
      </span>
    </div>
  );
}

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: THEME.lineBright, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: THEME.lineBright, border: 'none' }} />
    </>
  );
}

// Minimal inline glyphs — deliberately tiny, no external icon font on canvas.
function GlyphService() {
  return (
    <svg viewBox="0 0 16 16" fill="none" width={13} height={13}>
      <path d="M4.5 11.5h7a2.5 2.5 0 000-5 3.5 3.5 0 00-6.7-1.2A3 3 0 004.5 11.5z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function GlyphJob() {
  return (
    <svg viewBox="0 0 16 16" fill="none" width={13} height={13}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v3.2l2.2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function GlyphInfra() {
  return (
    <svg viewBox="0 0 16 16" fill="none" width={13} height={13}>
      <rect x="2.5" y="2.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="9.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="4.5" r="0.6" fill="currentColor" />
      <circle cx="5" cy="11.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
function GlyphTest() {
  return (
    <svg viewBox="0 0 16 16" fill="none" width={13} height={13}>
      <path d="M6.2 2.5h3.6M6.8 2.5v3.9L4 11.2a1.4 1.4 0 001.25 2.05h5.5A1.4 1.4 0 0012 11.2L9.2 6.4V2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

// ─── screen ─────────────────────────────────────────────────────────────────

export function ScreenNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, children = [], childClaims, onSelectChild, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative rounded-[10px] border w-[250px]${animationClasses(mounted, animation)}`}
      style={{
        background: `linear-gradient(180deg, ${THEME.panel2}, ${THEME.panel})`,
        borderColor: `${info.hex}66`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold flex-1 min-w-0 truncate">{node.label}</span>
      </div>
      {node.routePath && (
        <div
          className="mx-3 mb-1.5 inline-block text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: '#00000055', border: `1px solid ${THEME.line}`, color: THEME.ink2 }}
        >
          {node.routePath}
        </div>
      )}
      <div className="px-3 pb-2">
        <StatusRing status={node.status} />
      </div>
      {children.length > 0 && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-1">
          {children.map((child) => {
            const cVisual = claimVisual(childClaims?.get(child.id) ?? []);
            const cInfo = STATUS_INFO[child.status];
            return (
              <button
                key={child.id}
                type="button"
                data-testid={`pathviz-child-chip-${child.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectChild?.(child.id);
                }}
                className="flex items-center gap-1.5 h-[24px] px-2 rounded-md text-left"
                style={{
                  background: '#0B131B99',
                  border: `1px solid ${cVisual ? cVisual.outlineColor : THEME.line}`,
                  ...(cVisual ? { borderStyle: cVisual.outlineStyle } : {}),
                }}
              >
                <span className="w-[6px] h-[6px] rounded-[2px] shrink-0" style={{ background: cInfo.hex }} />
                <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: THEME.ink2 }}>
                  {child.label}
                </span>
                <span className="text-[7.5px] font-mono uppercase tracking-wide" style={{ color: cInfo.hex }}>
                  {cInfo.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── standalone component (defensive fallback — schema allows an orphan
// `component` node with no screen parent; the mockup/spec always expects one,
// so this is a small pill rather than a full glass card). ──────────────────

export function ComponentNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative flex items-center gap-2 h-[30px] px-3 rounded-md border${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 93%, ${info.hex})`,
        borderColor: `${info.hex}66`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <span className="text-[11px] font-mono truncate" style={{ color: THEME.ink2 }}>{node.label}</span>
      <StatusRing status={node.status} />
    </div>
  );
}

// ─── api ────────────────────────────────────────────────────────────────────

export function ApiNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  const method = typeof node.meta.method === 'string' ? node.meta.method : null;
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative flex items-center gap-2 h-[42px] px-3 rounded-lg border${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 93%, ${info.hex})`,
        borderColor: `${info.hex}6A`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      {method && (
        <span
          className="text-[8.5px] font-mono font-bold tracking-wide rounded px-1 py-0.5 shrink-0"
          style={{ color: THEME.surface, background: info.hex }}
        >
          {method}
        </span>
      )}
      <span className="font-mono text-[11px] truncate flex-1 min-w-0" style={{ color: THEME.ink2 }}>
        {node.routePath ?? node.label}
      </span>
      <StatusRing status={node.status} />
    </div>
  );
}

// ─── schema ─────────────────────────────────────────────────────────────────

export function SchemaNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative px-3 py-2 rounded-lg border w-[190px]${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 93%, ${info.hex})`,
        borderColor: `${info.hex}6A`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <div className="text-[7.5px] font-mono tracking-[.2em]" style={{ color: THEME.ink3 }}>TABLE</div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="font-mono text-[12px] truncate" style={{ color: THEME.ink }}>{node.label}</span>
        <StatusRing status={node.status} />
      </div>
    </div>
  );
}

// ─── service ────────────────────────────────────────────────────────────────

export function ServiceNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative flex items-center gap-2 h-[36px] px-3 rounded-full border${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 94%, ${info.hex})`,
        borderColor: `${info.hex}60`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <span style={{ color: info.hex }}><GlyphService /></span>
      <span className="font-mono text-[10.5px] truncate" style={{ color: THEME.ink2 }}>{node.label}</span>
    </div>
  );
}

// ─── test ───────────────────────────────────────────────────────────────────

export function TestNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative flex items-center gap-2 h-[36px] px-3 rounded-lg border border-dashed${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 94%, ${info.hex})`,
        borderColor: `${info.hex}60`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <span style={{ color: info.hex }}><GlyphTest /></span>
      <span className="font-mono text-[10.5px] truncate" style={{ color: THEME.ink2 }}>{node.label}</span>
    </div>
  );
}

// ─── job ────────────────────────────────────────────────────────────────────

export function JobNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative flex items-center gap-2 h-[36px] px-3 border${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 93%, ${info.hex})`,
        borderColor: `${info.hex}6A`,
        borderRadius: '999px 8px 8px 999px',
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <span style={{ color: info.hex }}><GlyphJob /></span>
      <span className="font-mono text-[10.5px] truncate" style={{ color: THEME.ink2 }}>{node.label}</span>
    </div>
  );
}

// ─── infra ──────────────────────────────────────────────────────────────────

export function InfraNode({ data }: NodeProps<PathVizNodeData>) {
  const { node, claims, mounted, animation } = data;
  const info = STATUS_INFO[node.status];
  return (
    <div
      data-testid={`pathviz-node-${node.id}`}
      className={`relative flex items-center gap-2 h-[36px] px-3 rounded-lg border border-dotted${animationClasses(mounted, animation)}`}
      style={{
        background: `color-mix(in srgb, ${THEME.panel2} 93%, ${info.hex})`,
        borderColor: `${info.hex}6A`,
        ...claimOutlineCss(claims),
      }}
    >
      <ClaimTag claims={claims} />
      <Handles />
      <span style={{ color: info.hex }}><GlyphInfra /></span>
      <span className="font-mono text-[10.5px] truncate" style={{ color: THEME.ink2 }}>{node.label}</span>
    </div>
  );
}

export const PATHVIZ_NODE_TYPES = {
  screen: ScreenNode,
  component: ComponentNode,
  api: ApiNode,
  schema: SchemaNode,
  service: ServiceNode,
  test: TestNode,
  job: JobNode,
  infra: InfraNode,
} as const;
