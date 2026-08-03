'use client';

// KanbanBoard and PlanningTab use dnd-kit + `window` directly, so they must
// opt out of SSR. Next 16 disallows `dynamic(..., { ssr: false })` inside Server
// Components, so the client-only dynamic imports live here in a Client Component
// and are re-exported for the server page to compose. The other (SSR-safe) tab
// components stay code-split directly in page.tsx.
import dynamic from 'next/dynamic';

export const KanbanBoard = dynamic(() => import('@/components/portal/KanbanBoard'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading board…</div>,
});

export const PlanningTab = dynamic(() => import('@/components/portal/planning/PlanningTab'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading planning…</div>,
});

// AgentFlowTab uses reactflow, which touches `window`/ResizeObserver directly,
// so it must opt out of SSR too.
export const AgentFlowTab = dynamic(() => import('@/components/portal/AgentFlowTab'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading workflow designer…</div>,
});

// FlowExecutionsTab holds live EventSource subscriptions, so it must not be
// server-rendered — same ssr:false requirement as the canvas tabs.
export const FlowExecutionsTab = dynamic(() => import('@/components/portal/FlowExecutionsTab'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading executions…</div>,
});

// PathVizTab (Dev Paths) renders a reactflow canvas, which reads `window` —
// same ssr:false requirement as KanbanBoard/PlanningTab above.
export const PathVizTab = dynamic(() => import('@/components/portal/pathviz/PathVizTab'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading Dev Paths…</div>,
});
