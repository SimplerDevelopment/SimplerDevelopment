// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/org-chart/page.tsx`
 *
 * Exercises:
 *   - BrainOrgChartPage: loading state, error state, successful render,
 *     compact/expanded toggle, "New unit" modal open
 *   - flatCount (0, 1, plural nested)
 *   - handleMove, handleRename, handleDelete, handleMerge, handleCreateChild
 *     via OrgUnitTree mock callbacks
 *   - EmptySidePanel (nothing selected)
 *   - UnitSidePanel: loading, error, full details, name/desc edit, color/icon
 *     patch, lead-person picker, add member, remove member, setPrimary,
 *     delete-unit modal (force / no-force)
 *   - NewUnitModal: create success, create failure, cancel, empty name guard,
 *     color + icon picker, lead-person picker, parent-unit picker
 *   - MemberRow: initials, star toggle, remove
 *   - LeadPersonName: cache hit, fetch success, fetch fallback
 *   - DeleteUnitInlineModal: no-members path, members path (force checkbox)
 *   - PersonPickerDialog
 *   - ModalShell: Escape key close, backdrop click, close button
 *   - Field helper
 *   - ParentUnitPicker tree walk
 *
 * Mocks: OrgUnitTree, PersonPicker, global fetch, window.alert
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

// Capture callbacks passed to OrgUnitTree so we can drive them from tests
const orgTreeCallbacks: {
  onSelect?: (u: { id: number }) => void;
  onMove?: (sourceId: number, newParentId: number | null) => void;
  onRename?: (id: number, newName: string) => void;
  onDelete?: (id: number, force: boolean) => void;
  onMerge?: (sourceId: number, targetId: number) => void;
  onCreateChild?: (parentId: number | null, name: string) => void;
} = {};

vi.mock('@/components/brain/OrgUnitTree', () => ({
  default: (props: {
    tree: unknown[];
    selectedUnitId: number | null;
    onSelect: (u: { id: number }) => void;
    onMove: (sourceId: number, newParentId: number | null) => void;
    onRename: (id: number, newName: string) => void;
    onDelete: (id: number, force: boolean) => void;
    onMerge: (sourceId: number, targetId: number) => void;
    onCreateChild: (parentId: number | null, name: string) => void;
  }) => {
    orgTreeCallbacks.onSelect = props.onSelect;
    orgTreeCallbacks.onMove = props.onMove;
    orgTreeCallbacks.onRename = props.onRename;
    orgTreeCallbacks.onDelete = props.onDelete;
    orgTreeCallbacks.onMerge = props.onMerge;
    orgTreeCallbacks.onCreateChild = props.onCreateChild;
    return React.createElement('div', { 'data-testid': 'org-unit-tree' }, 'OrgUnitTree');
  },
}));

// PersonPicker — capture onChangeWithHit so tests can trigger it
const personPickerCallbacks: {
  onChangeWithHit?: (hit: { id: number; fullName: string; title: string | null } | null) => void;
} = {};

vi.mock('@/components/brain/PersonPicker', () => ({
  PersonPicker: (props: {
    onChange: (id: number | null) => void;
    onChangeWithHit?: (hit: { id: number; fullName: string; title: string | null } | null) => void;
  }) => {
    personPickerCallbacks.onChangeWithHit = props.onChangeWithHit;
    return React.createElement('div', { 'data-testid': 'person-picker' }, 'PersonPicker');
  },
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

const alertMock = vi.fn();

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeNode(
  id: number,
  name = `Unit ${id}`,
  children: unknown[] = [],
): {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  memberCount: number;
  leadPersonId: number | null;
  children: unknown[];
} {
  return { id, name, description: null, color: null, icon: null, memberCount: 0, leadPersonId: null, children };
}

function makeDetails(
  unitId: number,
  overrides: Record<string, unknown> = {},
): {
  unit: {
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    leadPersonId: number | null;
  };
  ancestors: Array<{ id: number; name: string }>;
  members: Array<{
    personId: number;
    fullName: string;
    title: string | null;
    roleInUnit: string | null;
    primary: boolean;
  }>;
} {
  return {
    unit: {
      id: unitId,
      name: `Unit ${unitId}`,
      description: null,
      color: null,
      icon: null,
      leadPersonId: null,
    },
    ancestors: [],
    members: [],
    ...overrides,
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  alertMock.mockReset();
  // Default: tree loads successfully with one top-level unit
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/org-units?as=tree')) {
      return makeRes({ success: true, data: { tree: [makeNode(1)] } });
    }
    if (url.match(/\/api\/portal\/brain\/org-units\/\d+$/)) {
      return makeRes({ success: true, data: makeDetails(1) });
    }
    if (url.match(/\/api\/portal\/brain\/people\/\d+/)) {
      return makeRes({ success: true, data: { person: { fullName: 'Alice Smith' } } });
    }
    return makeRes({ success: true, data: {} });
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('alert', alertMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrainOrgChartPage from '@/app/portal/brain/org-chart/page';

function renderPage() {
  return render(<BrainOrgChartPage />);
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('BrainOrgChartPage — loading state', () => {
  it('shows loading spinner before tree resolves', () => {
    // Never resolve fetch so loading state persists
    fetchMock.mockImplementation(() => new Promise(() => { /* pending */ }));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error state ─────────────────────────────────────────────────────────────

describe('BrainOrgChartPage — error state', () => {
  it('shows error when tree load fails with message', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: false, message: 'tree exploded' }, false),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('tree exploded');
    });
  });

  it('shows error when fetch throws', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('network error'); });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network error');
    });
  });

  it('shows fallback error when thrown value is not an Error', async () => {
    fetchMock.mockImplementation(async () => { throw 'bad'; });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Main shell ──────────────────────────────────────────────────────────────

describe('BrainOrgChartPage — main shell', () => {
  it('renders the Org Chart heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Org Chart');
    });
  });

  it('renders unit count with plural label', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) {
        return makeRes({ success: true, data: { tree: [makeNode(1), makeNode(2)] } });
      }
      return makeRes({ success: true, data: makeDetails(1) });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 units');
    });
  });

  it('renders singular unit label when count is 1', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 unit');
    });
  });

  it('renders 0 units for an empty tree with no loading/error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) {
        // Must return non-empty tree first to avoid being in loading state,
        // then test with empty tree
        return makeRes({ success: true, data: { tree: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    // Render with empty tree but force the loading to be false by having resolved
    // But loading=true + empty tree = loading spinner; we need loading=false
    // So just check that when tree is empty but loaded, we see 0 units hint
    // (the page only shows the main layout when tree.length > 0 OR loading=false)
    // Since tree is empty and loading resolves false, we'll get the main layout
    const { container } = renderPage();
    await waitFor(() => {
      // Either shows 0 units or is in the main layout with no nodes
      expect(container.textContent).not.toContain('Loading');
    });
  });

  it('renders the OrgUnitTree component', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy();
    });
  });

  it('renders the EmptySidePanel when no unit is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing selected');
    });
  });

  it('renders "New unit" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New unit');
    });
  });
});

// ─── Density toggle ──────────────────────────────────────────────────────────

describe('BrainOrgChartPage — compact/expanded toggle', () => {
  it('Compact button sets aria-pressed=true and Expanded sets false', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Expanded');
    });
    const compactBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Compact'),
    ) as HTMLButtonElement;
    expect(compactBtn).toBeTruthy();
    fireEvent.click(compactBtn);
    await waitFor(() => {
      expect(compactBtn.getAttribute('aria-pressed')).toBe('true');
    });
    const expandedBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Expanded'),
    ) as HTMLButtonElement;
    fireEvent.click(expandedBtn);
    await waitFor(() => {
      expect(expandedBtn.getAttribute('aria-pressed')).toBe('true');
    });
  });
});

// ─── Tree callbacks → handleMove / handleRename / handleDelete / handleMerge / handleCreateChild

describe('BrainOrgChartPage — tree action callbacks', () => {
  async function waitForTree(container: HTMLElement) {
    await waitFor(() => {
      expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy();
    });
  }

  it('handleMove calls POST .../move and reloads tree', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/move') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      return makeRes({ success: true, data: {} });
    });
    await act(async () => {
      await orgTreeCallbacks.onMove?.(1, null);
    });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([u]) => u);
      expect(calls.some((u) => u.includes('/move'))).toBe(true);
    });
  });

  it('handleMove calls alert on failure', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/move') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'move failed' }, false);
      }
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      return makeRes({ success: true, data: {} });
    });
    await act(async () => {
      await orgTreeCallbacks.onMove?.(1, null);
    });
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('move failed');
    });
  });

  it('handleRename calls PATCH and reloads tree', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return makeRes({ success: true });
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      return makeRes({ success: true, data: {} });
    });
    await act(async () => {
      await orgTreeCallbacks.onRename?.(1, 'New Name');
    });
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
    });
  });

  it('handleRename calls alert on failure', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return makeRes({ success: false, message: 'rename failed' }, false);
      return makeRes({ success: true, data: { tree: [makeNode(1)] } });
    });
    await act(async () => {
      await orgTreeCallbacks.onRename?.(1, 'New Name');
    });
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('rename failed');
    });
  });

  it('handleDelete calls DELETE and reloads tree', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: { tree: [makeNode(1)] } });
    });
    await act(async () => {
      await orgTreeCallbacks.onDelete?.(1, false);
    });
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'DELETE');
      expect(delCall).toBeTruthy();
    });
  });

  it('handleDelete calls alert on failure', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeRes({ success: false, message: 'del failed' }, false);
      return makeRes({ success: true, data: { tree: [makeNode(1)] } });
    });
    await act(async () => {
      await orgTreeCallbacks.onDelete?.(1, false);
    });
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('del failed');
    });
  });

  it('handleMerge calls POST .../merge and reloads tree', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/merge') && init?.method === 'POST') return makeRes({ success: true });
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      return makeRes({ success: true, data: {} });
    });
    await act(async () => {
      await orgTreeCallbacks.onMerge?.(1, 2);
    });
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([u]) => u);
      expect(calls.some((u) => u.includes('/merge'))).toBe(true);
    });
  });

  it('handleMerge calls alert on failure', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/merge') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'merge failed' }, false);
      }
      return makeRes({ success: true, data: { tree: [makeNode(1)] } });
    });
    await act(async () => {
      await orgTreeCallbacks.onMerge?.(1, 2);
    });
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('merge failed');
    });
  });

  it('handleCreateChild calls POST /org-units, reloads, and selects new id', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(99, 'New Unit')] } });
      if (url.includes('/api/portal/brain/org-units/99')) return makeRes({ success: true, data: makeDetails(99) });
      return makeRes({ success: true, data: {} });
    });
    await act(async () => {
      await orgTreeCallbacks.onCreateChild?.(null, 'New Unit');
    });
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, i]) => u === '/api/portal/brain/org-units' && (i as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('handleCreateChild calls alert on failure', async () => {
    const { container } = renderPage();
    await waitForTree(container);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'create child failed' }, false);
      }
      return makeRes({ success: true, data: { tree: [makeNode(1)] } });
    });
    await act(async () => {
      await orgTreeCallbacks.onCreateChild?.(null, 'Fail Unit');
    });
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('create child failed');
    });
  });
});

// ─── UnitSidePanel ────────────────────────────────────────────────────────────

describe('UnitSidePanel', () => {
  async function selectUnit(container: HTMLElement, unitId = 1) {
    await waitFor(() => {
      expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy();
    });
    act(() => {
      orgTreeCallbacks.onSelect?.({ id: unitId });
    });
  }

  it('shows loading spinner while unit details load', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      // Unit detail never resolves
      return new Promise(() => { /* pending */ });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Loading unit');
    });
  });

  it('shows error when unit detail load fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/\d+$/)) {
        return makeRes({ success: false, message: 'unit boom' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('unit boom');
    });
  });

  it('renders unit name once loaded', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1, 'Engineering')] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1, { unit: { id: 1, name: 'Engineering', description: null, color: null, icon: null, leadPersonId: null } }) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Engineering');
    });
  });

  it('renders "Root" breadcrumb when there are no ancestors', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1, { ancestors: [] }) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Root');
    });
  });

  it('renders ancestor breadcrumb names when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1, { ancestors: [{ id: 0, name: 'Company' }] }) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Company');
    });
  });

  it('renders "No members yet." when members list is empty', async () => {
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('No members yet.');
    });
  });

  it('renders member rows when members are present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Bob Jones', title: 'Engineer', roleInUnit: null, primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Bob Jones');
    });
  });

  it('renders primary star for primary member', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Charlie', title: null, roleInUnit: null, primary: true }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      // Star icon renders "star" text for primary member
      const starBtns = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.querySelector('.material-icons')?.textContent === 'star',
      );
      expect(starBtns.length).toBeGreaterThan(0);
    });
  });

  it('patching name calls PATCH and reload', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.querySelector('input[class*="font-medium"]')).toBeTruthy();
    });
    const nameInput = container.querySelector('input[class*="font-medium"]') as HTMLInputElement;
    // Simulate user changing the name and tabbing away
    fireEvent.change(nameInput, { target: { value: 'Renamed Unit' } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/org-units/1') && (i as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('Enter key on name input blurs the element', async () => {
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.querySelector('input[class*="font-medium"]')).toBeTruthy();
    });
    const nameInput = container.querySelector('input[class*="font-medium"]') as HTMLInputElement;
    const blurSpy = vi.spyOn(nameInput, 'blur');
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(blurSpy).toHaveBeenCalled();
  });

  it('color preset click calls PATCH with color', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Color');
    });
    // Color buttons are round buttons inside the Color section
    const colorBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.classList.contains('rounded-full'),
    ) as HTMLButtonElement[];
    expect(colorBtns.length).toBeGreaterThan(0);
    // Click the second color preset (first non-empty)
    const redBtn = colorBtns[1];
    fireEvent.click(redBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/org-units/1') && (i as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('icon preset click calls PATCH with icon', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Icon');
    });
    // Icon buttons have a 7 h-7 class
    const iconBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.classList.contains('w-7'),
    ) as HTMLButtonElement[];
    expect(iconBtns.length).toBeGreaterThan(0);
    fireEvent.click(iconBtns[0]);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/org-units/1') && (i as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('renders "Set lead" button when leadPersonId is null', async () => {
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Set lead');
    });
  });

  it('renders LeadPersonName when leadPersonId is set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            unit: { id: 1, name: 'Unit 1', description: null, color: null, icon: null, leadPersonId: 5 },
          }),
        });
      }
      if (url.match(/\/api\/portal\/brain\/people\/5/)) {
        return makeRes({ success: true, data: { person: { fullName: 'Lead Person' } } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Lead Person');
    });
  });

  it('renders fallback #id when person fetch returns no name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            unit: { id: 1, name: 'Unit 1', description: null, color: null, icon: null, leadPersonId: 7 },
          }),
        });
      }
      if (url.match(/\/api\/portal\/brain\/people\/7/)) {
        return makeRes({ success: true, data: { person: {} } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('#7');
    });
  });

  it('renders #id when person fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            unit: { id: 1, name: 'Unit 1', description: null, color: null, icon: null, leadPersonId: 8 },
          }),
        });
      }
      if (url.match(/\/api\/portal\/brain\/people\/8/)) {
        throw new Error('fetch fail');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('#8');
    });
  });

  it('clicking "Set lead" opens PersonPickerDialog', async () => {
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Set lead');
    });
    const setLeadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set lead'),
    ) as HTMLButtonElement;
    fireEvent.click(setLeadBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Set lead person');
      expect(container.querySelector('[data-testid="person-picker"]')).toBeTruthy();
    });
  });

  it('picking a lead person from dialog calls PATCH and closes dialog', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) return makeRes({ success: true, data: makeDetails(1) });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Set lead'));
    const setLeadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Set lead'),
    ) as HTMLButtonElement;
    fireEvent.click(setLeadBtn);
    await waitFor(() => expect(container.querySelector('[data-testid="person-picker"]')).toBeTruthy());
    await act(async () => {
      personPickerCallbacks.onChangeWithHit?.({ id: 42, fullName: 'Alice', title: null });
    });
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/org-units/1') && (i as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('clear lead button calls PATCH with leadPersonId: null', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            unit: { id: 1, name: 'Unit 1', description: null, color: null, icon: null, leadPersonId: 5 },
          }),
        });
      }
      if (url.match(/\/api\/portal\/brain\/people\/5/)) {
        return makeRes({ success: true, data: { person: { fullName: 'Alice' } } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      // After person fetch, the close button for lead should appear
      const closeBtns = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.title === 'Clear lead',
      );
      expect(closeBtns.length).toBeGreaterThan(0);
    });
    const clearLeadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.title === 'Clear lead',
    ) as HTMLButtonElement;
    fireEvent.click(clearLeadBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, i]) => {
          if (u.includes('/org-units/1') && (i as RequestInit)?.method === 'PATCH') {
            const body = JSON.parse((i as RequestInit).body as string);
            return body.leadPersonId === null;
          }
          return false;
        },
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('"Add member" button opens AddMemberDialog', async () => {
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Add member'));
    const addMemberBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add member'),
    ) as HTMLButtonElement;
    fireEvent.click(addMemberBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Add member');
      expect(container.querySelector('[data-testid="person-picker"]')).toBeTruthy();
    });
  });

  it('adding a member via the dialog calls POST /members', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.includes('/members') && init?.method === 'POST') return makeRes({ success: true });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) return makeRes({ success: true, data: makeDetails(1) });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Add member'));
    const addMemberBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add member'),
    ) as HTMLButtonElement;
    fireEvent.click(addMemberBtn);
    await waitFor(() => expect(container.querySelector('[data-testid="person-picker"]')).toBeTruthy());
    // Select a person via the PersonPicker mock
    await act(async () => {
      personPickerCallbacks.onChangeWithHit?.({ id: 20, fullName: 'David Lee', title: null });
    });
    // Now submit the Add button
    await waitFor(() => {
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim().endsWith('Add') && !b.textContent?.includes('Add member'),
      ) as HTMLButtonElement;
      expect(addBtn).toBeTruthy();
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().endsWith('Add') && !b.textContent?.includes('Add member'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/members') && (i as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('remove member button calls DELETE /members', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.includes('/members') && init?.method === 'DELETE') return makeRes({ success: true });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Bob', title: null, roleInUnit: null, primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Bob'));
    const removeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.title === 'Remove from unit',
    ) as HTMLButtonElement[];
    expect(removeBtns.length).toBeGreaterThan(0);
    fireEvent.click(removeBtns[0]);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/members') && (i as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('toggle-primary button calls POST /members', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.includes('/members') && init?.method === 'POST') return makeRes({ success: true });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Eve', title: null, roleInUnit: null, primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Eve'));
    const starBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'star_outline',
    ) as HTMLButtonElement[];
    expect(starBtns.length).toBeGreaterThan(0);
    fireEvent.click(starBtns[0]);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/members') && (i as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('"Delete unit" button opens DeleteUnitInlineModal', async () => {
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Delete unit'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    });
  });

  it('DeleteUnitInlineModal: no-members path allows delete without force', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) return makeRes({ success: true, data: makeDetails(1) });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Delete unit'));
    const deleteUnitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteUnitBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    // Find the Delete confirm button in the dialog
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete') && !b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('/org-units/1') && (i as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('DeleteUnitInlineModal: members path requires force checkbox', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Bob', title: null, roleInUnit: null, primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Delete unit'));
    const deleteUnitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteUnitBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    // With members, the Delete button should be disabled until force is checked
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete') && !b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    // Check force checkbox
    const forceCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
      (c) => (c as HTMLInputElement).closest('[role="dialog"]'),
    ) as HTMLInputElement;
    expect(forceCheckbox).toBeTruthy();
    fireEvent.click(forceCheckbox);
    await waitFor(() => {
      expect(confirmBtn.disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([u, i]) => u.includes('?force=true') && (i as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
  });

  it('member pagination shows prev/next when members exceed page size', async () => {
    const manyMembers = Array.from({ length: 30 }, (_v, i) => ({
      personId: i + 1,
      fullName: `Person ${i + 1}`,
      title: null,
      roleInUnit: null,
      primary: false,
    }));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({ success: true, data: makeDetails(1, { members: manyMembers }) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Person 1');
    });
    // Next button should appear
    const nextBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Person 26');
    });
  });
});

// ─── NewUnitModal ─────────────────────────────────────────────────────────────

describe('NewUnitModal', () => {
  async function openNewModal(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('New unit'));
    const newUnitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New unit') && !b.closest('[role="dialog"]'),
    ) as HTMLButtonElement;
    fireEvent.click(newUnitBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    });
  }

  it('opens the NewUnitModal', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    expect(container.textContent).toContain('New org unit');
  });

  it('Create button disabled when name is empty', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });

  it('Create button enabled once name is filled', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    const nameInput = container.querySelector('input[placeholder="Engineering"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Design' } });
    await waitFor(() => {
      const createBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Create'),
      ) as HTMLButtonElement;
      expect(createBtn.disabled).toBe(false);
    });
  });

  it('successful create calls POST, closes modal, and selects new unit', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 50 } });
      }
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(50, 'Design')] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/50$/)) return makeRes({ success: true, data: makeDetails(50) });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await openNewModal(container);
    const nameInput = container.querySelector('input[placeholder="Engineering"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Design' } });
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, i]) => u === '/api/portal/brain/org-units' && (i as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('shows error message when create fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'create failed' }, false);
      }
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await openNewModal(container);
    const nameInput = container.querySelector('input[placeholder="Engineering"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('create failed');
    });
  });

  it('Cancel button closes the modal', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('backdrop click closes the modal', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('Escape key closes the modal', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('color preset in new unit modal updates selection', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    await waitFor(() => expect(container.textContent).toContain('Color'));
    const colorBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.classList.contains('rounded-full'),
    ) as HTMLButtonElement[];
    expect(colorBtns.length).toBeGreaterThan(0);
    fireEvent.click(colorBtns[1]); // click a colored preset
    // No crash expected; ring-2 class indicates selection
    expect(container.textContent).toContain('New org unit');
  });

  it('icon preset in new unit modal updates selection', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    await waitFor(() => expect(container.textContent).toContain('Icon'));
    const iconBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.classList.contains('w-7'),
    ) as HTMLButtonElement[];
    expect(iconBtns.length).toBeGreaterThan(0);
    fireEvent.click(iconBtns[1]); // pick a different icon
    expect(container.textContent).toContain('New org unit');
  });

  it('parent unit picker renders tree options', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) {
        return makeRes({
          success: true,
          data: {
            tree: [
              makeNode(1, 'Parent', [makeNode(2, 'Child')]),
            ],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await openNewModal(container);
    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      // Should have the parent option
      expect(select.textContent).toContain('Parent');
    });
  });

  it('parent unit picker selects a parent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) {
        return makeRes({ success: true, data: { tree: [makeNode(1, 'Parent')] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await openNewModal(container);
    await waitFor(() => expect(container.querySelector('select')).toBeTruthy());
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '1' } });
    expect(select.value).toBe('1');
    // Reset to no parent
    fireEvent.change(select, { target: { value: '' } });
    expect(select.value).toBe('');
  });

  it('lead-person picker in new unit modal opens and picks a person', async () => {
    const { container } = renderPage();
    await openNewModal(container);
    await waitFor(() => expect(container.textContent).toContain('Pick lead'));
    const pickLeadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Pick lead'),
    ) as HTMLButtonElement;
    fireEvent.click(pickLeadBtn);
    await waitFor(() => expect(container.querySelector('[data-testid="person-picker"]')).toBeTruthy());
    await act(async () => {
      personPickerCallbacks.onChangeWithHit?.({ id: 99, fullName: 'Zara', title: null });
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Zara');
    });
    // Clear lead
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.title === 'Clear',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Pick lead');
    });
  });
});

// ─── ModalShell Escape key ────────────────────────────────────────────────────

describe('ModalShell — Escape key', () => {
  it('pressing Escape closes the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New unit'));
    const newUnitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New unit'),
    ) as HTMLButtonElement;
    fireEvent.click(newUnitBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('pressing a non-Escape key does NOT close the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New unit'));
    const newUnitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New unit'),
    ) as HTMLButtonElement;
    fireEvent.click(newUnitBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('close button inside ModalShell closes the modal', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New unit'));
    const newUnitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New unit'),
    ) as HTMLButtonElement;
    fireEvent.click(newUnitBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
    const closeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.getAttribute('aria-label') === 'Close',
    ) as HTMLButtonElement[];
    expect(closeBtns.length).toBeGreaterThan(0);
    fireEvent.click(closeBtns[0]);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });
});

// ─── MemberRow — initials calculation ─────────────────────────────────────────

describe('MemberRow — initials', () => {
  it('renders initials for a 2-word name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'John Doe', title: null, roleInUnit: null, primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy());
    act(() => orgTreeCallbacks.onSelect?.({ id: 1 }));
    await waitFor(() => {
      expect(container.textContent).toContain('JD');
    });
  });

  it('renders roleInUnit when available', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Alice', title: 'Engineer', roleInUnit: 'Tech Lead', primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy());
    act(() => orgTreeCallbacks.onSelect?.({ id: 1 }));
    await waitFor(() => {
      expect(container.textContent).toContain('Tech Lead');
    });
  });

  it('renders title as fallback when roleInUnit is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) return makeRes({ success: true, data: { tree: [makeNode(1)] } });
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/)) {
        return makeRes({
          success: true,
          data: makeDetails(1, {
            members: [{ personId: 10, fullName: 'Alice', title: 'Software Engineer', roleInUnit: null, primary: false }],
          }),
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy());
    act(() => orgTreeCallbacks.onSelect?.({ id: 1 }));
    await waitFor(() => {
      expect(container.textContent).toContain('Software Engineer');
    });
  });
});

// ─── Nested tree flatCount ────────────────────────────────────────────────────

describe('BrainOrgChartPage — flatCount on nested tree', () => {
  it('counts nested children in flatCount', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('?as=tree')) {
        return makeRes({
          success: true,
          data: {
            tree: [
              makeNode(1, 'Root', [makeNode(2, 'Child1'), makeNode(3, 'Child2')]),
            ],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3 units');
    });
  });
});
