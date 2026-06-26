'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaPicker from '@/components/admin/MediaPicker';
import { IconPicker } from '../../IconPicker';
import { Field, TextareaField } from '../panel-fields';

// ─── List Editor (reusable for cards, stats, services, items, etc.) ──────────

export interface ListFieldDef {
  name: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  type?: 'text' | 'icon' | 'image' | 'video';
}

export function ListEditor({
  label,
  items,
  fieldDefs,
  onAdd,
  onRemove,
  onItemChange,
  onReorder,
}: {
  label: string;
  items: { id: string; fields: Record<string, string> }[];
  fieldDefs: ListFieldDef[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onItemChange: (id: string, field: string, value: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex(i => i.id === active.id);
    const newIdx = items.findIndex(i => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    onReorder(reordered.map(i => i.id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label} ({items.length})</span>
        <button type="button" onClick={onAdd} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
      </div>
      <DndContext sensors={listSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((item, i) => (
              <SortableListItem
                key={item.id}
                item={item}
                index={i}
                label={label}
                fieldDefs={fieldDefs}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onRemove={onRemove}
                onItemChange={onItemChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function SortableListItem({
  item,
  index,
  label,
  fieldDefs,
  expandedId,
  onToggleExpand,
  onRemove,
  onItemChange,
}: {
  item: { id: string; fields: Record<string, string> };
  index: number;
  label: string;
  fieldDefs: ListFieldDef[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
  onItemChange: (id: string, field: string, value: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const isExpanded = expandedId === item.id;

  return (
    <div ref={setNodeRef} style={style} className="border border-border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-1.5 py-1.5 bg-muted/50 cursor-pointer hover:bg-muted"
        onClick={() => onToggleExpand(item.id)}
      >
        <span
          {...attributes}
          {...listeners}
          className="material-icons text-xs text-muted-foreground/50 cursor-grab active:cursor-grabbing shrink-0"
          onClick={(e) => e.stopPropagation()}
        >drag_indicator</span>
        <span className="material-icons text-xs text-muted-foreground shrink-0">{isExpanded ? 'expand_more' : 'chevron_right'}</span>
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          {item.fields[fieldDefs[0].name] || `${label.slice(0, -1)} ${index + 1}`}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          title="Remove"
        >
          <span className="material-icons text-sm">close</span>
        </button>
      </div>
      {isExpanded && (
        <div className="px-2.5 py-2 space-y-2 border-t border-border">
          {fieldDefs.map((fd) => (
            fd.type === 'icon' ? (
              <IconPicker
                key={fd.name}
                label={fd.label}
                value={item.fields[fd.name]}
                onChange={(v) => onItemChange(item.id, fd.name, v)}
              />
            ) : fd.type === 'image' ? (
              <div key={fd.name}>
                <span className="text-xs font-medium text-muted-foreground">{fd.label}</span>
                <MediaPicker
                  value={item.fields[fd.name]}
                  onChange={(v) => onItemChange(item.id, fd.name, v)}
                  mimeTypeFilter="image"
                  label=""
                />
              </div>
            ) : fd.type === 'video' ? (
              <div key={fd.name}>
                <span className="text-xs font-medium text-muted-foreground">{fd.label}</span>
                <MediaPicker
                  value={item.fields[fd.name]}
                  onChange={(v) => onItemChange(item.id, fd.name, v)}
                  mimeTypeFilter="video"
                  label=""
                />
              </div>
            ) : fd.multiline ? (
              <TextareaField
                key={fd.name}
                label={fd.label}
                value={item.fields[fd.name]}
                onChange={(v) => onItemChange(item.id, fd.name, v)}
                rows={2}
              />
            ) : (
              <Field
                key={fd.name}
                label={fd.label}
                value={item.fields[fd.name]}
                onChange={(v) => onItemChange(item.id, fd.name, v)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
