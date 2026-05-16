// Types for the Fabric.js product designer.
//
// Layers are stored per-surface (keyed by surface slug, e.g. "front", "back",
// "left-sleeve") rather than the hard-coded productDesigner enum. A
// DesignerSurface describes the configurable canvas + mockup + print-area
// bounds that the merchant has set up in the portal.

export type LayerType = 'text' | 'icon' | 'image';

export interface TextLayerData {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontStyle?: 'normal' | 'italic';
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
}

export interface IconLayerData {
  iconName: string;
  iconLibrary?: string;
  fill: string;
  color?: string;
  /** Display size of icon in px (mapped to Fabric fontSize for unicode glyphs). */
  size?: number;
  strokeWidth?: number;
}

export interface ImageLayerData {
  url: string;
  originalWidth?: number;
  originalHeight?: number;
  altText?: string;
  fit?: 'cover' | 'contain' | 'fill';
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
}

export interface ExportedDesignData {
  designId: string | null;
  designName: string;
  productId: number | null;
  layersBySurface: Record<string, LayerData[]>;
  canvasSize: CanvasSize;
  exportedAt: string;
  version: string;
}

export interface UploadedImageResult {
  url: string;
  width: number;
  height: number;
}
