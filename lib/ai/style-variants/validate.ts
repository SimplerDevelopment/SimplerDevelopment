/**
 * Output validator for the AI Style Picker.
 *
 * Takes whatever the model returned (already JSON-parsed), the same style
 * surface that was given to the prompt builder, and the brand context, and
 * produces a clean, applyable result. Strategy:
 *
 *  - Drop unknown / out-of-surface keys silently — don't fight the model over
 *    a single unrecognized property when the rest of the variant is fine.
 *  - Drop values that fail enum / type checks for the same reason.
 *  - In brand-respect mode (default), drop brand-managed keys whose values
 *    aren't on-brand. The variant still applies; it just inherits the brand.
 *  - Throw only when the response shape is fundamentally wrong (no variants
 *    at all, all three are empty after stripping, etc.) — at that point a
 *    retry or surfacing the error to the user is the right call.
 *
 * Pure: no DB, no network, no React.
 */

import type { BlockStyle } from '@/types/blocks';
import type { BlockStyleSurface, StyleKeySpec, StyleKeyMap } from './style-surface';
import type { BrandStyleContext } from './prompt';

export interface ValidatedVariant {
  philosophyId: string;
  label: string;
  rationale: string;
  propsDelta: {
    style?: Partial<BlockStyle>;
    elementStyles?: Record<string, Partial<BlockStyle>>;
  };
}

export interface ValidationResult {
  variants: ValidatedVariant[];
  /** Per-variant counts of dropped keys, for logging / debugging. */
  diagnostics: Array<{ index: number; droppedKeys: string[] }>;
}

export class StyleVariantsValidationError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = 'StyleVariantsValidationError';
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function validateStyleVariantsResponse(
  raw: unknown,
  surface: BlockStyleSurface,
  brand: BrandStyleContext,
  exploreOutsideBrand: boolean,
): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    throw new StyleVariantsValidationError('Response is not an object', raw);
  }
  const arr = (raw as { variants?: unknown }).variants;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new StyleVariantsValidationError('Response missing variants array', raw);
  }

  const cleaned: ValidatedVariant[] = [];
  const diagnostics: ValidationResult['diagnostics'] = [];

  arr.forEach((v, i) => {
    if (!v || typeof v !== 'object') return;
    const variant = v as {
      philosophyId?: unknown;
      label?: unknown;
      rationale?: unknown;
      propsDelta?: unknown;
    };
    const propsDeltaRaw = (variant.propsDelta && typeof variant.propsDelta === 'object'
      ? variant.propsDelta
      : {}) as { style?: unknown; elementStyles?: unknown };

    const dropped: string[] = [];
    const cleanedStyle = cleanStyleObject(propsDeltaRaw.style, surface.wrapperStyle, brand, exploreOutsideBrand, dropped, 'style');

    const cleanedElementStyles: Record<string, Partial<BlockStyle>> = {};
    if (propsDeltaRaw.elementStyles && typeof propsDeltaRaw.elementStyles === 'object') {
      const es = propsDeltaRaw.elementStyles as Record<string, unknown>;
      for (const [elementName, elementStyles] of Object.entries(es)) {
        const elementSurface = surface.elementStyles[elementName];
        if (!elementSurface) {
          dropped.push(`elementStyles.${elementName} (unknown element)`);
          continue;
        }
        const elementClean = cleanStyleObject(elementStyles, elementSurface, brand, exploreOutsideBrand, dropped, `elementStyles.${elementName}`);
        if (elementClean && Object.keys(elementClean).length > 0) {
          cleanedElementStyles[elementName] = elementClean;
        }
      }
    }

    const hasAnyChange =
      (cleanedStyle && Object.keys(cleanedStyle).length > 0) ||
      Object.keys(cleanedElementStyles).length > 0;
    if (!hasAnyChange) {
      diagnostics.push({ index: i, droppedKeys: dropped.length ? dropped : ['(empty after cleaning)'] });
      return;
    }

    cleaned.push({
      philosophyId: typeof variant.philosophyId === 'string' ? variant.philosophyId : `variant-${i + 1}`,
      label: typeof variant.label === 'string' && variant.label.length > 0 ? variant.label : `Variant ${i + 1}`,
      rationale: typeof variant.rationale === 'string' ? variant.rationale : '',
      propsDelta: {
        ...(cleanedStyle && Object.keys(cleanedStyle).length ? { style: cleanedStyle } : {}),
        ...(Object.keys(cleanedElementStyles).length ? { elementStyles: cleanedElementStyles } : {}),
      },
    });
    diagnostics.push({ index: i, droppedKeys: dropped });
  });

  if (cleaned.length === 0) {
    throw new StyleVariantsValidationError('All variants empty after cleaning', { diagnostics });
  }
  return { variants: cleaned, diagnostics };
}

// ─── Cleaning a single style object against a key map ────────────────────────

function cleanStyleObject(
  input: unknown,
  keyMap: StyleKeyMap,
  brand: BrandStyleContext,
  exploreOutsideBrand: boolean,
  dropped: string[],
  pathPrefix: string,
): Partial<BlockStyle> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const spec = keyMap[key as keyof BlockStyle];
    if (!spec) {
      dropped.push(`${pathPrefix}.${key} (unknown key)`);
      continue;
    }
    if (typeof value !== 'string' || value.length === 0) {
      dropped.push(`${pathPrefix}.${key} (non-string)`);
      continue;
    }
    if (!isValidValue(value, spec)) {
      dropped.push(`${pathPrefix}.${key} (invalid value: "${value}")`);
      continue;
    }
    if (!exploreOutsideBrand && spec.brandManaged && !respectsBrand(key, value, spec, brand)) {
      dropped.push(`${pathPrefix}.${key} (off-brand: "${value}")`);
      continue;
    }
    out[key] = value;
  }
  return out as Partial<BlockStyle>;
}

// ─── Value-level validators ──────────────────────────────────────────────────

function isValidValue(value: string, spec: StyleKeySpec): boolean {
  if (spec.enumValues && spec.enumValues.length > 0) {
    return spec.enumValues.includes(value);
  }
  switch (spec.type) {
    case 'css-color':
      return isCssColor(value);
    case 'css-length':
      return isCssLength(value);
    case 'css-number':
      return /^-?\d+(\.\d+)?$/.test(value);
    case 'css-shadow':
      return value.length < 200 && /(?:rgb|rgba|hsl|hsla|#|inset|none)/i.test(value);
    case 'css-gradient':
      return /^(?:linear|radial|conic)-gradient\(/i.test(value);
    case 'css-string':
    case 'enum':
      return true;
    default:
      return true;
  }
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\([\d\s.,%/]+\)$/i;
const HSL_RE = /^hsla?\([\d\s.,%/]+\)$/i;
const NAMED_COLORS = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'black', 'white']);

function isCssColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS.has(v)) return true;
  if (HEX_RE.test(v)) return true;
  if (RGB_RE.test(v)) return true;
  if (HSL_RE.test(v)) return true;
  return false;
}

function isCssLength(value: string): boolean {
  const v = value.trim();
  if (v === '0' || v === 'auto' || v === 'inherit' || v === 'unset') return true;
  if (/^calc\(.+\)$/i.test(v)) return true;
  if (/^clamp\(.+\)$/i.test(v)) return true;
  if (/^min\(.+\)$/i.test(v)) return true;
  if (/^max\(.+\)$/i.test(v)) return true;
  // Allow shorthand like "8rem 2rem" — every token must be a length-like
  return v.split(/\s+/).every((t) => /^-?\d+(\.\d+)?(px|rem|em|vh|vw|svh|svw|dvh|dvw|%|ch|ex|pt)?$/i.test(t));
}

// ─── Brand-respect checks ────────────────────────────────────────────────────

function respectsBrand(
  key: string,
  value: string,
  spec: StyleKeySpec,
  brand: BrandStyleContext,
): boolean {
  // Color-typed brand-managed keys
  if (spec.type === 'css-color' || (spec.enumValues === undefined && /color/i.test(key))) {
    return isOnBrandColor(value, brand);
  }
  // Font family
  if (key === 'fontFamily') {
    return isOnBrandFont(value, brand);
  }
  // Border radius
  if (key === 'borderRadius') {
    return isOnBrandRadius(value, brand);
  }
  // Gradient — must reference at least one brand color
  if (spec.type === 'css-gradient') {
    return gradientUsesBrandColor(value, brand);
  }
  // Default: trust it
  return true;
}

function normalizeHex(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v.startsWith('#')) return null;
  v = v.slice(1);
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  if (v.length === 6 || v.length === 8) return '#' + v.slice(0, 6);
  return null;
}

/** True if hex represents a near-grayscale neutral (R≈G≈B). */
function isNeutral(hex: string): boolean {
  const norm = normalizeHex(hex);
  if (!norm) return false;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min <= 12; // tolerance — real "neutrals" rarely vary >12 across channels
}

export function isOnBrandColor(value: string, brand: BrandStyleContext): boolean {
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS.has(v)) return true;
  const norm = normalizeHex(value);
  if (!norm) {
    // rgb/hsl values — parse and convert to hex for comparison
    const fromFunc = parseRgbOrHslToHex(value);
    if (!fromFunc) return false;
    return brandColorsHexes(brand).has(fromFunc) || isNeutral(fromFunc);
  }
  return brandColorsHexes(brand).has(norm) || isNeutral(norm);
}

function brandColorsHexes(brand: BrandStyleContext): Set<string> {
  const out = new Set<string>();
  for (const c of [brand.primaryColor, brand.accentColor, brand.backgroundColor, brand.textColor]) {
    if (!c) continue;
    const n = normalizeHex(c);
    if (n) out.add(n);
  }
  return out;
}

function parseRgbOrHslToHex(value: string): string | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const r = Math.min(255, parseInt(m[1], 10));
  const g = Math.min(255, parseInt(m[2], 10));
  const b = Math.min(255, parseInt(m[3], 10));
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return hex;
}

function isOnBrandFont(value: string, brand: BrandStyleContext): boolean {
  const v = value.toLowerCase();
  // Inherits / system fallbacks always allowed
  if (/^(inherit|initial|unset|system-ui|-apple-system|sans-serif|serif|monospace)$/i.test(v.trim())) return true;
  const heading = (brand.headingFont || '').toLowerCase();
  const body = (brand.bodyFont || '').toLowerCase();
  // Substring match — CSS font-family often includes quotes + fallbacks
  const families = v.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  if (families.length === 0) return false;
  const primary = families[0];
  if (heading && heading.toLowerCase().includes(primary)) return true;
  if (body && body.toLowerCase().includes(primary)) return true;
  if (primary && (heading.includes(primary) || body.includes(primary))) return true;
  return false;
}

function parseLengthPx(value: string): number | null {
  const v = value.trim();
  if (v === '0') return 0;
  const m = v.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'px').toLowerCase();
  if (unit === 'px') return n;
  if (unit === 'rem' || unit === 'em') return n * 16;
  return null;
}

function isOnBrandRadius(value: string, brand: BrandStyleContext): boolean {
  // Always allow 0 (sharp / brutalist) and pill-like extremes
  const px = parseLengthPx(value);
  if (px === null) return true; // unparseable but valid CSS — let it through
  if (px === 0) return true;
  if (px >= 9999 || px === 999 || px === 999.5) return true; // pill
  const brandPx = brand.borderRadius ? parseLengthPx(brand.borderRadius) : null;
  if (brandPx === null) return true; // no brand radius set — anything goes
  // ±50% range from brand
  const lo = brandPx * 0.5;
  const hi = brandPx * 1.5;
  return px >= lo && px <= hi;
}

function gradientUsesBrandColor(value: string, brand: BrandStyleContext): boolean {
  const brandHexes = brandColorsHexes(brand);
  const lower = value.toLowerCase();
  for (const hex of brandHexes) {
    if (lower.includes(hex)) return true;
    // Also check shortened form (#abcabc → #abc when channels duplicate)
  }
  return false;
}
