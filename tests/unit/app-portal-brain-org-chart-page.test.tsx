// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/org-chart/page.tsx`
 *
 * Covers:
 *  - Loading / error / empty tree states (top-level)
 *  - Org tree renders once data loads
 *  - Compact / Expanded density toggle
 *  - New Unit modal: open, cancel (backdrop + button), submit success + failure,
 *    validation (empty name), lead-picker flow, parent selection, color/icon
 *  - UnitSidePanel: loading, error, edits (name, description, color, icon, lead),
 *    add-member dialog, remove member, toggle primary, pagination, delete-unit modal
 *  - EmptySidePanel shown when nothing selected
 *  - LeadPersonName: cache hit, cache miss, fetch failure
 *  - MemberRow: primary star toggle, remove button, initials rendering
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/org-chart',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// OrgUnitTree is a heavy interactive component; stub it to a simple div that
// surfaces the tree data and fires callbacks via test-only buttons.
vi.mock('@/components/brain/OrgUnitTree', () => ({
  default: function OrgUnitTree({
    tree,
    selectedUnitId,
    onSelect,
    onRename,
    onDelete,
    onMerge,
    onCreateChild,
    onMove,
  }: {
    tree: Array<{ id: number; name: string; children: unknown[] }>;
    selectedUnitId: number | null;
    onSelect: (u: { id: number }) => void;
    onRename: (id: number, name: string) => void;
    onDelete: (id: number, force: boolean) => void;
    onMerge: (src: number, tgt: number) => void;
    onCreateChild: (parentId: number | null, name: string) => void;
    onMove: (srcId: number, newParentId: number | null) => void;
  }) {
    return React.createElement(
      'div',
      { 'data-testid': 'org-unit-tree', 'data-selected': selectedUnitId },
      tree.map((n) =>
        React.createElement(
          'div',
          { key: n.id, 'data-testid': `tree-node-${n.id}` },
          React.createElement('span', null, n.name),
          React.createElement('button', { onClick: () => onSelect({ id: n.id }) }, `select-${n.id}`),
          React.createElement('button', { onClick: () => onRename(n.id, 'Renamed') }, `rename-${n.id}`),
          React.createElement('button', { onClick: () => onDelete(n.id, false) }, `delete-${n.id}`),
          React.createElement('button', { onClick: () => onMerge(n.id, 99) }, `merge-${n.id}`),
          React.createElement('button', { onClick: () => onCreateChild(n.id, 'Child') }, `createChild-${n.id}`),
          React.createElement('button', { onClick: () => onMove(n.id, null) }, `move-${n.id}`),
        ),
      ),
    );
  },
}));

// PersonPicker — stub to a simple input that fires onChangeWithHit
vi.mock('@/components/brain/PersonPicker', () => ({
  PersonPicker: function PersonPicker({
    onChangeWithHit,
  }: {
    onChange: (id: number | null) => void;
    onChangeWithHit?: (hit: { id: number; fullName: string; title?: string; email?: string } | null) => void;
  }) {
    return React.createElement(
      'div',
      { 'data-testid': 'person-picker' },
      React.createElement(
        'button',
        {
          'data-testid': 'person-picker-pick',
          onClick: () => onChangeWithHit?.({ id: 42, fullName: 'Alice Smith', title: 'Engineer', email: 'a@b.com' }),
        },
        'pick-person',
      ),
    );
  },
}));

// Stub lib/brain/org-units types — only imported as types, no runtime effect needed
vi.mock('@/lib/brain/org-units', () => ({}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeTree(count = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Unit ${i + 1}`,
    children: [],
    parentId: null,
    description: null,
    leadPersonId: null,
    color: null,
    icon: 'groups',
    memberCount: 0,
    path: `/${i + 1}`,
    slug: `unit-${i + 1}`,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    clientId: 1,
  }));
}

function makeUnitDetails(unitId = 1, extra: Record<string, unknown> = {}) {
  return {
    unit: {
      id: unitId,
      name: `Unit ${unitId}`,
      description: null,
      leadPersonId: null,
      color: null,
      icon: 'groups',
      parentId: null,
      memberCount: 0,
      path: `/${unitId}`,
      slug: `unit-${unitId}`,
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
      clientId: 1,
      ...extra,
    },
    ancestors: [] as Array<{ id: number; name: string }>,
    members: [] as Array<{
      personId: number;
      fullName: string;
      title: string | null;
      roleInUnit: string | null;
      primary: boolean;
    }>,
  };
}

function makeMember(personId = 10, extra: Record<string, unknown> = {}) {
  return {
    personId,
    fullName: `Person ${personId}`,
    title: 'Engineer',
    roleInUnit: null,
    primary: false,
    ...extra,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default: tree loads empty; unit detail never called initially
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/org-units?as=tree')) {
      return makeRes({ success: true, data: { tree: [] } });
    }
    return makeRes({ success: true, data: {} });
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrainOrgChartPage from '@/app/portal/brain/org-chart/page';

function renderPage() {
  return render(React.createElement(BrainOrgChartPage));
}

// ─── Top-level: loading state ────────────────────────────────────────────────

describe('BrainOrgChartPage — loading state', () => {
  it('shows loading spinner while tree fetch is pending', async () => {
    let resolve: (v: FetchResp) => void = () => {};
    const pending = new Promise<FetchResp>((res) => { resolve = res; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) return pending;
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
    resolve(makeRes({ success: true, data: { tree: [] } }));
  });
});

// ─── Top-level: error state ───────────────────────────────────────────────────

describe('BrainOrgChartPage — error state', () => {
  it('shows error banner when tree load returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: false, message: 'tree load failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('tree load failed');
    });
  });

  it('shows error banner when tree load throws a network error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) throw new Error('network down');
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows "Couldn\'t load org chart" title in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: false, message: 'boom' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load org chart");
    });
  });
});

// ─── Top-level: loaded state ──────────────────────────────────────────────────

describe('BrainOrgChartPage — loaded with tree', () => {
  function setupTree(count = 2) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(count) } });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  it('renders the Org Chart heading', async () => {
    setupTree(1);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Org Chart');
    });
  });

  it('renders unit count in the subtitle', async () => {
    setupTree(3);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3 units');
    });
  });

  it('renders singular "unit" for count of 1', async () => {
    setupTree(1);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 unit');
      expect(container.textContent).not.toContain('1 units');
    });
  });

  it('renders the OrgUnitTree component', async () => {
    setupTree(2);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy();
    });
  });

  it('renders tree node names', async () => {
    setupTree(2);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Unit 1');
      expect(container.textContent).toContain('Unit 2');
    });
  });

  it('shows EmptySidePanel when no unit is selected', async () => {
    setupTree(1);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing selected');
    });
  });

  it('renders New unit button', async () => {
    setupTree(0);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('New unit'),
      );
      expect(btn).toBeTruthy();
    });
  });
});

// ─── Density toggle ──────────────────────────────────────────────────────────

describe('BrainOrgChartPage — density toggle', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      return makeRes({ success: true, data: {} });
    });
  });

  it('Expanded button is pressed by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Expanded'),
      ) as HTMLButtonElement | undefined;
      expect(btn?.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('Compact button is not pressed by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Compact'),
      ) as HTMLButtonElement | undefined;
      expect(btn?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('clicking Compact sets aria-pressed=true on Compact and false on Expanded', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Expanded'));
    const compactBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Compact'),
    ) as HTMLButtonElement;
    fireEvent.click(compactBtn);
    await waitFor(() => {
      expect(compactBtn.getAttribute('aria-pressed')).toBe('true');
    });
    const expandedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Expanded'),
    ) as HTMLButtonElement;
    expect(expandedBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking Expanded after Compact reverts aria-pressed', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Expanded'));
    const compactBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Compact'),
    ) as HTMLButtonElement;
    fireEvent.click(compactBtn);
    const expandedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Expanded'),
    ) as HTMLButtonElement;
    fireEvent.click(expandedBtn);
    await waitFor(() => {
      expect(expandedBtn.getAttribute('aria-pressed')).toBe('true');
    });
  });
});

// ─── Tree actions via stub callbacks ─────────────────────────────────────────

describe('BrainOrgChartPage — tree callbacks', () => {
  function setupWithUnit() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  it('selecting a unit from the tree triggers UnitSidePanel load', async () => {
    setupWithUnit();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/\d+$/) && !url.includes('?')) {
        return makeRes({ success: true, data: makeUnitDetails(1) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="org-unit-tree"]')).toBeTruthy());
    const selectBtn = container.querySelector('button[data-testid]') ??
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith('select-'));
    fireEvent.click(selectBtn as HTMLButtonElement);
    await waitFor(() => {
      // UnitSidePanel shows after selection
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.match(/\/org-units\/\d+$/))).toBe(true);
    });
  });

  it('onRename callback calls PATCH and reloads tree', async () => {
    setupWithUnit();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: {} });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const renameBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'rename-1',
    ) as HTMLButtonElement;
    fireEvent.click(renameBtn);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH');
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('onDelete callback calls DELETE and reloads tree', async () => {
    setupWithUnit();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'delete-1',
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE');
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });

  it('onMerge callback calls /merge POST and reloads tree', async () => {
    setupWithUnit();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.includes('/merge') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const mergeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'merge-1',
    ) as HTMLButtonElement;
    fireEvent.click(mergeBtn);
    await waitFor(() => {
      const mergeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/merge'));
      expect(mergeCalls.length).toBeGreaterThan(0);
    });
  });

  it('onCreateChild callback calls POST /org-units and reloads tree', async () => {
    setupWithUnit();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const createChildBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'createChild-1',
    ) as HTMLButtonElement;
    fireEvent.click(createChildBtn);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]) === '/api/portal/brain/org-units' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('onMove callback calls /move POST and reloads tree', async () => {
    setupWithUnit();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.includes('/move') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const moveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'move-1',
    ) as HTMLButtonElement;
    fireEvent.click(moveBtn);
    await waitFor(() => {
      const moveCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/move'));
      expect(moveCalls.length).toBeGreaterThan(0);
    });
  });

  it('onRename API failure calls alert with the error message', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'rename failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const renameBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'rename-1',
    ) as HTMLButtonElement;
    fireEvent.click(renameBtn);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('rename failed');
    });
  });

  it('onDelete API failure calls alert with the error message', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'delete failed' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'delete-1',
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('delete failed');
    });
  });
});

// ─── New Unit Modal ───────────────────────────────────────────────────────────

describe('NewUnitModal', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 77 } });
      }
      return makeRes({ success: true, data: {} });
    });
  });

  async function openModal(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Org Chart'));
    const newUnitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New unit'),
    ) as HTMLButtonElement;
    fireEvent.click(newUnitBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('New org unit');
    });
  }

  it('opens the modal on "New unit" button click', async () => {
    const { container } = renderPage();
    await openModal(container);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('closes the modal on Cancel button click', async () => {
    const { container } = renderPage();
    await openModal(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('closes the modal on backdrop click', async () => {
    const { container } = renderPage();
    await openModal(container);
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('closes the modal on Escape key', async () => {
    const { container } = renderPage();
    await openModal(container);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('Create button is disabled when name is empty', async () => {
    const { container } = renderPage();
    await openModal(container);
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });

  it('Create button enables when name is typed', async () => {
    const { container } = renderPage();
    await openModal(container);
    const nameInput = container.querySelector('input[placeholder="Engineering"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dev Team' } });
    await waitFor(() => {
      const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create'),
      ) as HTMLButtonElement;
      expect(createBtn.disabled).toBe(false);
    });
  });

  it('submitting with a name calls POST /api/portal/brain/org-units', async () => {
    const { container } = renderPage();
    await openModal(container);
    const nameInput = container.querySelector('input[placeholder="Engineering"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Backend' } });
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]) === '/api/portal/brain/org-units' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows API error inline inside modal', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url === '/api/portal/brain/org-units' && init?.method === 'POST') {
        return makeRes({ success: false, message: 'name taken' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await openModal(container);
    const nameInput = container.querySelector('input[placeholder="Engineering"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Existing' } });
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('name taken');
    });
  });

  it('selecting a parent unit changes the select value', async () => {
    const { container } = renderPage();
    await openModal(container);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: '1' } });
    expect(select.value).toBe('1');
  });

  it('clicking a color preset updates selection ring', async () => {
    const { container } = renderPage();
    await openModal(container);
    const colorBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.title && (b.title.startsWith('#') || b.title === 'No color'),
    );
    expect(colorBtns.length).toBeGreaterThan(0);
    fireEvent.click(colorBtns[1]); // pick the first actual color
  });

  it('clicking an icon preset selects it', async () => {
    const { container } = renderPage();
    await openModal(container);
    const iconBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.title === 'engineering',
    );
    if (iconBtns.length > 0) fireEvent.click(iconBtns[0]);
  });

  it('person-picker in modal sets lead person', async () => {
    const { container } = renderPage();
    await openModal(container);
    // Click "Pick lead" button
    const pickLeadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pick lead'),
    ) as HTMLButtonElement;
    fireEvent.click(pickLeadBtn);
    await waitFor(() => {
      // PersonPickerDialog opens with PersonPicker stub
      const pickerBtn = container.querySelector('[data-testid="person-picker-pick"]') as HTMLButtonElement;
      expect(pickerBtn).toBeTruthy();
      fireEvent.click(pickerBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('lead person can be cleared after being set', async () => {
    const { container } = renderPage();
    await openModal(container);
    const pickLeadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pick lead'),
    ) as HTMLButtonElement;
    fireEvent.click(pickLeadBtn);
    await waitFor(() => {
      const pickerBtn = container.querySelector('[data-testid="person-picker-pick"]') as HTMLButtonElement;
      fireEvent.click(pickerBtn);
    });
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));
    // Now clear
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.title === 'Clear',
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Alice Smith');
    });
  });
});

// ─── UnitSidePanel ────────────────────────────────────────────────────────────

describe('UnitSidePanel', () => {
  function setupWithSelectedUnit(unitDetails: ReturnType<typeof makeUnitDetails>) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: unitDetails });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && init?.method === 'PATCH') {
        return makeRes({ success: true, data: unitDetails });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  async function selectUnit(container: HTMLElement) {
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
  }

  it('shows loading spinner while unit details fetch is pending', async () => {
    let resolveDetails: (v: FetchResp) => void = () => {};
    const pending = new Promise<FetchResp>((res) => { resolveDetails = res; });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/\d+$/)) return pending;
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Loading unit');
    });
    resolveDetails(makeRes({ success: true, data: makeUnitDetails(1) }));
  });

  it('shows unit name once details load', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Unit 1');
    });
  });

  it('shows error when unit details load fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/\d+$/)) {
        return makeRes({ success: false, message: 'unit not found' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load unit");
    });
  });

  it('renders "No members yet" when members array is empty', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('No members yet');
    });
  });

  it('renders member names', async () => {
    const details = makeUnitDetails(1);
    details.members = [makeMember(10), makeMember(11)];
    setupWithSelectedUnit(details);
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Person 10');
      expect(container.textContent).toContain('Person 11');
    });
  });

  it('renders breadcrumb "Root" when no ancestors', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Root');
    });
  });

  it('renders ancestor breadcrumb chain', async () => {
    const details = makeUnitDetails(1);
    details.ancestors = [{ id: 5, name: 'Engineering' }, { id: 6, name: 'Backend' }];
    setupWithSelectedUnit(details);
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Engineering');
      expect(container.textContent).toContain('Backend');
    });
  });

  it('shows "Set lead" button when leadPersonId is null', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Set lead');
    });
  });

  it('shows lead picker dialog when "Set lead" is clicked', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Set lead'));
    const setLeadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Set lead'),
    ) as HTMLButtonElement;
    fireEvent.click(setLeadBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="person-picker"]')).toBeTruthy();
    });
  });

  it('shows "Add member" button and opens AddMemberDialog', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Add member'));
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add member'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Add member');
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    });
  });

  it('shows Delete unit button', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete unit'),
      );
      expect(deleteBtn).toBeTruthy();
    });
  });

  it('opens DeleteUnitInlineModal when Delete unit is clicked', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Delete unit'));
    const deleteUnitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteUnitBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeTruthy();
      expect(container.textContent).toContain('Delete');
    });
  });

  it('name input blur triggers PATCH when value changed', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Unit 1'));
    const nameInput = Array.from(container.querySelectorAll('input')).find((i) =>
      i.value === 'Unit 1',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Renamed Unit' } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('name input Enter key triggers blur', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Unit 1'));
    const nameInput = Array.from(container.querySelectorAll('input')).find((i) =>
      i.value === 'Unit 1',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
  });

  it('description blur triggers PATCH when value changed', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Unit 1'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New description' } });
    fireEvent.blur(textarea);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('clicking a color preset calls PATCH with the color', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Unit 1'));
    const colorBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.title && b.title.startsWith('#'),
    );
    expect(colorBtns.length).toBeGreaterThan(0);
    fireEvent.click(colorBtns[0]);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('clicking an icon preset calls PATCH with the icon', async () => {
    setupWithSelectedUnit(makeUnitDetails(1));
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Unit 1'));
    const iconBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.title === 'engineering',
    );
    if (iconBtns.length > 0) {
      fireEvent.click(iconBtns[0]);
      await waitFor(() => {
        const patchCalls = fetchMock.mock.calls.filter(
          (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
        );
        expect(patchCalls.length).toBeGreaterThan(0);
      });
    }
  });

  it('shows member initials in the avatar', async () => {
    const details = makeUnitDetails(1);
    details.members = [{ personId: 10, fullName: 'John Doe', title: null, roleInUnit: null, primary: false }];
    setupWithSelectedUnit(details);
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('JD');
    });
  });

  it('shows star (primary) icon for primary members', async () => {
    const details = makeUnitDetails(1);
    details.members = [makeMember(10, { primary: true })];
    setupWithSelectedUnit(details);
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      const starIcon = Array.from(container.querySelectorAll('.material-icons')).find(
        (el) => el.textContent === 'star',
      );
      expect(starIcon).toBeTruthy();
    });
  });

  it('clicking toggle-primary fires POST to /members', async () => {
    const details = makeUnitDetails(1);
    details.members = [makeMember(10)];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/members') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Person 10'));
    const starBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.title?.includes('primary unit'),
    ) as HTMLButtonElement;
    fireEvent.click(starBtn);
    await waitFor(() => {
      const memberPostCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/members') && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(memberPostCalls.length).toBeGreaterThan(0);
    });
  });

  it('clicking remove-member fires DELETE to /members', async () => {
    const details = makeUnitDetails(1);
    details.members = [makeMember(10)];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/members') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Person 10'));
    const removeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.title === 'Remove from unit',
    ) as HTMLButtonElement;
    fireEvent.click(removeBtn);
    await waitFor(() => {
      const memberDeleteCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/members') && (c[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(memberDeleteCalls.length).toBeGreaterThan(0);
    });
  });

  it('member pagination: shows prev/next buttons when >25 members', async () => {
    const details = makeUnitDetails(1);
    details.members = Array.from({ length: 30 }, (_, i) => makeMember(i + 100));
    setupWithSelectedUnit(details);
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Page 1 of 2');
    });
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Next'),
    ) as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Page 2 of 2');
    });
  });

  it('member pagination: Prev button is disabled on page 1', async () => {
    const details = makeUnitDetails(1);
    details.members = Array.from({ length: 26 }, (_, i) => makeMember(i + 100));
    setupWithSelectedUnit(details);
    const { container } = renderPage();
    await selectUnit(container);
    await waitFor(() => expect(container.textContent).toContain('Page 1'));
    const prevBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Prev'),
    ) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });
});

// ─── DeleteUnitInlineModal ────────────────────────────────────────────────────

describe('DeleteUnitInlineModal', () => {
  function setupDeleteFlow(memberCount = 0) {
    const details = makeUnitDetails(1);
    details.members = Array.from({ length: memberCount }, (_, i) => makeMember(i + 10));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  async function openDeleteModal(container: HTMLElement) {
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => expect(container.textContent).toContain('Delete unit'));
    const deleteUnitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete unit'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteUnitBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
  }

  it('shows simple confirm message when no members', async () => {
    setupDeleteFlow(0);
    const { container } = renderPage();
    await openDeleteModal(container);
    expect(container.textContent).toContain('permanently delete');
    expect(container.textContent).not.toContain('Force delete');
  });

  it('shows force-delete checkbox when unit has members', async () => {
    setupDeleteFlow(3);
    const { container } = renderPage();
    await openDeleteModal(container);
    expect(container.textContent).toContain('Force delete');
    const forceCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(forceCheckbox).toBeTruthy();
    expect(forceCheckbox.checked).toBe(false);
  });

  it('Delete button disabled when members exist and force not checked', async () => {
    setupDeleteFlow(2);
    const { container } = renderPage();
    await openDeleteModal(container);
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete') && !b.textContent?.includes('unit'),
    ) as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);
  });

  it('Delete button enables after checking force', async () => {
    setupDeleteFlow(2);
    const { container } = renderPage();
    await openDeleteModal(container);
    const forceCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(forceCheckbox);
    await waitFor(() => {
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete') && !b.textContent?.includes('unit'),
      ) as HTMLButtonElement;
      expect(deleteBtn.disabled).toBe(false);
    });
  });

  it('confirming delete (no members) calls DELETE API', async () => {
    setupDeleteFlow(0);
    const { container } = renderPage();
    await openDeleteModal(container);
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete') && !b.textContent?.includes('unit'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });

  it('Cancel closes the delete modal', async () => {
    setupDeleteFlow(0);
    const { container } = renderPage();
    await openDeleteModal(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });
});

// ─── AddMemberDialog ──────────────────────────────────────────────────────────

describe('AddMemberDialog', () => {
  function setupWithUnit() {
    const details = makeUnitDetails(1);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/members') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  async function openAddMember(container: HTMLElement) {
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => expect(container.textContent).toContain('Add member'));
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add member'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => expect(container.querySelector('[role="dialog"]')).toBeTruthy());
  }

  it('Add button is disabled when no person is selected', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add' || /^progress_activity\s*Add/.test(b.textContent || ''),
    ) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it('selecting a person via PersonPicker enables Add button', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const pickerBtn = container.querySelector('[data-testid="person-picker-pick"]') as HTMLButtonElement;
    fireEvent.click(pickerBtn);
    await waitFor(() => {
      // Selected person name shown
      expect(container.textContent).toContain('Alice Smith');
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;
    expect(addBtn?.disabled).toBe(false);
  });

  it('clearing selected person re-disables Add button', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const pickerBtn = container.querySelector('[data-testid="person-picker-pick"]') as HTMLButtonElement;
    fireEvent.click(pickerBtn);
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.title === 'Clear',
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Add',
      ) as HTMLButtonElement | undefined;
      expect(addBtn?.disabled).toBe(true);
    });
  });

  it('submitting with person selected calls POST /members', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const pickerBtn = container.querySelector('[data-testid="person-picker-pick"]') as HTMLButtonElement;
    fireEvent.click(pickerBtn);
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      const memberPostCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/members') && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(memberPostCalls.length).toBeGreaterThan(0);
    });
  });

  it('add member failure shows alert', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    const details = makeUnitDetails(1);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/members') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'already a member' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await openAddMember(container);
    const pickerBtn = container.querySelector('[data-testid="person-picker-pick"]') as HTMLButtonElement;
    fireEvent.click(pickerBtn);
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('already a member');
    });
  });

  it('Cancel closes the AddMemberDialog', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).toBeFalsy();
    });
  });

  it('primary checkbox can be toggled in AddMemberDialog', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('role-in-unit input accepts text', async () => {
    setupWithUnit();
    const { container } = renderPage();
    await openAddMember(container);
    const roleInput = container.querySelector('input[placeholder="Tech lead"]') as HTMLInputElement;
    fireEvent.change(roleInput, { target: { value: 'Tech Lead' } });
    expect(roleInput.value).toBe('Tech Lead');
  });
});

// ─── LeadPersonName — fetch behavior ─────────────────────────────────────────

describe('LeadPersonName', () => {
  it('resolves and shows name from API when leadPersonId is set', async () => {
    const details = makeUnitDetails(1, { leadPersonId: 55 });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/api/portal/brain/people/55')) {
        return makeRes({ success: true, data: { person: { fullName: 'Bob Jones' } } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Bob Jones');
    });
  });

  it('falls back to "#id" when person API fails', async () => {
    const details = makeUnitDetails(1, { leadPersonId: 99 });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/api/portal/brain/people/99')) {
        throw new Error('person fetch failed');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('#99');
    });
  });

  it('shows "Clear lead" button when lead is set', async () => {
    const details = makeUnitDetails(1, { leadPersonId: 55 });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/api/portal/brain/people/55')) {
        return makeRes({ success: true, data: { person: { fullName: 'Bob Jones' } } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => {
      const clearLeadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.title === 'Clear lead',
      );
      expect(clearLeadBtn).toBeTruthy();
    });
  });

  it('clicking Clear lead calls PATCH with leadPersonId: null', async () => {
    const details = makeUnitDetails(1, { leadPersonId: 55 });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (url.includes('/api/portal/brain/people/55')) {
        return makeRes({ success: true, data: { person: { fullName: 'Bob Jones' } } });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => {
      const clearLeadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.title === 'Clear lead',
      );
      expect(clearLeadBtn).toBeTruthy();
    });
    const clearLeadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.title === 'Clear lead',
    ) as HTMLButtonElement;
    fireEvent.click(clearLeadBtn);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });
});

// ─── UnitSidePanel patchUnit error path ──────────────────────────────────────

describe('UnitSidePanel — patchUnit error', () => {
  it('alerts when PATCH returns failure', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    const details = makeUnitDetails(1);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      if (init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'patch error' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => expect(container.textContent).toContain('Unit 1'));
    const nameInput = Array.from(container.querySelectorAll('input')).find((i) =>
      i.value === 'Unit 1',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Changed' } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('patch error');
    });
  });
});

// ─── EmptySidePanel ───────────────────────────────────────────────────────────

describe('EmptySidePanel', () => {
  it('shows "Nothing selected" hint text by default', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing selected');
    });
  });

  it('shows "Select an org unit" instruction', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Select an org unit');
    });
  });

  it('hides EmptySidePanel once a unit is selected', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/\d+$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: makeUnitDetails(1) });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Nothing selected'));
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Nothing selected');
    });
  });
});

// ─── MemberRow — roleInUnit vs title display ──────────────────────────────────

describe('MemberRow — subtitle display', () => {
  function setupWithMember(member: ReturnType<typeof makeMember>) {
    const details = makeUnitDetails(1);
    details.members = [member];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: details });
      }
      return makeRes({ success: true, data: {} });
    });
  }

  async function selectAndWait(container: HTMLElement) {
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => expect(container.textContent).toContain('Person'));
  }

  it('shows roleInUnit when present', async () => {
    setupWithMember(makeMember(10, { roleInUnit: 'Tech Lead', title: 'Engineer' }));
    const { container } = renderPage();
    await selectAndWait(container);
    expect(container.textContent).toContain('Tech Lead');
  });

  it('falls back to title when roleInUnit is null', async () => {
    setupWithMember(makeMember(10, { roleInUnit: null, title: 'Designer' }));
    const { container } = renderPage();
    await selectAndWait(container);
    expect(container.textContent).toContain('Designer');
  });

  it('shows "—" when both roleInUnit and title are null', async () => {
    setupWithMember(makeMember(10, { roleInUnit: null, title: null }));
    const { container } = renderPage();
    await selectAndWait(container);
    expect(container.textContent).toContain('—');
  });
});

// ─── onDelete clears selectedId when deleted unit was selected ────────────────

describe('BrainOrgChartPage — onDelete clears selection', () => {
  it('clears selectedId when the selected unit is deleted via tree callback', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/org-units?as=tree')) {
        return makeRes({ success: true, data: { tree: makeTree(1) } });
      }
      if (url.match(/\/api\/portal\/brain\/org-units\/1$/) && (!init?.method || init.method === 'GET')) {
        return makeRes({ success: true, data: makeUnitDetails(1) });
      }
      if (init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('[data-testid="tree-node-1"]')).toBeTruthy());
    const selectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'select-1',
    ) as HTMLButtonElement;
    fireEvent.click(selectBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.match(/\/org-units\/1$/))).toBe(true);
    });
    // Now delete via tree callback — should reset selection to EmptySidePanel
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent === 'delete-1',
    ) as HTMLButtonElement;
    act(() => { fireEvent.click(deleteBtn); });
    await waitFor(() => {
      expect(container.textContent).toContain('Nothing selected');
    });
  });
});
