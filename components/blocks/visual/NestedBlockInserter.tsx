'use client';

import React from 'react';
import type { BlockType } from '@/types/blocks';
import { BUILT_IN_BLOCK_TYPES } from '@/lib/blocks/registry';

interface NestedBlockInserterProps {
  /** Called when the user selects a block type. The caller is responsible for
   *  creating the block via `createDefaultBlock` and inserting it. */
  onPick: (type: BlockType) => void;
  /** Dialog title — e.g. "Add Block to Column". Defaults to "Add Block". */
  title?: string;
  /** Close handler — called when the user clicks outside or the X button. */
  onClose: () => void;
  /**
   * Optional category filter. When provided only entries whose `category`
   * appears in this array are shown. Omit (or pass undefined) to show all 47
   * user-pickable block types.
   */
  categories?: string[];
  /**
   * When true renders a tighter 3-column grid. When false uses a wider layout
   * suitable for a full-width modal. Defaults to true.
   */
  compact?: boolean;
}

/**
 * Shared inline block-picker modal used by SectionBlockPreview,
 * ColumnsBlockPreview, and TabsBlockPreview (nested-context inserters).
 *
 * Sources the block list from `BUILT_IN_BLOCK_TYPES` (lib/blocks/registry.ts)
 * so the full 47-block roster is always available in nested contexts.
 * Material Icons throughout — no emoji.
 */
export function NestedBlockInserter({
  onPick,
  title = 'Add Block',
  onClose,
  categories,
  compact = true,
}: NestedBlockInserterProps) {
  const visibleTypes = categories
    ? BUILT_IN_BLOCK_TYPES.filter(bt => categories.includes(bt.category))
    : BUILT_IN_BLOCK_TYPES;

  const uniqueCategories = Array.from(new Set(visibleTypes.map(bt => bt.category)));
  const gridCols = compact ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-2xl w-full max-h-[70vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border bg-white dark:bg-gray-900">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
            >
              <span className="material-icons text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Block grid grouped by category */}
        <div className="overflow-y-auto max-h-[calc(70vh-80px)] bg-white dark:bg-gray-900">
          {uniqueCategories.map(category => (
            <div
              key={category}
              className="p-4 border-b border-border last:border-0 bg-white dark:bg-gray-900"
            >
              <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3 tracking-wide">
                {category}
              </h4>
              <div className={`grid ${gridCols} gap-3`}>
                {visibleTypes
                  .filter(bt => bt.category === category)
                  .map(bt => (
                    <button
                      key={bt.type}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(bt.type);
                      }}
                      className="p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group bg-white dark:bg-gray-900"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-icons text-2xl text-muted-foreground group-hover:text-primary">
                          {bt.icon}
                        </span>
                        <div className="text-xs font-medium text-foreground group-hover:text-primary text-center">
                          {bt.label}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
