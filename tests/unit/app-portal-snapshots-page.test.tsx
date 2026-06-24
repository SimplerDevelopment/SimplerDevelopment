// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/snapshots/page.tsx`
 * Covers: loading state, empty state, snapshot table, create form,
 * delete with confirm, import modal (new site / existing site / conflicts),
 * flash messages (success + error), and fetch error branches.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/snapshots',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function jsonOk(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

const baseSnapshots = [
  {
    id: 1,
    name: 'Acme v1',
    description: 'First snapshot',
    sourceSiteId: 10,
    version: 1,
    isPublic: false,
    createdAt: '2025-03-01T12:00:00Z',
  },
  {
    id: 2,
    name: 'Orphaned Snap',
    description: null,
    sourceSiteId: null, // renders as "Uploaded"
    version: 1,
    isPublic: true,
    createdAt: '2025-04-01T00:00:00Z',
  },
  {
    id: 3,
    name: 'Beta Site',
    description: 'Beta snapshot',
    sourceSiteId: 11, // ID not in websites list → "Site #11"
    version: 2,
    isPublic: false,
    createdAt: '2025-05-01T00:00:00Z',
  },
];

const baseWebsites = [
  { id: 10, name: 'Acme Marketing' },
  { id: 20, name: 'Demo Site' },
];

function defaultFetch(url: string, init?: RequestInit): Response {
  if (url === '/api/portal/snapshots') {
    return jsonOk({ success: true, data: baseSnapshots });
  }
  if (url === '/api/portal/cms/websites') {
    return jsonOk({ success: true, data: baseWebsites });
  }
  if (/^\/api\/portal\/sites\/\d+\/export$/.test(url) && init?.method === 'POST') {
    return jsonOk({ success: true, data: { id: 99, name: 'New Snap', description: null, sourceSiteId: 10, version: 1, isPublic: false, createdAt: new Date().toISOString() } });
  }
  if (/^\/api\/portal\/snapshots\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonOk({ success: true });
  }
  if (/^\/api\/portal\/snapshots\/\d+\/import$/.test(url) && init?.method === 'POST') {
    return jsonOk({ success: true, data: { postsCreated: 3, siteId: 20, conflicts: [] } });
  }
  if (/^\/api\/portal\/snapshots\/\d+\/download$/.test(url)) {
    return jsonOk({});
  }
  return jsonOk({});
}

let fetchOverride: ((url: string, init?: RequestInit) => Response) | null = null;

beforeEach(() => {
  fetchOverride = null;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const handler = fetchOverride ?? defaultFetch;
    return Promise.resolve(handler(url, init));
  }));
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Page under test (imported AFTER mocks)
import PortalSnapshotsPage from '@/app/portal/snapshots/page';

async function renderAndLoad() {
  const result = render(<PortalSnapshotsPage />);
  await waitFor(() => {
    // loading spinner disappears
    expect(result.container.textContent).not.toContain('progress_activity');
  });
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PortalSnapshotsPage', () => {
  describe('loading state', () => {
    it('shows loading spinner while fetching', () => {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* never resolves */ })));
      const { container } = render(<PortalSnapshotsPage />);
      expect(container.textContent).toContain('Loading snapshots...');
    });
  });

  describe('empty state', () => {
    it('shows empty state when no snapshots', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/snapshots') return jsonOk({ success: true, data: [] });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('No snapshots yet');
      expect(container.textContent).toContain('Create your first to clone a site');
    });
  });

  describe('snapshot table', () => {
    it('renders snapshot names', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Acme v1');
      expect(container.textContent).toContain('Orphaned Snap');
      expect(container.textContent).toContain('Beta Site');
    });

    it('renders description when present', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('First snapshot');
      expect(container.textContent).toContain('Beta snapshot');
    });

    it('renders source site name from websites list', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Acme Marketing');
    });

    it('renders "Uploaded" when sourceSiteId is null', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Uploaded');
    });

    it('renders "Site #<id>" when sourceSiteId not found in websites list', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Site #11');
    });

    it('renders a formatted createdAt date', async () => {
      const { container } = await renderAndLoad();
      // Just verify some date-like string rendered
      expect(container.textContent).toMatch(/2025|3\/1/);
    });

    it('renders Download link for each snapshot', async () => {
      const { container } = await renderAndLoad();
      const links = Array.from(container.querySelectorAll('a')).filter(
        (a) => a.textContent?.includes('Download'),
      );
      expect(links.length).toBe(3);
    });

    it('download link href points to correct endpoint', async () => {
      const { container } = await renderAndLoad();
      const link = Array.from(container.querySelectorAll('a')).find(
        (a) => a.textContent?.includes('Download'),
      )!;
      expect(link.getAttribute('href')).toBe('/api/portal/snapshots/1/download');
    });

    it('renders Import button for each snapshot', async () => {
      const { container } = await renderAndLoad();
      const importBtns = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent?.includes('Import'),
      );
      expect(importBtns.length).toBe(3);
    });

    it('renders Delete button for each snapshot', async () => {
      const { container } = await renderAndLoad();
      const deleteBtns = Array.from(container.querySelectorAll('button')).filter(
        (b) => b.textContent?.includes('Delete'),
      );
      expect(deleteBtns.length).toBe(3);
    });
  });

  describe('page header', () => {
    it('renders the page title', async () => {
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('Site snapshots');
    });

    it('renders the Create snapshot header button', async () => {
      const { container } = await renderAndLoad();
      // The header button has a material-icons "add" child — unique to the header
      const headerBtn = container.querySelector('button span.material-icons');
      expect(headerBtn?.textContent).toBe('add');
    });
  });

  // Helper: click the header "Create snapshot" button (has the "add" icon child).
  // After the panel opens a second button with the same text appears, so we
  // always target the one containing the icon span.
  function clickHeaderCreateBtn(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'add',
    )!;
    fireEvent.click(btn);
  }

  // Helper: find the panel's submit button (inside the pCard panel, no icon).
  // pCard = 'rounded-2xl border border-border bg-card'; create panel adds p-4.
  function getPanelSubmitBtn(container: HTMLElement) {
    const panel = container.querySelector('.rounded-2xl.border.border-border.bg-card.p-4') as HTMLElement;
    return Array.from(panel.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Create snapshot',
    ) as HTMLButtonElement;
  }

  describe('create snapshot form', () => {
    it('toggles the create form open', async () => {
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      expect(container.textContent).toContain('Create snapshot from a site');
    });

    it('second click closes the form', async () => {
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      clickHeaderCreateBtn(container);
      expect(container.textContent).not.toContain('Create snapshot from a site');
    });

    it('renders website options in source site select', async () => {
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      expect(container.textContent).toContain('Acme Marketing');
      expect(container.textContent).toContain('Demo Site');
    });

    it('Cancel button closes the form', async () => {
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      fireEvent.click(screen.getByText('Cancel'));
      expect(container.textContent).not.toContain('Create snapshot from a site');
    });

    it('panel submit button is disabled when no site selected', async () => {
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      const panelBtn = getPanelSubmitBtn(container);
      expect(panelBtn.hasAttribute('disabled')).toBe(true);
    });

    it('submits create with selected site and calls export endpoint', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      const panel = container.querySelector('.rounded-2xl.border.border-border.bg-card.p-4') as HTMLElement;
      const siteSelect = panel.querySelector('select') as HTMLSelectElement;
      fireEvent.change(siteSelect, { target: { value: '10' } });
      const nameInput = panel.querySelector(
        'input[placeholder="e.g. Acme Marketing Site v1"]',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Snap' } });
      await act(async () => { fireEvent.click(getPanelSubmitBtn(container)); });
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (c) => /\/api\/portal\/sites\/10\/export/.test(c[0]) && (c[1] as RequestInit)?.method === 'POST',
        );
        expect(post).toBeTruthy();
      });
    });

    it('shows flash error when export API returns failure', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/sites\/\d+\/export/.test(url)) {
          return jsonOk({ success: false, message: 'Export quota exceeded' }, 422);
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      const panel = container.querySelector('.rounded-2xl.border.border-border.bg-card.p-4') as HTMLElement;
      const siteSelect = panel.querySelector('select') as HTMLSelectElement;
      fireEvent.change(siteSelect, { target: { value: '10' } });
      await act(async () => { fireEvent.click(getPanelSubmitBtn(container)); });
      await waitFor(() => {
        expect(container.textContent).toContain('Export quota exceeded');
      });
    });

    it('falls back to "Export failed" when API error has no message', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/sites\/\d+\/export/.test(url)) {
          return jsonOk({ success: false }, 500);
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      clickHeaderCreateBtn(container);
      const panel = container.querySelector('.rounded-2xl.border.border-border.bg-card.p-4') as HTMLElement;
      const siteSelect = panel.querySelector('select') as HTMLSelectElement;
      fireEvent.change(siteSelect, { target: { value: '10' } });
      await act(async () => { fireEvent.click(getPanelSubmitBtn(container)); });
      await waitFor(() => {
        expect(container.textContent).toContain('Export failed');
      });
    });
  });

  describe('delete snapshot', () => {
    it('calls DELETE endpoint and refetches on confirm', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      )!;
      await act(async () => { fireEvent.click(deleteBtn); });
      await waitFor(() => {
        const del = fetchSpy.mock.calls.find(
          (c) => /\/api\/portal\/snapshots\/\d+/.test(c[0]) && (c[1] as RequestInit)?.method === 'DELETE',
        );
        expect(del).toBeTruthy();
      });
    });

    it('shows success flash after delete', async () => {
      const { container } = await renderAndLoad();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      )!;
      await act(async () => { fireEvent.click(deleteBtn); });
      await waitFor(() => {
        expect(container.textContent).toContain('Snapshot deleted');
      });
    });

    it('does not call DELETE when confirm returns false', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false));
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      )!;
      fireEvent.click(deleteBtn);
      const del = fetchSpy.mock.calls.find(
        (c) => /\/api\/portal\/snapshots\/\d+/.test(c[0]) && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(del).toBeUndefined();
    });

    it('shows error flash when delete API fails', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/snapshots\/\d+$/.test(url) && (init as RequestInit)?.method === 'DELETE') {
          return jsonOk({ success: false, message: 'Cannot delete' }, 422);
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      )!;
      await act(async () => { fireEvent.click(deleteBtn); });
      await waitFor(() => {
        expect(container.textContent).toContain('Cannot delete');
      });
    });
  });

  describe('import modal', () => {
    async function openImportModal(container: HTMLElement) {
      const importBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Import') && b.title === 'Import this snapshot',
      )!;
      fireEvent.click(importBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Import snapshot');
      });
      return importBtn;
    }

    it('opens the import modal when Import button is clicked', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      expect(screen.getByText('Import snapshot')).toBeTruthy();
    });

    it('shows the snapshot name in the modal', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      expect(container.textContent).toContain('Acme v1');
    });

    it('shows "Create a new site" as the default target option', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const targetSelect = container.querySelector(
        'div.fixed select',
      ) as HTMLSelectElement;
      expect(targetSelect.value).toBe('new');
    });

    it('shows new site name input when target is "new"', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      // new site name input should be visible
      expect(container.querySelector('div.fixed input[type="text"]')).toBeTruthy();
    });

    it('shows warning banner when existing site selected as target', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const targetSelect = container.querySelector('div.fixed select') as HTMLSelectElement;
      fireEvent.change(targetSelect, { target: { value: '20' } });
      expect(container.textContent).toContain('Posts with conflicting slugs');
    });

    it('hides new site name input when existing site is selected', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const targetSelect = container.querySelector('div.fixed select') as HTMLSelectElement;
      fireEvent.change(targetSelect, { target: { value: '20' } });
      expect(container.querySelector('div.fixed input[type="text"]')).toBeNull();
    });

    it('Cancel button closes the modal', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const cancelBtn = Array.from(container.querySelectorAll('div.fixed button')).find(
        (b) => b.textContent === 'Cancel',
      )!;
      fireEvent.click(cancelBtn);
      expect(container.querySelector('div.fixed')).toBeNull();
    });

    it('clicking the backdrop closes the modal', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const backdrop = container.querySelector('div.fixed.inset-0')!;
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(container.querySelector('div.fixed')).toBeNull();
      });
    });

    it('clicking the inner panel does NOT close the modal (stopPropagation)', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const innerPanel = container.querySelector('div.fixed.inset-0 > div')!;
      fireEvent.click(innerPanel);
      expect(container.querySelector('div.fixed')).toBeTruthy();
    });

    it('submitting import with new site calls import endpoint and shows success flash', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(defaultFetch(url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const importSubmitBtn = Array.from(container.querySelectorAll('div.fixed button')).find(
        (b) => b.textContent === 'Import',
      )!;
      await act(async () => { fireEvent.click(importSubmitBtn); });
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          (call) => /\/api\/portal\/snapshots\/\d+\/import/.test(call[0]) && (call[1] as RequestInit)?.method === 'POST',
        );
        expect(post).toBeTruthy();
      });
      await waitFor(() => {
        expect(container.textContent).toContain('Imported');
      });
    });

    it('shows conflict count in success flash when conflicts present', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/snapshots\/\d+\/import/.test(url)) {
          return jsonOk({ success: true, data: { postsCreated: 2, siteId: 20, conflicts: ['slug-a', 'slug-b'] } });
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const importSubmitBtn = Array.from(container.querySelectorAll('div.fixed button')).find(
        (b) => b.textContent === 'Import',
      )!;
      await act(async () => { fireEvent.click(importSubmitBtn); });
      await waitFor(() => {
        expect(container.textContent).toContain('2 slug conflicts resolved');
      });
    });

    it('shows error flash when import API fails', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/snapshots\/\d+\/import/.test(url)) {
          return jsonOk({ success: false, message: 'Import quota exceeded' }, 422);
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const importSubmitBtn = Array.from(container.querySelectorAll('div.fixed button')).find(
        (b) => b.textContent === 'Import',
      )!;
      await act(async () => { fireEvent.click(importSubmitBtn); });
      await waitFor(() => {
        expect(container.textContent).toContain('Import quota exceeded');
      });
    });

    it('falls back to "Import failed" when API error has no message', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/snapshots\/\d+\/import/.test(url)) {
          return jsonOk({ success: false }, 500);
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const importSubmitBtn = Array.from(container.querySelectorAll('div.fixed button')).find(
        (b) => b.textContent === 'Import',
      )!;
      await act(async () => { fireEvent.click(importSubmitBtn); });
      await waitFor(() => {
        expect(container.textContent).toContain('Import failed');
      });
    });

    it('closes modal after successful import', async () => {
      const { container } = await renderAndLoad();
      await openImportModal(container);
      const importSubmitBtn = Array.from(container.querySelectorAll('div.fixed button')).find(
        (b) => b.textContent === 'Import',
      )!;
      await act(async () => { fireEvent.click(importSubmitBtn); });
      await waitFor(() => {
        expect(container.querySelector('div.fixed')).toBeNull();
      });
    });
  });

  describe('flash messages', () => {
    it('renders success flash with green styling', async () => {
      const { container } = await renderAndLoad();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      )!;
      await act(async () => { fireEvent.click(deleteBtn); });
      await waitFor(() => {
        const flashEl = container.querySelector('.bg-green-50, [class*="green"]');
        expect(flashEl).toBeTruthy();
      });
    });

    it('renders error flash with red styling', async () => {
      fetchOverride = (url, init) => {
        if (/\/api\/portal\/snapshots\/\d+$/.test(url) && (init as RequestInit)?.method === 'DELETE') {
          return jsonOk({ success: false, message: 'Server error' }, 500);
        }
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      )!;
      await act(async () => { fireEvent.click(deleteBtn); });
      await waitFor(() => {
        const flashEl = container.querySelector('.bg-red-50, [class*="red-50"]');
        expect(flashEl).toBeTruthy();
      });
    });
  });

  describe('fetch failure branches', () => {
    it('handles snapshots fetch failure gracefully (catch block)', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));
      const { container } = render(<PortalSnapshotsPage />);
      await waitFor(() => {
        expect(container.textContent).not.toContain('progress_activity');
      });
      // Should show empty state without crashing
      expect(container.textContent).toContain('No snapshots yet');
    });

    it('handles snapshots returning success: false gracefully', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/snapshots') return jsonOk({ success: false });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      expect(container.textContent).toContain('No snapshots yet');
    });

    it('handles websites returning success: false gracefully', async () => {
      fetchOverride = (url, init) => {
        if (url === '/api/portal/cms/websites') return jsonOk({ success: false });
        return defaultFetch(url, init);
      };
      const { container } = await renderAndLoad();
      // Page still loads with snapshots, just no site names in dropdowns
      expect(container.textContent).toContain('Acme v1');
    });
  });
});
