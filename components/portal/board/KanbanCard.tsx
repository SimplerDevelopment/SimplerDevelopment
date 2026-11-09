// Extracted verbatim from components/portal/KanbanBoard.tsx (PUX-176) — the board is pinned at 996 code lines; the channel chip lands here.
'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor, stripMarkdown } from '@/lib/portal-utils';
import { CARD_TYPE_META } from '../card-detail/_lib/agile';
import { useFeatureFlag } from '../FeatureFlagsProvider';
import type { ChannelChip } from '@/lib/publishing/channel-chip';
import { scheduledLabel } from '@/lib/email/campaign-rates';

export interface CardAttachment {
  url: string;
  mimeType: string;
}

export interface CardLabel {
  id: number;
  name: string;
  color: string;
}

// Note: cardType / workflowState are intentionally widened to `string` here
// because the DB column is varchar and not all callers type-narrow before
// passing the row in. Runtime fallbacks in the chip use CARD_TYPE_META[type]
// only after narrowing through `keyof typeof CARD_TYPE_META`.
export interface Card {
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
  /** PUX-176 (design doc screen 35): publishing cards carry their channel as a chip, the campaign
   *  as a quiet line, and a Scheduled piece its send time. Only set under the portal-redesign flag. */
  channel?: ChannelChip | null;
  campaignName?: string | null;
  scheduledFor?: string | Date | null;
}

export { CARD_TYPE_META };

export function KanbanCard({
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
  const studio = useFeatureFlag('portal-redesign');
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
        <div className="absolute top-1.5 right-1.5 opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity z-10">
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
      {studio && (card.channel || card.campaignName) && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          {card.channel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 font-semibold uppercase tracking-[.05em] text-muted-foreground">
              <span className="material-icons text-[13px]">{card.channel.icon}</span>{card.channel.label}
            </span>
          )}
          {card.campaignName && <span className="truncate text-muted-foreground">{card.campaignName}</span>}
        </div>
      )}
      <p className="text-sm font-medium text-foreground pr-6">{card.title}</p>
      {studio && card.scheduledFor && (
        <p className="mt-1 flex items-center gap-1 text-xs text-primary">
          <span className="material-icons text-[14px]">event</span>{scheduledLabel(typeof card.scheduledFor === 'string' ? card.scheduledFor : card.scheduledFor.toISOString())}
        </p>
      )}
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

export default KanbanCard;
