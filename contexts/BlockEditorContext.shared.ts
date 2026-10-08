import { createContext, useContext } from 'react';
import type { BlockEditorContextValue } from './BlockEditorContext';

// Lightweight half of BlockEditorContext: just the context object and the
// optional reader, with no runtime imports beyond React (the value type is
// import-type only, erased at build). See BlockEditorContext.tsx for why.
export const BlockEditorContext = createContext<BlockEditorContextValue | undefined>(
  undefined,
);

/**
 * Hook to optionally access BlockEditor context.
 * Returns the context value if within a BlockEditorProvider, undefined otherwise.
 * Safe to call from components that may or may not be rendered inside the provider.
 */
export function useBlockEditorOptional() {
  return useContext(BlockEditorContext);
}
