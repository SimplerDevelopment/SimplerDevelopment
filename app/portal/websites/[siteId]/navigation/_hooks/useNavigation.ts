// ─── useNavigation: load + mutate + save nav state ──────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  fetchBranding,
  fetchNavigation,
  fetchSiteStatus,
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

  // Save
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([saveNavigation(siteId, items), saveBranding(siteId, branding)]);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [siteId, items, branding]);

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
    setItems((prev) => removeItemAndDescendants(prev, id));
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
  };
}
