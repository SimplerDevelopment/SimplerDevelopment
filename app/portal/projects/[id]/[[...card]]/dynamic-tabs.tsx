'use client';

// KanbanBoard and SprintPlanning use dnd-kit + `window` directly, so they must
// opt out of SSR. Next 16 disallows `dynamic(..., { ssr: false })` inside Server
// Components, so the client-only dynamic imports live here in a Client Component
// and are re-exported for the server page to compose. The other (SSR-safe) tab
// components stay code-split directly in page.tsx.
import dynamic from 'next/dynamic';

export const KanbanBoard = dynamic(() => import('@/components/portal/KanbanBoard'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading board…</div>,
});

export const SprintPlanning = dynamic(() => import('@/components/portal/SprintPlanning'), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading sprints…</div>,
});
