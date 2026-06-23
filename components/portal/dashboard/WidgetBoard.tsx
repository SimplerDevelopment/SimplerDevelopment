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
import { SOLUTION_LABELS } from '@/lib/dashboard/widgets';
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
  solution: string;
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
  onRemove,
  isCustomizing,
  slot,
}: {
  widget: WidgetMeta;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onRemove: (id: string) => void;
  isCustomizing: boolean;
  slot: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
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
        isCustomizing={isCustomizing}
        onRemove={onRemove}
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
  const [widgetSearch, setWidgetSearch] = useState('');

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

  // ─── Screen Options panel helpers ────────────────────────────────────────────

  const solutionOrder: string[] = [];
  const solutionMap: Record<string, AvailableWidgetMeta[]> = {};
  for (const w of allAvailable) {
    if (!solutionMap[w.solution]) {
      solutionOrder.push(w.solution);
      solutionMap[w.solution] = [];
    }
    solutionMap[w.solution].push(w);
  }

  const trimmedQuery = widgetSearch.trim().toLowerCase();
  const filteredSolutionOrder = trimmedQuery
    ? solutionOrder.filter((slug) => {
        const label = (SOLUTION_LABELS[slug] ?? slug).toLowerCase();
        return (
          label.includes(trimmedQuery) ||
          solutionMap[slug].some(
            (w) =>
              w.title.toLowerCase().includes(trimmedQuery) ||
              w.description.toLowerCase().includes(trimmedQuery),
          )
        );
      })
    : solutionOrder;

  const filteredSolutionMap: Record<string, AvailableWidgetMeta[]> = {};
  for (const slug of filteredSolutionOrder) {
    const label = (SOLUTION_LABELS[slug] ?? slug).toLowerCase();
    filteredSolutionMap[slug] = trimmedQuery && !label.includes(trimmedQuery)
      ? solutionMap[slug].filter(
          (w) =>
            w.title.toLowerCase().includes(trimmedQuery) ||
            w.description.toLowerCase().includes(trimmedQuery),
        )
      : solutionMap[slug];
  }

  const hasResults = filteredSolutionOrder.some(
    (slug) => filteredSolutionMap[slug].length > 0,
  );

  return (
    <div className="space-y-4">
      {/* Board header */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[13px] font-semibold text-foreground">Dashboard Widgets</h2>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[11px] font-mono text-muted-foreground">Saving…</span>
          )}
          <button
            type="button"
            onClick={() => {
              setScreenOptionsOpen((v) => {
                if (v) setWidgetSearch('');
                return !v;
              });
            }}
            className={[
              'inline-flex items-center gap-1.5 h-[34px] px-3 text-[13px] font-medium rounded-md border transition-colors',
              screenOptionsOpen
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-card border-border text-foreground hover:bg-accent',
            ].join(' ')}
          >
            <span className="material-icons text-[17px] leading-none">tune</span>
            Customize
          </button>
        </div>
      </div>

      {/* ── Screen Options slide-in panel ─────────────────────────────────── */}
      {screenOptionsOpen && (
        <div className="bg-card border border-[var(--portal-border-strong)] rounded-xl overflow-hidden">
          {/* Panel head */}
          <div className="flex items-start justify-between gap-3 px-[18px] py-4 border-b border-border">
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">Screen Options</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">Toggle widgets on or off. Drag to reorder.</p>
            </div>
            <button
              type="button"
              onClick={() => { setScreenOptionsOpen(false); setWidgetSearch(''); }}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors mt-0.5"
              aria-label="Close Screen Options"
            >
              <span className="material-icons text-[18px] leading-none">close</span>
            </button>
          </div>

          {/* Search */}
          <div className="px-[18px] pt-3 pb-2">
            <div className="relative">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[16px] leading-none">search</span>
              <input
                type="text"
                value={widgetSearch}
                onChange={(e) => setWidgetSearch(e.target.value)}
                placeholder="Search widgets…"
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Widget list */}
          <div className="px-2 pb-4 max-h-[420px] overflow-y-auto">
            {!hasResults && trimmedQuery ? (
              <p className="text-[13px] text-muted-foreground px-4 py-3">
                No widgets match &ldquo;{widgetSearch.trim()}&rdquo;.
              </p>
            ) : (
              filteredSolutionOrder.map((slug) =>
                filteredSolutionMap[slug].length === 0 ? null : (
                  <div key={slug}>
                    {/* Group label */}
                    <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground px-[10px] pt-3 pb-1.5">
                      {SOLUTION_LABELS[slug] ?? slug}
                    </p>
                    {filteredSolutionMap[slug].map((w) => {
                      const isVisible = !hidden.has(w.id);
                      return (
                        <div
                          key={w.id}
                          className={[
                            'flex items-center gap-[10px] px-[10px] py-2 rounded-md transition-colors',
                            'hover:bg-accent',
                            !isVisible ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          {/* Toggle switch */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isVisible}
                            onClick={() => handleToggleVisibility(w.id, !isVisible)}
                            className={[
                              'relative shrink-0 w-8 h-[18px] rounded-full transition-colors duration-150',
                              isVisible ? 'bg-primary' : 'bg-[var(--portal-border-strong)]',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-150',
                                isVisible ? 'translate-x-[14px]' : 'translate-x-0',
                              ].join(' ')}
                            />
                          </button>

                          {/* Widget icon */}
                          <span className="material-icons text-[17px] leading-none text-muted-foreground shrink-0">{w.icon}</span>

                          {/* Widget name + description */}
                          <div className="min-w-0 flex-1">
                            <p className={['text-[13px] font-medium', isVisible ? 'text-foreground' : 'text-muted-foreground'].join(' ')}>
                              {w.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">{w.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ),
              )
            )}
          </div>
        </div>
      )}

      {/* ── Widget grid ──────────────────────────────────────────────────── */}
      {/* A stable `id` is required: without it dnd-kit assigns an
          auto-incrementing aria-describedby id that differs between the server
          and client render, producing a hydration mismatch. */}
      <DndContext id="dashboard-widget-board" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {visibleWidgets.map((w) => (
              <SortableWidgetItem
                key={w.id}
                widget={w}
                collapsed={collapsed.has(w.id)}
                onToggleCollapse={handleToggleCollapse}
                onRemove={(id) => handleToggleVisibility(id, false)}
                isCustomizing={screenOptionsOpen}
                slot={slots[w.id]}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {visibleWidgets.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          {/* Empty icon container */}
          <div className="w-11 h-11 rounded-[11px] border border-border bg-[var(--portal-surface-2)] flex items-center justify-center mx-auto mb-3">
            <span className="material-icons text-[22px] leading-none text-muted-foreground">dashboard_customize</span>
          </div>
          <p className="text-[14px] font-semibold text-foreground">No widgets visible</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
            Use Customize to enable widgets on your dashboard.
          </p>
        </div>
      )}
    </div>
  );
}
