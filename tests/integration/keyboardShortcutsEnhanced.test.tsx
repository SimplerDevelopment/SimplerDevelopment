import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useKeyboardShortcuts, KeyboardShortcutConfig } from '@/lib/hooks/useKeyboardShortcuts';
import { renderHook, act } from '@testing-library/react';
import Mousetrap from 'mousetrap';

// Mock Mousetrap to test shortcut bindings without real DOM events
vi.mock('mousetrap', () => {
  const bindings = new Map<string, (e?: Event) => void | boolean>();

  return {
    default: {
      bind: vi.fn((keys: string, handler: (e?: Event) => void | boolean) => {
        bindings.set(keys, handler);
      }),
      unbind: vi.fn((keys: string) => {
        bindings.delete(keys);
      }),
      trigger: (keys: string) => {
        const handler = bindings.get(keys);
        if (handler) {
          const mockEvent = { preventDefault: vi.fn() } as unknown as Event;
          handler(mockEvent);
        }
      },
      _bindings: bindings,
    },
  };
});

describe('Keyboard Shortcuts - Enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Mousetrap as any)._bindings.clear();
  });

  it('binds all shortcuts on mount', () => {
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+z', description: 'Undo', handler: vi.fn() },
      { keys: 'mod+shift+z', description: 'Redo', handler: vi.fn() },
      { keys: 'mod+d', description: 'Duplicate', handler: vi.fn() },
      { keys: 'mod+enter', description: 'Insert block', handler: vi.fn() },
      { keys: 'mod+shift+up', description: 'Move up', handler: vi.fn() },
      { keys: 'mod+shift+down', description: 'Move down', handler: vi.fn() },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    expect(Mousetrap.bind).toHaveBeenCalledTimes(6);
    expect(Mousetrap.bind).toHaveBeenCalledWith('mod+z', expect.any(Function));
    expect(Mousetrap.bind).toHaveBeenCalledWith('mod+shift+z', expect.any(Function));
    expect(Mousetrap.bind).toHaveBeenCalledWith('mod+d', expect.any(Function));
    expect(Mousetrap.bind).toHaveBeenCalledWith('mod+enter', expect.any(Function));
    expect(Mousetrap.bind).toHaveBeenCalledWith('mod+shift+up', expect.any(Function));
    expect(Mousetrap.bind).toHaveBeenCalledWith('mod+shift+down', expect.any(Function));
  });

  it('unbinds all shortcuts on unmount', () => {
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+z', description: 'Undo', handler: vi.fn() },
      { keys: 'mod+d', description: 'Duplicate', handler: vi.fn() },
    ];

    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts, []));

    unmount();

    expect(Mousetrap.unbind).toHaveBeenCalledWith('mod+z');
    expect(Mousetrap.unbind).toHaveBeenCalledWith('mod+d');
  });

  it('calls handler when shortcut is triggered', () => {
    const undoHandler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+z', description: 'Undo', handler: undoHandler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    // Simulate the shortcut trigger
    (Mousetrap as any).trigger('mod+z');

    expect(undoHandler).toHaveBeenCalledTimes(1);
  });

  it('mod+d calls duplicate handler', () => {
    const duplicateHandler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+d', description: 'Duplicate', handler: duplicateHandler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    (Mousetrap as any).trigger('mod+d');

    expect(duplicateHandler).toHaveBeenCalledTimes(1);
  });

  it('mod+enter calls insert handler', () => {
    const insertHandler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+enter', description: 'Insert', handler: insertHandler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    (Mousetrap as any).trigger('mod+enter');

    expect(insertHandler).toHaveBeenCalledTimes(1);
  });

  it('mod+shift+up calls move up handler', () => {
    const moveUpHandler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+shift+up', description: 'Move up', handler: moveUpHandler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    (Mousetrap as any).trigger('mod+shift+up');

    expect(moveUpHandler).toHaveBeenCalledTimes(1);
  });

  it('mod+shift+down calls move down handler', () => {
    const moveDownHandler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+shift+down', description: 'Move down', handler: moveDownHandler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    (Mousetrap as any).trigger('mod+shift+down');

    expect(moveDownHandler).toHaveBeenCalledTimes(1);
  });

  it('mod+shift+z calls redo handler', () => {
    const redoHandler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+shift+z', description: 'Redo', handler: redoHandler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    (Mousetrap as any).trigger('mod+shift+z');

    expect(redoHandler).toHaveBeenCalledTimes(1);
  });

  it('preventDefault is called by default', () => {
    const handler = vi.fn();
    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+d', description: 'Duplicate', handler },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, []));

    // Get the actual bound handler from Mousetrap.bind call
    const boundCall = (Mousetrap.bind as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === 'mod+d'
    );
    expect(boundCall).toBeDefined();

    const boundHandler = boundCall![1];
    const mockEvent = { preventDefault: vi.fn() };
    boundHandler(mockEvent as unknown as Event);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('rebinds shortcuts when deps change', () => {
    let selectedId: string | null = null;
    const duplicateHandler = vi.fn(() => {
      if (selectedId) return false;
    });

    const shortcuts: KeyboardShortcutConfig[] = [
      { keys: 'mod+d', description: 'Duplicate', handler: duplicateHandler },
    ];

    const { rerender } = renderHook(
      ({ deps }) => useKeyboardShortcuts(shortcuts, deps),
      { initialProps: { deps: [selectedId] as React.DependencyList } }
    );

    // Initial bind
    expect(Mousetrap.bind).toHaveBeenCalledTimes(1);

    // Change dep
    selectedId = 'block-1';
    rerender({ deps: [selectedId] });

    // Should unbind old and rebind new
    expect(Mousetrap.unbind).toHaveBeenCalledWith('mod+d');
    expect(Mousetrap.bind).toHaveBeenCalledTimes(2);
  });

  describe('Shortcut handler logic', () => {
    it('duplicate handler only fires when a block is selected', () => {
      let selectedBlockId: string | null = null;
      const duplicateBlock = vi.fn();

      const handler = () => {
        if (selectedBlockId) duplicateBlock(selectedBlockId);
        return false;
      };

      const shortcuts: KeyboardShortcutConfig[] = [
        { keys: 'mod+d', description: 'Duplicate', handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts, [selectedBlockId]));

      // Trigger with no selection
      (Mousetrap as any).trigger('mod+d');
      expect(duplicateBlock).not.toHaveBeenCalled();
    });

    it('move up handler respects block boundaries', () => {
      const blocks = [
        { id: 'block-1', order: 0 },
        { id: 'block-2', order: 1 },
      ];
      const selectedBlockId = 'block-1'; // First block
      const reorderBlocks = vi.fn();

      const handler = () => {
        const idx = blocks.findIndex(b => b.id === selectedBlockId);
        if (idx > 0) reorderBlocks(idx, idx - 1);
        return false;
      };

      const shortcuts: KeyboardShortcutConfig[] = [
        { keys: 'mod+shift+up', description: 'Move up', handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts, []));

      (Mousetrap as any).trigger('mod+shift+up');

      // Should NOT reorder - already at top
      expect(reorderBlocks).not.toHaveBeenCalled();
    });

    it('move down handler respects block boundaries', () => {
      const blocks = [
        { id: 'block-1', order: 0 },
        { id: 'block-2', order: 1 },
      ];
      const selectedBlockId = 'block-2'; // Last block
      const reorderBlocks = vi.fn();

      const handler = () => {
        const idx = blocks.findIndex(b => b.id === selectedBlockId);
        if (idx >= 0 && idx < blocks.length - 1) reorderBlocks(idx, idx + 1);
        return false;
      };

      const shortcuts: KeyboardShortcutConfig[] = [
        { keys: 'mod+shift+down', description: 'Move down', handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts, []));

      (Mousetrap as any).trigger('mod+shift+down');

      // Should NOT reorder - already at bottom
      expect(reorderBlocks).not.toHaveBeenCalled();
    });

    it('move up handler calls reorder for valid position', () => {
      const blocks = [
        { id: 'block-1', order: 0 },
        { id: 'block-2', order: 1 },
      ];
      const selectedBlockId = 'block-2'; // Second block
      const reorderBlocks = vi.fn();

      const handler = () => {
        const idx = blocks.findIndex(b => b.id === selectedBlockId);
        if (idx > 0) reorderBlocks(idx, idx - 1);
        return false;
      };

      const shortcuts: KeyboardShortcutConfig[] = [
        { keys: 'mod+shift+up', description: 'Move up', handler },
      ];

      renderHook(() => useKeyboardShortcuts(shortcuts, []));

      (Mousetrap as any).trigger('mod+shift+up');

      expect(reorderBlocks).toHaveBeenCalledWith(1, 0);
    });
  });
});
