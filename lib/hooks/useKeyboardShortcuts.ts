'use client';

import { useEffect } from 'react';
import Mousetrap from 'mousetrap';

export interface KeyboardShortcutConfig {
  keys: string; // Mousetrap format (e.g., "mod+z", "mod+shift+z")
  description: string;
  handler: () => void | boolean;
  preventDefault?: boolean;
}

/**
 * Hook for registering keyboard shortcuts using Mousetrap
 *
 * @param shortcuts - Array of shortcut configurations
 * @param deps - Dependency array for when to re-bind shortcuts
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   {
 *     keys: 'mod+z',
 *     description: 'Undo',
 *     handler: () => undo(),
 *     preventDefault: true
 *   },
 *   {
 *     keys: 'mod+shift+z',
 *     description: 'Redo',
 *     handler: () => redo(),
 *     preventDefault: true
 *   }
 * ], [undo, redo]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcutConfig[],
  deps: React.DependencyList = []
) {
  useEffect(() => {
    // Bind all shortcuts
    shortcuts.forEach(({ keys, handler, preventDefault = true }) => {
      Mousetrap.bind(keys, (e) => {
        if (preventDefault && e) {
          e.preventDefault();
        }
        return handler();
      });
    });

    // Cleanup on unmount or when deps change
    return () => {
      shortcuts.forEach(({ keys }) => {
        Mousetrap.unbind(keys);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
