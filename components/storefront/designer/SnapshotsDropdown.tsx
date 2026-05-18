'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { LayerData } from '@/lib/designer/types';

interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  layersBySurface: Record<string, LayerData[]>;
  mockupTint: string | null;
  /** Data URL of a low-res PNG preview captured at snapshot time. Optional —
   * older snapshots taken before this feature shipped won't have one. */
  thumbnail?: string | null;
}

const STORAGE_PREFIX = 'designer:snapshots:';
const MAX_SNAPSHOTS = 20;
// Aim for ~150 px wide thumbnails. Canvases default to 800 px so 0.2 lands
// around 160 px — small enough for many entries to coexist in localStorage
// (5 MB cap on most browsers), large enough to identify the design at a glance.
const THUMBNAIL_MULTIPLIER = 0.2;

/**
 * Capture a low-res PNG of the current canvas, hiding overlays + guides so
 * the snapshot thumbnail matches what would ship to print. Returns null if
 * the canvas isn't available or toDataURL throws (e.g. tainted canvas).
 */
function captureCanvasThumbnail(): string | null {
  const canvas = useCanvasStore.getState().canvas;
  if (!canvas) return null;
  const hidden: Array<{ obj: { visible?: boolean }; was: boolean | undefined }> = [];
  try {
    canvas.getObjects().forEach((obj) => {
      const tagged = obj as unknown as {
        visible?: boolean;
        _designerPrintArea?: boolean;
        _designerGuide?: boolean;
        excludeFromExport?: boolean;
      };
      if (tagged._designerPrintArea || tagged._designerGuide || tagged.excludeFromExport) {
        hidden.push({ obj: tagged, was: tagged.visible });
        tagged.visible = false;
      }
    });
    canvas.requestRenderAll();
    return canvas.toDataURL({
      format: 'png',
      multiplier: THUMBNAIL_MULTIPLIER,
      quality: 0.85,
    });
  } catch {
    return null;
  } finally {
    hidden.forEach(({ obj, was }) => {
      obj.visible = was;
    });
    canvas.requestRenderAll();
  }
}

function loadSnapshots(designId: string | null): Snapshot[] {
  if (!designId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + designId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Snapshot[]) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(designId: string | null, snapshots: Snapshot[]): void {
  if (!designId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + designId,
      JSON.stringify(snapshots),
    );
  } catch {
    // localStorage quota exceeded — let the customer keep working without
    // crashing the panel; snapshots simply won't persist.
  }
}

function relativeTime(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return date.toLocaleDateString();
}

function countLayers(layersBySurface: Record<string, LayerData[]>): number {
  let n = 0;
  for (const list of Object.values(layersBySurface)) {
    n += list?.length ?? 0;
  }
  return n;
}

/**
 * Lightweight snapshot manager: customers can stash named restore points
 * locally so they can experiment freely and roll back without depending on
 * the undo stack (which has a 50-entry cap). Snapshots are scoped to the
 * current designId and persist in localStorage — no DB changes needed.
 */
export default function SnapshotsDropdown() {
  const designId = useCanvasStore((s) => s.designId);
  const layersBySurface = useCanvasStore((s) => s.layersBySurface);
  const mockupTint = useCanvasStore((s) => s.mockupTint);
  const importCanvasData = useCanvasStore((s) => s.importCanvasData);
  const setMockupTint = useCanvasStore((s) => s.setMockupTint);

  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  // Inline form state — replaces window.prompt so the flow stays inside the
  // popover, works in headless test runs, and doesn't pop a system dialog.
  const [naming, setNaming] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Re-hydrate when the dropdown opens or the design changes.
  useEffect(() => {
    if (!open) return;
    setSnapshots(loadSnapshots(designId));
    setNaming(false);
    setConfirmId(null);
    setStatusMsg(null);
  }, [open, designId]);

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (naming) {
        setNaming(false);
        return;
      }
      if (confirmId) {
        setConfirmId(null);
        return;
      }
      setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open, naming, confirmId]);

  // Focus the inline name input when it opens.
  useEffect(() => {
    if (!naming) return;
    const t = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [naming]);

  // Auto-clear transient status banners.
  useEffect(() => {
    if (!statusMsg) return;
    const t = window.setTimeout(() => setStatusMsg(null), 2500);
    return () => window.clearTimeout(t);
  }, [statusMsg]);

  const beginTakeSnapshot = useCallback(() => {
    if (!designId) {
      setStatusMsg('Save your design first to enable snapshots.');
      return;
    }
    setPendingName(`Snapshot ${snapshots.length + 1}`);
    setNaming(true);
  }, [designId, snapshots.length]);

  const commitSnapshot = useCallback(() => {
    if (!designId) return;
    const name =
      pendingName.trim() || `Snapshot ${snapshots.length + 1}`;
    const snap: Snapshot = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      createdAt: new Date().toISOString(),
      layersBySurface: JSON.parse(JSON.stringify(layersBySurface)),
      mockupTint,
      thumbnail: captureCanvasThumbnail(),
    };
    const next = [snap, ...snapshots].slice(0, MAX_SNAPSHOTS);
    setSnapshots(next);
    saveSnapshots(designId, next);
    setNaming(false);
    setPendingName('');
    setStatusMsg(`Saved "${name}"`);
  }, [designId, pendingName, snapshots, layersBySurface, mockupTint]);

  const handleRestore = useCallback(
    (snap: Snapshot) => {
      // Two-step restore — first click stages a confirm, second click runs.
      if (confirmId !== snap.id) {
        setConfirmId(snap.id);
        return;
      }
      const state = useCanvasStore.getState();
      importCanvasData({
        id: designId || '',
        productId: state.productId ?? 0,
        name: state.designName,
        layersBySurface: snap.layersBySurface,
        canvasSize: state.canvasSize,
        status: state.status,
      });
      setMockupTint(snap.mockupTint);
      setConfirmId(null);
      setOpen(false);
    },
    [confirmId, designId, importCanvasData, setMockupTint]
  );

  const handleDelete = useCallback(
    (snap: Snapshot) => {
      const next = snapshots.filter((s) => s.id !== snap.id);
      setSnapshots(next);
      saveSnapshots(designId, next);
      if (confirmId === snap.id) setConfirmId(null);
    },
    [snapshots, designId, confirmId]
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Snapshots — named restore points"
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <span className="material-icons text-base">photo_camera</span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute right-0 top-full mt-1 w-72 z-30 rounded-md border border-border bg-background shadow-lg"
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Snapshots</h3>
            {!naming && (
              <button
                type="button"
                onClick={beginTakeSnapshot}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <span className="material-icons text-sm">add_a_photo</span>
                New
              </button>
            )}
          </div>
          {statusMsg && (
            <div
              role="status"
              className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/30"
            >
              {statusMsg}
            </div>
          )}
          {naming && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitSnapshot();
              }}
              className="px-3 py-2 border-b border-border space-y-2"
            >
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Snapshot name
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                maxLength={60}
                className="w-full px-2 py-1 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g. Before color swap"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNaming(false)}
                  className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save
                </button>
              </div>
            </form>
          )}
          <div className="max-h-64 overflow-y-auto p-2 space-y-1">
            {snapshots.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">
                Take a snapshot to save the current canvas as a named restore
                point. Snapshots are stored in your browser.
              </div>
            ) : (
              snapshots.map((snap) => {
                const layerCount = countLayers(snap.layersBySurface);
                const isConfirming = confirmId === snap.id;
                return (
                  <div
                    key={snap.id}
                    className={`group flex items-start gap-2 px-2 py-1.5 rounded ${
                      isConfirming ? 'bg-amber-500/10' : 'hover:bg-muted'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleRestore(snap)}
                      className="flex-1 text-left flex items-center gap-2"
                      title={
                        isConfirming
                          ? 'Click again to replace the current canvas'
                          : 'Restore this snapshot'
                      }
                    >
                      <span className="w-10 h-10 flex-none rounded border border-border bg-muted overflow-hidden flex items-center justify-center">
                        {snap.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={snap.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className="material-icons text-base text-muted-foreground/60"
                            aria-hidden="true"
                          >
                            photo
                          </span>
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground line-clamp-1">
                          {snap.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {isConfirming ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              Click again to replace current canvas
                            </span>
                          ) : (
                            <>
                              {relativeTime(new Date(snap.createdAt))} ·{' '}
                              {layerCount} layer
                              {layerCount === 1 ? '' : 's'}
                            </>
                          )}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(snap)}
                      aria-label={`Delete snapshot ${snap.name}`}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
