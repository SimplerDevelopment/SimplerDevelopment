// ─── MenuItemEditor: collapsible row + inline edit form for a single item ───

'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { NavItem } from '../_lib/types';

type MegaRole = 'nav-link' | 'column' | 'mega-item' | null;

interface Props {
  item: NavItem;
  editing: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<NavItem>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddChild?: () => void;
  onPublish?: () => void;
  onCancelDelete?: () => void;
  depth?: number;
  isMegaMenu?: boolean;
  siteId?: string;
}

function formatDraftTooltip(item: NavItem): string {
  const updatedAt = item.draft?.updatedAt;
  const updatedBy = item.draft?.updatedBy;
  const parts: string[] = [];
  if (updatedAt) {
    try {
      parts.push(`Updated ${new Date(updatedAt).toLocaleString()}`);
    } catch {
      parts.push(`Updated ${updatedAt}`);
    }
  }
  if (updatedBy != null) parts.push(`by user ${updatedBy}`);
  return parts.length > 0 ? parts.join(' ') : 'Unpublished draft';
}

export function MenuItemEditor({
  item,
  editing,
  onEdit,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddChild,
  onPublish,
  onCancelDelete,
  depth = 0,
  isMegaMenu = false,
  siteId,
}: Props) {
  const hasDraft = item.draft != null;
  const pendingDelete = item.draft?.pendingDelete === true;
  const draftTooltip = formatDraftTooltip(item);
  // Determine the role of this item in mega menu mode
  const megaRole: MegaRole = isMegaMenu
    ? depth === 0
      ? 'nav-link'
      : depth === 1
        ? 'column'
        : 'mega-item'
    : null;
  const roleIcon =
    megaRole === 'column' ? 'view_column' : megaRole === 'mega-item' ? 'link' : undefined;
  const roleLabel = megaRole === 'column' ? 'Column' : megaRole === 'mega-item' ? 'Item' : undefined;

  return (
    <div className={`${depth === 1 ? 'ml-6' : depth === 2 ? 'ml-12' : ''}`}>
      <div
        className={`rounded-lg border transition-colors ${
          editing
            ? 'border-primary bg-primary/5'
            : megaRole === 'column'
              ? 'border-border bg-muted/30 hover:border-primary/30'
              : 'border-border bg-card hover:border-primary/30'
        }`}
      >
        {/* Collapsed row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="material-icons text-base text-muted-foreground cursor-grab">
            drag_indicator
          </span>
          {roleIcon && (
            <span className="material-icons text-sm text-muted-foreground">{roleIcon}</span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-medium text-foreground truncate ${pendingDelete ? 'line-through text-muted-foreground' : ''}`}
              >
                {item.label}
              </span>
              {item.isButton && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
                  Button
                </span>
              )}
              {roleLabel && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground leading-none">
                  {roleLabel}
                </span>
              )}
              {hasDraft && !pendingDelete && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 leading-none"
                  title={draftTooltip}
                >
                  Draft
                </span>
              )}
              {pendingDelete && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/10 text-destructive leading-none"
                  title={draftTooltip}
                >
                  Pending delete
                </span>
              )}
            </div>
            {megaRole !== 'column' && (
              <span
                className={`text-xs text-muted-foreground truncate block ${pendingDelete ? 'line-through' : ''}`}
              >
                {item.href}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {pendingDelete && onCancelDelete && (
              <button
                onClick={onCancelDelete}
                className="p-1 hover:bg-muted rounded"
                title="Cancel deletion"
              >
                <span className="material-icons text-sm text-muted-foreground">undo</span>
              </button>
            )}
            {hasDraft && onPublish && item.id > 0 && (
              <button
                onClick={onPublish}
                className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded"
                title={`Publish this item${draftTooltip ? ` — ${draftTooltip}` : ''}`}
              >
                <span className="material-icons text-sm text-amber-700 dark:text-amber-300">
                  publish
                </span>
              </button>
            )}
            <button onClick={onMoveUp} className="p-1 hover:bg-muted rounded" title="Move up">
              <span className="material-icons text-sm text-muted-foreground">
                keyboard_arrow_up
              </span>
            </button>
            <button onClick={onMoveDown} className="p-1 hover:bg-muted rounded" title="Move down">
              <span className="material-icons text-sm text-muted-foreground">
                keyboard_arrow_down
              </span>
            </button>
            <button onClick={onEdit} className="p-1 hover:bg-muted rounded" title="Edit">
              <span className="material-icons text-sm text-muted-foreground">
                {editing ? 'expand_less' : 'edit'}
              </span>
            </button>
            <button
              onClick={onRemove}
              className="p-1 hover:bg-destructive/10 rounded"
              title="Remove"
            >
              <span className="material-icons text-sm text-destructive">delete</span>
            </button>
          </div>
        </div>

        {/* Expanded edit form */}
        {editing && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            {megaRole === 'column' ? (
              <ColumnEditFields
                item={item}
                onUpdate={onUpdate}
                onAddChild={onAddChild}
                siteId={siteId}
              />
            ) : (
              <LinkEditFields
                item={item}
                onUpdate={onUpdate}
                megaRole={megaRole}
                isMegaMenu={isMegaMenu}
                onAddChild={onAddChild}
                depth={depth}
                siteId={siteId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnEditFields({
  item,
  onUpdate,
  onAddChild,
  siteId,
}: {
  item: NavItem;
  onUpdate: (updates: Partial<NavItem>) => void;
  onAddChild?: () => void;
  siteId?: string;
}) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Column Heading
        </label>
        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
          placeholder="e.g. Products, Resources"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Featured Image
        </label>
        <MediaPicker
          value={item.featuredImage || ''}
          onChange={(url) => onUpdate({ featuredImage: url })}
          label="Column Image"
          mimeTypeFilter="image"
          apiEndpoint={
            siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media'
          }
        />
      </div>
      {onAddChild && (
        <button
          onClick={onAddChild}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons text-sm">add</span>
          Add menu item
        </button>
      )}
    </>
  );
}

function LinkEditFields({
  item,
  onUpdate,
  megaRole,
  isMegaMenu,
  onAddChild,
  depth,
  siteId,
}: {
  item: NavItem;
  onUpdate: (updates: Partial<NavItem>) => void;
  megaRole: MegaRole;
  isMegaMenu: boolean;
  onAddChild?: () => void;
  depth: number;
  siteId?: string;
}) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
        <input
          type="text"
          value={item.href}
          onChange={(e) => onUpdate({ href: e.target.value })}
          className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground font-mono"
          placeholder="/about"
        />
      </div>

      {/* Mega item extra fields */}
      {megaRole === 'mega-item' && (
        <>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Description
            </label>
            <textarea
              value={item.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={2}
              className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
              placeholder="Short description shown under the link"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Icon</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={item.icon || ''}
                onChange={(e) => onUpdate({ icon: e.target.value })}
                className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
                placeholder="e.g. rocket_launch"
              />
              {item.icon && (
                <span className="material-icons text-xl text-muted-foreground">{item.icon}</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Featured Image
            </label>
            <MediaPicker
              value={item.featuredImage || ''}
              onChange={(url) => onUpdate({ featuredImage: url })}
              label="Featured Image"
              mimeTypeFilter="image"
              apiEndpoint={
                siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media'
              }
            />
          </div>
        </>
      )}

      {/* Standard nav options (not for mega items) */}
      {megaRole !== 'mega-item' && (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={item.openInNewTab}
              onChange={(e) => onUpdate({ openInNewTab: e.target.checked })}
              className="rounded border-border"
            />
            Open in new tab
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={item.isButton}
              onChange={(e) => onUpdate({ isButton: e.target.checked })}
              className="rounded border-border accent-primary"
            />
            Display as button
          </label>
        </div>
      )}

      {depth === 0 && onAddChild && (
        <button
          onClick={onAddChild}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons text-sm">add</span>
          {isMegaMenu ? 'Add column' : 'Add dropdown item'}
        </button>
      )}
    </>
  );
}
