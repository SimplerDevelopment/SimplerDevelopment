import type { Block, PageSettings } from './blocks';

// ─── Message Protocol ────────────────────────────────────────────────────────

export type MessageSource = 'sd-editor-parent' | 'sd-editor-iframe';

export interface VisualEditorMessage<T = unknown> {
  source: MessageSource;
  type: string;
  payload: T;
  timestamp: number;
}

// Parent → iframe
export interface EditorInitPayload {
  blocks: Block[];
  selectedBlockId: string | null;
  pageSettings?: PageSettings;
  /**
   * Post-type template JSON ({ blocks, version }) for the post being edited.
   * When present, the iframe renders the template as static chrome with the
   * `post-content` placeholder swapped for the editable post-blocks slot —
   * matching what the public site shows. Null/undefined for posts without a
   * template (or for the template editor itself).
   */
  typeTemplate?: string | null;
}

export interface BlocksUpdatePayload {
  blocks: Block[];
  /**
   * When true, the iframe coalesces this update into the current drag/slider
   * session — only the first coalesce-true update in a session pushes history,
   * so a slider drag becomes one undo entry instead of one per pixel. The
   * session ends after a 300 ms quiet period or when a coalesce-false update
   * arrives. Default false: every parent-initiated change is its own entry.
   */
  coalesce?: boolean;
}

export interface SelectBlockPayload {
  blockId: string | null;
}

export interface HoverBlockPayload {
  blockId: string | null;
}

export interface CustomCodeUpdatePayload {
  css: string;
  js: string;
}

// iframe → parent
export interface IframeReadyPayload {
  registeredComponents: ComponentManifestEntry[];
}

export interface BlockClickedPayload {
  blockId: string;
}

export interface BlockHoveredPayload {
  blockId: string | null;
}

export interface ComponentRegistryPayload {
  components: ComponentManifestEntry[];
}

// ─── Component Registration ──────────────────────────────────────────────────

export type PropSchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'url'
  | 'richtext'
  | 'image'
  | 'list';

export interface PropSchema {
  name: string;
  label: string;
  type: PropSchemaType;
  defaultValue?: unknown;
  required?: boolean;
  enumOptions?: { label: string; value: string }[];
  listItemSchema?: PropSchema[];
}

export interface ComponentManifestEntry {
  type: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  inputs: PropSchema[];
  defaultProps: Record<string, unknown>;
}

// ─── Message Type Constants ──────────────────────────────────────────────────

export const PARENT_MESSAGES = {
  EDITOR_INIT: 'EDITOR_INIT',
  BLOCKS_UPDATE: 'BLOCKS_UPDATE',
  SELECT_BLOCK: 'SELECT_BLOCK',
  HOVER_BLOCK: 'HOVER_BLOCK',
  EXIT_EDIT_MODE: 'EXIT_EDIT_MODE',
  PAGE_SETTINGS_UPDATE: 'PAGE_SETTINGS_UPDATE',
  UNDO: 'UNDO',
  REDO: 'REDO',
  EXTERNAL_DRAG_START: 'EXTERNAL_DRAG_START',
  EXTERNAL_DRAG_MOVE: 'EXTERNAL_DRAG_MOVE',
  EXTERNAL_DRAG_END: 'EXTERNAL_DRAG_END',
  EXTERNAL_DRAG_CANCEL: 'EXTERNAL_DRAG_CANCEL',
  CUSTOM_CODE_UPDATE: 'CUSTOM_CODE_UPDATE',
} as const;

export const IFRAME_MESSAGES = {
  IFRAME_READY: 'IFRAME_READY',
  BLOCK_CLICKED: 'BLOCK_CLICKED',
  BLOCK_HOVERED: 'BLOCK_HOVERED',
  COMPONENT_REGISTRY: 'COMPONENT_REGISTRY',
  BLOCKS_REORDERED: 'BLOCKS_REORDERED',
  ADD_BLOCK_AFTER: 'ADD_BLOCK_AFTER',
  BLOCK_RESIZED: 'BLOCK_RESIZED',
  BLOCK_STYLE_UPDATED: 'BLOCK_STYLE_UPDATED',
  UNDO_REDO_STATE: 'UNDO_REDO_STATE',
  COLUMN_RESIZED: 'COLUMN_RESIZED',
  GAP_CHANGED: 'GAP_CHANGED',
  EXTERNAL_DROP_COMPLETED: 'EXTERNAL_DROP_COMPLETED',
  BLOCK_CONTENT_UPDATED: 'BLOCK_CONTENT_UPDATED',
  BLOCK_CONTEXT_MENU: 'BLOCK_CONTEXT_MENU',
  /** Iframe → parent: user pressed Cmd/Ctrl+C inside the iframe with one or
   *  more blocks selected. Parent runs its localStorage copy of the selection. */
  COPY_BLOCKS: 'COPY_BLOCKS',
  /** Iframe → parent: user pressed Cmd/Ctrl+V inside the iframe. Parent
   *  reads its clipboard and inserts the blocks at the current insertion point. */
  PASTE_BLOCKS: 'PASTE_BLOCKS',
  /** Iframe → parent: user clicked an `<img data-field-image="X">`. Parent
   *  opens the MediaPicker modal targeting that field path. After selection,
   *  the parent writes the new URL into block.values via the existing
   *  BLOCK_CONTENT_UPDATED route. */
  REQUEST_IMAGE_PICKER: 'REQUEST_IMAGE_PICKER',
} as const;
