'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { Block, HistoryAction, PageSettings } from '@/types/blocks';
import { BlockHistory } from '@/lib/utils/blockHistory';

interface UseBlockHistoryReturn {
  // Current state
  blocks: Block[];
  pageSettings: PageSettings;
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  setBlocks: (blocks: Block[], action: HistoryAction, options?: { batch?: boolean }) => void;
  setPageSettings: (pageSettings: PageSettings, action: HistoryAction) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Metadata
  lastAction: string | null;
  nextAction: string | null;
}

/**
 * Hook for managing block history with undo/redo functionality
 *
 * @param initialBlocks - Initial block state
 * @param maxHistorySize - Maximum number of history entries (default: 50)
 * @returns Object with blocks, history controls, and metadata
 *
 * @example
 * ```tsx
 * const { blocks, setBlocks, undo, redo, canUndo, canRedo } = useBlockHistory(initialBlocks);
 *
 * // Update blocks with history tracking
 * setBlocks(newBlocks, { type: 'add', description: 'Added heading block' });
 *
 * // Undo/redo
 * if (canUndo) undo();
 * if (canRedo) redo();
 * ```
 */
export function useBlockHistory(
  initialBlocks: Block[] = [],
  maxHistorySize: number = 50,
  initialPageSettings: PageSettings = {}
): UseBlockHistoryReturn {
  // Only use initialBlocks on first render - use lazy initialization
  const [blocks, setBlocksState] = useState<Block[]>(() => initialBlocks);
  const [pageSettings, setPageSettingsState] = useState<PageSettings>(() => initialPageSettings);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);

  // Use ref to persist history across renders
  const historyRef = useRef(new BlockHistory(maxHistorySize));

  // Track if we've initialized the history
  const initializedRef = useRef(false);
  const prevInitialBlocksRef = useRef(initialBlocks);

  // Keep a ref to current pageSettings for use in setBlocks callback
  const pageSettingsRef = useRef(pageSettings);
  useLayoutEffect(() => {
    pageSettingsRef.current = pageSettings;
  });

  // Initialize history with the starting state on first render.
  // Use an effect so we don't access refs during render.
  useEffect(() => {
    if (!initializedRef.current && initialBlocks.length > 0) {
      historyRef.current.push(initialBlocks, {
        type: 'modify',
        description: 'Initial state',
      }, undefined, initialPageSettings);
      initializedRef.current = true;
    }
  // intentional: initialBlocks/initialPageSettings are only consumed once at mount
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: initialBlocks is consumed via lazy useState initialization above.
  // We intentionally do NOT sync on subsequent changes — the hook owns
  // block state after mount. Parent changes are handled by unmount/remount
  // of the provider (e.g., navigating to a different post).

  /**
   * Update blocks with history tracking
   * This replaces the current blocks and creates a history entry.
   *
   * The history stack holds successive STATES (including the current one),
   * so we push the NEW state: undo() pops it back off and reveals the
   * previous entry. Pushing the pre-change state instead would make undo
   * skip a step (S0→S1→S2 would jump back to S0).
   *
   * @param newBlocks - New block state
   * @param action - Description of the action being performed
   */
  // Drag/batch session tracking — only one history entry per rapid sequence
  const batchActiveRef = useRef(false);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setBlocks = useCallback(
    (newBlocks: Block[], action: HistoryAction, options?: { batch?: boolean }) => {
      const history = historyRef.current;

      if (options?.batch) {
        // Only push history on the first call of a batch sequence
        if (!batchActiveRef.current) {
          batchActiveRef.current = true;
          history.push(newBlocks, action, undefined, pageSettingsRef.current);
        }
        // Reset batch after a quiet period
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(() => { batchActiveRef.current = false; }, 300);
      } else {
        // Push the NEW state to history (see the stack-of-states note above)
        history.push(newBlocks, action, undefined, pageSettingsRef.current);
      }

      // Update state
      setBlocksState(newBlocks);

      // Update can undo/redo flags
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());

      // Update action metadata
      setLastAction(history.getLastAction());
      setNextAction(history.getNextAction());
    },
    []
  );

  const setPageSettings = useCallback(
    (newPageSettings: PageSettings, action: HistoryAction) => {
      const history = historyRef.current;

      // Post-change snapshot (same convention as setBlocks above): the entry
      // carries the current blocks plus the NEW settings, so undo reveals the
      // previous entry with both fields intact.
      history.push(blocks, action, undefined, newPageSettings);

      // Update state
      setPageSettingsState(newPageSettings);

      // Update can undo/redo flags
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());

      // Update action metadata
      setLastAction(history.getLastAction());
      setNextAction(history.getNextAction());
    },
    [blocks]
  );

  /**
   * Undo the last action
   */
  const undo = useCallback(() => {
    const history = historyRef.current;
    const result = history.undo();

    if (result) {
      setBlocksState(result.blocks);
      if (result.pageSettings !== undefined) {
        setPageSettingsState(result.pageSettings);
      }
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      setLastAction(history.getLastAction());
      setNextAction(history.getNextAction());
    }
  }, []);

  /**
   * Redo the last undone action
   */
  const redo = useCallback(() => {
    const history = historyRef.current;
    const result = history.redo();

    if (result) {
      setBlocksState(result.blocks);
      if (result.pageSettings !== undefined) {
        setPageSettingsState(result.pageSettings);
      }
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
      setLastAction(history.getLastAction());
      setNextAction(history.getNextAction());
    }
  }, []);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    const history = historyRef.current;
    history.clear();
    setCanUndo(false);
    setCanRedo(false);
    setLastAction(null);
    setNextAction(null);
  }, []);

  return {
    blocks,
    pageSettings,
    canUndo,
    canRedo,
    setBlocks,
    setPageSettings,
    undo,
    redo,
    clearHistory,
    lastAction,
    nextAction,
  };
}
