// ─── MenuTree: render the 3-level (top → column → item) menu tree ───────────

'use client';

import { childrenOf, topLevel } from '../_lib/tree';
import type { NavItem } from '../_lib/types';
import { MenuItemEditor } from './MenuItemEditor';

interface Props {
  items: NavItem[];
  editingId: number | null;
  isMegaMenu: boolean;
  siteId?: string;
  onSetEditingId: (id: number | null) => void;
  onUpdate: (id: number, updates: Partial<NavItem>) => void;
  onRemove: (id: number) => void;
  onMove: (id: number, direction: -1 | 1) => void;
  onAddTopLevel: () => void;
  onAddChild: (parentId: number) => void;
  onAddMegaItem: (columnId: number) => void;
  onPublishItem: (id: number) => void;
  onPublishAll: () => void;
  onCancelDelete: (id: number) => void;
}

export function MenuTree({
  items,
  editingId,
  isMegaMenu,
  siteId,
  onSetEditingId,
  onUpdate,
  onRemove,
  onMove,
  onAddTopLevel,
  onAddChild,
  onAddMegaItem,
  onPublishItem,
  onPublishAll,
  onCancelDelete,
}: Props) {
  const tops = topLevel(items);
  const draftCount = items.filter((i) => i.draft != null).length;

  const toggleEdit = (id: number) => {
    onSetEditingId(editingId === id ? null : id);
  };

  const handlePublishAll = () => {
    if (draftCount === 0) return;
    if (
      !confirm(
        `Publish ${draftCount} draft nav change${draftCount === 1 ? '' : 's'}? This will make them live on the public site.`,
      )
    ) {
      return;
    }
    onPublishAll();
  };

  return (
    <div className="p-4 space-y-2">
      {draftCount > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <span className="material-icons text-base">edit_note</span>
            <span>
              {draftCount} unpublished change{draftCount === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={handlePublishAll}
            className="px-3 py-1 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center gap-1"
            title="Publish every nav draft for this site"
          >
            <span className="material-icons text-sm">publish</span>
            Publish all drafts
          </button>
        </div>
      )}
      {tops.map((item) => (
        <div key={item.id}>
          {/* Level 0: Nav Link */}
          <MenuItemEditor
            item={item}
            editing={editingId === item.id}
            onEdit={() => toggleEdit(item.id)}
            onUpdate={(updates) => onUpdate(item.id, updates)}
            onRemove={() => onRemove(item.id)}
            onMoveUp={() => onMove(item.id, -1)}
            onMoveDown={() => onMove(item.id, 1)}
            onAddChild={() => onAddChild(item.id)}
            onPublish={() => onPublishItem(item.id)}
            onCancelDelete={() => onCancelDelete(item.id)}
            depth={0}
            isMegaMenu={isMegaMenu}
            siteId={siteId}
          />
          {childrenOf(items, item.id).map((child) => (
            <div key={child.id}>
              {/* Level 1: Column (mega) or Dropdown Item (regular) */}
              <MenuItemEditor
                item={child}
                editing={editingId === child.id}
                onEdit={() => toggleEdit(child.id)}
                onUpdate={(updates) => onUpdate(child.id, updates)}
                onRemove={() => onRemove(child.id)}
                onMoveUp={() => onMove(child.id, -1)}
                onMoveDown={() => onMove(child.id, 1)}
                onAddChild={isMegaMenu ? () => onAddMegaItem(child.id) : undefined}
                onPublish={() => onPublishItem(child.id)}
                onCancelDelete={() => onCancelDelete(child.id)}
                depth={1}
                isMegaMenu={isMegaMenu}
                siteId={siteId}
              />
              {/* Level 2: Mega Menu Items (only in mega mode) */}
              {isMegaMenu &&
                childrenOf(items, child.id).map((megaItem) => (
                  <MenuItemEditor
                    key={megaItem.id}
                    item={megaItem}
                    editing={editingId === megaItem.id}
                    onEdit={() => toggleEdit(megaItem.id)}
                    onUpdate={(updates) => onUpdate(megaItem.id, updates)}
                    onRemove={() => onRemove(megaItem.id)}
                    onMoveUp={() => onMove(megaItem.id, -1)}
                    onMoveDown={() => onMove(megaItem.id, 1)}
                    onPublish={() => onPublishItem(megaItem.id)}
                    onCancelDelete={() => onCancelDelete(megaItem.id)}
                    depth={2}
                    isMegaMenu={isMegaMenu}
                    siteId={siteId}
                  />
                ))}
            </div>
          ))}
        </div>
      ))}

      <button
        onClick={onAddTopLevel}
        className="w-full py-2.5 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5"
      >
        <span className="material-icons text-base">add</span>
        Add Menu Item
      </button>
    </div>
  );
}
