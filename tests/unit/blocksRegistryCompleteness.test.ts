import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BLOCK_ICONS } from '@/lib/utils/blockIcons';
import { EMAIL_BLOCK_TYPES } from '@/lib/email/email-block-types';
import type { BlockType } from '@/types/blocks';

/**
 * Drift-detection test: every block type in the Block union must be wired
 * through the production renderer, the visual-editor picker, and (for
 * AI/external consumers) the /api/blocks metadata endpoint.
 *
 * BLOCK_ICONS is `Record<BlockType, LucideIcon>` — TypeScript's exhaustiveness
 * check guarantees it covers every type. We use it as the source of truth.
 */

// Source of truth — typesafe via Record<BlockType, ...>
const ALL_BLOCK_TYPES = Object.keys(BLOCK_ICONS) as BlockType[];

// Block types intentionally excluded from the website block picker. Each gets
// a comment explaining the editing surface where it IS available.
const NOT_USER_PICKABLE: ReadonlySet<BlockType> = new Set<BlockType>([
  // Email-editor-only (see lib/email/email-block-types.ts → EMAIL_BLOCK_TYPES)
  'email-header',
  'email-footer',

  // Pitch-deck-only (added via the deck slide editor, not the website editor)
  'survey-input',
  'deck-next-slide',
  'deck-jump-to',

  // Site-specific custom block — only used by the Palizzi tenant
  'palizzi-nav',
  'palizzi-hero',
  'palizzi-welcome',
  'palizzi-history',
  'palizzi-menu',
  'palizzi-rules',
  'palizzi-membership',
  'palizzi-footer',
]);

const REPO_ROOT = join(__dirname, '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
}

function extractRenderCases(): Set<string> {
  const content = readRepoFile('components/blocks/render/BlockRenderer.tsx');
  const matches = content.matchAll(/case '([a-z][a-z0-9-]*)':/g);
  return new Set(Array.from(matches, m => m[1]));
}

function extractPickerTypes(): Set<string> {
  // Matches `{ type: 'foo', label: 'Foo', ...` entries in BUILT_IN_BLOCK_TYPES.
  // The canonical registry is now lib/blocks/registry.ts; VisualEditorShell.tsx
  // imports from there (refactor: audit decisions #8/#11).
  const content = readRepoFile('lib/blocks/registry.ts');
  const matches = content.matchAll(/type:\s+'([a-z][a-z0-9-]*)',\s+label:/g);
  return new Set(Array.from(matches, m => m[1]));
}

function extractApiBlockTypes(): Set<string> {
  // Matches `{ type: 'foo', name: 'Foo', ...` entries in /api/blocks. The
  // `name:` follow-on disambiguates block entries from `type: 'string'`
  // entries inside the nested `inputs:` arrays.
  const content = readRepoFile('app/api/blocks/route.ts');
  const matches = content.matchAll(/type:\s+'([a-z][a-z0-9-]*)',\s+name:/g);
  return new Set(Array.from(matches, m => m[1]));
}

function extractVisualPreviewCases(): Set<string> {
  const content = readRepoFile('components/blocks/visual/VisualBlockPreview.tsx');
  const matches = content.matchAll(/case '([a-z][a-z0-9-]*)':/g);
  return new Set(Array.from(matches, m => m[1]));
}

describe('Block registry drift detection', () => {
  it('every block type in BLOCK_ICONS has a production renderer case', () => {
    const cases = extractRenderCases();
    const missing = ALL_BLOCK_TYPES.filter(t => !cases.has(t));
    expect(
      missing,
      `BlockRenderer.tsx is missing case arms for: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every user-pickable block is in BUILT_IN_BLOCK_TYPES (visual editor picker)', () => {
    const pickerTypes = extractPickerTypes();
    const userPickable = ALL_BLOCK_TYPES.filter(t => !NOT_USER_PICKABLE.has(t));
    const missing = userPickable.filter(t => !pickerTypes.has(t));
    expect(
      missing,
      `BUILT_IN_BLOCK_TYPES (lib/blocks/registry.ts) is missing entries for: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every block in BUILT_IN_BLOCK_TYPES is also a real BlockType (no orphans)', () => {
    const pickerTypes = extractPickerTypes();
    const orphans = Array.from(pickerTypes).filter(
      t => !ALL_BLOCK_TYPES.includes(t as BlockType),
    );
    expect(
      orphans,
      `BUILT_IN_BLOCK_TYPES (lib/blocks/registry.ts) has entries that aren't in the Block union: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('every user-pickable block is documented in /api/blocks metadata', () => {
    const apiTypes = extractApiBlockTypes();
    const userPickable = ALL_BLOCK_TYPES.filter(t => !NOT_USER_PICKABLE.has(t));
    const missing = userPickable.filter(t => !apiTypes.has(t));
    expect(
      missing,
      `app/api/blocks/route.ts is missing entries for: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('EMAIL_BLOCK_TYPES only contains real BlockTypes', () => {
    const orphans = EMAIL_BLOCK_TYPES.filter(t => !ALL_BLOCK_TYPES.includes(t));
    expect(orphans, `EMAIL_BLOCK_TYPES has unknown types: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every user-pickable block has a VisualBlockPreview case (so it shows in the editor)', () => {
    const cases = extractVisualPreviewCases();
    const userPickable = ALL_BLOCK_TYPES.filter(t => !NOT_USER_PICKABLE.has(t));
    const missing = userPickable.filter(t => !cases.has(t));
    expect(
      missing,
      `VisualBlockPreview.tsx is missing case arms for: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
