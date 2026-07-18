// ─── useNavigation: load + mutate + save nav state ──────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  fetchBranding,
  fetchNavigation,
  fetchSiteStatus,
  publishAllNav,
  publishNavItem,
  resolvePreviewBase,
  saveBranding,
  saveNavigation,
} from '../_lib/api';
import {
  appendItem,
  moveInFlatList,
  removeItemAndDescendants,
  updateById,
} from '../_lib/tree';
import { DEFAULT_BRANDING, type Branding, type NavItem } from '../_lib/types';

let nextTempId = -1;

export function useNavigation(siteId: string) {
  const [items, setItems] = useState<NavItem[]>([]);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sitePreviewUrl, setSitePreviewUrl] = useState<string | null>(null);

  // Load
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchNavigation(siteId),
      fetchBranding(siteId),
      fetchSiteStatus(siteId),
    ])
      .then(([navItems, brand, status]) => {
        if (cancelled) return;
        setItems(navItems);
        if (brand) setBranding({ ...DEFAULT_BRANDING, ...brand });
        const host = typeof window !== 'undefined' ? window.location.host : null;
        setSitePreviewUrl(resolvePreviewBase(status, host));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Save (stages changes as drafts server-side)
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([saveNavigation(siteId, items), saveBranding(siteId, branding)]);
      // Re-fetch so the editor sees the server-assigned ids + freshly-staged
      // draft overlays. This keeps subsequent edits merging into the same
      // draft rather than overwriting it.
      const next = await fetchNavigation(siteId);
      setItems(next);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [siteId, items, branding]);

  // Publish a single nav item's draft → live, then refetch.
  const publishItem = useCallback(
    async (id: number) => {
      await publishNavItem(siteId, id);
      const next = await fetchNavigation(siteId);
      setItems(next);
      setDirty(false);
    },
    [siteId],
  );

  // Publish every draft on this site → live, then refetch.
  const publishAll = useCallback(async () => {
    await publishAllNav(siteId);
    const next = await fetchNavigation(siteId);
    setItems(next);
    setDirty(false);
  }, [siteId]);

  // Local-state undo for a staged delete. The user can also Save Changes to
  // persist the revival to the draft.
  const cancelDelete = useCallback((id: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && i.draft?.pendingDelete
          ? { ...i, draft: { ...i.draft, pendingDelete: false } }
          : i,
      ),
    );
    setDirty(true);
  }, []);

  // Item CRUD
  const addItem = useCallback(
    (parentId: number | null = null, defaults?: Partial<NavItem>) => {
      const id = nextTempId--;
      setItems((prev) => appendItem(prev, id, parentId, defaults));
      setEditingId(id);
      setDirty(true);
    },
    [],
  );

  const addColumn = useCallback(
    (parentId: number) => {
      // Use a callback to compute the next column index from the latest items
      setItems((prev) => {
        const columnCount = prev.filter((i) => i.parentId === parentId).length;
        const id = nextTempId--;
        setEditingId(id);
        return appendItem(prev, id, parentId, {
          label: `Column ${columnCount + 1}`,
          href: '#',
        });
      });
      setDirty(true);
    },
    [],
  );

  const addMegaItem = useCallback(
    (columnId: number) => {
      addItem(columnId, { label: 'New Item', href: '/' });
    },
    [addItem],
  );

  const updateItem = useCallback((id: number, updates: Partial<NavItem>) => {
    setItems((prev) => updateById(prev, id, updates));
    setDirty(true);
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      // Brand-new items (negative temp id) or draft-only items have nothing
      // live to tombstone — drop them entirely along with their descendants.
      const isDraftOnly = !target || id < 0 || target.draft?.pendingCreate === true;
      if (isDraftOnly) return removeItemAndDescendants(prev, id);
      // Live row → flip the draft tombstone on this item + its descendants
      // so the renderer keeps showing them until the user publishes.
      return prev.map((i) =>
        i.id === id || i.parentId === id
          ? {
              ...i,
              draft: { ...(i.draft ?? {}), pendingDelete: true },
            }
          : i,
      );
    });
    setDirty(true);
  }, []);

  const moveItem = useCallback((id: number, direction: -1 | 1) => {
    setItems((prev) => moveInFlatList(prev, id, direction));
    setDirty(true);
  }, []);

  const updateBranding = useCallback((updates: Partial<Branding>) => {
    setBranding((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }, []);

  return {
    // state
    items,
    branding,
    loading,
    saving,
    dirty,
    editingId,
    sitePreviewUrl,
    // setters
    setEditingId,
    // actions
    addItem,
    addColumn,
    addMegaItem,
    updateItem,
    removeItem,
    moveItem,
    updateBranding,
    save,
    publishItem,
    publishAll,
    cancelDelete,
  };
}
