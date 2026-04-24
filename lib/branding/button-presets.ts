/**
 * Resolve a branded button preset into concrete CSSProperties, handling brand
 * sentinels ("brand.primary" → "var(--brand-primary)").
 *
 * Pure: no DOM, no DB. Safe to call from client, server, or edge.
 */

import type { CSSProperties } from 'react';
import type { BrandButtonPreset } from '@/lib/branding-types';
import { resolveBrandSentinel } from './sentinel';

/** Convert a preset to inline styles applied by ButtonBlockRender. */
export function presetToStyle(preset: BrandButtonPreset): CSSProperties {
  const s: CSSProperties = {};
  if (preset.backgroundColor) s.backgroundColor = resolveBrandSentinel(preset.backgroundColor);
  if (preset.color) s.color = resolveBrandSentinel(preset.color);
  if (preset.borderColor) s.borderColor = resolveBrandSentinel(preset.borderColor);
  if (preset.borderWidth) s.borderWidth = preset.borderWidth;
  if (preset.borderStyle) s.borderStyle = preset.borderStyle;
  if (preset.borderRadius) s.borderRadius = resolveBrandSentinel(preset.borderRadius);
  if (preset.fontWeight) s.fontWeight = preset.fontWeight;
  if (preset.textTransform) s.textTransform = preset.textTransform;
  if (preset.letterSpacing) s.letterSpacing = preset.letterSpacing;
  if (preset.paddingX || preset.paddingY) {
    s.paddingTop = preset.paddingY;
    s.paddingBottom = preset.paddingY;
    s.paddingLeft = preset.paddingX;
    s.paddingRight = preset.paddingX;
  }
  return s;
}

/** Lookup a preset by ID from a ResolvedBranding-shaped input. */
export function findPreset(
  presets: BrandButtonPreset[] | undefined,
  presetId: string | undefined,
): BrandButtonPreset | undefined {
  if (!presets || !presetId) return undefined;
  return presets.find((p) => p.id === presetId);
}

/** Generate a stable UUID for a new preset. crypto.randomUUID works on modern browsers + Node 19+. */
export function newPresetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback — good enough for a transient client-side form
  return `preset_${Math.random().toString(36).slice(2, 11)}`;
}

/** Default preset blueprint for "Add preset" in the editor. */
export function createDefaultPreset(count: number): BrandButtonPreset {
  return {
    id: newPresetId(),
    name: count === 0 ? 'Primary' : `Preset ${count + 1}`,
    backgroundColor: 'brand.primary',
    color: '#ffffff',
    borderRadius: 'brand.btnRadius',
  };
}
