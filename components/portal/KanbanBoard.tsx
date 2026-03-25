'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor } from '@/lib/portal-utils';
import CardDetailModal from './CardDetailModal';

interface CardAttachment {
  url: string;
  mimeType: string;
}

interface Card {
  id: number;
  columnId: number;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | Date | null;
  order: number;
  sprintId?: number | null;
  attachments?: CardAttachment[];
}

interface Column {
  id: number;
  name: string;
  color: string | null;
  order: number;
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
  currentUserId: number;
  sprints?: SprintOption[];
}

function KanbanCard({
  card,
  onOpen,
  isDragging,
}: {
  card: Card;
  onOpen: () => void;
  isDragging?: boolean;
}) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
    >
      <p className="text-sm font-medium text-foreground">{card.title}</p>
      {card.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{card.description}</p>
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
      <div className="mt-2 flex items-center gap-2">
        {card.priority && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(card.priority)}`}>
            {card.priority}
          </span>
        )}
        {card.dueDate && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <span className="material-icons text-xs">event</span>
            {new Date(card.dueDate).toLocaleDateString()}
          </span>
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
}) {
  const cardIds = column.cards.map(c => `card-${c.id}`);

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/40 rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          {column.color && (
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
          )}
          <h3 className="text-sm font-semibold text-foreground">{column.name}</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {column.cards.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 flex-1 min-h-[80px]">
          {column.cards.map(card => (
            <KanbanCard
              key={card.id}
              card={card}
              onOpen={() => onCardOpen(card.id)}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add card */}
      {isStaff && (
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
      )}
    </div>
  );
}

export default function KanbanBoard({ projectId, initialColumns, isStaff, currentUserId, sprints = [] }: Props) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [filterSprintId, setFilterSprintId] = useState<number | 'backlog' | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<number | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    const { active } = event;
    const activeId = active.id as string;
    if (!activeId.startsWith('card-')) return;

    const cardId = parseInt(activeId.replace('card-', ''), 10);
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

  const allColumnIds = columns.map(c => `col-${c.id}`);

  const filteredColumns = filterSprintId === null
    ? columns
    : columns.map(col => ({
        ...col,
        cards: col.cards.filter(c =>
          filterSprintId === 'backlog'
            ? c.sprintId == null
            : c.sprintId === filterSprintId
        ),
      }));

  return (
    <>
      {sprints.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs font-medium text-muted-foreground">Sprint:</span>
          <button
            onClick={() => setFilterSprintId(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterSprintId === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            All
          </button>
          {sprints.map(s => (
            <button
              key={s.id}
              onClick={() => setFilterSprintId(s.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterSprintId === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {s.name}
            </button>
          ))}
          <button
            onClick={() => setFilterSprintId('backlog')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterSprintId === 'backlog' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            Backlog
          </button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={allColumnIds} strategy={verticalListSortingStrategy}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {filteredColumns.map(col => (
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
                onCardOpen={id => { if (!activeCard) setSelectedCardId(id); }}
              />
            ))}
          </div>
        </SortableContext>

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
          isStaff={isStaff}
          currentUserId={currentUserId}
          onClose={() => setSelectedCardId(null)}
          onDeleted={handleCardDeleted}
          onUpdated={handleCardUpdated}
        />
      )}
    </>
  );
}
