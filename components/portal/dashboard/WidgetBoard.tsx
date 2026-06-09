'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashboardWidgetPrefs } from '@/lib/dashboard/widgets';
import WidgetShell from './WidgetShell';

interface WidgetMeta {
  id: string;
  title: string;
  icon: string;
  href: string;
}

interface AvailableWidgetMeta extends WidgetMeta {
  description: string;
  visible: boolean;
}

interface WidgetBoardProps {
  widgets: WidgetMeta[];
  allAvailable: AvailableWidgetMeta[];
  initialPrefs: DashboardWidgetPrefs;
  slots: Record<string, ReactNode>;
}

// ─── Sortable item wrapper ────────────────────────────────────────────────────

function SortableWidgetItem({
  widget,
  collapsed,
  onToggleCollapse,
  slot,
}: {
  widget: WidgetMeta;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  slot: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <WidgetShell
        id={widget.id}
        title={widget.title}
        icon={widget.icon}
        href={widget.href}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
      >
        {slot}
      </WidgetShell>
    </div>
  );
}

// ─── Main board ──────────────────────────────────────────────────────────────

export default function WidgetBoard({
  widgets,
  allAvailable,
  initialPrefs,
  slots,
}: WidgetBoardProps) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(() => widgets.map((w) => w.id));
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(initialPrefs.hidden ?? []),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(initialPrefs.collapsed ?? []),
  );
  const [screenOptionsOpen, setScreenOptionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build ordered visible widget list from current state
  const visibleWidgets = order
    .map((id) => widgets.find((w) => w.id === id))
    .filter((w): w is WidgetMeta => !!w && !hidden.has(w.id));

  async function persistPrefs(nextOrder: string[], nextHidden: Set<string>, nextCollapsed: Set<string>) {
    setSaving(true);
    try {
      await fetch('/api/portal/dashboard/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: nextOrder,
          hidden: Array.from(nextHidden),
          collapsed: Array.from(nextCollapsed),
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);
    persistPrefs(newOrder, hidden, collapsed);
  }

  function handleToggleCollapse(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCollapsed(next);
    persistPrefs(order, hidden, next);
  }

  function handleToggleVisibility(id: string, visible: boolean) {
    const next = new Set(hidden);
    if (visible) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setHidden(next);
    persistPrefs(order, next, collapsed).then(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {/* Board header */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-foreground">Dashboard Widgets</h2>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
          <button
            type="button"
            onClick={() => setScreenOptionsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            <span className="material-icons text-base">tune</span>
            Screen Options
          </button>
        </div>
      </div>

      {/* Screen Options panel */}
      {screenOptionsOpen && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Show / hide widgets
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allAvailable.map((w) => {
              const isVisible = !hidden.has(w.id);
              return (
                <label
                  key={w.id}
                  className="flex items-start gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                    checked={isVisible}
                    onChange={(e) => handleToggleVisibility(w.id, e.target.checked)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <span className="material-icons text-sm text-muted-foreground">{w.icon}</span>
                      {w.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{w.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Widget grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            {visibleWidgets.map((w) => (
              <SortableWidgetItem
                key={w.id}
                widget={w}
                collapsed={collapsed.has(w.id)}
                onToggleCollapse={handleToggleCollapse}
                slot={slots[w.id]}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {visibleWidgets.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-3xl text-muted-foreground">dashboard_customize</span>
          <p className="mt-3 text-sm text-muted-foreground">
            No widgets visible. Use Screen Options to enable some.
          </p>
        </div>
      )}
    </div>
  );
}
