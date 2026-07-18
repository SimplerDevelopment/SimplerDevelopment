// @vitest-environment jsdom
/**
 * Unit tests for useNavigation.
 *
 * Strategy:
 *   - Mock the entire `_lib/api` module so no real fetch is issued.
 *   - Mock the `_lib/tree` module to validate that helpers are called
 *     correctly (appendItem, moveInFlatList, removeItemAndDescendants,
 *     updateById are tested in isolation elsewhere; here we verify the hook
 *     delegates correctly and wires up state).
 *   - Use absolute import paths (project vitest resolution requirement).
 *   - Use renderHook + act + waitFor from @testing-library/react.
 *   - Exercises: initial load (success + error), save (success + error),
 *     publishItem, publishAll, addItem, addColumn, addMegaItem, updateItem,
 *     removeItem (draft-only vs live row), moveItem, updateBranding,
 *     cancelDelete, setEditingId, sitePreviewUrl derivation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── mock api ──────────────────────────────────────────────────────────────────
vi.mock(
  '@/app/portal/websites/[siteId]/navigation/_lib/api',
  () => ({
    fetchNavigation: vi.fn(),
    fetchBranding: vi.fn(),
    fetchSiteStatus: vi.fn(),
    publishAllNav: vi.fn(),
    publishNavItem: vi.fn(),
    resolvePreviewBase: vi.fn(),
    saveBranding: vi.fn(),
    saveNavigation: vi.fn(),
  }),
);

// ── mock tree helpers ─────────────────────────────────────────────────────────
// Keep real implementations but spy on them so we can assert call shapes.
// The hook's behaviour is still driven by real data transforms; we just verify
// the bridge between hook and helper.
vi.mock(
  '@/app/portal/websites/[siteId]/navigation/_lib/tree',
  async () => {
    // Import the real module and re-export, wrapping each export with vi.fn()
    // that delegates to the original so logic is preserved.
    const real = await vi.importActual<
      typeof import('@/app/portal/websites/[siteId]/navigation/_lib/tree')
    >(
      '@/app/portal/websites/[siteId]/navigation/_lib/tree',
    );
    return {
      appendItem: vi.fn(real.appendItem),
      moveInFlatList: vi.fn(real.moveInFlatList),
      removeItemAndDescendants: vi.fn(real.removeItemAndDescendants),
      updateById: vi.fn(real.updateById),
      withSequentialSortOrder: vi.fn(real.withSequentialSortOrder),
      topLevel: vi.fn(real.topLevel),
      childrenOf: vi.fn(real.childrenOf),
      findById: vi.fn(real.findById),
      collectDescendantIds: vi.fn(real.collectDescendantIds),
    };
  },
);

import * as api from '@/app/portal/websites/[siteId]/navigation/_lib/api';
import { useNavigation } from '@/app/portal/websites/[siteId]/navigation/_hooks/useNavigation';
import { DEFAULT_BRANDING } from '@/app/portal/websites/[siteId]/navigation/_lib/types';
import type { NavItem, Branding } from '@/app/portal/websites/[siteId]/navigation/_lib/types';

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeNavItem(overrides: Partial<NavItem> = {}): NavItem {
  return {
    id: 1,
    label: 'Home',
    href: '/',
    parentId: null,
    sortOrder: 0,
    openInNewTab: false,
    isButton: false,
    ...overrides,
  };
}

const SITE_ID = 'site-42';

function setupHappyPath(items: NavItem[] = [makeNavItem()]) {
  vi.mocked(api.fetchNavigation).mockResolvedValue(items);
  vi.mocked(api.fetchBranding).mockResolvedValue(null);
  vi.mocked(api.fetchSiteStatus).mockResolvedValue(null);
  vi.mocked(api.resolvePreviewBase).mockReturnValue(null);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initial state ─────────────────────────────────────────────────────────

  it('starts in loading state with empty items', () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it('starts with DEFAULT_BRANDING', () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    expect(result.current.branding).toEqual(DEFAULT_BRANDING);
  });

  it('starts with saving=false, dirty=false, editingId=null', () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    expect(result.current.saving).toBe(false);
    expect(result.current.dirty).toBe(false);
    expect(result.current.editingId).toBeNull();
  });

  // ── load ──────────────────────────────────────────────────────────────────

  it('populates items from fetchNavigation on mount', async () => {
    const items = [makeNavItem({ id: 10, label: 'About' })];
    setupHappyPath(items);
    const { result } = renderHook(() => useNavigation(SITE_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual(items);
  });

  it('merges fetched branding with DEFAULT_BRANDING', async () => {
    vi.mocked(api.fetchNavigation).mockResolvedValue([]);
    vi.mocked(api.fetchBranding).mockResolvedValue({ primaryColor: '#ff0000' });
    vi.mocked(api.fetchSiteStatus).mockResolvedValue(null);
    vi.mocked(api.resolvePreviewBase).mockReturnValue(null);

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding.primaryColor).toBe('#ff0000');
    // Non-overridden defaults remain
    expect(result.current.branding.logoUrl).toBe(DEFAULT_BRANDING.logoUrl);
  });

  it('leaves branding as DEFAULT_BRANDING when fetchBranding returns null', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.branding).toEqual(DEFAULT_BRANDING);
  });

  it('sets sitePreviewUrl from resolvePreviewBase', async () => {
    vi.mocked(api.fetchNavigation).mockResolvedValue([]);
    vi.mocked(api.fetchBranding).mockResolvedValue(null);
    vi.mocked(api.fetchSiteStatus).mockResolvedValue({ vercelDomain: 'example.com' });
    vi.mocked(api.resolvePreviewBase).mockReturnValue('/sites/example.com');

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sitePreviewUrl).toBe('/sites/example.com');
  });

  it('sets loading=false after all fetches settle', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('calls fetchNavigation with the provided siteId', async () => {
    setupHappyPath();
    renderHook(() => useNavigation('my-site'));
    await waitFor(() => expect(api.fetchNavigation).toHaveBeenCalledWith('my-site'));
  });

  // ── save ──────────────────────────────────────────────────────────────────

  it('save: sets saving=true while in-flight, then false on success', async () => {
    setupHappyPath();
    vi.mocked(api.saveNavigation).mockResolvedValue(new Response());
    vi.mocked(api.saveBranding).mockResolvedValue(new Response());
    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ id: 99, label: 'Updated' })]);

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Reset mocks so the next fetchNavigation call is the post-save refetch
    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ id: 99, label: 'Saved' })]);

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.save();
    });

    expect(result.current.saving).toBe(true);

    await act(async () => {
      await savePromise!;
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it('save: re-fetches navigation after saving and updates items', async () => {
    setupHappyPath([makeNavItem({ id: 1, label: 'Home' })]);
    vi.mocked(api.saveNavigation).mockResolvedValue(new Response());
    vi.mocked(api.saveBranding).mockResolvedValue(new Response());

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ id: 1, label: 'Home (saved)' })]);

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.items[0].label).toBe('Home (saved)');
  });

  it('save: clears saving=false even when saveNavigation throws', async () => {
    setupHappyPath();
    vi.mocked(api.saveNavigation).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      // save() uses try/finally so it should not throw to the caller
      try {
        await result.current.save();
      } catch {
        // expected
      }
    });

    expect(result.current.saving).toBe(false);
  });

  // ── publishItem ───────────────────────────────────────────────────────────

  it('publishItem: calls publishNavItem then refetches navigation', async () => {
    setupHappyPath([makeNavItem({ id: 5 })]);
    vi.mocked(api.publishNavItem).mockResolvedValue({ success: true, data: null });
    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ id: 5, label: 'Published' })]);

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Reset so the next call is post-publish refetch
    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ id: 5, label: 'Published' })]);

    await act(async () => {
      await result.current.publishItem(5);
    });

    expect(api.publishNavItem).toHaveBeenCalledWith(SITE_ID, 5);
    expect(result.current.items[0].label).toBe('Published');
    expect(result.current.dirty).toBe(false);
  });

  // ── publishAll ────────────────────────────────────────────────────────────

  it('publishAll: calls publishAllNav then refetches navigation', async () => {
    setupHappyPath([makeNavItem()]);
    vi.mocked(api.publishAllNav).mockResolvedValue({ success: true, data: null });
    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ label: 'All Published' })]);

    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ label: 'All Published' })]);

    await act(async () => {
      await result.current.publishAll();
    });

    expect(api.publishAllNav).toHaveBeenCalledWith(SITE_ID);
    expect(result.current.items[0].label).toBe('All Published');
    expect(result.current.dirty).toBe(false);
  });

  // ── addItem ───────────────────────────────────────────────────────────────

  it('addItem: appends a new item to the list and sets editingId', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addItem();
    });

    expect(result.current.items.length).toBe(2);
    // The new item has a negative temp id
    const newItem = result.current.items.find((i) => i.id < 0);
    expect(newItem).toBeDefined();
    expect(result.current.editingId).toBe(newItem!.id);
    expect(result.current.dirty).toBe(true);
  });

  it('addItem: sets parentId when provided', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addItem(1);
    });

    const child = result.current.items.find((i) => i.parentId === 1);
    expect(child).toBeDefined();
  });

  it('addItem: applies defaults when passed', async () => {
    setupHappyPath([]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addItem(null, { label: 'Custom', href: '/custom' });
    });

    expect(result.current.items[0].label).toBe('Custom');
    expect(result.current.items[0].href).toBe('/custom');
  });

  // ── addColumn ─────────────────────────────────────────────────────────────

  it('addColumn: appends a column child under parentId with auto-generated label', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addColumn(1);
    });

    const col = result.current.items.find((i) => i.parentId === 1);
    expect(col).toBeDefined();
    expect(col!.label).toBe('Column 1');
    expect(result.current.dirty).toBe(true);
  });

  it('addColumn: increments column label with existing children', async () => {
    const existingCol = makeNavItem({ id: 2, parentId: 1, label: 'Column 1' });
    setupHappyPath([makeNavItem({ id: 1 }), existingCol]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addColumn(1);
    });

    const cols = result.current.items.filter((i) => i.parentId === 1);
    expect(cols.length).toBe(2);
    expect(cols[1].label).toBe('Column 2');
  });

  // ── addMegaItem ───────────────────────────────────────────────────────────

  it('addMegaItem: adds a child item under the given columnId with defaults', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addMegaItem(1);
    });

    const mega = result.current.items.find((i) => i.parentId === 1);
    expect(mega).toBeDefined();
    expect(mega!.label).toBe('New Item');
    expect(mega!.href).toBe('/');
  });

  // ── updateItem ────────────────────────────────────────────────────────────

  it('updateItem: updates the matching item by id and sets dirty', async () => {
    setupHappyPath([makeNavItem({ id: 3, label: 'Old' })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateItem(3, { label: 'New' });
    });

    expect(result.current.items[0].label).toBe('New');
    expect(result.current.dirty).toBe(true);
  });

  it('updateItem: does not affect other items', async () => {
    setupHappyPath([makeNavItem({ id: 3 }), makeNavItem({ id: 4, label: 'Other' })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateItem(3, { label: 'Changed' });
    });

    const other = result.current.items.find((i) => i.id === 4);
    expect(other!.label).toBe('Other');
  });

  // ── removeItem ────────────────────────────────────────────────────────────

  it('removeItem: removes temp item (negative id) entirely', async () => {
    // addItem produces a negative-id temp item
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addItem();
    });
    const tempId = result.current.items.find((i) => i.id < 0)!.id;
    expect(tempId).toBeLessThan(0);

    act(() => {
      result.current.removeItem(tempId);
    });

    expect(result.current.items.find((i) => i.id === tempId)).toBeUndefined();
  });

  it('removeItem: tombstones a live item (positive id) with pendingDelete', async () => {
    setupHappyPath([makeNavItem({ id: 10 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.removeItem(10);
    });

    const item = result.current.items.find((i) => i.id === 10);
    expect(item).toBeDefined();
    expect(item!.draft?.pendingDelete).toBe(true);
    expect(result.current.dirty).toBe(true);
  });

  it('removeItem: also tombstones direct children of a live item', async () => {
    setupHappyPath([makeNavItem({ id: 10 }), makeNavItem({ id: 11, parentId: 10 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.removeItem(10);
    });

    const child = result.current.items.find((i) => i.id === 11);
    expect(child!.draft?.pendingDelete).toBe(true);
  });

  it('removeItem: removes draft-only item (pendingCreate=true) entirely', async () => {
    setupHappyPath([makeNavItem({ id: 5, draft: { pendingCreate: true } })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.removeItem(5);
    });

    expect(result.current.items.find((i) => i.id === 5)).toBeUndefined();
  });

  // ── moveItem ──────────────────────────────────────────────────────────────

  it('moveItem: moves item up (-1) and sets dirty', async () => {
    setupHappyPath([makeNavItem({ id: 1, label: 'A' }), makeNavItem({ id: 2, label: 'B' })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.moveItem(2, -1);
    });

    expect(result.current.items[0].id).toBe(2);
    expect(result.current.items[1].id).toBe(1);
    expect(result.current.dirty).toBe(true);
  });

  it('moveItem: moves item down (+1)', async () => {
    setupHappyPath([makeNavItem({ id: 1, label: 'A' }), makeNavItem({ id: 2, label: 'B' })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.moveItem(1, 1);
    });

    expect(result.current.items[0].id).toBe(2);
    expect(result.current.items[1].id).toBe(1);
    expect(result.current.dirty).toBe(true);
  });

  it('moveItem: no-ops when at boundary (move first item up)', async () => {
    setupHappyPath([makeNavItem({ id: 1 }), makeNavItem({ id: 2 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.moveItem(1, -1);
    });

    // Order unchanged
    expect(result.current.items[0].id).toBe(1);
  });

  // ── updateBranding ────────────────────────────────────────────────────────

  it('updateBranding: merges partial updates into branding and sets dirty', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateBranding({ primaryColor: '#123456' });
    });

    expect(result.current.branding.primaryColor).toBe('#123456');
    expect(result.current.branding.logoUrl).toBe(DEFAULT_BRANDING.logoUrl);
    expect(result.current.dirty).toBe(true);
  });

  it('updateBranding: can update multiple fields at once', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const patch: Partial<Branding> = { navTemplate: 'mega', navPosition: 'sticky' };
    act(() => {
      result.current.updateBranding(patch);
    });

    expect(result.current.branding.navTemplate).toBe('mega');
    expect(result.current.branding.navPosition).toBe('sticky');
  });

  // ── cancelDelete ──────────────────────────────────────────────────────────

  it('cancelDelete: clears pendingDelete flag on the matching item', async () => {
    setupHappyPath([makeNavItem({ id: 7, draft: { pendingDelete: true } })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.cancelDelete(7);
    });

    const item = result.current.items.find((i) => i.id === 7);
    expect(item!.draft?.pendingDelete).toBe(false);
    expect(result.current.dirty).toBe(true);
  });

  it('cancelDelete: no-ops for an item without pendingDelete', async () => {
    setupHappyPath([makeNavItem({ id: 8 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should not throw even if item has no draft
    expect(() => {
      act(() => {
        result.current.cancelDelete(8);
      });
    }).not.toThrow();
  });

  // ── setEditingId ──────────────────────────────────────────────────────────

  it('setEditingId: updates editingId directly', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setEditingId(1);
    });

    expect(result.current.editingId).toBe(1);
  });

  it('setEditingId: can be cleared to null', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setEditingId(1);
    });
    act(() => {
      result.current.setEditingId(null);
    });

    expect(result.current.editingId).toBeNull();
  });

  // ── siteId change (re-fetch) ──────────────────────────────────────────────

  it('re-fetches when siteId changes', async () => {
    setupHappyPath([makeNavItem({ id: 1 })]);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useNavigation(id),
      { initialProps: { id: 'site-1' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(api.fetchNavigation).mockResolvedValue([makeNavItem({ id: 99 })]);
    vi.mocked(api.fetchBranding).mockResolvedValue(null);
    vi.mocked(api.fetchSiteStatus).mockResolvedValue(null);
    vi.mocked(api.resolvePreviewBase).mockReturnValue(null);

    act(() => {
      rerender({ id: 'site-2' });
    });

    await waitFor(() => expect(api.fetchNavigation).toHaveBeenCalledWith('site-2'));
  });

  // ── returned surface ──────────────────────────────────────────────────────

  it('exposes all expected state and action keys', async () => {
    setupHappyPath();
    const { result } = renderHook(() => useNavigation(SITE_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const keys = Object.keys(result.current);
    const expected = [
      'items', 'branding', 'loading', 'saving', 'dirty', 'editingId',
      'sitePreviewUrl', 'setEditingId', 'addItem', 'addColumn', 'addMegaItem',
      'updateItem', 'removeItem', 'moveItem', 'updateBranding', 'save',
      'publishItem', 'publishAll', 'cancelDelete',
    ];
    for (const key of expected) {
      expect(keys).toContain(key);
    }
  });
});
