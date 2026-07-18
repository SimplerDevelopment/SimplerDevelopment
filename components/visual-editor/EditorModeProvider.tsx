'use client';

import React from 'react';
import { useEditorMode } from '@/lib/visual-editor/useEditorMode';
import { EditorModeContext } from './editor-mode-context';

// `useEditorModeContext` + the context object now live in `./editor-mode-context`
// (a lightweight module with no heavy imports) so public block renderers can
// consume editor state without bundling `useEditorMode` → the block registry.
// Re-export the hook here for backward compatibility with existing importers.
export { useEditorModeContext } from './editor-mode-context';
export type { EditorModeContextValue } from './editor-mode-context';

// `useEditorMode` statically imports the full block registry (all 64 renderers),
// dnd-kit, and the postMessage protocol — so this component must only ever be
// reached from the lazily-loaded edit path (EditableBlockRenderer), never from
// a public site render.
export function EditorModeProvider({ children }: { children: React.ReactNode }) {
  const editorMode = useEditorMode();

  return (
    <EditorModeContext.Provider value={editorMode}>
      {children}
    </EditorModeContext.Provider>
  );
}
