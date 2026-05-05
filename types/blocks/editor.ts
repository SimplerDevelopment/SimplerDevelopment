import type { Block } from './index';

export interface PageSettings {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  maxWidth?: string; // e.g., '1200px', '100%', '960px'
  paddingTop?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingRight?: string;
  fontFamily?: string;
  color?: string;
  cssClass?: string;
  backgroundVideo?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  backgroundOpacity?: number; // 0 to 1
}

export interface BlockEditorData {
  blocks: Block[];
  pageSettings?: PageSettings;
  version: string;
}

// ============================================================================
// Block Editor UX Improvements - New Types
// ============================================================================

// History Management
export interface HistoryAction {
  type: 'add' | 'delete' | 'modify' | 'reorder' | 'duplicate';
  description: string; // Human-readable (e.g., "Added heading block")
}

export interface HistoryEntry {
  blocks: Block[]; // Complete block state at this point
  pageSettings?: PageSettings; // Page settings at this point
  timestamp: number; // Unix timestamp (ms)
  action: HistoryAction; // Type of action that created this entry
  affectedBlockIds?: string[]; // IDs of blocks changed (for optimization)
}

// Editor State
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ContentStats {
  // Overall document
  totalWords: number;
  totalCharacters: number;
  totalCharactersNoSpaces: number;
  totalSentences: number;
  readingTimeMinutes: number; // Based on 200 WPM average

  // Per-block (for selected block)
  selectedBlockWords: number;
  selectedBlockCharacters: number;

  // Block type breakdown
  blockCounts: Record<string, number>; // { heading: 5, text: 12, image: 3 }
}

export interface EditorState {
  // Content
  blocks: Block[];

  // Selection & Focus
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  focusedBlockId: string | null; // For keyboard navigation

  // UI State
  showBlockPicker: boolean;
  showKeyboardReference: boolean; // Keyboard shortcuts modal
  insertPosition: number | null; // Where to insert new block
  previewMode: boolean; // Toggle between edit and preview

  // Drag-and-Drop
  isDragging: boolean;
  draggedBlockId: string | null;
  dropTargetIndex: number | null;

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Content Analysis
  stats: ContentStats;

  // Save State
  saveStatus: SaveStatus;
  lastSavedAt: number | null; // Unix timestamp
  hasUnsavedChanges: boolean;
}

// Drag-and-Drop State
export interface DragState {
  active: {
    id: string; // Block ID being dragged
    index: number; // Original position
  } | null;

  over: {
    id: string; // Drop target block ID
    index: number; // Drop position
  } | null;
}

// Keyboard Shortcuts
export type ShortcutCategory = 'editing' | 'navigation' | 'blocks' | 'system';

export interface KeyboardShortcut {
  keys: string; // Mousetrap format (e.g., "mod+z")
  description: string; // Human-readable (e.g., "Undo last action")
  category: ShortcutCategory;
  handler: () => void;
}

// Rich Paste
export type PasteWarningType =
  | 'unsupported_element'
  | 'image_failed'
  | 'formatting_lost';

export interface PasteWarning {
  type: PasteWarningType;
  element: string; // HTML element name (e.g., "table")
  message: string; // User-friendly explanation
}

export interface PasteResult {
  blocks: Block[]; // Converted blocks
  warnings: PasteWarning[]; // Elements that couldn't convert
  success: boolean; // Overall success status
}
