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
}

export interface BlocksUpdatePayload {
  blocks: Block[];
}

export interface SelectBlockPayload {
  blockId: string | null;
}

export interface HoverBlockPayload {
  blockId: string | null;
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
} as const;

export const IFRAME_MESSAGES = {
  IFRAME_READY: 'IFRAME_READY',
  BLOCK_CLICKED: 'BLOCK_CLICKED',
  BLOCK_HOVERED: 'BLOCK_HOVERED',
  COMPONENT_REGISTRY: 'COMPONENT_REGISTRY',
  BLOCKS_REORDERED: 'BLOCKS_REORDERED',
  ADD_BLOCK_AFTER: 'ADD_BLOCK_AFTER',
  BLOCK_RESIZED: 'BLOCK_RESIZED',
} as const;
