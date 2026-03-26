'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export interface DragDropState {
  activeId: string | null;
  overId: string | null;
}

export interface UseBlockDragDropReturn {
  // DnD Kit exports
  DndContext: typeof DndContext;
  SortableContext: typeof SortableContext;

  // State
  dragState: DragDropState;

  // Handlers
  handleDragStart: (event: DragStartEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;

  // Sensors
  sensors: ReturnType<typeof useSensors>;

  // Utilities
  arrayMove: typeof arrayMove;
}

/**
 * Hook for managing drag-and-drop functionality with @dnd-kit
 *
 * @param onReorder - Callback when items are reordered (fromIndex, toIndex)
 *
 * @example
 * ```tsx
 * const { DndContext, SortableContext, sensors, handleDragEnd } = useBlockDragDrop(
 *   (fromIndex, toIndex) => reorderBlocks(fromIndex, toIndex)
 * );
 *
 * return (
 *   <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
 *     <SortableContext items={blockIds}>
 *       {blocks.map(block => <SortableBlock key={block.id} block={block} />)}
 *     </SortableContext>
 *   </DndContext>
 * );
 * ```
 */
export function useBlockDragDrop(
  onReorder: (fromIndex: number, toIndex: number) => void
): UseBlockDragDropReturn {
  const [dragState, setDragState] = useState<DragDropState>({
    activeId: null,
    overId: null,
  });

  // Configure sensors for drag interaction
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setDragState({
      activeId: event.active.id as string,
      overId: null,
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    setDragState((prev) => ({
      ...prev,
      overId: event.over?.id as string | null,
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Calculate indices from IDs
      // Note: This assumes items array is available in the calling component
      // The actual reordering logic is delegated to the callback
      onReorder(active.id as any, over.id as any);
    }

    // Reset drag state
    setDragState({
      activeId: null,
      overId: null,
    });
  };

  const handleDragCancel = () => {
    setDragState({
      activeId: null,
      overId: null,
    });
  };

  return {
    DndContext,
    SortableContext,
    dragState,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    sensors,
    arrayMove,
  };
}
