// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/people/[id]/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * params is Promise<{ id: string }>; React.use() is mocked below.
 *
 * Covers:
 *  - Loading state (spinner)
 *  - Error state (API !ok, success=false, network throw)
 *  - Error state back-link present
 *  - Loaded state: name, status chip, title, email, manager link
 *  - Status chip variants: active, inactive, departed
 *  - initialsOf rendered in avatar
 *  - fmtDate: null → not shown; valid date → locale string
 *  - Profile section: email, title, start/end dates, notes, profileUrls
 *  - Org membership: empty state, list with primary badge
 *  - Reporting section: no manager state, manager link, direct reports
 *  - Edit mode: enters, form fields populated, Cancel discards, Save calls PATCH
 *  - Save error shown inline
 *  - Save network error shown inline
 *  - Save disabled when formName is empty
 *  - Delete button opens confirm dialog
 *  - Delete confirm dialog: cancel, doDelete success → router.push
 *  - Delete failure shows error
 *  - ExpertiseEditor and PersonProfileSidebar stubs rendered
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks (must precede page import) ──────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/components/brain/PersonProfileSidebar', () => ({
  PersonProfileSidebar: ({ person }: any) =>
    React.createElement('div', { 'data-testid': 'person-profile-sidebar', 'data-id': person.id }),
}));

vi.mock('@/components/brain/ExpertiseEditor', () => ({
  ExpertiseEditor: ({ personId, expertise }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'expertise-editor', 'data-person': personId },
      `chips:${(expertise ?? []).length}`,
    ),
}));

// React.use — intercept so we can return a synchronously-known value.
const USE_VALUE = Symbol('use-value');
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: any) => {
      if (p && USE_VALUE in p) return p[USE_VALUE];
      return (actual as any).use(p);
    },
  };
});

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Sample data factories ─────────────────────────────────────────────────

function makePerson(extra: Record<string, any> = {}): any {
  return {
    id: 7,
    fullName: 'Alice Smith',
    email: 'alice@example.com',
    title: 'Engineer',
    status: 'active',
    notes: null,
    startDate: null,
    endDate: null,
    profileUrls: [],
    userId: null,
    ...extra,
  };
}

function makeManager(extra: Record<string, any> = {}): any {
  return { id: 3, fullName: 'Bob Manager', ...extra };
}

function makeBundle(extra: Record<string, any> = {}): any {
  return {
    person: makePerson(),
    manager: null,
    directReports: [],
    orgUnits: [],
    expertise: [],
    ...extra,
  };
}

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();

  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/people/7')) {
      return makeRes({ success: true, data: makeBundle() });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock as any);
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ────────────────────────────────────────────────────

import BrainPersonProfilePage from '@/app/portal/brain/people/[id]/page';

function makeParams(id = '7') {
  const p = Promise.resolve({ id }) as any;
  p[USE_VALUE] = { id };
  return p;
}

function renderPage(id = '7') {
  return render(<BrainPersonProfilePage params={makeParams(id)} />);
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('BrainPersonProfilePage — loading', () => {
  it('shows loading spinner while data is fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error state ───────────────────────────────────────────────────────────

describe('BrainPersonProfilePage — error state', () => {
  it('shows error banner when fetch returns !ok', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: false, message: 'Not found' }, false, 404),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load person");
    });
  });

  it('shows server message from json.message on failure', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: false, message: 'Forbidden' }, false),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Forbidden');
    });
  });

  it('shows fallback message when json has no message', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }, false));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to load person');
    });
  });

  it('shows network error message when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network down');
    });
  });

  it('renders "Back to People" link in error state', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: false, message: 'oops' }, false),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/people"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Populated state — header ──────────────────────────────────────────────

describe('BrainPersonProfilePage — header', () => {
  it('renders person full name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders initials in avatar (AS for Alice Smith)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('AS');
    });
  });

  it('renders status chip for active person', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('active');
    });
  });

  it('renders status chip for inactive person', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: makeBundle({ person: makePerson({ status: 'inactive' }) }) }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('inactive');
    });
  });

  it('renders status chip for departed person', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: makeBundle({ person: makePerson({ status: 'departed' }) }) }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('departed');
    });
  });

  it('renders title below name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Engineer');
    });
  });

  it('renders email with mailto link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="mailto:alice@example.com"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders "Back to People" breadcrumb link in loaded state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/people"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders manager link when manager is present', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: makeBundle({ manager: makeManager() }) }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/people/3"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Bob Manager');
    });
  });

  it('renders primary org unit in header when present', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          orgUnits: [{ id: 10, name: 'Engineering', primary: true, roleInUnit: null }],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Engineering');
    });
  });

  it('does not render title section when title is null', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: makeBundle({ person: makePerson({ title: null }) }) }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
    // title "Engineer" should not appear
    expect(container.textContent).not.toContain('Engineer');
  });
});

// ─── Profile section ───────────────────────────────────────────────────────

describe('BrainPersonProfilePage — profile section', () => {
  it('renders Profile section heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Profile');
    });
  });

  it('renders Email label in profile dl', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Email');
    });
  });

  it('renders formatted start date when present', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({ person: makePerson({ startDate: '2023-06-15T00:00:00Z' }) }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toMatch(/2023/);
    });
  });

  it('renders notes when present', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({ person: makePerson({ notes: 'Great team member' }) }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Great team member');
    });
  });

  it('renders profile URL links', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          person: makePerson({
            profileUrls: [{ url: 'https://linkedin.com/in/alice', label: 'LinkedIn' }],
          }),
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="https://linkedin.com/in/alice"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('LinkedIn');
    });
  });

  it('uses url as label when profile url has no label', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          person: makePerson({
            profileUrls: [{ url: 'https://github.com/alice', label: '' }],
          }),
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('https://github.com/alice');
    });
  });
});

// ─── Expertise section ─────────────────────────────────────────────────────

describe('BrainPersonProfilePage — expertise section', () => {
  it('renders the ExpertiseEditor stub', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          expertise: [{ id: 1, name: 'TypeScript', level: 'expert' }],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const editor = container.querySelector('[data-testid="expertise-editor"]');
      expect(editor).toBeTruthy();
      expect(editor?.getAttribute('data-person')).toBe('7');
    });
  });

  it('shows chip count in expertise editor stub', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          expertise: [
            { id: 1, name: 'TypeScript', level: 'expert' },
            { id: 2, name: 'React', level: 'intermediate' },
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('chips:2');
    });
  });
});

// ─── Org membership section ────────────────────────────────────────────────

describe('BrainPersonProfilePage — org membership section', () => {
  it('shows "Not assigned to any org units yet" when orgUnits is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not assigned to any org units yet');
    });
  });

  it('renders org units with names and links', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          orgUnits: [
            { id: 10, name: 'Engineering', primary: false, roleInUnit: 'Lead' },
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/people?orgUnitId=10"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Engineering');
    });
  });

  it('renders role in unit when present', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          orgUnits: [{ id: 10, name: 'Engineering', primary: false, roleInUnit: 'Tech Lead' }],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tech Lead');
    });
  });

  it('renders Primary badge for primary org unit', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          orgUnits: [{ id: 10, name: 'Engineering', primary: true, roleInUnit: null }],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Primary');
    });
  });
});

// ─── Reporting section ─────────────────────────────────────────────────────

describe('BrainPersonProfilePage — reporting section', () => {
  it('shows "No manager set." when manager is null', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No manager set.');
    });
  });

  it('shows "No direct reports." when directReports is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No direct reports.');
    });
  });

  it('renders manager link in reporting section', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({ manager: makeManager({ id: 5, fullName: 'Carol Boss' }) }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      const links = container.querySelectorAll('a[href="/portal/brain/people/5"]');
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].textContent).toContain('Carol Boss');
    });
  });

  it('renders direct report links', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeBundle({
          directReports: [
            { id: 20, fullName: 'Dave Report' },
            { id: 21, fullName: 'Eve Report' },
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('a[href="/portal/brain/people/20"]')).toBeTruthy();
      expect(container.querySelector('a[href="/portal/brain/people/21"]')).toBeTruthy();
      expect(container.textContent).toContain('Dave Report');
      expect(container.textContent).toContain('Eve Report');
    });
  });
});

// ─── PersonProfileSidebar ──────────────────────────────────────────────────

describe('BrainPersonProfilePage — sidebar', () => {
  it('renders PersonProfileSidebar stub with correct person id', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const sidebar = container.querySelector('[data-testid="person-profile-sidebar"]');
      expect(sidebar).toBeTruthy();
      expect(sidebar?.getAttribute('data-id')).toBe('7');
    });
  });
});

// Helper: find the Edit button (has icon "edit" + text "Edit", not "Delete")
function findEditBtn(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('Edit') && !b.textContent?.includes('Delete'),
  ) as HTMLButtonElement | undefined;
}

// Helper: wait for page data to load then return the Edit button
async function waitForEditBtn(container: HTMLElement): Promise<HTMLButtonElement> {
  await waitFor(() => {
    const btn = findEditBtn(container);
    expect(btn).toBeTruthy();
  });
  return findEditBtn(container) as HTMLButtonElement;
}

// ─── Edit mode ─────────────────────────────────────────────────────────────

describe('BrainPersonProfilePage — edit mode', () => {
  it('shows Edit and Delete buttons when not editing', async () => {
    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    expect(editBtn).toBeTruthy();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    );
    expect(deleteBtn).toBeTruthy();
  });

  it('clicking Edit switches to editing mode (shows Cancel and Save)', async () => {
    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Cancel'),
      )).toBe(true);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save'),
    );
    expect(saveBtn).toBeTruthy();
  });

  it('edit form is pre-populated with person name', async () => {
    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);
    await waitFor(() => {
      const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(nameInput?.value).toBe('Alice Smith');
    });
  });

  it('clicking Cancel discards edits and exits edit mode', async () => {
    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Cancel'),
      )).toBe(true);
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      // Back to view mode — Edit button reappears
      expect(findEditBtn(container)).toBeTruthy();
    });
  });

  it('Save button calls PATCH with updated fields', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({ success: true, data: makeBundle() });
    });

    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('input[type="text"]')).toBeTruthy();
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });

    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter((c) => (c[1] as any)?.method === 'PATCH');
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('Save shows inline error when PATCH fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Validation error' }, false);
      }
      return makeRes({ success: true, data: makeBundle() });
    });

    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Save'),
      )).toBe(true);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Validation error');
    });
  });

  it('Save shows inline error on network throw', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') throw new Error('timeout');
      return makeRes({ success: true, data: makeBundle() });
    });

    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Save'),
      )).toBe(true);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('timeout');
    });
  });

  it('Save button is disabled when name is cleared', async () => {
    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(container.querySelector('input[type="text"]')).toBeTruthy();
    });
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '   ' } });

    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save'),
      ) as HTMLButtonElement;
      expect(saveBtn?.disabled).toBe(true);
    });
  });

  it('status select is populated with all three options in edit mode', async () => {
    const { container } = renderPage();
    const editBtn = await waitForEditBtn(container);
    fireEvent.click(editBtn);

    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      const opts = Array.from(select.options).map((o) => o.value);
      expect(opts).toContain('active');
      expect(opts).toContain('inactive');
      expect(opts).toContain('departed');
    });
  });
});

// ─── Delete modal ──────────────────────────────────────────────────────────

describe('BrainPersonProfilePage — delete modal', () => {
  it('shows delete confirm dialog when Delete is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      ) as HTMLButtonElement;
      fireEvent.click(deleteBtn);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Delete this person?');
    });
  });

  it('dialog Cancel hides the modal without deleting', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    await waitFor(() => expect(container.textContent).toContain('Delete this person?'));

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(container.textContent).not.toContain('Delete this person?');
    });

    const deleteCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as any)?.method === 'DELETE',
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('Confirm delete calls DELETE and navigates to /portal/brain/people', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: makeBundle() });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    await waitFor(() => expect(container.textContent).toContain('Delete this person?'));

    // The confirm dialog's own Delete button (inside the dialog)
    const confirmDeleteBtn = Array.from(
      container.querySelectorAll('[role="dialog"] button'),
    ).find((b) => b.textContent?.includes('Delete')) as HTMLButtonElement;
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/people');
    });
  });

  it('shows error when DELETE fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'Cannot delete' }, false);
      }
      return makeRes({ success: true, data: makeBundle() });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    await waitFor(() => expect(container.textContent).toContain('Delete this person?'));

    const confirmDeleteBtn = Array.from(
      container.querySelectorAll('[role="dialog"] button'),
    ).find((b) => b.textContent?.includes('Delete')) as HTMLButtonElement;
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Cannot delete');
    });
  });

  it('shows error when DELETE throws a network error', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') throw new Error('connection lost');
      return makeRes({ success: true, data: makeBundle() });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    await waitFor(() => expect(container.textContent).toContain('Delete this person?'));

    const confirmDeleteBtn = Array.from(
      container.querySelectorAll('[role="dialog"] button'),
    ).find((b) => b.textContent?.includes('Delete')) as HTMLButtonElement;
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('connection lost');
    });
  });

  it('dialog contains person name in warning text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Alice Smith'));

    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
      expect(container.textContent).toContain('Delete this person?');
    });
  });
});
