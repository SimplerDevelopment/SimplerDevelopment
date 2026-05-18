// Types for the Fabric.js product designer.
//
// Layers are stored per-surface (keyed by surface slug, e.g. "front", "back",
// "left-sleeve") rather than the hard-coded productDesigner enum. A
// DesignerSurface describes the configurable canvas + mockup + print-area
// bounds that the merchant has set up in the portal.

export type LayerType = 'text' | 'icon' | 'image';

/**
 * Persisted drop-shadow effect description. Round-tripped to/from Fabric's
 * `Shadow` instance so effects survive save/load. All values optional so
 * partial payloads from older designs remain readable.
 */
export interface TextShadowEffect {
  enabled: boolean;
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface TextLayerData {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontStyle?: 'normal' | 'italic';
  /** Single-line underline below the text. Maps directly to Fabric's `underline`. */
  underline?: boolean;
  fill: string;
  color?: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  charSpacing: number;
  /** Optional Google Font metadata (family + variants). */
  googleFont?: {
    family: string;
    category?: string;
    variants?: string[];
  };
  fontSource?: 'system' | 'google';
  textBackgroundColor?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Persisted drop-shadow effect (offsetX/Y/blur/color). Replayed on canvas rebuild. */
  shadow?: TextShadowEffect | null;
  /**
   * Optional per-mockup-tint colour overrides. Keyed by lowercase tint hex
   * (e.g. '#1f2a44') or the literal string 'none' for the no-tint state.
   * When the active tint has an entry here, the layer is rendered with this
   * fill instead of the base `fill`. Lets a customer pick different ink
   * colours per shirt colour without duplicating the layer.
   */
  fillByTint?: Record<string, string>;
}

export interface IconLayerData {
  iconName: string;
  iconLibrary?: string;
  fill: string;
  color?: string;
  /** Display size of icon in px (mapped to Fabric fontSize for unicode glyphs). */
  size?: number;
  strokeWidth?: number;
  /** Per-tint overrides — same shape as TextLayerData.fillByTint. */
  fillByTint?: Record<string, string>;
}

export interface ImageFiltersData {
  /** -1 → 1, 0 default. */
  brightness: number;
  /** -1 → 1, 0 default. */
  contrast: number;
  /** -1 → 1, 0 default. */
  saturation: number;
  /** 0 → 1, 0 default. */
  blur: number;
}

export interface ImageLayerData {
  url: string;
  originalWidth?: number;
  originalHeight?: number;
  altText?: string;
  fit?: 'cover' | 'contain' | 'fill';
  /** Persisted Fabric image filters — replayed on canvas rebuild. */
  filters?: ImageFiltersData;
}

export type LayerDataPayload = TextLayerData | IconLayerData | ImageLayerData;

export interface LayerData {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  left: number;
  top: number;
  width?: number;
  height?: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  /** Layer-type-specific payload (text content, icon name, image url, etc). */
  data: TextLayerData | IconLayerData | ImageLayerData | Record<string, unknown>;
  zIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanvasSize {
  width: number;
  height: number;
  dpi: number;
}

export interface DesignerSurface {
  id: number;
  slug: string;
  name: string;
  mockupImage: string;
  canvasWidth: number;
  canvasHeight: number;
  printAreaX: number;
  printAreaY: number;
  printAreaWidth: number;
  printAreaHeight: number;
  printDpi: number;
  displayOrder: number;
}

export type DesignStatus = 'draft' | 'finalized' | 'rendered';

export interface DesignDoc {
  id: string;
  productId: number;
  name: string;
  /** Per-surface layer lists keyed by surface slug. */
  layersBySurface: Record<string, LayerData[]>;
  canvasSize: CanvasSize;
  status: DesignStatus;
  thumbnailUrl?: string | null;
  /** Hex color applied as a multiply tint to the mockup, or null for none. */
  mockupTint?: string | null;
}

export interface LayerSelection {
  selectedLayerIds: string[];
  selectionMode: 'single' | 'multiple';
  lastSelectedId: string | null;
  canBatchEdit: boolean;
  batchEditableProperties: Array<'opacity' | 'visible' | 'locked' | 'color'>;
}

export interface BatchUpdateData {
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  color?: string;
  /**
   * When set alongside `color`, routes the colour write into each layer's
   * `fillByTint[tintKey]` map instead of clobbering the base `fill`. Keeps
   * a batch colour change on a tinted mockup scoped to that tint, matching
   * how the single-layer TintAwareColorPicker behaves.
   */
  colorTintKey?: string;
}

export interface ExportedDesignData {
  designId: string | null;
  designName: string;
  productId: number | null;
  layersBySurface: Record<string, LayerData[]>;
  canvasSize: CanvasSize;
  /** Hex color tint applied to the mockup, or null when un-tinted. */
  mockupTint?: string | null;
  exportedAt: string;
  version: string;
}

export interface UploadedImageResult {
  url: string;
  width: number;
  height: number;
}
