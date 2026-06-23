import type { IconLayerData, LayerData, TextLayerData } from './types';

/**
 * Canonical key for the per-tint fill override map. Lower-cases the hex so
 * '#FFFFFF' and '#ffffff' collide, and maps null (no tint) → the literal
 * 'none' so the map can be indexed without special-casing.
 */
export function tintKey(tint: string | null | undefined): string {
  if (!tint) return 'none';
  return tint.toLowerCase();
}

/**
 * Returns the fill colour that should be applied to a text or icon layer
 * given the active mockup tint. Falls back to the base `fill` when no
 * override is set for the current tint, and returns null for non-text/icon
 * layer types since image layers don't have a tint-aware fill.
 */
export function resolveLayerFill(
  layer: Pick<LayerData, 'type' | 'data'>,
  tint: string | null | undefined,
): string | null {
  if (layer.type !== 'text' && layer.type !== 'icon') return null;
  const data = layer.data as Partial<TextLayerData & IconLayerData>;
  const base = data.fill ?? data.color ?? null;
  const overrides = data.fillByTint;
  if (overrides) {
    const key = tintKey(tint);
    if (typeof overrides[key] === 'string') return overrides[key];
  }
  return base;
}
