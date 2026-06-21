'use client';

// Lightweight editor-mode context — split out from EditorModeProvider so that
// PUBLIC site block renderers (e.g. HtmlRenderBlockRender) can read editor
// state with `useEditorModeContext()` WITHOUT pulling in `useEditorMode`, which
// statically imports the full block registry (all 64 renderers) + dnd-kit +
// the visual-editor machinery. That chain was the ~400KB chunk shipped to every
// public page even though edit mode only runs at `?_edit=true`. This module
// imports nothing heavier than React + types, so it tree-shakes cleanly.
//
// The heavy `EditorModeProvider` (which calls `useEditorMode`) lives in
// `./EditorModeProvider` and is only reachable from the lazily-loaded edit path.

import { createContext, useContext } from 'react';
// Type-only import — erased at compile time, so it creates NO runtime/bundle
// edge back to useEditorMode (and therefore none to the block registry).
import type { ExternalDragState } from '@/lib/visual-editor/useEditorMode';
import type { Block, PageSettings } from '@/types/blocks';

export interface EditorModeContextValue {
  active: boolean;
  blocks: Block[];
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  hoveredBlockId: string | null;
  pageSettings?: PageSettings;
  externalDrag: ExternalDragState;
  typeTemplate: string | null;
  onBlockClicked: (blockId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onBlockHovered: (blockId: string | null) => void;
  onBlocksReordered: (blocks: Block[]) => void;
  onAddBlockAfter: (blockId: string) => void;
  onBlockResized: (blockId: string, width: string | undefined, height: string | undefined) => void;
  onBlockStyleUpdated: (blockId: string, style: Record<string, string>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const EditorModeContext = createContext<EditorModeContextValue>({
  active: false,
  blocks: [],
  selectedBlockId: null,
  selectedBlockIds: [],
  hoveredBlockId: null,
  externalDrag: { active: false, blockType: null, x: 0, y: 0 },
  typeTemplate: null,
  onBlockClicked: () => {},
  onBlockHovered: () => {},
  onBlocksReordered: () => {},
  onAddBlockAfter: () => {},
  onBlockResized: () => {},
  onBlockStyleUpdated: () => {},
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
});

// The default value above (active: false) is exactly what a PUBLIC page sees —
// no provider in the tree → `editor.active === false` → renderers take their
// non-editing branch. Identical behavior to before the split.
export function useEditorModeContext() {
  return useContext(EditorModeContext);
}
