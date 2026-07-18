/**
 * Unit tests for 4 utility lib files (batch 37c)
 *  1. lib/utils/responsive.ts
 *  2. lib/utils/responsiveCss.ts
 *  3. lib/utils/keyboardShortcuts.ts
 *  4. lib/utils/blockHistory.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  generateResponsivePaddingClasses,
  generateResponsiveMarginClasses,
  generateResponsiveVisibilityClasses,
  generateResponsiveTypographyClasses,
  getViewportWidth,
  combineResponsiveClasses,
} from '@/lib/utils/responsive';

import {
  generateResponsiveStyles,
  parseShorthandSide,
} from '@/lib/utils/responsiveCss';

import {
  EDITOR_SHORTCUTS,
  getShortcutsByCategory,
  formatShortcutKeys,
  getCategoryName,
} from '@/lib/utils/keyboardShortcuts';

import { BlockHistory } from '@/lib/utils/blockHistory';

import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// 1. responsive.ts
// ---------------------------------------------------------------------------
describe('lib/utils/responsive.ts', () => {
  describe('generateResponsivePaddingClasses', () => {
    it('returns empty string when spacing is undefined', () => {
      expect(generateResponsivePaddingClasses('top')).toBe('');
    });

    it('maps SpacingSize tokens for top direction', () => {
      const result = generateResponsivePaddingClasses('top', {
        mobile: 'sm',
        tablet: 'md',
        desktop: 'lg',
      });
      expect(result).toBe('pt-2 md:pt-4 lg:pt-6');
    });

    it('handles "all" direction with no suffix', () => {
      const result = generateResponsivePaddingClasses('all', {
        mobile: 'xs',
      });
      // Source emits `p<dir>` without a hyphen when dir is empty
      expect(result).toBe('p1');
    });

    it('falls through unknown spacing values', () => {
      const result = generateResponsivePaddingClasses('bottom', {
        mobile: '13px' as any,
      });
      expect(result).toBe('pb-13px');
    });

    it('supports x and y directions', () => {
      expect(
        generateResponsivePaddingClasses('x', { mobile: 'md', desktop: 'xl' })
      ).toBe('px-4 lg:px-8');
      expect(
        generateResponsivePaddingClasses('y', { tablet: '2xl' })
      ).toBe('md:py-12');
    });

    it('omits levels that are absent', () => {
      const result = generateResponsivePaddingClasses('top', {
        desktop: 'lg',
      });
      expect(result).toBe('lg:pt-6');
    });

    it('maps the "none" spacing to 0', () => {
      const result = generateResponsivePaddingClasses('all', { mobile: 'none' });
      // "all" omits hyphen; "none" maps to "0"
      expect(result).toBe('p0');
    });
  });

  describe('generateResponsiveMarginClasses', () => {
    it('returns empty string when spacing is undefined', () => {
      expect(generateResponsiveMarginClasses('top')).toBe('');
    });

    it('maps SpacingSize tokens', () => {
      const result = generateResponsiveMarginClasses('left', {
        mobile: 'md',
        tablet: 'lg',
        desktop: 'xl',
      });
      expect(result).toBe('ml-4 md:ml-6 lg:ml-8');
    });

    it('handles "all" direction with no suffix', () => {
      const result = generateResponsiveMarginClasses('all', { mobile: 'sm' });
      // Source emits `m<dir>` without a hyphen when dir is empty
      expect(result).toBe('m2');
    });

    it('passes through unknown values', () => {
      const result = generateResponsiveMarginClasses('right', {
        tablet: '99rem' as any,
      });
      expect(result).toBe('md:mr-99rem');
    });
  });

  describe('generateResponsiveVisibilityClasses', () => {
    it('returns empty string when visibility undefined', () => {
      expect(generateResponsiveVisibilityClasses()).toBe('');
    });

    it('hides on mobile only', () => {
      // mobile false → "hidden"; tablet undefined doesn't add anything
      const result = generateResponsiveVisibilityClasses({ mobile: false });
      // desktop !== false but tablet !== false branch handles md
      expect(result).toContain('hidden');
    });

    it('shows on mobile, hidden on tablet', () => {
      const result = generateResponsiveVisibilityClasses({
        mobile: true,
        tablet: false,
      });
      expect(result).toContain('block md:hidden');
    });

    it('hidden on tablet only', () => {
      const result = generateResponsiveVisibilityClasses({ tablet: false });
      expect(result).toContain('md:hidden');
    });

    it('hidden on mobile but shown on tablet', () => {
      const result = generateResponsiveVisibilityClasses({
        mobile: false,
        tablet: true,
      });
      expect(result).toContain('hidden md:block');
    });

    it('shown on tablet but hidden on desktop', () => {
      const result = generateResponsiveVisibilityClasses({
        tablet: true,
        desktop: false,
      });
      expect(result).toContain('lg:hidden');
    });

    it('hidden on desktop while tablet not explicitly hidden', () => {
      const result = generateResponsiveVisibilityClasses({ desktop: false });
      expect(result).toContain('lg:hidden');
    });

    it('hidden on tablet but shown on desktop', () => {
      const result = generateResponsiveVisibilityClasses({
        tablet: false,
        desktop: true,
      });
      expect(result).toContain('hidden lg:block');
    });
  });

  describe('generateResponsiveTypographyClasses', () => {
    it('returns empty string when typography undefined', () => {
      expect(generateResponsiveTypographyClasses()).toBe('');
    });

    it('emits classes for each breakpoint', () => {
      const result = generateResponsiveTypographyClasses({
        mobile: 'sm',
        tablet: 'lg',
        desktop: '2xl',
      });
      expect(result).toBe('text-sm md:text-lg lg:text-2xl');
    });

    it('only mobile size', () => {
      expect(generateResponsiveTypographyClasses({ mobile: 'base' })).toBe(
        'text-base'
      );
    });

    it('only desktop size', () => {
      expect(generateResponsiveTypographyClasses({ desktop: '6xl' })).toBe(
        'lg:text-6xl'
      );
    });
  });

  describe('getViewportWidth', () => {
    it('returns mobile width', () => {
      expect(getViewportWidth('mobile')).toBe(375);
    });
    it('returns tablet width', () => {
      expect(getViewportWidth('tablet')).toBe(768);
    });
    it('returns desktop width', () => {
      expect(getViewportWidth('desktop')).toBe(1440);
    });
    it('defaults to 1440 for unknown values', () => {
      expect(getViewportWidth('foo' as any)).toBe(1440);
    });
  });

  describe('combineResponsiveClasses (deprecated)', () => {
    it('is a no-op returning empty string', () => {
      expect(combineResponsiveClasses()).toBe('');
      expect(
        combineResponsiveClasses(
          { mobile: 'sm' },
          { mobile: 'md' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { mobile: true },
          { mobile: 'lg' }
        )
      ).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. responsiveCss.ts
// ---------------------------------------------------------------------------
describe('lib/utils/responsiveCss.ts', () => {
  function makeBlock(overrides: Partial<Block>): Block {
    return {
      id: 'b1',
      type: 'text',
      order: 0,
      content: 'hi',
      ...overrides,
    } as Block;
  }

  describe('parseShorthandSide', () => {
    it('returns null for undefined input', () => {
      expect(parseShorthandSide(undefined, 'top')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseShorthandSide('', 'top')).toBeNull();
    });

    it('returns null when only whitespace', () => {
      expect(parseShorthandSide('   ', 'left')).toBeNull();
    });

    it('handles 1-token shorthand (all sides)', () => {
      expect(parseShorthandSide('10px', 'top')).toBe('10px');
      expect(parseShorthandSide('10px', 'right')).toBe('10px');
      expect(parseShorthandSide('10px', 'bottom')).toBe('10px');
      expect(parseShorthandSide('10px', 'left')).toBe('10px');
    });

    it('handles 2-token shorthand (block / inline)', () => {
      expect(parseShorthandSide('10px 20px', 'top')).toBe('10px');
      expect(parseShorthandSide('10px 20px', 'bottom')).toBe('10px');
      expect(parseShorthandSide('10px 20px', 'right')).toBe('20px');
      expect(parseShorthandSide('10px 20px', 'left')).toBe('20px');
    });

    it('handles 3-token shorthand', () => {
      expect(parseShorthandSide('1px 2px 3px', 'top')).toBe('1px');
      expect(parseShorthandSide('1px 2px 3px', 'right')).toBe('2px');
      expect(parseShorthandSide('1px 2px 3px', 'left')).toBe('2px');
      expect(parseShorthandSide('1px 2px 3px', 'bottom')).toBe('3px');
    });

    it('handles 4-token shorthand', () => {
      expect(parseShorthandSide('1px 2px 3px 4px', 'top')).toBe('1px');
      expect(parseShorthandSide('1px 2px 3px 4px', 'right')).toBe('2px');
      expect(parseShorthandSide('1px 2px 3px 4px', 'bottom')).toBe('3px');
      expect(parseShorthandSide('1px 2px 3px 4px', 'left')).toBe('4px');
    });

    it('handles 5-token shorthand by falling into the 4+ branch', () => {
      // 5 tokens — uses the indexed lookup; index for 'top'=0
      expect(parseShorthandSide('1px 2px 3px 4px 5px', 'top')).toBe('1px');
    });

    it('collapses extra whitespace', () => {
      expect(parseShorthandSide('   1px    2px   ', 'top')).toBe('1px');
    });
  });

  describe('generateResponsiveStyles', () => {
    it('returns null when responsive is undefined', () => {
      expect(generateResponsiveStyles(makeBlock({}))).toBeNull();
    });

    it('returns null when responsive has no values', () => {
      expect(
        generateResponsiveStyles(makeBlock({ responsive: {} as any }))
      ).toBeNull();
    });

    it('generates css for mobile margin-top using SpacingSize token', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'b42',
          responsive: { marginTop: { mobile: 'md' } } as any,
        })
      );
      expect(result).not.toBeNull();
      expect(result!.className).toBe('bsr-b42');
      expect(result!.css).toContain('.bsr-b42{margin-top: 1rem}');
    });

    it('wraps tablet declarations in min-width 768px media query', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'x',
          responsive: { marginTop: { tablet: 'lg' } } as any,
        })
      );
      expect(result!.css).toContain('@media (min-width: 768px)');
      expect(result!.css).toContain('margin-top: 1.5rem');
    });

    it('wraps desktop declarations in min-width 1024px media query', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'd',
          responsive: { paddingLeft: { desktop: 'xl' } } as any,
        })
      );
      expect(result!.css).toContain('@media (min-width: 1024px)');
      expect(result!.css).toContain('padding-left: 2rem');
    });

    it('passes through custom px/% values verbatim', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'c',
          responsive: {
            marginBottom: { mobile: '37px' },
            paddingRight: { tablet: '25%' },
          } as any,
        })
      );
      expect(result!.css).toContain('margin-bottom: 37px');
      expect(result!.css).toContain('padding-right: 25%');
    });

    it('treats "none" → "0"', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'n',
          responsive: { paddingTop: { mobile: 'none' } } as any,
        })
      );
      expect(result!.css).toContain('padding-top: 0');
    });

    it('skips empty-string spacing values', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 's',
          responsive: { marginTop: { mobile: '' } } as any,
        })
      );
      // responsive.marginTop is truthy but the only value is empty → no decls.
      expect(result).toBeNull();
    });

    it('emits font-size and visibility:none', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'v',
          responsive: {
            fontSize: { mobile: 'lg', desktop: '2xl' },
            visibility: { tablet: false },
          } as any,
        })
      );
      expect(result!.css).toContain('font-size: 1.125rem');
      expect(result!.css).toContain('font-size: 1.5rem');
      expect(result!.css).toContain('display: none');
    });

    it('passes through custom font-size tokens', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'fz',
          responsive: { fontSize: { mobile: '42px' as any } } as any,
        })
      );
      expect(result!.css).toContain('font-size: 42px');
    });

    it('sanitizes block id with invalid characters', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'foo bar/baz!',
          responsive: { marginTop: { mobile: 'sm' } } as any,
        })
      );
      expect(result!.className).toBe('bsr-foobarbaz');
    });

    it('falls back to "noid" when block id missing', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: undefined as any,
          responsive: { marginTop: { mobile: 'sm' } } as any,
        })
      );
      expect(result!.className).toBe('bsr-noid');
    });

    it('handles all 8 margin/padding sides plus font-size + visibility', () => {
      const result = generateResponsiveStyles(
        makeBlock({
          id: 'all',
          responsive: {
            marginTop: { mobile: 'xs' },
            marginBottom: { mobile: 'sm' },
            marginLeft: { mobile: 'md' },
            marginRight: { mobile: 'lg' },
            paddingTop: { mobile: 'xl' },
            paddingBottom: { mobile: '2xl' },
            paddingLeft: { mobile: 'none' },
            paddingRight: { mobile: 'md' },
            fontSize: { mobile: 'base' },
            visibility: { mobile: false },
          } as any,
        })
      );
      const css = result!.css;
      expect(css).toContain('margin-top: 0.25rem');
      expect(css).toContain('margin-bottom: 0.5rem');
      expect(css).toContain('margin-left: 1rem');
      expect(css).toContain('margin-right: 1.5rem');
      expect(css).toContain('padding-top: 2rem');
      expect(css).toContain('padding-bottom: 3rem');
      expect(css).toContain('padding-left: 0');
      expect(css).toContain('padding-right: 1rem');
      expect(css).toContain('font-size: 1rem');
      expect(css).toContain('display: none');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. keyboardShortcuts.ts
// ---------------------------------------------------------------------------
describe('lib/utils/keyboardShortcuts.ts', () => {
  describe('EDITOR_SHORTCUTS', () => {
    it('exposes the expected shortcut keys', () => {
      expect(EDITOR_SHORTCUTS.undo.keys).toBe('mod+z');
      expect(EDITOR_SHORTCUTS.redo.keys).toBe('mod+shift+z');
      expect(EDITOR_SHORTCUTS.save.keys).toBe('mod+s');
      expect(EDITOR_SHORTCUTS.addBlock.keys).toBe('mod+enter');
      expect(EDITOR_SHORTCUTS.duplicateBlock.keys).toBe('mod+d');
      expect(EDITOR_SHORTCUTS.deleteBlock.keys).toBe('mod+backspace');
      expect(EDITOR_SHORTCUTS.moveBlockUp.keys).toBe('mod+shift+up');
      expect(EDITOR_SHORTCUTS.moveBlockDown.keys).toBe('mod+shift+down');
      expect(EDITOR_SHORTCUTS.selectPrevious.keys).toBe('up');
      expect(EDITOR_SHORTCUTS.selectNext.keys).toBe('down');
      expect(EDITOR_SHORTCUTS.deselectBlock.keys).toBe('esc');
      expect(EDITOR_SHORTCUTS.showShortcuts.keys).toBe('?');
      expect(EDITOR_SHORTCUTS.togglePreview.keys).toBe('mod+shift+p');
    });

    it('each shortcut has a description, category, and handler', () => {
      for (const sc of Object.values(EDITOR_SHORTCUTS)) {
        expect(typeof sc.description).toBe('string');
        expect(['editing', 'navigation', 'blocks', 'system']).toContain(
          sc.category
        );
        expect(typeof sc.handler).toBe('function');
        // Default handler is a no-op — should not throw.
        expect(() => sc.handler()).not.toThrow();
      }
    });
  });

  describe('getShortcutsByCategory', () => {
    it('groups every shortcut into its category', () => {
      const grouped = getShortcutsByCategory();
      expect(grouped.editing.length).toBeGreaterThan(0);
      expect(grouped.navigation.length).toBeGreaterThan(0);
      expect(grouped.blocks.length).toBeGreaterThan(0);
      expect(grouped.system.length).toBeGreaterThan(0);

      const total =
        grouped.editing.length +
        grouped.navigation.length +
        grouped.blocks.length +
        grouped.system.length;
      expect(total).toBe(Object.keys(EDITOR_SHORTCUTS).length);
    });

    it('places undo into editing', () => {
      const grouped = getShortcutsByCategory();
      const keys = grouped.editing.map((s) => s.keys);
      expect(keys).toContain('mod+z');
    });

    it('places selectPrevious into navigation', () => {
      const grouped = getShortcutsByCategory();
      const keys = grouped.navigation.map((s) => s.keys);
      expect(keys).toContain('up');
    });
  });

  describe('formatShortcutKeys', () => {
    const origNav = (globalThis as any).navigator;

    afterEach(() => {
      // Restore navigator after each test
      if (origNav === undefined) {
        // can't truly delete from globalThis cleanly across runtimes
        try {
          (globalThis as any).navigator = undefined;
        } catch {
          /* ignore */
        }
      } else {
        (globalThis as any).navigator = origNav;
      }
    });

    function setPlatform(platform: string) {
      Object.defineProperty(globalThis, 'navigator', {
        value: { platform },
        configurable: true,
        writable: true,
      });
    }

    it('formats Mac shortcuts using glyphs joined without "+"', () => {
      setPlatform('MacIntel');
      expect(formatShortcutKeys('mod+z')).toBe('⌘Z');
      expect(formatShortcutKeys('mod+shift+z')).toBe('⌘⇧Z');
      expect(formatShortcutKeys('mod+alt+s')).toBe('⌘⌥S');
      expect(formatShortcutKeys('ctrl+enter')).toBe('⌃↵');
      expect(formatShortcutKeys('mod+backspace')).toBe('⌘⌫');
    });

    it('formats Windows shortcuts using "+" join and Ctrl/Shift/Alt', () => {
      setPlatform('Win32');
      expect(formatShortcutKeys('mod+z')).toBe('Ctrl+Z');
      expect(formatShortcutKeys('mod+shift+z')).toBe('Ctrl+Shift+Z');
      expect(formatShortcutKeys('alt+enter')).toBe('Alt+Enter');
      expect(formatShortcutKeys('ctrl+backspace')).toBe('Ctrl+Backspace');
    });

    it('maps arrow + esc keys', () => {
      setPlatform('Win32');
      expect(formatShortcutKeys('up')).toBe('↑');
      expect(formatShortcutKeys('down')).toBe('↓');
      expect(formatShortcutKeys('left')).toBe('←');
      expect(formatShortcutKeys('right')).toBe('→');
      expect(formatShortcutKeys('esc')).toBe('Esc');
    });

    it('uppercases unknown keys', () => {
      setPlatform('Win32');
      expect(formatShortcutKeys('a')).toBe('A');
      expect(formatShortcutKeys('?')).toBe('?');
    });
  });

  describe('getCategoryName', () => {
    it('returns the display name for each category', () => {
      expect(getCategoryName('editing')).toBe('Editing');
      expect(getCategoryName('navigation')).toBe('Navigation');
      expect(getCategoryName('blocks')).toBe('Blocks');
      expect(getCategoryName('system')).toBe('System');
    });
  });
});

// ---------------------------------------------------------------------------
// 4. blockHistory.ts
// ---------------------------------------------------------------------------
describe('lib/utils/blockHistory.ts (BlockHistory)', () => {
  function makeBlocks(n: number): Block[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `b${i}`,
      type: 'text',
      order: i,
      content: `block-${i}`,
    })) as Block[];
  }

  let history: BlockHistory;

  beforeEach(() => {
    history = new BlockHistory();
  });

  it('constructor accepts a custom maxSize', () => {
    const h = new BlockHistory(3);
    h.push(makeBlocks(1), { type: 'add', description: '1' });
    h.push(makeBlocks(2), { type: 'add', description: '2' });
    h.push(makeBlocks(3), { type: 'add', description: '3' });
    h.push(makeBlocks(4), { type: 'add', description: '4' });
    // Past should be trimmed to 3.
    expect(h.size().past).toBe(3);
  });

  it('push() stores entries and clears the future stack', () => {
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    history.push(makeBlocks(2), { type: 'modify', description: 'b' });
    // Manually populate future via undo/redo, then push to clear it.
    history.undo();
    expect(history.size().future).toBe(1);
    history.push(makeBlocks(3), { type: 'add', description: 'c' });
    expect(history.size().future).toBe(0);
  });

  it('push() respects maxSize and drops oldest entries', () => {
    const h = new BlockHistory(2);
    h.push(makeBlocks(1), { type: 'add', description: '1' });
    h.push(makeBlocks(1), { type: 'add', description: '2' });
    h.push(makeBlocks(1), { type: 'add', description: '3' });
    expect(h.size().past).toBe(2);
    expect(h.getLastAction()).toBe('3');
  });

  it('push() accepts optional affected ids and pageSettings (deep clone)', () => {
    const blocks = makeBlocks(2);
    const pageSettings = { backgroundColor: '#fff' };
    history.push(blocks, { type: 'modify', description: 'x' }, ['b0'], pageSettings);
    // Mutate the original pageSettings — clone should be unaffected.
    pageSettings.backgroundColor = '#000';
    // Undo from a single-entry past returns the empty-state fallback.
    const res = history.undo();
    expect(res).toBeDefined();
    // future now holds 1 — we can redo back.
    const redone = history.redo();
    expect(redone!.pageSettings?.backgroundColor).toBe('#fff');
  });

  it('undo() returns undefined when past is empty', () => {
    expect(history.undo()).toBeUndefined();
  });

  it('undo() from single-entry past returns the empty-state fallback', () => {
    history.push(makeBlocks(2), { type: 'add', description: 'first' });
    const result = history.undo();
    expect(result).toBeDefined();
    expect(result!.blocks).toEqual([]);
    expect(result!.action.description).toBe('Initial state');
  });

  it('undo() with multiple entries returns prior state and the popped action', () => {
    history.push(makeBlocks(1), { type: 'add', description: 'first' });
    history.push(makeBlocks(2), { type: 'modify', description: 'second' });
    const result = history.undo();
    expect(result).toBeDefined();
    expect(result!.blocks.length).toBe(1);
    expect(result!.action.description).toBe('second');
  });

  it('redo() returns undefined when future is empty', () => {
    expect(history.redo()).toBeUndefined();
  });

  it('redo() restores the entry popped by undo()', () => {
    history.push(makeBlocks(1), { type: 'add', description: '1' });
    history.push(makeBlocks(2), { type: 'modify', description: '2' });
    history.undo();
    const redone = history.redo();
    expect(redone).toBeDefined();
    expect(redone!.blocks.length).toBe(2);
    expect(redone!.action.description).toBe('2');
  });

  it('canUndo() requires at least 2 entries', () => {
    expect(history.canUndo()).toBe(false);
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    expect(history.canUndo()).toBe(false);
    history.push(makeBlocks(2), { type: 'add', description: 'b' });
    expect(history.canUndo()).toBe(true);
  });

  it('canRedo() reflects future stack size', () => {
    expect(history.canRedo()).toBe(false);
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    history.push(makeBlocks(2), { type: 'add', description: 'b' });
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.redo();
    expect(history.canRedo()).toBe(false);
  });

  it('clear() empties past and future', () => {
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    history.push(makeBlocks(2), { type: 'add', description: 'b' });
    history.undo();
    history.clear();
    expect(history.size()).toEqual({ past: 0, future: 0 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('size() reports counts for past and future', () => {
    expect(history.size()).toEqual({ past: 0, future: 0 });
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    history.push(makeBlocks(2), { type: 'add', description: 'b' });
    expect(history.size()).toEqual({ past: 2, future: 0 });
    history.undo();
    expect(history.size()).toEqual({ past: 1, future: 1 });
  });

  it('getLastAction() returns null when past is empty', () => {
    expect(history.getLastAction()).toBeNull();
  });

  it('getLastAction() returns the top-of-past description', () => {
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    history.push(makeBlocks(2), { type: 'modify', description: 'b' });
    expect(history.getLastAction()).toBe('b');
  });

  it('getNextAction() returns null when future is empty', () => {
    expect(history.getNextAction()).toBeNull();
  });

  it('getNextAction() returns the top-of-future description', () => {
    history.push(makeBlocks(1), { type: 'add', description: 'a' });
    history.push(makeBlocks(2), { type: 'modify', description: 'b' });
    history.undo();
    expect(history.getNextAction()).toBe('b');
  });

  it('push() snapshots blocks via immer (returned state is frozen)', () => {
    const blocks = makeBlocks(1);
    history.push(blocks, { type: 'add', description: 'first' });
    history.push(makeBlocks(2), { type: 'add', description: 'second' });
    const result = history.undo();
    // Undo should return the previous snapshot, not mutated state.
    expect(result!.blocks).toHaveLength(1);
    expect((result!.blocks[0] as any).content).toBe('block-0');
    // The snapshot is frozen by immer's produce — mutation throws.
    expect(() => {
      (result!.blocks[0] as any).content = 'mutated';
    }).toThrow();
  });
});
