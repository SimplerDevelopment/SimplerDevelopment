'use client';

import { FabricImage, FabricObject, FabricText, Path as FabricPath, Shadow } from 'fabric';
import { v4 as uuidv4 } from 'uuid';

import type {
  IconLayerData,
  ImageLayerData,
  LayerData,
  TextLayerData,
  TextShadowEffect,
} from './types';

/**
 * Map of common icon names → unicode glyphs.
 * Same compatibility set used by the productDesigner source. For richer icons
 * (FontAwesome / Material), the consuming app should render the glyph by name
 * and pass it in as text + fontFamily.
 */
const UNICODE_ICON_MAP: Record<string, string> = {
  star: '★',
  heart: '♥',
  circle: '●',
  square: '■',
  triangle: '▲',
  diamond: '♦',
  arrow: '→',
  check: '✓',
  close: '✕',
  plus: '+',
  minus: '−',
  bolt: '⚡',
  sun: '☀',
  moon: '☾',
  music: '♪',
  smile: '☺',
  flag: '⚑',
  crown: '♛',
  flower: '✿',
};

interface FabricCommonOptions {
  left?: number;
  top?: number;
  originX?: 'left' | 'center' | 'right';
  originY?: 'top' | 'center' | 'bottom';
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  visible?: boolean;
  selectable?: boolean;
  evented?: boolean;
  data?: Record<string, unknown>;
}

interface FabricTextOptions extends FabricCommonOptions {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  underline?: boolean;
  fill?: string;
  textAlign?: string;
  lineHeight?: number;
  charSpacing?: number;
  textBackgroundColor?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface FabricIconOptions extends FabricCommonOptions {
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
}

// Strip undefined- and null-valued keys from options so the {...options}
// spread doesn't blow away the explicit defaults below. Without this,
// callers that pass `fontFamily: undefined` (very common when round-tripping
// LayerData where the property is just missing) hit Fabric's getFontCache
// crash "Cannot read properties of undefined (reading 'toLowerCase')".
function stripNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Create a Fabric Text object for a text layer. */
export function createFabricText(
  text: string,
  options: FabricTextOptions = {}
): FabricText {
  const clean = stripNullish(options as Record<string, unknown>);
  const merged = {
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    fill: '#000000',
    textAlign: 'left',
    ...clean,
    data: {
      id: options.data?.id || uuidv4(),
      type: 'text' as const,
      ...(options.data || {}),
    },
  };
  return new FabricText(text, merged as unknown as Record<string, unknown>);
}

/** Create a Fabric icon (rendered as a unicode FabricText for now). */
export function createFabricIcon(
  iconName: string,
  options: FabricIconOptions = {}
): FabricText {
  const glyph = UNICODE_ICON_MAP[iconName] || UNICODE_ICON_MAP.star;
  const clean = stripNullish(options as Record<string, unknown>);
  const merged = {
    fontFamily: 'Arial, sans-serif',
    fontSize: 48,
    fill: '#333333',
    textAlign: 'center',
    ...clean,
    data: {
      id: options.data?.id || uuidv4(),
      type: 'icon' as const,
      iconName,
      ...(options.data || {}),
    },
  };
  return new FabricText(glyph, merged as unknown as Record<string, unknown>);
}

/** Create a Fabric Image object from a URL. Async because images must load. */
export async function createFabricImage(
  imageUrl: string,
  options: FabricCommonOptions = {}
): Promise<FabricImage> {
  const img = (await FabricImage.fromURL(imageUrl, {
    crossOrigin: 'anonymous',
  })) as FabricImage;
  if (!img) throw new Error('Failed to load image');
  const defaults = {
    ...options,
    data: {
      id: options.data?.id || uuidv4(),
      type: 'image' as const,
      url: imageUrl,
      ...(options.data || {}),
    },
  };
  img.set(defaults as unknown as Record<string, unknown>);
  return img;
}

/**
 * Build a FabricObject from a LayerData record. Returns null for unrecognised
 * types or async types whose data is missing (e.g. image without url).
 *
 * For images the caller must `await` — the factory returns a Promise to keep a
 * single entry point.
 */
export async function layerToFabricObject(
  layer: LayerData
): Promise<FabricObject | null> {
  const common: FabricCommonOptions = {
    left: layer.left,
    top: layer.top,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.angle,
    opacity: layer.opacity,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
    data: {
      id: layer.id,
      type: layer.type,
      ...(layer.data as Record<string, unknown>),
    },
  };

  if (layer.type === 'text') {
    const d = layer.data as Partial<TextLayerData>;
    const text = createFabricText(d.text ?? 'Text', {
      ...common,
      fontFamily: d.fontFamily,
      fontSize: d.fontSize,
      fontWeight: d.fontWeight,
      fontStyle: d.fontStyle,
      underline: d.underline,
      fill: d.fill || d.color,
      textAlign: d.textAlign,
      lineHeight: d.lineHeight,
      charSpacing: d.charSpacing,
      textBackgroundColor: d.textBackgroundColor,
      stroke: d.stroke,
      strokeWidth: d.strokeWidth,
    });
    // Replay persisted drop-shadow effect, if any.
    if (d.shadow && d.shadow.enabled) {
      applyShadowEffectToFabricObject(text, d.shadow);
    }
    return text;
  }
  if (layer.type === 'icon') {
    const d = layer.data as Partial<IconLayerData>;
    return createFabricIcon(d.iconName ?? 'star', {
      ...common,
      fill: d.fill || d.color,
      fontSize: d.size,
    });
  }
  if (layer.type === 'image') {
    const d = layer.data as Partial<ImageLayerData>;
    if (!d.url) return null;
    return createFabricImage(d.url, common);
  }
  return null;
}

/**
 * Convert a Fabric object back to LayerData. Used by event handlers that
 * detect drag/resize/edit changes on the canvas.
 */
export function fabricObjectToLayer(
  obj: FabricObject,
  current?: LayerData
): Partial<LayerData> {
  const data: Record<string, unknown> = current
    ? { ...(current.data as Record<string, unknown>) }
    : {};
  const objLike = obj as unknown as {
    fill?: string;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
  };

  if ((current?.type === 'text' || obj.type === 'text' || obj.type === 'i-text') &&
    objLike.fill) {
    data.fill = objLike.fill;
    data.color = objLike.fill;
  }
  if (current?.type === 'text') {
    if (objLike.text !== undefined) data.text = objLike.text;
    if (objLike.fontSize) data.fontSize = objLike.fontSize;
    if (objLike.fontFamily) data.fontFamily = objLike.fontFamily;
    if (objLike.fontWeight) data.fontWeight = objLike.fontWeight;
    // Capture text effects (stroke + shadow) so the panel's mutations
    // round-trip through autosave.
    const fxLike = obj as unknown as {
      stroke?: string | null;
      strokeWidth?: number;
      shadow?: {
        color?: string;
        offsetX?: number;
        offsetY?: number;
        blur?: number;
      } | null;
    };
    if (fxLike.stroke !== undefined) data.stroke = fxLike.stroke ?? undefined;
    if (fxLike.strokeWidth !== undefined) data.strokeWidth = fxLike.strokeWidth;
    if (fxLike.shadow === null) {
      data.shadow = null;
    } else if (fxLike.shadow) {
      data.shadow = {
        enabled: true,
        color: fxLike.shadow.color ?? '#000000',
        offsetX: fxLike.shadow.offsetX ?? 0,
        offsetY: fxLike.shadow.offsetY ?? 0,
        blur: fxLike.shadow.blur ?? 0,
      } satisfies TextShadowEffect;
    }
  }
  if (current?.type === 'icon' && objLike.fill) {
    data.fill = objLike.fill;
    data.color = objLike.fill;
    if (objLike.fontSize) data.size = objLike.fontSize;
  }

  return {
    left: obj.left ?? 0,
    top: obj.top ?? 0,
    scaleX: obj.scaleX ?? 1,
    scaleY: obj.scaleY ?? 1,
    angle: obj.angle ?? 0,
    opacity: obj.opacity ?? 1,
    visible: obj.visible !== false,
    data,
  };
}

// Re-export Path constructor in case consumers need it (e.g. SVG icons).
export { FabricPath };

/**
 * Apply (or clear) a drop-shadow effect on a FabricObject. When the effect is
 * disabled or omitted, the shadow is removed. Centralised so the Effects UI
 * and the layer→fabric replay use exactly the same semantics.
 */
export function applyShadowEffectToFabricObject(
  obj: FabricObject,
  effect: TextShadowEffect | null | undefined
): void {
  if (!effect || !effect.enabled) {
    (obj as unknown as { set: (k: string, v: unknown) => void }).set(
      'shadow',
      null
    );
    return;
  }
  const shadow = new Shadow({
    color: effect.color || '#000000',
    offsetX: effect.offsetX ?? 0,
    offsetY: effect.offsetY ?? 0,
    blur: effect.blur ?? 0,
  });
  (obj as unknown as { set: (k: string, v: unknown) => void }).set(
    'shadow',
    shadow
  );
}

/**
 * Apply (or clear) a text outline (stroke) on a FabricObject. width === 0
 * clears the outline.
 */
export function applyOutlineEffectToFabricObject(
  obj: FabricObject,
  color: string,
  width: number
): void {
  const setter = (obj as unknown as {
    set: (k: string, v: unknown) => void;
  }).set;
  if (!width || width <= 0) {
    setter.call(obj, 'stroke', null);
    setter.call(obj, 'strokeWidth', 0);
    return;
  }
  setter.call(obj, 'stroke', color);
  setter.call(obj, 'strokeWidth', width);
}
