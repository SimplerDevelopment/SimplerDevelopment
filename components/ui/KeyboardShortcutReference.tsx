'use client';

import { useEffect } from 'react';
import {
  getShortcutsByCategory,
  formatShortcutKeys,
  getCategoryName,
} from '@/lib/utils/keyboardShortcuts';
import { ShortcutCategory } from '@/types/blocks';

interface KeyboardShortcutReferenceProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal displaying all available keyboard shortcuts
 *
 * @example
 * ```tsx
 * const [showShortcuts, setShowShortcuts] = useState(false);
 *
 * <KeyboardShortcutReference
 *   isOpen={showShortcuts}
 *   onClose={() => setShowShortcuts(false)}
 * />
 * ```
 */
export function KeyboardShortcutReference({
  isOpen,
  onClose,
}: KeyboardShortcutReferenceProps) {
  const shortcuts = getShortcutsByCategory();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories: ShortcutCategory[] = ['editing', 'blocks', 'navigation', 'system'];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Keyboard Shortcuts
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Speed up your workflow with these shortcuts
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent transition-colors"
              title="Close (Esc)"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-100px)] p-6 bg-white dark:bg-gray-900">
          <div className="space-y-6">
            {categories.map((category) => {
              const categoryShortcuts = shortcuts[category];
              if (categoryShortcuts.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    {getCategoryName(category)}
                  </h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <span className="text-sm text-foreground">
                          {shortcut.description}
                        </span>
                        <kbd className="px-3 py-1.5 text-sm font-mono font-semibold bg-muted text-muted-foreground rounded border border-border shadow-sm">
                          {formatShortcutKeys(shortcut.keys)}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-2 py-0.5 text-xs font-mono bg-background border border-border rounded">?</kbd> to show this dialog anytime
          </p>
        </div>
      </div>
    </div>
  );
}
