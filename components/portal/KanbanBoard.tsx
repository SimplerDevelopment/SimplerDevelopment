'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  pointerWithin,
  CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor, stripMarkdown } from '@/lib/portal-utils';
import CardDetailModal from './CardDetailModal';
import { CARD_TYPE_META } from './card-detail/_lib/agile';

interface CardAttachment {
  url: string;
  mimeType: string;
}

interface CardLabel {
  id: number;
  name: string;
  color: string;
}

// Note: cardType / workflowState are intentionally widened to `string` here
// because the DB column is varchar and not all callers type-narrow before
// passing the row in. Runtime fallbacks in the chip use CARD_TYPE_META[type]
// only after narrowing through `keyof typeof CARD_TYPE_META`.
interface Card {
  id: number;
  columnId: number;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | Date | null;
  order: number;
  sprintId?: number | null;
  key?: string | null;
  attachments?: CardAttachment[];
  labels?: CardLabel[];
  checklist?: { total: number; done: number } | null;
  assignees?: { id: number; name: string }[];
  blockedCount?: number;
  commentCount?: number;
  unreadAlerts?: number;
  isWatching?: boolean;
  storyPoints?: number | null;
  cardType?: string;
  parentCardId?: number | null;
  workflowState?: string;
}

interface Column {
  id: number;
  name: string;
  color: string | null;
  order: number;
  isDone?: boolean;
  wipLimit?: number | null;
  cards: Card[];
}

interface SprintOption {
  id: number;
  name: string;
  status: string;
}

interface Props {
  projectId: number;
  initialColumns: Column[];
  isStaff: boolean;
  canEdit: boolean;
  currentUserId: number;
  sprints?: SprintOption[];
  /** Card id from the addressable route /portal/projects/<id>/<cardId>; opens that card on load. */
  initialCardId?: number | null;
}

function KanbanCard({
  card,
  onOpen,
  isDragging,
  columns,
  onMoveToColumn,
}: {
  card: Card;
  onOpen: () => void;
  isDragging?: boolean;
  columns?: { id: number; name: string; color: string | null }[];
  onMoveToColumn?: (cardId: number, columnId: number) => void;
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `card-${card.id}`,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const attachments = card.attachments ?? [];
  const imageThumbs = attachments.filter(a => a.mimeType.startsWith('image/')).slice(0, 2);
  const totalCount = attachments.length;
  const otherColumns = (columns || []).filter(c => c.id !== card.columnId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group/card relative"
    >
      {/* Move-to button */}
      {otherColumns.length > 0 && onMoveToColumn && (
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu); }}
            className="p-1 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Move to column"
          >
            <span className="material-icons text-sm">swap_horiz</span>
          </button>
          {showMoveMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-20">
              <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Move to</p>
              {otherColumns.map(col => (
                <button
                  key={col.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToColumn(card.id, col.id);
                    setShowMoveMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors flex items-center gap-2"
                >
                  {col.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />}
                  {col.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5 pr-6">
          {card.labels.map(l => (
            <span
              key={l.id}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-0.5 text-[10px]">
        {card.cardType && card.cardType !== 'task' && card.cardType in CARD_TYPE_META && (
          <span
            className={`material-icons text-sm ${CARD_TYPE_META[card.cardType as keyof typeof CARD_TYPE_META].color}`}
            title={CARD_TYPE_META[card.cardType as keyof typeof CARD_TYPE_META].label}
          >
            {CARD_TYPE_META[card.cardType as keyof typeof CARD_TYPE_META].icon}
          </span>
        )}
        {card.key && <span className="font-mono text-muted-foreground">{card.key}</span>}
        {card.storyPoints != null && (
          <span className="px-1 rounded bg-primary/10 text-primary font-semibold" title={`${card.storyPoints} story points`}>
            {card.storyPoints}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-foreground pr-6">{card.title}</p>
      {card.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{stripMarkdown(card.description)}</p>
      )}
      {imageThumbs.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          {imageThumbs.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img.url}
              alt=""
              className="h-10 w-14 object-cover rounded border border-border flex-shrink-0"
            />
          ))}
          {totalCount > 2 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
              <span className="material-icons text-xs">attach_file</span>
              +{totalCount - 2}
            </span>
          )}
        </div>
      )}
      {totalCount > 0 && imageThumbs.length === 0 && (
        <div className="mt-2 flex items-center gap-0.5 text-xs text-muted-foreground">
          <span className="material-icons text-xs">attach_file</span>
          {totalCount}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {card.priority && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(card.priority)}`}>
            {card.priority}
          </span>
        )}
        {card.dueDate && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <span className="material-icons text-xs">event</span>
            {new Date(card.dueDate).toLocaleDateString('en-US')}
          </span>
        )}
        {card.checklist && card.checklist.total > 0 && (
          <span className={`text-xs flex items-center gap-0.5 ${card.checklist.done === card.checklist.total ? 'text-green-600' : 'text-muted-foreground'}`}>
            <span className="material-icons text-xs">check_box</span>
            {card.checklist.done}/{card.checklist.total}
          </span>
        )}
        {card.commentCount !== undefined && card.commentCount > 0 && (
          <span className="text-xs flex items-center gap-0.5 text-muted-foreground" title={`${card.commentCount} comment${card.commentCount === 1 ? '' : 's'}`}>
            <span className="material-icons text-xs">chat_bubble</span>
            {card.commentCount}
          </span>
        )}
        {card.unreadAlerts !== undefined && card.unreadAlerts > 0 && (
          <span className="text-xs flex items-center gap-0.5 text-primary font-medium" title={`${card.unreadAlerts} unread alert${card.unreadAlerts === 1 ? '' : 's'} on this card`}>
            <span className="material-icons text-xs">notifications_active</span>
            {card.unreadAlerts}
          </span>
        )}
        {card.blockedCount !== undefined && card.blockedCount > 0 && (
          <span className="text-xs flex items-center gap-0.5 text-destructive font-medium"
            title={`Blocked by ${card.blockedCount} card${card.blockedCount === 1 ? '' : 's'}`}>
            <span className="material-icons text-xs">block</span>
            {card.blockedCount}
          </span>
        )}
        {card.assignees && card.assignees.length > 0 && (
          <div className="flex -space-x-1 ml-auto">
            {card.assignees.slice(0, 3).map(a => (
              <span key={a.id}
                title={a.name}
                className="w-5 h-5 rounded-full bg-primary/10 border border-card flex items-center justify-center text-[10px] font-semibold text-primary">
                {(a.name ?? '?').trim().charAt(0).toUpperCase()}
              </span>
            ))}
            {card.assignees.length > 3 && (
              <span className="w-5 h-5 rounded-full bg-muted border border-card flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                +{card.assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  isStaff,
  addingToColumn,
  newCardTitle,
  onStartAdd,
  onCancelAdd,
  onNewCardTitleChange,
  onSubmitAdd,
  onCardOpen,
  allColumns,
  onMoveToColumn,
  onMoveColumn,
  onDeleteColumn,
  onToggleDone,
  onSetWipLimit,
  isFirst,
  isLast,
}: {
  column: Column;
  isStaff: boolean;
  addingToColumn: number | null;
  newCardTitle: string;
  onStartAdd: (columnId: number) => void;
  onCancelAdd: () => void;
  onNewCardTitleChange: (v: string) => void;
  onSubmitAdd: (e: React.FormEvent) => void;
  onCardOpen: (cardId: number) => void;
  allColumns: { id: number; name: string; color: string | null }[];
  onMoveToColumn: (cardId: number, columnId: number) => void;
  onMoveColumn: (columnId: number, direction: 'left' | 'right') => void;
  onDeleteColumn: (columnId: number) => void;
  onToggleDone: (columnId: number, isDone: boolean) => void;
  onSetWipLimit: (columnId: number, limit: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const cardIds = column.cards.map(c => `card-${c.id}`);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `col-${column.id}` });
  const isEmpty = column.cards.length === 0;

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/40 rounded-xl border border-border group/col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {column.color && (
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
          )}
          <h3 className="text-sm font-semibold text-foreground truncate">{column.name}</h3>
          {(() => {
            const limit = column.wipLimit ?? 0;
            const count = column.cards.length;
            const atLimit = limit > 0 && count >= limit;
            const over = limit > 0 && count > limit;
            const tone = over
              ? 'bg-red-100 text-red-700'
              : atLimit
                ? 'bg-amber-100 text-amber-700'
                : 'bg-muted text-muted-foreground';
            return (
              <span className={`text-xs rounded-full px-1.5 py-0.5 shrink-0 font-medium ${tone}`}
                title={limit > 0 ? `WIP limit: ${limit}${over ? ' (over limit — drops will be rejected)' : atLimit ? ' (at limit — next add will be rejected)' : ''}` : undefined}>
                {count}{limit > 0 ? `/${limit}` : ''}
              </span>
            );
          })()}
          {column.isDone && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium shrink-0" title="Marked as Done column">
              Done
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0">
          {isStaff && (
            <button
              type="button"
              onClick={() => onToggleDone(column.id, !column.isDone)}
              className={`p-0.5 rounded transition-colors ${column.isDone ? 'text-green-600' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              title={column.isDone ? 'Remove as Done column' : 'Mark as Done column (for sprint reports)'}
            >
              <span className="material-icons text-sm">{column.isDone ? 'check_circle' : 'check_circle_outline'}</span>
            </button>
          )}
          {isStaff && (
            <button
              type="button"
              onClick={() => {
                const current = column.wipLimit ?? '';
                const input = window.prompt('Set WIP limit for this column (leave empty to remove):', String(current));
                if (input === null) return;
                const n = input.trim() === '' ? 0 : parseInt(input, 10);
                if (Number.isNaN(n) || n < 0) return;
                onSetWipLimit(column.id, n);
              }}
              className={`p-0.5 rounded transition-colors ${column.wipLimit ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              title={column.wipLimit ? `WIP limit: ${column.wipLimit}` : 'Set WIP limit'}
            >
              <span className="material-icons text-sm">speed</span>
            </button>
          )}
          {!isFirst && (
            <button
              type="button"
              onClick={() => onMoveColumn(column.id, 'left')}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Move left"
            >
              <span className="material-icons text-sm">chevron_left</span>
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              onClick={() => onMoveColumn(column.id, 'right')}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Move right"
            >
              <span className="material-icons text-sm">chevron_right</span>
            </button>
          )}
          {isEmpty && (
            <button
              type="button"
              onClick={() => onDeleteColumn(column.id)}
              className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-0.5"
              title="Delete empty column"
            >
              <span className="material-icons text-sm">delete_outline</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setDropRef}
          className={`p-2 space-y-2 flex-1 min-h-[80px] transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset rounded-b-xl' : ''}`}
        >
          {column.cards.map(card => (
            <KanbanCard
              key={card.id}
              card={card}
              onOpen={() => onCardOpen(card.id)}
              columns={allColumns}
              onMoveToColumn={onMoveToColumn}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add card */}
      <div className="p-2 border-t border-border/50">
        {addingToColumn === column.id ? (
          <form onSubmit={onSubmitAdd} className="space-y-2">
            <input
              autoFocus
              value={newCardTitle}
              onChange={e => onNewCardTitleChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onCancelAdd(); }}
              placeholder="Card title…"
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newCardTitle.trim()}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={onCancelAdd}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => onStartAdd(column.id)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg px-2 py-1.5 transition-colors w-full"
          >
            <span className="material-icons text-sm">add</span>
            Add card
          </button>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({ projectId, initialColumns, isStaff, canEdit, currentUserId, sprints = [], initialCardId = null }: Props) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [filterSprintId, setFilterSprintId] = useState<number | 'backlog' | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Set<string>>(new Set());
  const [filterAssignees, setFilterAssignees] = useState<Set<number>>(new Set());
  const [filterLabels, setFilterLabels] = useState<Set<number>>(new Set());
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<number | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#6366f1');

  const allAssignees: { id: number; name: string }[] = (() => {
    const map = new Map<number, { id: number; name: string }>();
    for (const col of columns) for (const c of col.cards) for (const a of c.assignees ?? []) map.set(a.id, a);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  const allLabels: CardLabel[] = (() => {
    const map = new Map<number, CardLabel>();
    for (const col of columns) for (const c of col.cards) for (const l of c.labels ?? []) map.set(l.id, l);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  const activeFilterCount =
    (filterSearch.trim() ? 1 : 0)
    + filterPriority.size
    + filterAssignees.size
    + filterLabels.size
    + (filterSprintId !== null ? 1 : 0);

  function toggleSetValue<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }
  function clearFilters() {
    setFilterSearch(''); setFilterPriority(new Set()); setFilterAssignees(new Set());
    setFilterLabels(new Set()); setFilterSprintId(null);
  }

  // PointerSensor handles both mouse + touch. Adding MouseSensor alongside
  // causes drag events to race and can silently cancel drops in some browsers.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Custom collision detection:
  // 1. pointerWithin first — gives unambiguous "cursor is directly over this column".
  //    If the cursor is over a column, prefer the card inside that column closest to
  //    the pointer. This makes cross-column drags reliable regardless of the
  //    active card's rect size.
  // 2. Fall back to closestCenter over cards if the pointer isn't over any column
  //    (e.g. at column edges / between columns).
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const overCol = pointerCollisions.find(c => String(c.id).startsWith('col-'));
    if (overCol) {
      // Prefer the closest card inside that column so ordering works
      const colId = String(overCol.id);
      const projectedColId = parseInt(colId.replace('col-', ''), 10);
      const cardCollisions = closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter(c => {
          const id = String(c.id);
          if (!id.startsWith('card-')) return false;
          const cardId = parseInt(id.replace('card-', ''), 10);
          return columns.find(col => col.id === projectedColId)?.cards.some(cc => cc.id === cardId) ?? false;
        }),
      });
      if (cardCollisions.length > 0) return [cardCollisions[0]];
      return [overCol];
    }
    // Fallback: card-level proximity anywhere on screen
    const corners = closestCorners(args);
    const firstCard = corners.find(c => String(c.id).startsWith('card-'));
    if (firstCard) return [firstCard];
    return corners;
  };

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'card') setActiveCard(data.card);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const isActiveCard = activeId.startsWith('card-');
    const isOverCard = overId.startsWith('card-');
    const isOverColumn = overId.startsWith('col-');

    if (!isActiveCard) return;

    const activeCardId = parseInt(activeId.replace('card-', ''), 10);
    const activeColIndex = columns.findIndex(col => col.cards.some(c => c.id === activeCardId));
    if (activeColIndex === -1) return;

    setColumns(cols => {
      const newCols = cols.map(col => ({ ...col, cards: [...col.cards] }));

      const activeColIdx = newCols.findIndex(col => col.cards.some(c => c.id === activeCardId));
      const activeCardIdx = newCols[activeColIdx].cards.findIndex(c => c.id === activeCardId);
      const [movedCard] = newCols[activeColIdx].cards.splice(activeCardIdx, 1);

      if (isOverColumn) {
        const targetColId = parseInt(overId.replace('col-', ''), 10);
        const targetColIdx = newCols.findIndex(c => c.id === targetColId);
        if (targetColIdx !== -1) {
          movedCard.columnId = newCols[targetColIdx].id;
          newCols[targetColIdx].cards.push(movedCard);
        }
      } else if (isOverCard) {
        const overCardId = parseInt(overId.replace('card-', ''), 10);
        const targetColIdx = newCols.findIndex(col => col.cards.some(c => c.id === overCardId));
        const targetCardIdx = newCols[targetColIdx].cards.findIndex(c => c.id === overCardId);
        movedCard.columnId = newCols[targetColIdx].id;
        newCols[targetColIdx].cards.splice(targetCardIdx, 0, movedCard);
      }

      return newCols;
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    const activeId = active.id as string;
    if (!activeId.startsWith('card-')) return;

    const cardId = parseInt(activeId.replace('card-', ''), 10);

    // If dropped over a column directly (empty column), move card there
    if (over && String(over.id).startsWith('col-')) {
      const targetColId = parseInt(String(over.id).replace('col-', ''), 10);
      setColumns(cols => {
        const newCols = cols.map(col => ({ ...col, cards: [...col.cards] }));
        const srcIdx = newCols.findIndex(col => col.cards.some(c => c.id === cardId));
        if (srcIdx === -1) return cols;
        const cardIdx = newCols[srcIdx].cards.findIndex(c => c.id === cardId);
        const [movedCard] = newCols[srcIdx].cards.splice(cardIdx, 1);
        const destIdx = newCols.findIndex(c => c.id === targetColId);
        if (destIdx !== -1) {
          movedCard.columnId = targetColId;
          newCols[destIdx].cards.push(movedCard);
        }
        return newCols;
      });
      // Persist — use timeout so state has settled
      setTimeout(async () => {
        await fetch(`/api/portal/cards/${cardId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId: targetColId, order: 0 }),
        });
      }, 0);
      return;
    }

    // Normal case: card was dropped on/between other cards — position already set by onDragOver
    const col = columns.find(c => c.cards.some(card => card.id === cardId));
    if (!col) return;

    const cardIndex = col.cards.findIndex(c => c.id === cardId);

    await fetch(`/api/portal/cards/${cardId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: col.id, order: cardIndex }),
    });
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    if (!newCardTitle.trim() || !addingToColumn) return;

    const res = await fetch('/api/portal/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: addingToColumn, title: newCardTitle.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      setColumns(prev =>
        prev.map(col =>
          col.id === addingToColumn
            ? { ...col, cards: [...col.cards, data.data] }
            : col,
        ),
      );
      setNewCardTitle('');
      setAddingToColumn(null);
    }
  }

  function handleCardUpdated(update: { id: number } & Partial<Card>) {
    setColumns(prev =>
      prev.map(col => ({
        ...col,
        cards: col.cards.map(c => c.id === update.id ? { ...c, ...update } : c),
      })),
    );
  }

  function handleCardDeleted(cardId: number) {
    setColumns(prev =>
      prev.map(col => ({
        ...col,
        cards: col.cards.filter(c => c.id !== cardId),
      })),
    );
    setSelectedCardId(null);
  }

  async function handleAddColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColumnName.trim()) return;

    const res = await fetch(`/api/portal/projects/${projectId}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newColumnName.trim(), color: newColumnColor }),
    });
    const data = await res.json();
    if (data.success) {
      setColumns(prev => [...prev, { ...data.data, cards: [] }]);
      setNewColumnName('');
      setNewColumnColor('#6366f1');
      setAddingColumn(false);
    }
  }

  async function handleMoveColumn(columnId: number, direction: 'left' | 'right') {
    setColumns(prev => {
      const idx = prev.findIndex(c => c.id === columnId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const newCols = [...prev];
      [newCols[idx], newCols[swapIdx]] = [newCols[swapIdx], newCols[idx]];
      return newCols;
    });

    // Persist new order
    const reordered = (() => {
      const copy = [...columns];
      const idx = copy.findIndex(c => c.id === columnId);
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= copy.length) return null;
      [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
      return copy.map(c => c.id);
    })();

    if (reordered) {
      await fetch(`/api/portal/projects/${projectId}/columns/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnIds: reordered }),
      });
    }
  }

  async function handleDeleteColumn(columnId: number) {
    const col = columns.find(c => c.id === columnId);
    if (!col || col.cards.length > 0) return;

    const res = await fetch(`/api/portal/projects/${projectId}/columns/${columnId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      setColumns(prev => prev.filter(c => c.id !== columnId));
    }
  }

  async function handleToggleDone(columnId: number, isDone: boolean) {
    setColumns(prev => prev.map(c =>
      c.id === columnId ? { ...c, isDone }
        : isDone ? { ...c, isDone: false } : c,
    ));
    await fetch(`/api/portal/projects/${projectId}/columns/${columnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone }),
    });
  }

  async function handleSetWipLimit(columnId: number, limit: number) {
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, wipLimit: limit > 0 ? limit : null } : c));
    await fetch(`/api/portal/projects/${projectId}/columns/${columnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wipLimit: limit }),
    });
  }

  // ─── Card deep-linking / URL sync ──────────────────────────────────────
  // Each open card is addressable at /portal/projects/<projectId>/<cardId>.
  // The modal stays client-side (no server navigation) — we only rewrite the
  // URL via history so opening a card is instant and the board never re-renders.
  const projectBasePath = `/portal/projects/${projectId}`;
  // Tracks whether the currently-open card was opened by us via pushState (so
  // closing can pop back), vs. arrived via a hard load / deep link (so closing
  // just replaces the URL without leaving the app).
  const didPushCardRef = useRef(false);

  const cardIdFromPath = (pathname: string): number | null => {
    // Matches /portal/projects/<projectId>/<cardId> (optional catch-all route).
    const m = pathname.match(new RegExp(`^/portal/projects/${projectId}/(\\d+)`));
    if (!m) return null;
    const id = parseInt(m[1], 10);
    return Number.isFinite(id) ? id : null;
  };

  function openCard(id: number) {
    setSelectedCardId(id);
    if (typeof window === 'undefined') return;
    if (cardIdFromPath(window.location.pathname) === id) return; // already addressed (deep load)
    window.history.pushState({ sdCardId: id }, '', `${projectBasePath}/${id}${window.location.search}`);
    didPushCardRef.current = true;
  }

  function closeCard() {
    setSelectedCardId(null);
    if (typeof window === 'undefined') return;
    if (didPushCardRef.current) {
      didPushCardRef.current = false;
      window.history.back(); // return to the pre-open entry; popstate reconciles state
    } else if (cardIdFromPath(window.location.pathname) != null) {
      window.history.replaceState({}, '', `${projectBasePath}${window.location.search}`);
    }
  }

  // Seed the open card on mount from the path segment (preferred) or the legacy
  // ?card=<id> query param (still emitted by notifications / standup links).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromPath = initialCardId ?? cardIdFromPath(window.location.pathname);
    const fromQuery = (() => {
      const p = new URLSearchParams(window.location.search).get('card');
      const id = p ? parseInt(p, 10) : NaN;
      return Number.isFinite(id) ? id : null;
    })();
    (async () => {
      await Promise.resolve();
      const seed = fromPath ?? fromQuery;
      if (seed != null) setSelectedCardId(seed);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward: reconcile the open card with the URL.
  useEffect(() => {
    function onPop() {
      didPushCardRef.current = false;
      setSelectedCardId(cardIdFromPath(window.location.pathname));
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keyboard shortcuts: "/" focuses filter search, "c" starts adding a card to the first column.
  // Use refs for values to avoid re-registering the listener on every state change.
  const shortcutStateRef = useRef({ canEdit, columns, selectedCardId });
  useLayoutEffect(() => {
    shortcutStateRef.current = { canEdit, columns, selectedCardId };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = shortcutStateRef.current;
      if (s.selectedCardId !== null) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('input[placeholder="Filter cards…"]');
        el?.focus();
      } else if (e.key === 'c' && s.canEdit && s.columns.length > 0) {
        e.preventDefault();
        setAddingToColumn(s.columns[0].id);
      } else if (e.key === 'Escape') {
        setAddingToColumn(null);
        setAddingColumn(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Move card to a specific column (used by the "Move to" dropdown on cards)
  async function moveCardToColumn(cardId: number, targetColId: number) {
    setColumns(cols => {
      const newCols = cols.map(col => ({ ...col, cards: [...col.cards] }));
      const srcIdx = newCols.findIndex(col => col.cards.some(c => c.id === cardId));
      if (srcIdx === -1) return cols;
      const cardIdx = newCols[srcIdx].cards.findIndex(c => c.id === cardId);
      const [movedCard] = newCols[srcIdx].cards.splice(cardIdx, 1);
      const destIdx = newCols.findIndex(c => c.id === targetColId);
      if (destIdx !== -1) {
        movedCard.columnId = targetColId;
        newCols[destIdx].cards.push(movedCard);
      }
      return newCols;
    });
    await fetch(`/api/portal/cards/${cardId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: targetColId, order: 0 }),
    });
  }

  const allColumnsMeta = columns.map(c => ({ id: c.id, name: c.name, color: c.color }));

  const needle = filterSearch.trim().toLowerCase();
  const filteredColumns = columns.map(col => ({
    ...col,
    cards: col.cards.filter(c => {
      if (filterSprintId === 'backlog' && c.sprintId != null) return false;
      if (typeof filterSprintId === 'number' && c.sprintId !== filterSprintId) return false;
      if (filterPriority.size > 0 && !filterPriority.has(c.priority ?? 'medium')) return false;
      if (filterAssignees.size > 0 && !(c.assignees ?? []).some(a => filterAssignees.has(a.id))) return false;
      if (filterLabels.size > 0 && !(c.labels ?? []).some(l => filterLabels.has(l.id))) return false;
      if (needle) {
        const hay = `${c.title} ${c.description ?? ''} ${c.key ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    }),
  }));

  return (
    <>
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="material-icons text-sm text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Filter cards…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {(['low','medium','high','urgent']).map(p => (
            <button
              key={p}
              onClick={() => toggleSetValue(setFilterPriority, p)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterPriority.has(p) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {p}
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs px-2.5 py-1 rounded-full text-muted-foreground hover:text-destructive ml-auto">
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
        {(sprints.length > 0 || allAssignees.length > 0 || allLabels.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {sprints.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Sprint:</span>
                <button onClick={() => setFilterSprintId(null)}
                  className={`px-2 py-0.5 rounded-full border ${filterSprintId === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>All</button>
                {sprints.map(s => (
                  <button key={s.id} onClick={() => setFilterSprintId(s.id)}
                    className={`px-2 py-0.5 rounded-full border ${filterSprintId === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{s.name}</button>
                ))}
                <button onClick={() => setFilterSprintId('backlog')}
                  className={`px-2 py-0.5 rounded-full border ${filterSprintId === 'backlog' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Backlog</button>
              </div>
            )}
            {allAssignees.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Assignee:</span>
                {allAssignees.map(a => (
                  <button key={a.id} onClick={() => toggleSetValue(setFilterAssignees, a.id)}
                    className={`px-2 py-0.5 rounded-full border ${filterAssignees.has(a.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
            {allLabels.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Label:</span>
                {allLabels.map(l => {
                  const on = filterLabels.has(l.id);
                  return (
                    <button key={l.id} onClick={() => toggleSetValue(setFilterLabels, l.id)}
                      className="px-2 py-0.5 rounded-full border transition-colors"
                      style={{
                        backgroundColor: on ? l.color : 'transparent',
                        color: on ? '#fff' : l.color,
                        borderColor: l.color,
                      }}>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {filteredColumns.map((col, idx) => (
              <KanbanColumn
                key={col.id}
                column={col}
                isStaff={isStaff}
                addingToColumn={addingToColumn}
                newCardTitle={newCardTitle}
                onStartAdd={id => { setAddingToColumn(id); setNewCardTitle(''); }}
                onCancelAdd={() => setAddingToColumn(null)}
                onNewCardTitleChange={setNewCardTitle}
                onSubmitAdd={handleAddCard}
                onCardOpen={id => { if (!activeCard) openCard(id); }}
                allColumns={allColumnsMeta}
                onMoveToColumn={moveCardToColumn}
                onMoveColumn={handleMoveColumn}
                onDeleteColumn={handleDeleteColumn}
                onToggleDone={handleToggleDone}
                onSetWipLimit={handleSetWipLimit}
                isFirst={idx === 0}
                isLast={idx === filteredColumns.length - 1}
              />
            ))}

            {/* Add column */}
            <div className="flex-shrink-0 w-72">
              {addingColumn ? (
                <form onSubmit={handleAddColumn} className="bg-muted/40 rounded-xl border border-border p-3 space-y-3">
                  <input
                    autoFocus
                    value={newColumnName}
                    onChange={e => setNewColumnName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setAddingColumn(false); }}
                    placeholder="Column name..."
                    className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Color</label>
                    <input
                      type="color"
                      value={newColumnColor}
                      onChange={e => setNewColumnColor(e.target.value)}
                      className="w-6 h-6 rounded border border-border cursor-pointer"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!newColumnName.trim()}
                      className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingColumn(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAddingColumn(true)}
                  className="flex items-center justify-center gap-1 w-full py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors"
                >
                  <span className="material-icons text-sm">add</span>
                  Add column
                </button>
              )}
            </div>
          </div>

        <DragOverlay>
          {activeCard ? (
            <div className="rotate-2 opacity-90">
              <div className="bg-card border border-border rounded-lg p-3 shadow-lg w-72">
                <p className="text-sm font-medium text-foreground">{activeCard.title}</p>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedCardId !== null && (
        <CardDetailModal
          cardId={selectedCardId}
          projectId={projectId}
          isStaff={isStaff}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onClose={closeCard}
          onDeleted={(id) => { handleCardDeleted(id); closeCard(); }}
          onUpdated={handleCardUpdated}
        />
      )}
    </>
  );
}
