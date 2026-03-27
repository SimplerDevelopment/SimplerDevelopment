import { Block, HistoryEntry, HistoryAction, PageSettings } from '@/types/blocks';
import { produce } from 'immer';

/**
 * BlockHistory class manages undo/redo history for block editor
 *
 * Features:
 * - Stores up to 50 history entries (configurable)
 * - Supports undo/redo operations
 * - Clears redo stack on new actions
 * - Uses circular buffer for constant memory usage
 */
export class BlockHistory {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Push a new history entry
   * This should be called BEFORE making changes to blocks
   *
   * @param blocks - Current block state (before the change)
   * @param action - Description of the action being performed
   * @param affectedBlockIds - Optional list of block IDs affected by this action
   */
  push(
    blocks: Block[],
    action: HistoryAction,
    affectedBlockIds?: string[],
    pageSettings?: PageSettings
  ): void {
    const entry: HistoryEntry = {
      blocks: produce(blocks, (draft) => draft), // Deep clone using immer
      pageSettings: pageSettings ? { ...pageSettings } : undefined,
      timestamp: Date.now(),
      action,
      affectedBlockIds,
    };

    this.past.push(entry);

    // Trim if exceeds max size
    if (this.past.length > this.maxSize) {
      this.past.shift(); // Remove oldest
    }

    // Clear future (can't redo after new action)
    this.future = [];
  }

  /**
   * Undo the last action
   * Returns the previous block state, or undefined if nothing to undo
   */
  undo(): { blocks: Block[]; pageSettings?: PageSettings; action: HistoryAction } | undefined {
    const entry = this.past.pop();
    if (!entry) {
      return undefined;
    }

    // Move current state to future
    this.future.push(entry);

    // Return the previous state (which is now the last item in past)
    const previousEntry = this.past[this.past.length - 1];
    if (!previousEntry) {
      // No previous state, return empty blocks
      return {
        blocks: [],
        pageSettings: undefined,
        action: { type: 'modify', description: 'Initial state' },
      };
    }

    return {
      blocks: previousEntry.blocks,
      pageSettings: previousEntry.pageSettings,
      action: entry.action,
    };
  }

  /**
   * Redo the last undone action
   * Returns the next block state, or undefined if nothing to redo
   */
  redo(): { blocks: Block[]; pageSettings?: PageSettings; action: HistoryAction } | undefined {
    const entry = this.future.pop();
    if (!entry) {
      return undefined;
    }

    // Move back to past
    this.past.push(entry);

    return {
      blocks: entry.blocks,
      pageSettings: entry.pageSettings,
      action: entry.action,
    };
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.past.length > 1; // Need at least 2 entries (current + previous)
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.past = [];
    this.future = [];
  }

  /**
   * Get the size of the history
   */
  size(): { past: number; future: number } {
    return {
      past: this.past.length,
      future: this.future.length,
    };
  }

  /**
   * Get the last action description (for UI display)
   */
  getLastAction(): string | null {
    const lastEntry = this.past[this.past.length - 1];
    return lastEntry ? lastEntry.action.description : null;
  }

  /**
   * Get the next action description (for UI display)
   */
  getNextAction(): string | null {
    const nextEntry = this.future[this.future.length - 1];
    return nextEntry ? nextEntry.action.description : null;
  }
}
