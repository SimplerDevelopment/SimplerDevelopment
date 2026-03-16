'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Block, HistoryAction } from '@/types/blocks';
import { BlockHistory } from '@/lib/utils/blockHistory';

interface UseBlockHistoryReturn {
  // Current state
  blocks: Block[];
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  setBlocks: (blocks: Block[], action: HistoryAction) => void;
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
  maxHistorySize: number = 50
): UseBlockHistoryReturn {
  // Only use initialBlocks on first render - use lazy initialization
  const [blocks, setBlocksState] = useState<Block[]>(() => initialBlocks);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);

  // Use ref to persist history across renders
  const historyRef = useRef(new BlockHistory(maxHistorySize));

  // Track if we've initialized the history
  const initializedRef = useRef(false);
  const prevInitialBlocksRef = useRef(initialBlocks);

  // Initialize history with the starting state on first render
  if (!initializedRef.current && initialBlocks.length > 0) {
    historyRef.current.push(initialBlocks, {
      type: 'modify',
      description: 'Initial state',
    });
    initializedRef.current = true;
  }

  // Sync with external initialBlocks changes (from parent component)
  // This is critical for keeping the hook in sync when parent state changes
  useEffect(() => {
    // Only sync if initialBlocks actually changed (by reference)
    if (prevInitialBlocksRef.current !== initialBlocks) {
      console.log('[useBlockHistory] initialBlocks changed externally, syncing from', blocks.length, 'to', initialBlocks.length);
      setBlocksState(initialBlocks);
      prevInitialBlocksRef.current = initialBlocks;
    }
  }, [initialBlocks, blocks.length]);

  /**
   * Update blocks with history tracking
   * This replaces the current blocks and creates a history entry
   *
   * @param newBlocks - New block state
   * @param action - Description of the action
   */
  const setBlocks = useCallback(
    (newBlocks: Block[], action: HistoryAction) => {
      const history = historyRef.current;

      // Push current state to history BEFORE updating
      history.push(blocks, action);

      // Update state
      setBlocksState(newBlocks);

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
    canUndo,
    canRedo,
    setBlocks,
    undo,
    redo,
    clearHistory,
    lastAction,
    nextAction,
  };
}
