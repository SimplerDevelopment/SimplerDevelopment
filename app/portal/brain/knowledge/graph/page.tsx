'use client';

/**
 * Knowledge Graph — full-page force-directed graph view at
 * /portal/brain/knowledge/graph. Sits alongside the IDE shell at
 * /portal/brain/knowledge; clicking a node deep-links back into that page
 * with `?id=N` so the existing selection logic picks it up.
 */

import Link from 'next/link';
import NoteGraphView from '@/components/brain/NoteGraphView';

export default function BrainKnowledgeGraphPage() {
  return (
    <div className="fixed inset-0 top-[var(--portal-header-height,3.5rem)] flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Link
          href="/portal/brain/knowledge"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <span className="material-icons text-[16px]">arrow_back</span>
          Back to knowledge
        </Link>
        <div className="h-4 w-px bg-border" aria-hidden />
        <h1 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="material-icons text-[18px] text-primary">hub</span>
          Knowledge Graph
        </h1>
        <span className="ml-2 text-[11px] text-muted-foreground hidden sm:inline">
          Wikilinks between your notes — click a node to open it.
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <NoteGraphView />
      </div>
    </div>
  );
}
