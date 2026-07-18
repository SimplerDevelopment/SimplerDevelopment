'use client';

/**
 * TopicTree — recursive disclosure component for the brain topic hierarchy.
 *
 * Renders a nested topic tree with optional drag-drop reparenting, inline
 * rename, "new child" insertion, merge-into picker, and force-delete confirm.
 *
 * Drag-drop semantics (HTML5 DnD, no external lib):
 *   - drag a row onto the LEFT half of another row → reparent as a sibling-
 *     before (i.e. move to that node's parent, sort just before it).
 *   - drag a row onto the RIGHT half → become that node's child.
 *   - cycle guard: refuses to drop a node onto one of its descendants. Drops
 *     are silently rejected; the UI surfaces a tooltip via the dropTarget
 *     state when this happens.
 *
 * Selection is purely visual (caller controls via `selectedTopicId`). Rename /
 * delete / merge / new-child all delegate to the caller's mutation handlers.
 *
 * Wave 3b — see .planning/brain-restructure/PLAN.md.
 */

import { useCallback, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { BrainTopicTreeNode } from '@/lib/brain/topics';

export interface TopicTreeProps {
  tree: BrainTopicTreeNode[];
  selectedTopicId?: number | null;
  onSelect?: (topic: BrainTopicTreeNode) => void;
  enableDragDrop?: boolean;
  onMove?: (sourceId: number, newParentId: number | null) => Promise<void> | void;
  /** Rename a topic by id. Caller commits via PATCH. */
  onRename?: (id: number, newName: string) => Promise<void> | void;
  /** Delete a topic. `force=true` cascades attached entity-links. Caller commits via DELETE. */
  onDelete?: (id: number, opts: { force: boolean }) => Promise<void> | void;
  /** Merge `sourceId` into `targetId`. Caller commits via POST .../merge. */
  onMerge?: (sourceId: number, targetId: number) => Promise<void> | void;
  /** Create a child under `parentId`. Caller commits via POST. */
  onCreateChild?: (parentId: number | null, name: string) => Promise<void> | void;
  /** Flat list of all topics — used by the "Merge into…" picker. */
  allTopics?: Array<{ id: number; name: string; path: string }>;
  showEntityCounts?: boolean;
  className?: string;
}

interface DropTarget {
  /** The id of the topic being targeted, or null for the root sentinel. */
  targetId: number | null;
  /** 'before' = drop as sibling-before; 'child' = drop as child. */
  position: 'before' | 'child';
  /** True if the drop would create a cycle and should be visually rejected. */
  rejected: boolean;
}

export default function TopicTree({
  tree,
  selectedTopicId = null,
  onSelect,
  enableDragDrop = false,
  onMove,
  onRename,
  onDelete,
  onMerge,
  onCreateChild,
  allTopics,
  showEntityCounts = false,
  className,
}: TopicTreeProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // Default: expand top-level roots. Children stay collapsed.
    const s = new Set<number>();
    for (const r of tree) s.add(r.id);
    return s;
  });
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuId, setMenuId] = useState<number | null>(null);
  const [mergePickerFor, setMergePickerFor] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; hasEntities: boolean } | null>(null);
  const [newChildFor, setNewChildFor] = useState<number | 'root' | null>(null);
  const [newChildValue, setNewChildValue] = useState('');
  const [dragSourceId, setDragSourceId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Quick map for cycle-guard descendant checks.
  const descendantsById = useMemo(() => collectDescendants(tree), [tree]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const startRename = useCallback((node: BrainTopicTreeNode) => {
    setMenuId(null);
    setRenamingId(node.id);
    setRenameValue(node.name);
  }, []);

  const commitRename = useCallback(async (id: number) => {
    const next = renameValue.trim();
    setRenamingId(null);
    setRenameValue('');
    if (!next) return;
    await onRename?.(id, next);
  }, [renameValue, onRename]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const startNewChild = useCallback((parentId: number | 'root') => {
    setMenuId(null);
    setNewChildFor(parentId);
    setNewChildValue('');
    if (typeof parentId === 'number') {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
  }, []);

  const commitNewChild = useCallback(async () => {
    const name = newChildValue.trim();
    const parent = newChildFor;
    setNewChildFor(null);
    setNewChildValue('');
    if (!name || parent === null) return;
    const parentId = parent === 'root' ? null : parent;
    await onCreateChild?.(parentId, name);
  }, [newChildValue, newChildFor, onCreateChild]);

  const cancelNewChild = useCallback(() => {
    setNewChildFor(null);
    setNewChildValue('');
  }, []);

  const handleDelete = useCallback((node: BrainTopicTreeNode) => {
    setMenuId(null);
    setDeleteConfirm({ id: node.id, hasEntities: node.entityCount > 0 });
  }, []);

  const commitDelete = useCallback(async (force: boolean) => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    await onDelete?.(id, { force });
  }, [deleteConfirm, onDelete]);

  const handleMerge = useCallback(async (targetId: number) => {
    const source = mergePickerFor;
    setMergePickerFor(null);
    if (source == null || source === targetId) return;
    await onMerge?.(source, targetId);
  }, [mergePickerFor, onMerge]);

  // ── Drag-drop ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, node: BrainTopicTreeNode) => {
    if (!enableDragDrop) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-brain-topic', String(node.id));
    setDragSourceId(node.id);
  }, [enableDragDrop]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, node: BrainTopicTreeNode) => {
    if (!enableDragDrop || dragSourceId == null) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const position: 'before' | 'child' = x < rect.width / 2 ? 'before' : 'child';

    // Cycle guard: can't drop onto self or any descendant.
    const isSelf = node.id === dragSourceId;
    const descendants = descendantsById.get(dragSourceId) ?? new Set<number>();
    const wouldCycle = isSelf || descendants.has(node.id);

    e.dataTransfer.dropEffect = wouldCycle ? 'none' : 'move';
    setDropTarget({ targetId: node.id, position, rejected: wouldCycle });
  }, [enableDragDrop, dragSourceId, descendantsById]);

  const handleDragLeave = useCallback(() => {
    // We don't clear here — handleDragOver on the next row will overwrite.
    // Clearing on leave creates flicker between sibling rows.
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, node: BrainTopicTreeNode) => {
    if (!enableDragDrop || dragSourceId == null) return;
    e.preventDefault();
    const sourceId = dragSourceId;
    const target = dropTarget;
    setDragSourceId(null);
    setDropTarget(null);
    if (!target || target.rejected) return;
    const newParentId: number | null = target.position === 'child' ? node.id : node.parentId;
    if (sourceId === node.id) return;
    await onMove?.(sourceId, newParentId);
  }, [enableDragDrop, dragSourceId, dropTarget, onMove]);

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDropTarget(null);
  }, []);

  // Root-area drop: drop onto empty space at the bottom to detach to root.
  const handleRootDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!enableDragDrop || dragSourceId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ targetId: null, position: 'child', rejected: false });
  }, [enableDragDrop, dragSourceId]);

  const handleRootDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    if (!enableDragDrop || dragSourceId == null) return;
    e.preventDefault();
    const sourceId = dragSourceId;
    setDragSourceId(null);
    setDropTarget(null);
    await onMove?.(sourceId, null);
  }, [enableDragDrop, dragSourceId, onMove]);

  return (
    <div
      className={`relative ${className ?? ''}`}
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      {tree.length === 0 && newChildFor !== 'root' && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No topics yet.
        </div>
      )}
      {tree.map((node) => (
        <TopicRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          selectedTopicId={selectedTopicId}
          onSelect={onSelect}
          enableDragDrop={enableDragDrop}
          dragSourceId={dragSourceId}
          dropTarget={dropTarget}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValueChange={setRenameValue}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          menuId={menuId}
          onOpenMenu={setMenuId}
          onStartRename={startRename}
          onStartNewChild={(id) => startNewChild(id)}
          onStartMerge={(id) => { setMenuId(null); setMergePickerFor(id); }}
          onStartDelete={handleDelete}
          newChildFor={newChildFor}
          newChildValue={newChildValue}
          onNewChildValueChange={setNewChildValue}
          onCommitNewChild={commitNewChild}
          onCancelNewChild={cancelNewChild}
          showEntityCounts={showEntityCounts}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* "Create root topic" inline row, rendered when the caller-driven
          "New topic" flow selects 'root'. */}
      {newChildFor === 'root' && (
        <div className="px-2 py-1.5 flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">add</span>
          <input
            type="text"
            autoFocus
            value={newChildValue}
            onChange={(e) => setNewChildValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewChild();
              else if (e.key === 'Escape') cancelNewChild();
            }}
            onBlur={commitNewChild}
            placeholder="New topic name…"
            className="flex-1 px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      {/* Cycle-rejection tooltip */}
      {dropTarget?.rejected && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded bg-destructive text-destructive-foreground text-xs shadow-lg">
          <span className="material-icons text-sm align-middle mr-1">block</span>
          Can&apos;t make a parent into its own child
        </div>
      )}

      {/* Merge picker modal */}
      {mergePickerFor != null && (
        <MergePickerModal
          sourceId={mergePickerFor}
          allTopics={allTopics ?? collectFlat(tree)}
          onPick={handleMerge}
          onCancel={() => setMergePickerFor(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          hasEntities={deleteConfirm.hasEntities}
          onConfirm={commitDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Inner row component ──────────────────────────────────────────────────

interface TopicRowProps {
  node: BrainTopicTreeNode;
  depth: number;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  selectedTopicId: number | null;
  onSelect?: (topic: BrainTopicTreeNode) => void;
  enableDragDrop: boolean;
  dragSourceId: number | null;
  dropTarget: DropTarget | null;
  renamingId: number | null;
  renameValue: string;
  onRenameValueChange: (v: string) => void;
  onCommitRename: (id: number) => void;
  onCancelRename: () => void;
  menuId: number | null;
  onOpenMenu: (id: number | null) => void;
  onStartRename: (node: BrainTopicTreeNode) => void;
  onStartNewChild: (id: number) => void;
  onStartMerge: (id: number) => void;
  onStartDelete: (node: BrainTopicTreeNode) => void;
  newChildFor: number | 'root' | null;
  newChildValue: string;
  onNewChildValueChange: (v: string) => void;
  onCommitNewChild: () => void;
  onCancelNewChild: () => void;
  showEntityCounts: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, node: BrainTopicTreeNode) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, node: BrainTopicTreeNode) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, node: BrainTopicTreeNode) => void;
  onDragEnd: () => void;
}

function TopicRow(props: TopicRowProps) {
  const {
    node, depth, expanded, onToggleExpand, selectedTopicId, onSelect,
    enableDragDrop, dragSourceId, dropTarget,
    renamingId, renameValue, onRenameValueChange, onCommitRename, onCancelRename,
    menuId, onOpenMenu, onStartRename, onStartNewChild, onStartMerge, onStartDelete,
    newChildFor, newChildValue, onNewChildValueChange, onCommitNewChild, onCancelNewChild,
    showEntityCounts,
    onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  } = props;

  const isExpanded = expanded.has(node.id);
  const isSelected = selectedTopicId === node.id;
  const isRenaming = renamingId === node.id;
  const showMenu = menuId === node.id;
  const isDropTarget = dropTarget?.targetId === node.id;
  const isDragging = dragSourceId === node.id;
  const hasChildren = node.children.length > 0;
  const indent = 8 + depth * 16;

  const icon = node.icon || (hasChildren ? 'folder' : 'sell');

  const handleRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onCommitRename(node.id);
    else if (e.key === 'Escape') onCancelRename();
  };

  return (
    <div>
      <div
        draggable={enableDragDrop && !isRenaming}
        onDragStart={(e) => onDragStart(e, node)}
        onDragOver={(e) => onDragOver(e, node)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, node)}
        onDragEnd={onDragEnd}
        onClick={() => { if (!isRenaming) onSelect?.(node); }}
        className={`group relative flex items-center gap-1 pr-2 py-1 text-sm cursor-pointer transition-colors ${
          isSelected ? 'bg-accent' : 'hover:bg-muted/40'
        } ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: indent }}
      >
        {/* drop indicator bars */}
        {isDropTarget && !dropTarget?.rejected && dropTarget?.position === 'before' && (
          <span className="absolute left-0 right-0 top-0 h-0.5 bg-primary pointer-events-none" />
        )}
        {isDropTarget && !dropTarget?.rejected && dropTarget?.position === 'child' && (
          <span className="absolute left-0 right-0 inset-y-0 ring-2 ring-inset ring-primary/60 pointer-events-none rounded" />
        )}
        {isDropTarget && dropTarget?.rejected && (
          <span className="absolute left-0 right-0 inset-y-0 ring-2 ring-inset ring-destructive/60 pointer-events-none rounded" />
        )}

        {/* disclosure */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            className="h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <span className="material-icons text-sm">
              {isExpanded ? 'expand_more' : 'chevron_right'}
            </span>
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        {/* icon (color tint if set) */}
        <span
          className="material-icons text-base shrink-0"
          style={node.color ? { color: node.color } : undefined}
        >
          {icon}
        </span>

        {/* name */}
        {isRenaming ? (
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleRenameKey}
            onBlur={() => onCommitRename(node.id)}
            className="flex-1 min-w-0 px-1 py-0 text-sm bg-transparent border-b border-primary focus:outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-foreground">{node.name}</span>
        )}

        {/* counts */}
        {showEntityCounts && !isRenaming && node.entityCount > 0 && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded text-[11px] font-medium tabular-nums bg-muted/60 text-muted-foreground">
            {node.entityCount}
          </span>
        )}

        {/* more-menu */}
        {!isRenaming && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenMenu(showMenu ? null : node.id); }}
              title="More"
              aria-label="More"
              className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent"
            >
              <span className="material-icons text-sm">more_horiz</span>
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={(e) => { e.stopPropagation(); onOpenMenu(null); }}
                />
                <div
                  className="absolute right-0 top-full mt-1 z-40 w-40 rounded-md border border-border bg-popover shadow-md py-1 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem icon="edit" label="Rename" onClick={() => onStartRename(node)} />
                  <MenuItem icon="add" label="New child" onClick={() => onStartNewChild(node.id)} />
                  <MenuItem icon="merge_type" label="Merge into…" onClick={() => onStartMerge(node.id)} />
                  <div className="my-1 border-t border-border" />
                  <MenuItem
                    icon="delete"
                    label="Delete"
                    destructive
                    onClick={() => onStartDelete(node)}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* New-child inline input under this node */}
      {newChildFor === node.id && (
        <div className="py-1 flex items-center gap-2" style={{ paddingLeft: indent + 16 }}>
          <span className="material-icons text-base text-muted-foreground">add</span>
          <input
            type="text"
            autoFocus
            value={newChildValue}
            onChange={(e) => onNewChildValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitNewChild();
              else if (e.key === 'Escape') onCancelNewChild();
            }}
            onBlur={onCommitNewChild}
            placeholder="New child name…"
            className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      {isExpanded && hasChildren && node.children.map((child) => (
        <TopicRow
          key={child.id}
          {...props}
          node={child}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function MenuItem({ icon, label, onClick, destructive }: {
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent ${
        destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground'
      }`}
    >
      <span className="material-icons text-sm">{icon}</span>
      {label}
    </button>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────

function MergePickerModal({
  sourceId,
  allTopics,
  onPick,
  onCancel,
}: {
  sourceId: number;
  allTopics: Array<{ id: number; name: string; path: string }>;
  onPick: (targetId: number) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allTopics.filter((t) => t.id !== sourceId);
    if (!q) return filtered;
    return filtered.filter((t) => t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q));
  }, [query, allTopics, sourceId]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-lg border border-border bg-popover shadow-xl flex flex-col max-h-[70vh]">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">merge_type</span>
            <h3 className="text-sm font-semibold flex-1">Merge into…</h3>
            <button
              type="button"
              onClick={onCancel}
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent"
              aria-label="Cancel"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          <div className="px-3 py-2 border-b border-border">
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics…"
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {candidates.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">No matching topics.</div>
            )}
            <ul>
              {candidates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t.id)}
                    className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex flex-col"
                  >
                    <span className="text-sm text-foreground">{t.name}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{t.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            Source topic&apos;s entities and children will be moved into the chosen target.
          </div>
        </div>
      </div>
    </>
  );
}

function DeleteConfirmModal({
  hasEntities,
  onConfirm,
  onCancel,
}: {
  hasEntities: boolean;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}) {
  const [force, setForce] = useState(false);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border bg-popover shadow-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="material-icons text-destructive">delete_forever</span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Delete topic?</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {hasEntities
                  ? 'This topic has entities attached. To delete it anyway, enable force-delete below — the entity links will be removed but the entities themselves will be kept.'
                  : 'This will remove the topic permanently. Children must be deleted or merged first.'}
              </p>
            </div>
          </div>
          {hasEntities && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span>Force delete (detaches all entity links)</span>
            </label>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs rounded border border-border text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(force)}
              disabled={hasEntities && !force}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              <span className="material-icons text-sm">delete</span>
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

/** Walk the tree once and produce a map of id → Set<descendantIds>. Used for
 *  drag-drop cycle guard. Each node knows the ids of every descendant beneath
 *  it (not including itself). */
function collectDescendants(tree: BrainTopicTreeNode[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  function walk(node: BrainTopicTreeNode): Set<number> {
    const own = new Set<number>();
    for (const child of node.children) {
      own.add(child.id);
      const childDesc = walk(child);
      for (const id of childDesc) own.add(id);
    }
    out.set(node.id, own);
    return own;
  }
  for (const root of tree) walk(root);
  return out;
}

/** Flatten the tree for the default Merge picker when no `allTopics` provided. */
function collectFlat(tree: BrainTopicTreeNode[]): Array<{ id: number; name: string; path: string }> {
  const out: Array<{ id: number; name: string; path: string }> = [];
  function walk(node: BrainTopicTreeNode) {
    out.push({ id: node.id, name: node.name, path: node.path });
    for (const c of node.children) walk(c);
  }
  for (const r of tree) walk(r);
  return out;
}
