'use client';

import { useCallback } from 'react';
import { findBlockById, removeBlockById } from '@/lib/utils/blockHelpers';
import type { Block, BlockStyle } from '@/types/blocks';

/**
 * Multi-select bulk operations: delete, duplicate, group-into-section, and
 * shallow style-merge across selection.
 *
 * All callers route writes back through `onBlocksChange` so the parent
 * can co-ordinate iframe origin tracking + history. Setters for
 * `selectedBlockIds` and `internalSelectedBlockId` are passed in so the
 * hook can move selection along with the bulk operation (e.g. deleting a
 * block clears selection; grouping selects the new section).
 */
export function useBulkActions({
  blocks,
  selectedBlockIds,
  onBlocksChange,
  setSelectedBlockIds,
  setInternalSelectedBlockId,
  iframeOriginatedRef,
}: {
  blocks: Block[];
  selectedBlockIds: string[];
  onBlocksChange: (blocks: Block[]) => void;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
  setInternalSelectedBlockId: (id: string | null) => void;
  iframeOriginatedRef: React.MutableRefObject<boolean>;
}) {
  const bulkDelete = useCallback(() => {
    // Filter out required blocks from deletion
    const deletableIds = selectedBlockIds.filter((id) => {
      const block = findBlockById(blocks, id);
      return block && !block.required;
    });
    if (deletableIds.length === 0) return;
    let updated = blocks;
    for (const id of deletableIds) {
      updated = removeBlockById(updated, id);
    }
    onBlocksChange(updated);
    setSelectedBlockIds([]);
    setInternalSelectedBlockId(null);
  }, [blocks, selectedBlockIds, onBlocksChange, setSelectedBlockIds, setInternalSelectedBlockId]);

  const bulkDuplicate = useCallback(() => {
    const updated = [...blocks];
    const newIds: string[] = [];
    for (const id of selectedBlockIds) {
      const block = findBlockById(blocks, id);
      if (block) {
        const dupId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const dup = { ...JSON.parse(JSON.stringify(block)), id: dupId } as Block;
        const idx = updated.findIndex((b) => b.id === id);
        if (idx !== -1) {
          updated.splice(idx + 1, 0, dup);
          newIds.push(dupId);
        }
      }
    }
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds(newIds);
  }, [blocks, selectedBlockIds, onBlocksChange, setSelectedBlockIds, iframeOriginatedRef]);

  const bulkGroup = useCallback(() => {
    const selectedBlocks = selectedBlockIds.map((id) => findBlockById(blocks, id)).filter(Boolean) as Block[];
    if (selectedBlocks.length < 2) return;
    const updated = blocks.filter((b) => !selectedBlockIds.includes(b.id));
    const section: Block = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'section',
      order: 0,
      blocks: selectedBlocks,
    } as Block;
    const firstIdx = blocks.findIndex((b) => selectedBlockIds.includes(b.id));
    updated.splice(Math.min(firstIdx, updated.length), 0, section);
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds([section.id]);
    setInternalSelectedBlockId(section.id);
  }, [blocks, selectedBlockIds, onBlocksChange, setSelectedBlockIds, setInternalSelectedBlockId, iframeOriginatedRef]);

  const bulkUpdateStyle = useCallback((style: Partial<BlockStyle>) => {
    const updated = blocks.map((b) => {
      if (selectedBlockIds.includes(b.id)) {
        return { ...b, style: { ...(b.style || {}), ...style } } as Block;
      }
      return b;
    });
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
  }, [blocks, selectedBlockIds, onBlocksChange, iframeOriginatedRef]);

  return { bulkDelete, bulkDuplicate, bulkGroup, bulkUpdateStyle };
}
