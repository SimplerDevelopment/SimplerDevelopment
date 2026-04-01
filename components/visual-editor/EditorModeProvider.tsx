'use client';

import React, { createContext, useContext } from 'react';
import { useEditorMode } from '@/lib/visual-editor/useEditorMode';
import type { ExternalDragState } from '@/lib/visual-editor/useEditorMode';
import type { Block, PageSettings } from '@/types/blocks';

interface EditorModeContextValue {
  active: boolean;
  blocks: Block[];
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  pageSettings?: PageSettings;
  externalDrag: ExternalDragState;
  onBlockClicked: (blockId: string) => void;
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

const EditorModeContext = createContext<EditorModeContextValue>({
  active: false,
  blocks: [],
  selectedBlockId: null,
  hoveredBlockId: null,
  externalDrag: { active: false, blockType: null, x: 0, y: 0 },
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

export function useEditorModeContext() {
  return useContext(EditorModeContext);
}

export function EditorModeProvider({ children }: { children: React.ReactNode }) {
  const editorMode = useEditorMode();

  return (
    <EditorModeContext.Provider value={editorMode}>
      {children}
    </EditorModeContext.Provider>
  );
}
