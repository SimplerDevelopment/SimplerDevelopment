'use client';

/**
 * Brain knowledge — tag treemap.
 *
 * Full-page squarified treemap of all tags. Each tile area ∝ note count.
 * Click a tile to jump back to the IDE filtered by that tag.
 */

import Link from 'next/link';
import TagTreemapView from '@/components/brain/TagTreemapView';

export default function BrainKnowledgeTreemapPage() {
  return (
    <div className="fixed inset-0 top-[var(--portal-header-height,3.5rem)] flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2 min-h-[3rem]">
        <Link
          href="/portal/brain/knowledge"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base">arrow_back</span>
          <span>Back to knowledge</span>
        </Link>
        <div className="h-4 w-px bg-border" aria-hidden />
        <h1 className="text-sm font-semibold text-foreground">Tag Treemap</h1>
        <span className="ml-auto text-[11px] text-muted-foreground hidden sm:inline">
          Tile area is proportional to note count
        </span>
      </header>
      <div className="flex-1 min-h-0">
        <TagTreemapView />
      </div>
    </div>
  );
}
