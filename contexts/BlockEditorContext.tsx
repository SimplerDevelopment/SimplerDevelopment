'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import {
  Block,
  EditorState,
  SaveStatus,
  ContentStats,
  HistoryAction,
  PageSettings,
} from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { useBlockHistory } from '@/lib/hooks/useBlockHistory';
import { useSettingsPanelSync, type SettingsPanelMessage } from '@/lib/hooks/useSettingsPanelSync';
import {
  getStoredWindowConfig,
  getDefaultWindowConfig,
  saveWindowConfig,
} from '@/lib/utils/settingsWindowStorage';
import { findBlockById, updateBlockById } from '@/lib/utils/blockHelpers';

// Context value interface
interface BlockEditorContextValue {
  // State
  state: EditorState;

  // Block operations
  updateBlock: (id: string, updates: Partial<Block>) => void;
  addBlock: (block: Block, position?: number) => void;
  deleteBlock: (id: string) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  duplicateBlock: (id: string) => void;
  setBlocks: (blocks: Block[]) => void;

  // Selection
  selectBlock: (id: string | null) => void;
  setHoveredBlock: (id: string | null) => void;
  setFocusedBlock: (id: string | null) => void;

  // UI state
  toggleBlockPicker: (show?: boolean) => void;
  toggleKeyboardReference: (show?: boolean) => void;
  setInsertPosition: (position: number | null) => void;
  togglePreviewMode: (enabled?: boolean) => void;

  // Drag-and-drop
  setIsDragging: (isDragging: boolean) => void;
  setDraggedBlock: (id: string | null) => void;
  setDropTarget: (index: number | null) => void;

  // History
  undo: () => void;
  redo: () => void;

  // Save
  setSaveStatus: (status: SaveStatus) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  markAsSaved: () => void;

  // Settings panel pop-out
  isSettingsPoppedOut: boolean;
  openSettingsPopOut: () => void;
  dockSettings: () => void;

  // Viewport
  currentViewport: Breakpoint;
  setCurrentViewport: (viewport: Breakpoint) => void;

  // Page settings
  pageSettings: PageSettings;
  updatePageSettings: (updates: Partial<PageSettings>) => void;
}

const BlockEditorContext = createContext<BlockEditorContextValue | undefined>(
  undefined
);

// Provider props
interface BlockEditorProviderProps {
  children: React.ReactNode;
  initialBlocks?: Block[];
  onBlocksChange?: (blocks: Block[]) => void;
  initialViewport?: Breakpoint;
  onViewportChange?: (viewport: Breakpoint) => void;
  initialPageSettings?: PageSettings;
  onPageSettingsChange?: (settings: PageSettings) => void;
}

/**
 * BlockEditorProvider - Provides shared state for block editor
 *
 * @param children - Child components
 * @param initialBlocks - Initial blocks (default: [])
 * @param onBlocksChange - Callback when blocks change
 * @param initialViewport - Initial viewport (default: 'desktop')
 * @param onViewportChange - Callback when viewport changes
 */
export function BlockEditorProvider({
  children,
  initialBlocks = [],
  onBlocksChange,
  initialViewport = 'desktop',
  onViewportChange,
  initialPageSettings = {},
  onPageSettingsChange,
}: BlockEditorProviderProps) {
  console.log('[BlockEditorProvider] Rendered with initialBlocks:', initialBlocks.length);

  // History management
  const {
    blocks,
    setBlocks: setBlocksWithHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBlockHistory(initialBlocks);

  console.log('[BlockEditorProvider] Current blocks from useBlockHistory:', blocks.length);

  // Selection state
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);

  // UI state
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showKeyboardReference, setShowKeyboardReference] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Settings panel pop-out state
  const [isSettingsPoppedOut, setIsSettingsPoppedOut] = useState(false);
  const [popOutWindow, setPopOutWindow] = useState<Window | null>(null);
  const [tabId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const stored = sessionStorage.getItem('editorTabId');
    if (stored) return stored;
    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('editorTabId', newTabId);
    return newTabId;
  });

  // Viewport state
  const [currentViewport, setCurrentViewport] = useState<Breakpoint>(initialViewport);

  // Page settings
  const [pageSettings, setPageSettings] = useState<PageSettings>(initialPageSettings);

  const updatePageSettings = useCallback((updates: Partial<PageSettings>) => {
    setPageSettings((prev) => {
      const next = { ...prev, ...updates };
      onPageSettingsChange?.(next);
      setHasUnsavedChanges(true);
      return next;
    });
  }, [onPageSettingsChange]);

  // Calculate content stats
  const stats: ContentStats = useMemo(() => {
    // Placeholder implementation - will be replaced with actual word count logic
    const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

    return {
      totalWords: 0,
      totalCharacters: 0,
      totalCharactersNoSpaces: 0,
      totalSentences: 0,
      readingTimeMinutes: 0,
      selectedBlockWords: 0,
      selectedBlockCharacters: 0,
      blockCounts: {},
    };
  }, [blocks, selectedBlockId]);

  // Block operations
  const updateBlock = useCallback(
    (id: string, updates: Partial<Block>) => {
      const newBlocks = updateBlockById(blocks, id, updates);
      const updatedBlock = findBlockById(newBlocks, id);
      setBlocksWithHistory(newBlocks, {
        type: 'modify',
        description: `Modified ${updatedBlock?.type || 'unknown'} block`,
      });
      setHasUnsavedChanges(true);
      onBlocksChange?.(newBlocks);
    },
    [blocks, setBlocksWithHistory, onBlocksChange]
  );

  // Define dockSettings early so it can be used in handleBroadcastMessage
  const dockSettings = useCallback(() => {
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.close();
    }
    setPopOutWindow(null);
    setIsSettingsPoppedOut(false);
  }, [popOutWindow]);

  // BroadcastChannel message handler
  const handleBroadcastMessage = useCallback(
    (message: SettingsPanelMessage) => {
      switch (message.type) {
        case 'BLOCK_UPDATED':
          // Handle block updates from the popup window
          updateBlock(message.payload.id, message.payload.updates);
          break;
        case 'DOCK_REQUESTED':
          // Handle dock requests from the popup window
          dockSettings();
          break;
        // Note: Main window doesn't handle SELECTION_CHANGED - it's the source of truth
        // The popup window handles SELECTION_CHANGED to stay in sync
        default:
          break;
      }
    },
    [updateBlock, dockSettings]
  );

  // BroadcastChannel sync
  const { sendMessage } = useSettingsPanelSync({
    isMainWindow: true,
    onMessage: handleBroadcastMessage,
    tabId,
  });

  const addBlock = useCallback(
    (block: Block, position?: number) => {
      const newBlocks = [...blocks];
      const insertIndex = position ?? blocks.length;
      newBlocks.splice(insertIndex, 0, block);

      // Update order for all blocks (create new objects to avoid mutating frozen objects)
      const updatedBlocks = newBlocks.map((b, index) => ({
        ...b,
        order: index + 1,
      }));

      console.log('[BlockEditorContext] addBlock - calling setBlocksWithHistory with', updatedBlocks.length, 'blocks');
      setBlocksWithHistory(updatedBlocks, {
        type: 'add',
        description: `Added ${block.type} block`,
      });
      setHasUnsavedChanges(true);
      console.log('[BlockEditorContext] addBlock - calling onBlocksChange with', updatedBlocks.length, 'blocks');
      console.log('[BlockEditorContext] onBlocksChange exists?', !!onBlocksChange);
      onBlocksChange?.(updatedBlocks);
    },
    [blocks, setBlocksWithHistory, onBlocksChange]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      const blockToDelete = blocks.find((b) => b.id === id);
      const newBlocks = blocks
        .filter((block) => block.id !== id)
        .map((b, index) => ({
          ...b,
          order: index + 1,
        }));

      setBlocksWithHistory(newBlocks, {
        type: 'delete',
        description: `Deleted ${blockToDelete?.type} block`,
      });
      setHasUnsavedChanges(true);
      onBlocksChange?.(newBlocks);
    },
    [blocks, setBlocksWithHistory, onBlocksChange]
  );

  const reorderBlocks = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newBlocks = [...blocks];
      const [removed] = newBlocks.splice(fromIndex, 1);
      newBlocks.splice(toIndex, 0, removed);

      // Update order for all blocks (create new objects to avoid mutating frozen objects)
      const updatedBlocks = newBlocks.map((b, index) => ({
        ...b,
        order: index + 1,
      }));

      setBlocksWithHistory(updatedBlocks, {
        type: 'reorder',
        description: 'Reordered blocks',
      });
      setHasUnsavedChanges(true);
      onBlocksChange?.(updatedBlocks);
    },
    [blocks, setBlocksWithHistory, onBlocksChange]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const blockToDuplicate = blocks.find((b) => b.id === id);
      if (!blockToDuplicate) return;

      const duplicatedBlock = {
        ...blockToDuplicate,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      const blockIndex = blocks.findIndex((b) => b.id === id);
      const newBlocks = [...blocks];
      newBlocks.splice(blockIndex + 1, 0, duplicatedBlock);

      // Update order for all blocks (create new objects to avoid mutating frozen objects)
      const updatedBlocks = newBlocks.map((b, index) => ({
        ...b,
        order: index + 1,
      }));

      setBlocksWithHistory(updatedBlocks, {
        type: 'duplicate',
        description: `Duplicated ${blockToDuplicate.type} block`,
      });
      setHasUnsavedChanges(true);
      onBlocksChange?.(updatedBlocks);
    },
    [blocks, setBlocksWithHistory, onBlocksChange]
  );

  const setBlocks = useCallback(
    (newBlocks: Block[]) => {
      setBlocksWithHistory(newBlocks, {
        type: 'modify',
        description: 'Updated blocks',
      });
      setHasUnsavedChanges(true);
      onBlocksChange?.(newBlocks);
    },
    [setBlocksWithHistory, onBlocksChange]
  );

  // UI actions
  const toggleBlockPicker = useCallback((show?: boolean) => {
    setShowBlockPicker((prev) => show ?? !prev);
  }, []);

  const toggleKeyboardReference = useCallback((show?: boolean) => {
    setShowKeyboardReference((prev) => show ?? !prev);
  }, []);

  const togglePreviewMode = useCallback((enabled?: boolean) => {
    setPreviewMode((prev) => enabled ?? !prev);
  }, []);

  // Settings panel pop-out functions
  const openSettingsPopOut = useCallback(() => {
    if (isSettingsPoppedOut || popOutWindow) return;

    const config = getStoredWindowConfig() || getDefaultWindowConfig();
    const features = `width=${config.width},height=${config.height},left=${config.left},top=${config.top},resizable=yes,scrollbars=yes`;

    const popup = window.open(
      `/block-editor/settings-popup?tabId=${tabId}`,
      'blockEditorSettings',
      features
    );

    if (!popup) {
      alert('Please allow popups for this site to use the detached settings panel.');
      return;
    }

    setPopOutWindow(popup);
    setIsSettingsPoppedOut(true);

    // Listen for READY message from popup and send initial state
    const handlePopupMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== popup) return;

      if (event.data.type === 'POPUP_READY' && event.data.tabId === tabId) {
        popup.postMessage(
          {
            type: 'INITIAL_STATE',
            selectedBlockId,
            blocks,
            currentViewport,
            tabId,
          },
          window.location.origin
        );
        window.removeEventListener('message', handlePopupMessage);
      }
    };
    window.addEventListener('message', handlePopupMessage);

    // Save window config when it moves/resizes
    const saveWindowPosition = () => {
      if (popup && !popup.closed) {
        saveWindowConfig({
          width: popup.outerWidth,
          height: popup.outerHeight,
          left: popup.screenX,
          top: popup.screenY,
        });
      }
    };

    // Check periodically for window config changes
    const configInterval = setInterval(saveWindowPosition, 1000);

    // Cleanup interval when popup closes
    const checkInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(configInterval);
        clearInterval(checkInterval);
      }
    }, 500);
  }, [isSettingsPoppedOut, popOutWindow, blocks, selectedBlockId, currentViewport, tabId]);

  // Monitor pop-out window close
  useEffect(() => {
    if (!popOutWindow) return;

    const checkInterval = setInterval(() => {
      if (popOutWindow.closed) {
        setIsSettingsPoppedOut(false);
        setPopOutWindow(null);
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [popOutWindow]);

  // Send WINDOW_CLOSING message when main window closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      sendMessage('WINDOW_CLOSING', null);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sendMessage]);

  // Sync selection changes to popup
  useEffect(() => {
    if (isSettingsPoppedOut) {
      sendMessage('SELECTION_CHANGED', { selectedBlockId });
    }
  }, [selectedBlockId, isSettingsPoppedOut, sendMessage]);

  // Sync block updates to popup
  useEffect(() => {
    if (isSettingsPoppedOut) {
      sendMessage('BLOCKS_CHANGED', { blocks });
    }
  }, [blocks, isSettingsPoppedOut, sendMessage]);

  // Sync viewport changes to popup
  useEffect(() => {
    if (isSettingsPoppedOut) {
      sendMessage('VIEWPORT_CHANGED', { viewport: currentViewport });
    }
  }, [currentViewport, isSettingsPoppedOut, sendMessage]);

  // Call viewport change callback
  useEffect(() => {
    if (onViewportChange) {
      onViewportChange(currentViewport);
    }
  }, [currentViewport, onViewportChange]);

  const markAsSaved = useCallback(() => {
    setSaveStatus('saved');
    setLastSavedAt(Date.now());
    setHasUnsavedChanges(false);

    // Reset to idle after 2 seconds
    setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
  }, []);

  // Build state object
  const state: EditorState = useMemo(
    () => ({
      blocks,
      selectedBlockId,
      hoveredBlockId,
      focusedBlockId,
      showBlockPicker,
      showKeyboardReference,
      insertPosition,
      previewMode,
      isDragging,
      draggedBlockId,
      dropTargetIndex,
      canUndo,
      canRedo,
      stats,
      saveStatus,
      lastSavedAt,
      hasUnsavedChanges,
    }),
    [
      blocks,
      selectedBlockId,
      hoveredBlockId,
      focusedBlockId,
      showBlockPicker,
      showKeyboardReference,
      insertPosition,
      previewMode,
      isDragging,
      draggedBlockId,
      dropTargetIndex,
      canUndo,
      canRedo,
      stats,
      saveStatus,
      lastSavedAt,
      hasUnsavedChanges,
    ]
  );

  const value: BlockEditorContextValue = useMemo(
    () => ({
      state,
      updateBlock,
      addBlock,
      deleteBlock,
      reorderBlocks,
      duplicateBlock,
      setBlocks,
      selectBlock: setSelectedBlockId,
      setHoveredBlock: setHoveredBlockId,
      setFocusedBlock: setFocusedBlockId,
      toggleBlockPicker,
      toggleKeyboardReference,
      setInsertPosition,
      togglePreviewMode,
      setIsDragging,
      setDraggedBlock: setDraggedBlockId,
      setDropTarget: setDropTargetIndex,
      undo,
      redo,
      setSaveStatus,
      setHasUnsavedChanges,
      markAsSaved,
      isSettingsPoppedOut,
      openSettingsPopOut,
      dockSettings,
      currentViewport,
      setCurrentViewport,
      pageSettings,
      updatePageSettings,
    }),
    [
      state,
      updateBlock,
      addBlock,
      deleteBlock,
      reorderBlocks,
      duplicateBlock,
      setBlocks,
      setSelectedBlockId,
      setHoveredBlockId,
      setFocusedBlockId,
      toggleBlockPicker,
      toggleKeyboardReference,
      setInsertPosition,
      togglePreviewMode,
      setIsDragging,
      setDraggedBlockId,
      setDropTargetIndex,
      undo,
      redo,
      setSaveStatus,
      setHasUnsavedChanges,
      markAsSaved,
      isSettingsPoppedOut,
      openSettingsPopOut,
      dockSettings,
      currentViewport,
      setCurrentViewport,
      pageSettings,
      updatePageSettings,
    ]
  );

  return (
    <BlockEditorContext.Provider value={value}>
      {children}
    </BlockEditorContext.Provider>
  );
}

/**
 * Hook to access BlockEditor context
 * @throws Error if used outside BlockEditorProvider
 */
export function useBlockEditor() {
  const context = useContext(BlockEditorContext);
  if (!context) {
    throw new Error(
      'useBlockEditor must be used within a BlockEditorProvider'
    );
  }
  return context;
}
