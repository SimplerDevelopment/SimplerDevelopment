import { KeyboardShortcut, ShortcutCategory } from '@/types/blocks';

/**
 * Comprehensive keyboard shortcuts for the block editor
 *
 * Note: "mod" automatically maps to Cmd on Mac, Ctrl on Windows/Linux
 */
export const EDITOR_SHORTCUTS: Record<string, KeyboardShortcut> = {
  // Editing shortcuts
  undo: {
    keys: 'mod+z',
    description: 'Undo last action',
    category: 'editing',
    handler: () => {}, // Will be overridden by component
  },
  redo: {
    keys: 'mod+shift+z',
    description: 'Redo last action',
    category: 'editing',
    handler: () => {},
  },
  save: {
    keys: 'mod+s',
    description: 'Save changes',
    category: 'editing',
    handler: () => {},
  },

  // Block shortcuts
  addBlock: {
    keys: 'mod+enter',
    description: 'Add new block below',
    category: 'blocks',
    handler: () => {},
  },
  duplicateBlock: {
    keys: 'mod+d',
    description: 'Duplicate selected block',
    category: 'blocks',
    handler: () => {},
  },
  deleteBlock: {
    keys: 'mod+backspace',
    description: 'Delete selected block',
    category: 'blocks',
    handler: () => {},
  },
  moveBlockUp: {
    keys: 'mod+shift+up',
    description: 'Move block up',
    category: 'blocks',
    handler: () => {},
  },
  moveBlockDown: {
    keys: 'mod+shift+down',
    description: 'Move block down',
    category: 'blocks',
    handler: () => {},
  },

  // Navigation shortcuts
  selectPrevious: {
    keys: 'up',
    description: 'Select previous block',
    category: 'navigation',
    handler: () => {},
  },
  selectNext: {
    keys: 'down',
    description: 'Select next block',
    category: 'navigation',
    handler: () => {},
  },
  deselectBlock: {
    keys: 'esc',
    description: 'Deselect current block',
    category: 'navigation',
    handler: () => {},
  },

  // System shortcuts
  showShortcuts: {
    keys: '?',
    description: 'Show keyboard shortcuts',
    category: 'system',
    handler: () => {},
  },
  togglePreview: {
    keys: 'mod+shift+p',
    description: 'Toggle preview mode',
    category: 'system',
    handler: () => {},
  },
};

/**
 * Get shortcuts grouped by category
 */
export function getShortcutsByCategory(): Record<ShortcutCategory, KeyboardShortcut[]> {
  const grouped: Record<ShortcutCategory, KeyboardShortcut[]> = {
    editing: [],
    navigation: [],
    blocks: [],
    system: [],
  };

  Object.values(EDITOR_SHORTCUTS).forEach((shortcut) => {
    grouped[shortcut.category].push(shortcut);
  });

  return grouped;
}

/**
 * Format keyboard shortcut for display
 * Converts "mod+z" to "⌘Z" on Mac or "Ctrl+Z" on Windows
 */
export function formatShortcutKeys(keys: string): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  let formatted = keys
    .split('+')
    .map((key) => {
      switch (key.toLowerCase()) {
        case 'mod':
          return isMac ? '⌘' : 'Ctrl';
        case 'shift':
          return isMac ? '⇧' : 'Shift';
        case 'alt':
          return isMac ? '⌥' : 'Alt';
        case 'ctrl':
          return isMac ? '⌃' : 'Ctrl';
        case 'enter':
          return isMac ? '↵' : 'Enter';
        case 'backspace':
          return isMac ? '⌫' : 'Backspace';
        case 'up':
          return '↑';
        case 'down':
          return '↓';
        case 'left':
          return '←';
        case 'right':
          return '→';
        case 'esc':
          return 'Esc';
        default:
          return key.toUpperCase();
      }
    })
    .join(isMac ? '' : '+');

  return formatted;
}

/**
 * Get category display name
 */
export function getCategoryName(category: ShortcutCategory): string {
  const names: Record<ShortcutCategory, string> = {
    editing: 'Editing',
    navigation: 'Navigation',
    blocks: 'Blocks',
    system: 'System',
  };
  return names[category];
}
