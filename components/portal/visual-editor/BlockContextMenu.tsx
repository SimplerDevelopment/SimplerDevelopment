'use client';

/**
 * Right-click context menu rendered at iframe-relative coordinates the parent
 * has already translated into screen space. Items dispatch into the bulk
 * actions + clipboard hooks and into the SaveAsTemplate flow. The fixed
 * full-screen overlay closes the menu on outside click.
 */
export function BlockContextMenu({
  contextMenu,
  selectedCount,
  onClose,
  onDuplicate,
  onCopy,
  onPaste,
  onGroup,
  onSaveAsTemplate,
  onDelete,
}: {
  contextMenu: { x: number; y: number };
  selectedCount: number;
  onClose: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onGroup: () => void;
  onSaveAsTemplate: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 min-w-[200px] rounded-md border border-border bg-card shadow-xl py-1 text-sm"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
          {selectedCount > 1 ? `${selectedCount} blocks` : 'Block'}
        </div>
        <button
          type="button"
          onClick={() => { onDuplicate(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
        >
          <span className="material-icons text-base text-muted-foreground">content_copy</span>
          Duplicate
          <span className="ml-auto text-[10px] text-muted-foreground/70">⌘D</span>
        </button>
        <button
          type="button"
          onClick={() => { onCopy(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
        >
          <span className="material-icons text-base text-muted-foreground">file_copy</span>
          Copy
          <span className="ml-auto text-[10px] text-muted-foreground/70">⌘C</span>
        </button>
        <button
          type="button"
          onClick={() => { onPaste(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
        >
          <span className="material-icons text-base text-muted-foreground">content_paste</span>
          Paste
          <span className="ml-auto text-[10px] text-muted-foreground/70">⌘V</span>
        </button>
        <button
          type="button"
          onClick={() => { onGroup(); onClose(); }}
          disabled={selectedCount < 2}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left disabled:opacity-40 disabled:cursor-not-allowed"
          title={selectedCount < 2 ? 'Select 2 or more blocks to group' : ''}
        >
          <span className="material-icons text-base text-muted-foreground">crop_free</span>
          Group into Section
        </button>
        <button
          type="button"
          onClick={() => { onSaveAsTemplate(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
        >
          <span className="material-icons text-base text-muted-foreground">bookmark_add</span>
          Save as Template
        </button>
        <div className="border-t border-border my-1" />
        <button
          type="button"
          onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-left"
        >
          <span className="material-icons text-base">delete</span>
          Delete
        </button>
      </div>
    </>
  );
}
