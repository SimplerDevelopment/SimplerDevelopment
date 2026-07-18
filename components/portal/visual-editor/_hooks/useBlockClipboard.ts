'use client';

import { useCallback, useEffect } from 'react';
import { findBlockById, deepCloneBlock } from '@/lib/utils/blockHelpers';
import type { Block } from '@/types/blocks';

const CLIPBOARD_KEY = 'sd-block-clipboard';

/**
 * Cross-post block clipboard via localStorage.
 *
 * Cmd+C / Cmd+V on selected blocks. Survives navigating between posts so
 * authors can lift a chunk out of one page and drop it on another. Stored
 * alongside the source post id so we can show "pasted from post N" in
 * future toasts, but the block content travels independently of source.
 *
 * Window-level Cmd+C/Cmd+V keybinds are skipped when focus is in an input,
 * textarea, select, or contentEditable region — otherwise we'd hijack the
 * user's normal text copy/paste inside a field input. A live text selection
 * also defers to the browser default.
 */
export function useBlockClipboard({
  blocks,
  selectedBlockIds,
  siteId,
  onBlocksChange,
  setSelectedBlockIds,
  setInternalSelectedBlockId,
  iframeOriginatedRef,
}: {
  blocks: Block[];
  selectedBlockIds: string[];
  siteId?: number;
  onBlocksChange: (blocks: Block[]) => void;
  setSelectedBlockIds: (ids: string[]) => void;
  setInternalSelectedBlockId: (id: string | null) => void;
  iframeOriginatedRef: React.MutableRefObject<boolean>;
}) {
  const copySelectedBlocks = useCallback(() => {
    if (selectedBlockIds.length === 0) return false;
    const picked = selectedBlockIds.map((id) => findBlockById(blocks, id)).filter((b): b is Block => !!b);
    if (picked.length === 0) return false;
    try {
      window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({
        version: 1,
        copiedAt: Date.now(),
        sourceSiteId: siteId ?? null,
        blocks: picked,
      }));
    } catch {
      // localStorage may be unavailable (private mode, quota); fail silently
      return false;
    }
    return true;
  }, [blocks, selectedBlockIds, siteId]);

  const pasteFromClipboard = useCallback(() => {
    let payload: { version: number; blocks: Block[] } | null = null;
    try {
      const raw = window.localStorage.getItem(CLIPBOARD_KEY);
      if (!raw) return false;
      payload = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!payload || !Array.isArray(payload.blocks) || payload.blocks.length === 0) return false;

    // Regenerate every id so the pasted blocks don't collide with whatever's
    // already on this page (and so React reconciliation treats them fresh).
    const cloned = payload.blocks.map(deepCloneBlock);

    // Insert position: after the last currently-selected block at top level if
    // there is one; otherwise append to the end.
    let insertAt = blocks.length;
    if (selectedBlockIds.length > 0) {
      const lastIdx = Math.max(...selectedBlockIds.map((id) => blocks.findIndex((b) => b.id === id)).filter((i) => i >= 0));
      if (lastIdx >= 0) insertAt = lastIdx + 1;
    }
    const updated = [...blocks];
    updated.splice(insertAt, 0, ...cloned);
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds(cloned.map((b) => b.id));
    setInternalSelectedBlockId(cloned[0]?.id ?? null);
    return true;
  }, [blocks, selectedBlockIds, onBlocksChange, setSelectedBlockIds, setInternalSelectedBlockId, iframeOriginatedRef]);

  // Window-level Cmd+C / Cmd+V binding. Stays out of the way when the user
  // is editing text — see comment block above.
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'c' && k !== 'v') return;
      if (isEditableTarget(e.target)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return;

      if (k === 'c') {
        if (copySelectedBlocks()) {
          e.preventDefault();
        }
      } else if (k === 'v') {
        if (pasteFromClipboard()) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copySelectedBlocks, pasteFromClipboard]);

  return { copySelectedBlocks, pasteFromClipboard };
}
