/**
 * Baseline shape lock for `lib/blocks/registry.ts`.
 *
 * Pairs with the types/blocks refactor — the registry's `BlockType` import
 * comes from `@/types/blocks`, so renaming or losing an exported type would
 * surface here as either a compile error or a count drift.
 */
import { describe, it, expect } from 'vitest';

import {
  BUILT_IN_BLOCK_TYPES,
  POST_CONTENT_PICKER_ENTRY,
  type BlockRegistryEntry,
} from '@/lib/blocks/registry';

describe('lib/blocks/registry shape', () => {
  it('exposes the expected number of built-in entries', () => {
    expect(BUILT_IN_BLOCK_TYPES.length).toBe(47);
  });

  it('every entry has the canonical 5-field shape', () => {
    for (const entry of BUILT_IN_BLOCK_TYPES) {
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.icon).toBe('string');
      expect(typeof entry.category).toBe('string');
      expect(typeof entry.description).toBe('string');
    }
  });

  it('entry types are unique', () => {
    const seen = new Set<string>();
    for (const entry of BUILT_IN_BLOCK_TYPES) {
      expect(seen.has(entry.type)).toBe(false);
      seen.add(entry.type);
    }
  });

  it('post-content picker entry is structured the same way', () => {
    const e: BlockRegistryEntry = POST_CONTENT_PICKER_ENTRY;
    expect(e.type).toBe('post-content');
    expect(e.category).toBe('Layout');
  });

  it('uses categories from the canonical set', () => {
    const expected = new Set([
      'Basic', 'Media', 'Layout', 'Components', 'eCommerce', 'Interactive',
    ]);
    for (const entry of BUILT_IN_BLOCK_TYPES) {
      expect(expected.has(entry.category)).toBe(true);
    }
  });
});
