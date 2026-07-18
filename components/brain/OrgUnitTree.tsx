'use client';

/**
 * OrgUnitTree — recursive disclosure tree for `brain_org_units`.
 *
 * Renders the full org-unit hierarchy with row-level actions (rename, new
 * child, merge, delete) and optional HTML5 drag-and-drop reparenting.
 *
 * Drop semantics (when `enableDragDrop` is set):
 *   - drop over the LEFT half of a row → sibling-before
 *   - drop over the RIGHT half of a row → make it a child of that row
 *   - dropping onto self OR any descendant is refused (cycle guard)
 *
 * The "sibling-before" case is implemented as a reparent to the target's
 * parent — sortOrder ordering inside that parent is left to a follow-up;
 * for now the move REST endpoint only carries `newParentId`. We pass that
 * through to `onMove`; consumers can layer sort-order on top later without
 * an API change.
 *
 * No external drag libs — vanilla HTML5 `dragstart`/`dragover`/`drop`.
 */

import { useEffect, useRef, useState } from 'react';
import type { BrainOrgUnitTreeNode } from '@/lib/brain/org-units';

export interface OrgUnitTreeProps {
  tree: BrainOrgUnitTreeNode[];
  selectedUnitId?: number | null;
  onSelect?: (unit: BrainOrgUnitTreeNode) => void;
  enableDragDrop?: boolean;
  onMove?: (sourceId: number, newParentId: number | null) => Promise<void> | void;
  onRename?: (id: number, newName: string) => Promise<void> | void;
  onDelete?: (id: number, force: boolean) => Promise<void> | void;
  onMerge?: (sourceId: number, targetId: number) => Promise<void> | void;
  onCreateChild?: (parentId: number | null, name: string) => Promise<void> | void;
  showMemberCounts?: boolean;
  className?: string;
}

interface DragState {
  sourceId: number;
  // Snapshot of descendant ids so cycle-guard works without a re-query.
  descendantIds: ReadonlySet<number>;
}

type DropZone = 'before' | 'child';

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectDescendantIds(node: BrainOrgUnitTreeNode): Set<number> {
  const ids = new Set<number>([node.id]);
  const walk = (n: BrainOrgUnitTreeNode) => {
    for (const c of n.children) {
      ids.add(c.id);
      walk(c);
    }
  };
  walk(node);
  return ids;
}

function findNodeById(
  nodes: BrainOrgUnitTreeNode[],
  id: number,
): BrainOrgUnitTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inChild = findNodeById(n.children, id);
    if (inChild) return inChild;
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function OrgUnitTree({
  tree,
  selectedUnitId,
  onSelect,
  enableDragDrop = false,
  onMove,
  onRename,
  onDelete,
  onMerge,
  onCreateChild,
  showMemberCounts = false,
  className,
}: OrgUnitTreeProps) {
  // We track *collapsed* ids — default is "everything expanded". This avoids
  // a sync-effect to backfill new ids into an `expanded` set when the tree
  // changes (which would trip react-hooks/set-state-in-effect).
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [creatingUnderParentId, setCreatingUnderParentId] = useState<number | null | undefined>(undefined);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; zone: DropZone } | null>(null);

  const toggle = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expand = (id: number) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // ─── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, node: BrainOrgUnitTreeNode) => {
    if (!enableDragDrop) return;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers (Firefox) require a non-empty dataTransfer payload.
    e.dataTransfer.setData('text/plain', String(node.id));
    setDragState({
      sourceId: node.id,
      descendantIds: collectDescendantIds(node),
    });
  };

  const handleDragOver = (e: React.DragEvent, node: BrainOrgUnitTreeNode) => {
    if (!enableDragDrop || !dragState) return;
    if (dragState.descendantIds.has(node.id)) return; // cycle guard
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zone: DropZone = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'child';
    setDropTarget((cur) => (cur?.id === node.id && cur.zone === zone) ? cur : { id: node.id, zone });
  };

  const handleDragLeave = (e: React.DragEvent, node: BrainOrgUnitTreeNode) => {
    if (!enableDragDrop) return;
    // Only clear when we leave the row entirely, not a child element.
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDropTarget((cur) => (cur?.id === node.id ? null : cur));
  };

  const handleDrop = async (e: React.DragEvent, node: BrainOrgUnitTreeNode) => {
    if (!enableDragDrop || !dragState) return;
    e.preventDefault();
    e.stopPropagation();
    const sourceId = dragState.sourceId;
    const zone = dropTarget?.zone ?? 'child';
    setDragState(null);
    setDropTarget(null);
    if (dragState.descendantIds.has(node.id)) return; // cycle guard
    if (!onMove) return;
    // sibling-before → reparent under the target's parent (sort-order is a
    // follow-up). `child` → make it a direct child of node.
    let newParentId: number | null;
    if (zone === 'child') {
      newParentId = node.id;
    } else {
      // We don't have parent ids in node directly — but the tree node IS the
      // brainOrgUnit row, so node.parentId is available.
      newParentId = node.parentId ?? null;
    }
    await onMove(sourceId, newParentId);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDropTarget(null);
  };

  // Allow dropping at the very top to make a root.
  const handleRootDrop = async (e: React.DragEvent) => {
    if (!enableDragDrop || !dragState) return;
    e.preventDefault();
    const sourceId = dragState.sourceId;
    setDragState(null);
    setDropTarget(null);
    if (!onMove) return;
    await onMove(sourceId, null);
  };

  // ─── Inline rename ────────────────────────────────────────────────────────
  const submitRename = async (id: number, newName: string) => {
    setRenamingId(null);
    const trimmed = newName.trim();
    if (!trimmed) return;
    const existing = findNodeById(tree, id);
    if (existing && existing.name === trimmed) return;
    if (onRename) await onRename(id, trimmed);
  };

  // ─── Inline create-child ──────────────────────────────────────────────────
  const submitCreate = async (parentId: number | null, newName: string) => {
    setCreatingUnderParentId(undefined);
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (onCreateChild) await onCreateChild(parentId, trimmed);
  };

  // ─── Renderer ─────────────────────────────────────────────────────────────
  const renderRow = (node: BrainOrgUnitTreeNode, depth: number): React.ReactNode => {
    const isExpanded = !collapsed.has(node.id);
    const isSelected = selectedUnitId === node.id;
    const isDescendantOfDragged = dragState?.descendantIds.has(node.id) ?? false;
    const isDropTarget = dropTarget?.id === node.id;
    const dropZone = isDropTarget ? dropTarget!.zone : null;
    const hasChildren = node.children.length > 0;
    const icon = node.icon || 'groups';

    return (
      <li key={node.id} className="select-none">
        <div
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          draggable={enableDragDrop && !renamingId}
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={(e) => handleDragLeave(e, node)}
          onDrop={(e) => handleDrop(e, node)}
          onDragEnd={handleDragEnd}
          onClick={() => onSelect?.(node)}
          className={[
            'group flex items-center gap-1.5 pr-1.5 py-1 rounded text-sm cursor-pointer transition-colors relative',
            isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
            isDescendantOfDragged ? 'opacity-40' : '',
          ].join(' ')}
          style={{ paddingLeft: 6 + depth * 16 }}
        >
          {dropZone === 'before' && (
            <span aria-hidden className="absolute left-0 right-0 -top-px h-0.5 bg-primary pointer-events-none" />
          )}
          {dropZone === 'child' && (
            <span aria-hidden className="absolute inset-0 border-2 border-primary/50 rounded pointer-events-none" />
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            className={`shrink-0 w-4 h-4 inline-flex items-center justify-center text-muted-foreground ${hasChildren ? '' : 'opacity-0 pointer-events-none'}`}
            tabIndex={-1}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <span className="material-icons text-base">
              {isExpanded ? 'expand_more' : 'chevron_right'}
            </span>
          </button>

          <span
            className="material-icons text-base shrink-0"
            style={{ color: node.color || undefined }}
            aria-hidden
          >
            {icon}
          </span>

          {renamingId === node.id ? (
            <InlineNameInput
              initial={node.name}
              onSubmit={(v) => submitRename(node.id, v)}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <span className="truncate flex-1 min-w-0">{node.name}</span>
          )}

          {showMemberCounts && renamingId !== node.id && (
            <span
              title={`${node.memberCount} member${node.memberCount === 1 ? '' : 's'}`}
              className="shrink-0 text-[10px] tabular-nums font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {node.memberCount}
            </span>
          )}

          {/* Row menu (⋯) — visible on hover or when open */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpenId((cur) => cur === node.id ? null : node.id); }}
              className={`h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground transition-opacity ${menuOpenId === node.id ? 'opacity-100 bg-muted' : 'opacity-0 group-hover:opacity-100 hover:bg-muted'}`}
              aria-label="Unit actions"
              aria-haspopup="menu"
              aria-expanded={menuOpenId === node.id}
            >
              <span className="material-icons text-base">more_horiz</span>
            </button>
            {menuOpenId === node.id && (
              <RowMenu
                onClose={() => setMenuOpenId(null)}
                onRename={() => { setMenuOpenId(null); setRenamingId(node.id); }}
                onNewChild={() => {
                  setMenuOpenId(null);
                  expand(node.id);
                  setCreatingUnderParentId(node.id);
                }}
                onMerge={() => { setMenuOpenId(null); setMergeSourceId(node.id); }}
                onDelete={() => { setMenuOpenId(null); setDeleteTargetId(node.id); }}
              />
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <ul role="group" className="list-none">
            {node.children.map((child) => renderRow(child, depth + 1))}
          </ul>
        )}

        {creatingUnderParentId === node.id && (
          <div style={{ paddingLeft: 6 + (depth + 1) * 16 }} className="py-1 flex items-center gap-1.5">
            <span className="w-4 h-4" />
            <span className="material-icons text-base text-muted-foreground" aria-hidden>add</span>
            <InlineNameInput
              initial=""
              placeholder="New child unit name"
              onSubmit={(v) => submitCreate(node.id, v)}
              onCancel={() => setCreatingUnderParentId(undefined)}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          if (!enableDragDrop || !dragState) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={handleRootDrop}
        className="min-h-full"
      >
        {tree.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 italic">
            No org units yet. Click &ldquo;New unit&rdquo; to add the first one.
          </div>
        ) : (
          <ul role="tree" aria-label="Org units" className="list-none p-1">
            {tree.map((node) => renderRow(node, 0))}
          </ul>
        )}

        {creatingUnderParentId === null && (
          <div className="px-2 py-1 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground" aria-hidden>add</span>
            <InlineNameInput
              initial=""
              placeholder="New root unit name"
              onSubmit={(v) => submitCreate(null, v)}
              onCancel={() => setCreatingUnderParentId(undefined)}
            />
          </div>
        )}
      </div>

      {mergeSourceId !== null && (
        <MergeDialog
          source={findNodeById(tree, mergeSourceId)}
          tree={tree}
          onClose={() => setMergeSourceId(null)}
          onMerge={async (targetId) => {
            const src = mergeSourceId;
            setMergeSourceId(null);
            if (onMerge && src !== null) await onMerge(src, targetId);
          }}
        />
      )}

      {deleteTargetId !== null && (
        <DeleteDialog
          target={findNodeById(tree, deleteTargetId)}
          onClose={() => setDeleteTargetId(null)}
          onConfirm={async (force) => {
            const id = deleteTargetId;
            setDeleteTargetId(null);
            if (onDelete && id !== null) await onDelete(id, force);
          }}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function InlineNameInput({
  initial,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => onSubmit(value)}
      className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function RowMenu({
  onClose,
  onRename,
  onNewChild,
  onMerge,
  onDelete,
}: {
  onClose: () => void;
  onRename: () => void;
  onNewChild: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-7 z-30 w-44 bg-popover border border-border rounded-md shadow-lg p-1 text-sm"
    >
      <MenuItem icon="edit" label="Rename" onClick={onRename} />
      <MenuItem icon="subdirectory_arrow_right" label="New child" onClick={onNewChild} />
      <MenuItem icon="call_merge" label="Merge into…" onClick={onMerge} />
      <div className="my-1 h-px bg-border" />
      <MenuItem icon="delete" label="Delete" onClick={onDelete} destructive />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full inline-flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-muted ${destructive ? 'text-destructive' : 'text-foreground'}`}
    >
      <span className="material-icons text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MergeDialog({
  source,
  tree,
  onClose,
  onMerge,
}: {
  source: BrainOrgUnitTreeNode | null;
  tree: BrainOrgUnitTreeNode[];
  onClose: () => void;
  onMerge: (targetId: number) => Promise<void> | void;
}) {
  const [search, setSearch] = useState('');
  if (!source) return null;
  const sourceDescendantIds = collectDescendantIds(source);
  const candidates: BrainOrgUnitTreeNode[] = [];
  const collect = (nodes: BrainOrgUnitTreeNode[]) => {
    for (const n of nodes) {
      if (!sourceDescendantIds.has(n.id)) candidates.push(n);
      collect(n.children);
    }
  };
  collect(tree);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.path.toLowerCase().includes(q))
    : candidates;

  return (
    <Modal onClose={onClose} title={`Merge "${source.name}" into…`}>
      <p className="text-xs text-muted-foreground mb-3">
        Members and children of <strong>{source.name}</strong> will be reassigned to the chosen target.
        The source unit will be deleted. This cannot be undone.
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter units…"
        className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      />
      <div className="max-h-72 overflow-y-auto border border-border rounded">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground italic">No matching units.</div>
        ) : (
          <ul className="list-none">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onMerge(c.id)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted flex items-center gap-2"
                >
                  <span className="material-icons text-sm text-muted-foreground">{c.icon || 'groups'}</span>
                  <span className="text-sm flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{c.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function DeleteDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: BrainOrgUnitTreeNode | null;
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void> | void;
}) {
  const [force, setForce] = useState(false);
  if (!target) return null;
  const hasMembers = target.memberCount > 0;
  const hasChildren = target.children.length > 0;
  const needsForce = hasMembers || hasChildren;
  return (
    <Modal onClose={onClose} title={`Delete "${target.name}"?`}>
      <p className="text-xs text-muted-foreground mb-3">
        {needsForce
          ? `This unit has ${target.memberCount} member${target.memberCount === 1 ? '' : 's'} and ${target.children.length} child unit${target.children.length === 1 ? '' : 's'}. Force delete to detach members and re-parent children up one level.`
          : 'This will permanently delete the unit.'}
      </p>
      {needsForce && (
        <label className="flex items-start gap-2 text-xs mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong>Force delete</strong> (cascades children to parent, detaches all members)
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={needsForce && !force}
          onClick={() => onConfirm(force)}
          className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          <span className="material-icons text-base">delete</span>
          Delete
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
