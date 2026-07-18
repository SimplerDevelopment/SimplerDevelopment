'use client';

/**
 * FlowDiagramTab — visual DAG of survey pages + skip-logic (LOGIC-03).
 *
 * Renders each page as a node (rectangle with rounded corners) and each
 * goToPage rule as a labeled dashed arrow between nodes. The implicit
 * "Next" edge is rendered as a solid arrow. Orphaned pages (those with no
 * incoming edge) are flagged with a red dashed border + warning badge.
 *
 * Layout is intentionally simple: pages are stacked vertically and edges
 * are SVG paths drawn in an overlay. No graph library — pure React + SVG
 * matches the project's chart conventions (see ResponseAnalytics.tsx).
 */

import { useMemo } from 'react';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import {
  extractPagesAndEdges,
  type FlowEdge,
  type FlowPage,
} from '@/lib/surveys/flow-diagram';

interface Props {
  fields: SurveyField[];
}

// Layout constants — keep node geometry predictable so SVG paths align.
const NODE_WIDTH = 360;
const NODE_HORIZONTAL_PAD = 64; // SVG canvas padding on each side of node
const ROW_HEIGHT = 168; // vertical distance from one node's top to the next
const NODE_HEIGHT_BASE = 92; // base height before extending for question rows
const QUESTION_ROW_HEIGHT = 18;
const MAX_QUESTIONS_SHOWN = 3;

function nodeHeight(page: FlowPage): number {
  const shown = Math.min(page.fields.length, MAX_QUESTIONS_SHOWN);
  const extraRow = page.fields.length > MAX_QUESTIONS_SHOWN ? 1 : 0;
  return NODE_HEIGHT_BASE + (shown + extraRow) * QUESTION_ROW_HEIGHT;
}

function truncateLabel(s: string, max = 48): string {
  if (!s) return '(untitled)';
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export default function FlowDiagramTab({ fields }: Props) {
  const graph = useMemo(() => extractPagesAndEdges(fields), [fields]);

  // Single-page surveys: there is literally nothing to diagram.
  if (graph.pages.length <= 1) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <span className="material-icons text-4xl text-muted-foreground/50">account_tree</span>
        <h3 className="font-semibold text-foreground">No flow to diagram</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          This survey has only one page — no flow to diagram. Add a{' '}
          <span className="font-medium text-foreground">Page Break</span> on the Edit tab to split
          questions across multiple pages and unlock skip-logic between them.
        </p>
      </div>
    );
  }

  // Compute Y position for each page node (vertical stack).
  const pageY: number[] = [];
  let cursor = 24; // top padding
  for (const page of graph.pages) {
    pageY.push(cursor);
    cursor += nodeHeight(page) + (ROW_HEIGHT - NODE_HEIGHT_BASE);
  }
  const svgHeight = cursor + 24;
  const svgWidth = NODE_WIDTH + NODE_HORIZONTAL_PAD * 2;
  const nodeX = NODE_HORIZONTAL_PAD;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">account_tree</span>
              Page Flow
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {graph.pages.length} pages, {graph.edges.length} connection
              {graph.edges.length === 1 ? '' : 's'}
              {graph.orphans.size > 0 && (
                <>
                  {' '}
                  &middot;{' '}
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {graph.orphans.size} unreachable
                  </span>
                </>
              )}
            </p>
          </div>
          <Legend />
        </div>

        <div className="overflow-x-auto">
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="img"
            aria-label="Survey flow diagram"
            className="mx-auto block"
          >
            <defs>
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground/60" />
              </marker>
              <marker
                id="arrow-goto"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
              </marker>
            </defs>

            {/* Edges first (so nodes stack on top of edge paths). */}
            {graph.edges.map((edge, idx) => (
              <EdgePath
                key={`edge-${idx}`}
                edge={edge}
                pageY={pageY}
                nodeX={nodeX}
                pageHeights={graph.pages.map(nodeHeight)}
              />
            ))}

            {/* Nodes. */}
            {graph.pages.map((page) => (
              <PageNode
                key={`node-${page.index}`}
                page={page}
                x={nodeX}
                y={pageY[page.index]}
                isOrphan={graph.orphans.has(page.index)}
              />
            ))}
          </svg>
        </div>
      </div>

      {graph.orphans.size > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <span className="material-icons text-red-600 dark:text-red-400 text-lg">
              warning_amber
            </span>
            <div className="text-sm text-red-700 dark:text-red-300">
              <p className="font-medium">
                {graph.orphans.size} unreachable page{graph.orphans.size === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs">
                {Array.from(graph.orphans)
                  .map((i) => `Page ${i + 1}`)
                  .join(', ')}{' '}
                {graph.orphans.size === 1 ? 'has' : 'have'} no incoming edge — no respondent will
                ever land on{' '}
                {graph.orphans.size === 1 ? 'this page' : 'these pages'}. Check the goToPage rules
                on the preceding page&apos;s select/radio fields.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true">
          <line
            x1="0"
            y1="5"
            x2="20"
            y2="5"
            className="stroke-foreground/60"
            strokeWidth="1.5"
          />
        </svg>
        Default Next
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true">
          <line
            x1="0"
            y1="5"
            x2="20"
            y2="5"
            className="stroke-primary"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        </svg>
        Skip Logic
      </span>
    </div>
  );
}

interface PageNodeProps {
  page: FlowPage;
  x: number;
  y: number;
  isOrphan: boolean;
}

function PageNode({ page, x, y, isOrphan }: PageNodeProps) {
  const h = nodeHeight(page);
  const shown = page.fields.slice(0, MAX_QUESTIONS_SHOWN);
  const overflow = page.fields.length - shown.length;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={NODE_WIDTH}
        height={h}
        rx="12"
        ry="12"
        className={
          isOrphan
            ? 'fill-red-50 dark:fill-red-900/20 stroke-red-500'
            : 'fill-card stroke-border'
        }
        strokeWidth="1.5"
        strokeDasharray={isOrphan ? '6 4' : undefined}
      />

      {/* Header row */}
      <text
        x={x + 16}
        y={y + 26}
        className="fill-foreground"
        style={{ fontSize: '14px', fontWeight: 600 }}
      >
        Page {page.index + 1}
      </text>
      <text
        x={x + NODE_WIDTH - 16}
        y={y + 26}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontSize: '12px' }}
      >
        {page.fields.length} question{page.fields.length === 1 ? '' : 's'}
      </text>

      {/* Orphan badge */}
      {isOrphan && (
        <g>
          <rect
            x={x + 16}
            y={y + 38}
            width="118"
            height="22"
            rx="6"
            ry="6"
            className="fill-red-100 dark:fill-red-900/40 stroke-red-300 dark:stroke-red-800"
            strokeWidth="1"
          />
          <text
            x={x + 26}
            y={y + 53}
            className="fill-red-700 dark:fill-red-300"
            style={{
              fontFamily: 'Material Icons',
              fontSize: '13px',
            }}
          >
            warning_amber
          </text>
          <text
            x={x + 46}
            y={y + 53}
            className="fill-red-700 dark:fill-red-300"
            style={{ fontSize: '11px', fontWeight: 500 }}
          >
            Unreachable
          </text>
        </g>
      )}

      {/* Question labels */}
      {shown.map((f, idx) => (
        <text
          key={`q-${page.index}-${idx}`}
          x={x + 16}
          y={y + (isOrphan ? 80 : 60) + idx * QUESTION_ROW_HEIGHT}
          className="fill-foreground/70"
          style={{ fontSize: '12px' }}
        >
          {`${idx + 1}. ${truncateLabel(f.label)}`}
        </text>
      ))}
      {overflow > 0 && (
        <text
          x={x + 16}
          y={y + (isOrphan ? 80 : 60) + shown.length * QUESTION_ROW_HEIGHT}
          className="fill-muted-foreground italic"
          style={{ fontSize: '11px' }}
        >
          +{overflow} more
        </text>
      )}

      {/* Empty-page label */}
      {page.fields.length === 0 && (
        <text
          x={x + 16}
          y={y + (isOrphan ? 80 : 60)}
          className="fill-muted-foreground italic"
          style={{ fontSize: '12px' }}
        >
          (no questions on this page)
        </text>
      )}
    </g>
  );
}

interface EdgePathProps {
  edge: FlowEdge;
  pageY: number[];
  nodeX: number;
  pageHeights: number[];
}

function EdgePath({ edge, pageY, nodeX, pageHeights }: EdgePathProps) {
  const isGoto = edge.kind === 'goto';
  const fromTop = pageY[edge.from];
  const fromH = pageHeights[edge.from];
  const toTop = pageY[edge.to];
  const toH = pageHeights[edge.to];

  // For default-next (always to adjacent page below) use a vertical line.
  // For goto edges (any direction, possibly jumping over pages) route around
  // the right side of the node column.
  const isAdjacentDown = !isGoto && edge.to === edge.from + 1;
  const goingUp = edge.to < edge.from;
  const nodeRight = nodeX + NODE_WIDTH;

  let pathD: string;
  let labelX = 0;
  let labelY = 0;

  if (isAdjacentDown) {
    const startX = nodeX + NODE_WIDTH / 2;
    const startY = fromTop + fromH;
    const endX = startX;
    const endY = toTop;
    pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
    labelX = startX + 8;
    labelY = (startY + endY) / 2;
  } else {
    // Route around the right side.
    const startX = nodeRight;
    const startY = fromTop + fromH / 2;
    const endX = nodeRight;
    const endY = goingUp ? toTop + toH / 2 : toTop + toH / 2;
    const sideX = nodeRight + 32;
    pathD = `M ${startX} ${startY} L ${sideX} ${startY} L ${sideX} ${endY} L ${endX} ${endY}`;
    labelX = sideX + 6;
    labelY = (startY + endY) / 2;
  }

  const strokeClass = isGoto ? 'stroke-primary' : 'stroke-foreground/60';
  const markerId = isGoto ? 'arrow-goto' : 'arrow-default';

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        className={strokeClass}
        strokeWidth="1.5"
        strokeDasharray={isGoto ? '5 4' : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {isGoto && edge.optionLabel && (
        <text
          x={labelX}
          y={labelY}
          className="fill-primary"
          style={{ fontSize: '11px', fontWeight: 500 }}
        >
          {truncateLabel(edge.optionLabel, 24)}
        </text>
      )}
    </g>
  );
}
