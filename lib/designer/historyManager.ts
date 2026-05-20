'use client';

/**
 * Standalone history stack used by callers that want to track snapshots
 * outside of the Zustand store (e.g. raw canvas JSON snapshots for crash
 * recovery). The main undo/redo flow goes through `useCanvasStore.undo()` /
 * `redo()`; this helper is a thin wrapper kept around for parity with the
 * source app.
 */

export interface HistorySnapshot<T = unknown> {
  id: string;
  timestamp: number;
  description?: string;
  payload: T;
}

export interface HistoryManagerOptions {
  maxHistorySize?: number;
}

export class HistoryManager<T = unknown> {
  private history: HistorySnapshot<T>[] = [];
  private currentIndex = -1;
  private readonly maxHistorySize: number;

  constructor(options: HistoryManagerOptions = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 50;
  }

  push(payload: T, description?: string): void {
    // Drop forward history when pushing after an undo.
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    this.history.push({
      id: cryptoRandom(),
      timestamp: Date.now(),
      description,
      payload,
    });
    if (this.history.length > this.maxHistorySize) {
      const drop = this.history.length - this.maxHistorySize;
      this.history.splice(0, drop);
      this.currentIndex -= drop;
    }
    this.currentIndex = this.history.length - 1;
  }

  undo(): T | null {
    if (this.currentIndex <= 0) return null;
    this.currentIndex -= 1;
    return this.history[this.currentIndex].payload;
  }

  redo(): T | null {
    if (this.currentIndex >= this.history.length - 1) return null;
    this.currentIndex += 1;
    return this.history[this.currentIndex].payload;
  }

  current(): HistorySnapshot<T> | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.history.length) return null;
    return this.history[this.currentIndex];
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  size(): number {
    return this.history.length;
  }
}

function cryptoRandom(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
