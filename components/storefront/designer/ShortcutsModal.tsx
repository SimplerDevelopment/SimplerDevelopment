'use client';

import React, { useEffect } from 'react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutEntry[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Edit',
    items: [
      { keys: 'Ctrl/Cmd + Z', description: 'Undo' },
      { keys: 'Ctrl/Cmd + Shift + Z', description: 'Redo' },
      { keys: 'Ctrl/Cmd + Y', description: 'Redo (alternate)' },
      { keys: 'Ctrl/Cmd + S', description: 'Save' },
      { keys: 'Ctrl/Cmd + E', description: 'Export' },
    ],
  },
  {
    title: 'Layers',
    items: [
      { keys: 'Ctrl/Cmd + D', description: 'Duplicate selected' },
      { keys: 'Ctrl/Cmd + C', description: 'Copy selected' },
      { keys: 'Ctrl/Cmd + V', description: 'Paste from clipboard' },
      { keys: 'Ctrl/Cmd + A', description: 'Select all layers' },
      { keys: 'Delete / Backspace', description: 'Delete selected' },
      { keys: 'Ctrl/Cmd + ]', description: 'Bring forward (one step)' },
      { keys: 'Ctrl/Cmd + [', description: 'Send backward (one step)' },
      { keys: 'Ctrl/Cmd + Shift + ]', description: 'Bring to front' },
      { keys: 'Ctrl/Cmd + Shift + [', description: 'Send to back' },
    ],
  },
  {
    title: 'Move & zoom',
    items: [
      { keys: 'Arrow keys', description: 'Nudge selected layer (1 px)' },
      { keys: 'Shift + Arrow', description: 'Nudge selected layer (10 px)' },
      { keys: 'Ctrl/Cmd + +', description: 'Zoom in' },
      { keys: 'Ctrl/Cmd + -', description: 'Zoom out' },
      { keys: 'Ctrl/Cmd + 0', description: 'Reset zoom to 100%' },
    ],
  },
  {
    title: 'Help',
    items: [{ keys: '?', description: 'Toggle this help overlay' }],
  },
];

/**
 * Modal overlay that lists every keyboard shortcut the designer supports.
 * Mirrors what's wired in `lib/designer/hooks/useKeyboardShortcuts.ts`.
 *
 * Closes on Escape and on backdrop click. The "?" key opening this modal
 * lives in the shared keyboard-shortcuts hook so it works from anywhere.
 */
export default function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-background border border-border rounded-lg shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-background">
          <h2
            id="shortcuts-modal-title"
            className="text-base font-semibold text-foreground flex items-center gap-2"
          >
            <span className="material-icons text-lg">keyboard</span>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
                {group.items.map((item) => (
                  <React.Fragment key={item.keys}>
                    <div className="flex flex-wrap gap-1">
                      {item.keys.split(' + ').map((part, idx, arr) => (
                        <React.Fragment key={`${item.keys}-${idx}`}>
                          <kbd className="inline-flex items-center px-2 py-0.5 text-xs font-mono rounded border border-border bg-muted text-foreground">
                            {part}
                          </kbd>
                          {idx < arr.length - 1 && (
                            <span className="text-muted-foreground text-xs self-center">
                              +
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="text-sm text-foreground self-center">
                      {item.description}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
