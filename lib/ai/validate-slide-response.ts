/**
 * Validation & normalization layer for AI-generated slide JSON.
 *
 * Ensures the AI response is structurally valid before it hits the database.
 */

import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { getAllBlockSchemas } from './block-schemas';

interface ValidationResult {
  valid: boolean;
  slide: PitchDeckSlideV2;
  warnings: string[];
}

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const RGBA_RE = /^rgba?\(/i;

function isValidColor(v: string): boolean {
  return HEX_RE.test(v) || RGBA_RE.test(v) || v.startsWith('linear-gradient') || v.startsWith('radial-gradient');
}

function ensureBlockId(block: Record<string, unknown>): string {
  if (typeof block.id === 'string' && block.id.length > 0) return block.id;
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function validateSlideResponse(
  raw: unknown,
  originalSlideId: string,
): ValidationResult {
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, slide: {} as PitchDeckSlideV2, warnings: ['Response is not an object'] };
  }

  const slide = raw as Record<string, unknown>;

  // Force original ID
  slide.id = originalSlideId;

  // Ensure label
  if (typeof slide.label !== 'string' || !slide.label) {
    slide.label = 'Untitled Slide';
    warnings.push('Missing slide label, defaulted to "Untitled Slide"');
  }

  // Ensure notes is string or undefined
  if (slide.notes !== undefined && typeof slide.notes !== 'string') {
    slide.notes = String(slide.notes);
  }

  // Validate blocks array
  if (!Array.isArray(slide.blocks)) {
    slide.blocks = [];
    warnings.push('Missing blocks array, defaulted to empty');
  }

  const knownTypes = new Set(getAllBlockSchemas().map((s) => s.type));

  const blocks = slide.blocks as Record<string, unknown>[];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || typeof block !== 'object') {
      warnings.push(`Block at index ${i} is not an object, removed`);
      blocks.splice(i, 1);
      i--;
      continue;
    }

    // Ensure ID
    block.id = ensureBlockId(block);

    // Ensure order
    block.order = i + 1;

    // Warn on unknown types (but keep them — might be custom)
    if (typeof block.type !== 'string') {
      warnings.push(`Block ${block.id} has no type, removed`);
      blocks.splice(i, 1);
      i--;
      continue;
    }

    if (!knownTypes.has(block.type as string)) {
      warnings.push(`Block "${block.id}" uses unknown type "${block.type}" — kept as-is`);
    }

    // Normalize style colors
    if (block.style && typeof block.style === 'object') {
      const style = block.style as Record<string, unknown>;
      for (const key of ['backgroundColor', 'color', 'borderColor'] as const) {
        const v = style[key];
        if (typeof v === 'string' && v && !isValidColor(v)) {
          warnings.push(`Block "${block.id}" style.${key}="${v}" is not a valid color`);
        }
      }
    }

    // Normalize elementStyles
    if (block.elementStyles && typeof block.elementStyles === 'object') {
      const es = block.elementStyles as Record<string, unknown>;
      for (const [elName, elStyle] of Object.entries(es)) {
        if (!elStyle || typeof elStyle !== 'object') {
          delete es[elName];
          warnings.push(`Block "${block.id}" elementStyles.${elName} is not an object, removed`);
        }
      }
    }
  }

  slide.blocks = blocks;

  return {
    valid: true,
    slide: slide as unknown as PitchDeckSlideV2,
    warnings,
  };
}
