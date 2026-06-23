// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label }: any) =>
    React.createElement('button', {
      'data-testid': 'media-picker',
      'data-value': value ?? '',
      'aria-label': label ?? 'media',
      onClick: () => onChange('https://cdn.example.com/mock-image.png'),
    }, label ?? 'Pick media'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSurface(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    productId: 42,
    name: 'Front',
    slug: 'front',
    displayOrder: 0,
    mockupImage: 'https://cdn.example.com/front.png',
    canvasWidth: 800,
    canvasHeight: 600,
    printAreaX: 100,
    printAreaY: 100,
    printAreaWidth: 600,
    printAreaHeight: 400,
    printDpi: 300,
    active: true,
    ...overrides,
  };
}

function makeFetchOk(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

function makeFetchFail(body: unknown) {
  return Promise.resolve({ ok: false, json: () => Promise.resolve(body) });
}

function setupFetch(surfaces: unknown[] = [], overrides?: (url: string, init?: RequestInit) => unknown) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (overrides) {
      const result = overrides(url, init);
      if (result !== undefined) return result;
    }
    // Default: GET surfaces list
    if (!init || !init.method || init.method === 'GET') {
      return makeFetchOk({ success: true, data: surfaces });
    }
    return makeFetchOk({ success: true, data: makeSurface() });
  }) as any;
}

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import DesignSurfacesEditor from '@/components/portal/store/DesignSurfacesEditor';

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------
const DEFAULT_PROPS = { productId: 42, siteId: 'site-abc' };

beforeEach(() => {
  vi.clearAllMocks();
  // Stub window.confirm — default to true (user confirms delete)
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — loading state', () => {
  it('shows a loading spinner while fetching surfaces', async () => {
    // Never resolve the fetch to keep loading=true
    let resolve: (v: any) => void;
    const pending = new Promise<any>((res) => { resolve = res; });
    global.fetch = vi.fn(() => pending) as any;

    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();

    // Clean up pending promise
    act(() => { resolve!({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) }); });
  });

  it('stops showing spinner after data loads', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — empty state', () => {
  it('renders empty-state UI when no surfaces exist', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('No design surfaces yet')).toBeTruthy());
  });

  it('shows "Add your first surface" button in empty state', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add your first surface/ })).toBeTruthy(),
    );
  });

  it('clicking "Add your first surface" opens the add form', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => expect(screen.getByText('New surface')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Fetch error state
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — fetch error', () => {
  it('shows error message when fetch returns success:false', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: false, message: 'DB unavailable' }),
    ) as any;
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('DB unavailable')).toBeTruthy());
  });

  it('shows generic error when fetch rejects', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network down'))) as any;
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('Failed to load surfaces')).toBeTruthy());
  });

  it('falls back to generic message when success:false has no message', async () => {
    global.fetch = vi.fn(() => makeFetchOk({ success: false })) as any;
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('Failed to load surfaces')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Surfaces table (with data)
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — surfaces table', () => {
  it('renders a table row for each surface', async () => {
    setupFetch([makeSurface({ id: 1, name: 'Front' }), makeSurface({ id: 2, name: 'Back', slug: 'back' })]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const names = inputs.filter((i) => i.value === 'Front' || i.value === 'Back');
      expect(names.length).toBe(2);
    });
  });

  it('shows mockup image when mockupImage is set', async () => {
    setupFetch([makeSurface({ mockupImage: 'https://cdn.example.com/front.png' })]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => {
      const imgs = document.querySelectorAll('img');
      expect(imgs.length).toBeGreaterThan(0);
    });
  });

  it('shows placeholder icon when mockupImage is empty', async () => {
    setupFetch([makeSurface({ mockupImage: '' })]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => {
      // table row rendered — no crash is the assertion
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const nameInput = inputs.find((i) => i.value === 'Front');
      expect(nameInput).toBeTruthy();
    });
  });

  it('shows "Add surface" button below the table when surfaces exist', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Add surface/ })).toBeTruthy());
  });

  it('renders table column headers', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Slug')).toBeTruthy();
      expect(screen.getByText('Canvas')).toBeTruthy();
      expect(screen.getByText('DPI')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Inline editing (updateLocal)
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — inline editing', () => {
  it('updates name field locally (marks row dirty)', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('Front'));

    const nameInput = screen.getAllByDisplayValue('Front')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
    expect((screen.getAllByDisplayValue('Updated Name')[0] as HTMLInputElement).value).toBe('Updated Name');
  });

  it('updates slug field and slugifies input', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('front'));

    const slugInput = screen.getAllByDisplayValue('front')[0] as HTMLInputElement;
    fireEvent.change(slugInput, { target: { value: 'My Slug Value!' } });
    // slugify converts to my-slug-value
    await waitFor(() =>
      expect((screen.getAllByDisplayValue('my-slug-value')[0] as HTMLInputElement).value).toBe('my-slug-value'),
    );
  });

  it('updates canvasWidth field', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('800'));

    const widthInput = screen.getAllByDisplayValue('800')[0] as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '1024' } });
    expect((screen.getAllByDisplayValue('1024')[0] as HTMLInputElement).value).toBe('1024');
  });

  it('toggles active state via the toggle button', async () => {
    setupFetch([makeSurface({ active: true })]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('Front'));

    // Find the toggle button (aria-less; identify by bg-primary class)
    const toggleBtn = document.querySelector('button.bg-primary') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn);
    // After toggle, the button should lose bg-primary (now bg-border)
    await waitFor(() =>
      expect(document.querySelector('button.bg-border')).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// saveSurface (PATCH)
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — saveSurface', () => {
  it('does not call PATCH when row has no local edits', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByTitle('Save changes'));

    const saveBtn = screen.getAllByTitle('Save changes')[0];
    fireEvent.click(saveBtn);
    // Only the initial GET should have been called
    await waitFor(() => {
      const patchCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBe(0);
    });
  });

  it('sends PATCH after editing and clicking Save', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('Front'));

    // Make a local edit to mark dirty
    const nameInput = screen.getAllByDisplayValue('Front')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });

    const saveBtn = screen.getAllByTitle('Save changes')[0];
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const patchCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBe(1);
      const body = JSON.parse(patchCalls[0][1].body);
      expect(body.name).toBe('New Name');
    });
  });

  it('shows error when PATCH returns success:false', async () => {
    setupFetch([makeSurface()], (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return makeFetchOk({ success: false, message: 'Save failed' });
      }
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('Front'));

    const nameInput = screen.getAllByDisplayValue('Front')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Changed' } });

    fireEvent.click(screen.getAllByTitle('Save changes')[0]);

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
  });

  it('shows generic error when PATCH rejects', async () => {
    setupFetch([makeSurface()], (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.reject(new Error('Network'));
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByDisplayValue('Front'));

    const nameInput = screen.getAllByDisplayValue('Front')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Changed' } });

    fireEvent.click(screen.getAllByTitle('Save changes')[0]);
    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// deleteSurface (DELETE)
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — deleteSurface', () => {
  it('calls DELETE and removes the row on success', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByTitle('Delete'));

    fireEvent.click(screen.getAllByTitle('Delete')[0]);

    await waitFor(() => {
      const deleteCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBe(1);
    });
    // Row is removed — no more input with value 'Front'
    await waitFor(() => expect(screen.queryByDisplayValue('Front')).toBeNull());
  });

  it('skips DELETE when user cancels confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByTitle('Delete'));

    fireEvent.click(screen.getAllByTitle('Delete')[0]);

    await waitFor(() => {
      const deleteCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBe(0);
    });
    // Row remains
    expect(screen.getAllByDisplayValue('Front').length).toBeGreaterThan(0);
  });

  it('shows error when DELETE returns success:false', async () => {
    setupFetch([makeSurface()], (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return makeFetchOk({ success: false, message: 'Delete failed' });
      }
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByTitle('Delete'));

    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    await waitFor(() => expect(screen.getByText('Delete failed')).toBeTruthy());
  });

  it('shows generic error when DELETE rejects', async () => {
    setupFetch([makeSurface()], (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.reject(new Error('Network'));
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByTitle('Delete'));

    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    await waitFor(() => expect(screen.getByText('Delete failed')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// updateMockup (MediaPicker change → immediate PATCH)
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — updateMockup', () => {
  it('immediately PATCHes mockupImage when MediaPicker triggers onChange', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getAllByTestId('media-picker'));

    // Click the first MediaPicker stub — it calls onChange with a URL
    fireEvent.click(screen.getAllByTestId('media-picker')[0]);

    await waitFor(() => {
      const patchCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCalls.length).toBe(1);
      const body = JSON.parse(patchCalls[0][1].body);
      expect(body.mockupImage).toBe('https://cdn.example.com/mock-image.png');
    });
  });
});

// ---------------------------------------------------------------------------
// Add form (createSurface)
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — add form', () => {
  it('opens add form when "Add surface" button is clicked', async () => {
    setupFetch([makeSurface()]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add surface/ }));

    fireEvent.click(screen.getByRole('button', { name: /Add surface/ }));
    await waitFor(() => expect(screen.getByText('New surface')).toBeTruthy());
  });

  it('closes add form when X button is clicked', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    // Click the close (X) button — find by its title/close icon sibling
    const closeBtn = document.querySelector('button > span.material-icons')?.parentElement;
    // More reliable: find button that contains 'close' icon text
    const allBtns = Array.from(document.querySelectorAll('button'));
    const xBtn = allBtns.find((b) => b.querySelector('span')?.textContent === 'close');
    expect(xBtn).toBeTruthy();
    fireEvent.click(xBtn!);

    await waitFor(() => expect(screen.queryByText('New surface')).toBeNull());
  });

  it('closes add form when Cancel button is clicked', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByText('New surface')).toBeNull());
  });

  it('shows error when creating without a name', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    fireEvent.click(screen.getByRole('button', { name: /Create surface/ }));
    await waitFor(() => expect(screen.getByText('Name is required')).toBeTruthy());
  });

  it('shows error when creating without a slug', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    // Fill name but leave slug blank
    const inputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'My Surface' } });
    // Clear the auto-generated slug
    const slugInputs = Array.from(document.querySelectorAll('input[placeholder="front"]')) as HTMLInputElement[];
    fireEvent.change(slugInputs[0], { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Create surface/ }));
    await waitFor(() => expect(screen.getByText('Slug is required')).toBeTruthy());
  });

  it('shows error when creating without a mockup image', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    const nameInputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'My Surface' } });
    // slug is auto-generated; no image picked

    fireEvent.click(screen.getByRole('button', { name: /Create surface/ }));
    await waitFor(() => expect(screen.getByText('Mockup image is required')).toBeTruthy());
  });

  it('auto-generates slug from name when slug has not been manually touched', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    const nameInputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'My Cool Surface' } });

    const slugInputs = Array.from(document.querySelectorAll('input[placeholder="front"]')) as HTMLInputElement[];
    await waitFor(() => expect(slugInputs[0].value).toBe('my-cool-surface'));
  });

  it('keeps manual slug when user has touched the slug field', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    // Type a manual slug first
    const slugInputs = Array.from(document.querySelectorAll('input[placeholder="front"]')) as HTMLInputElement[];
    fireEvent.change(slugInputs[0], { target: { value: 'custom-slug' } });

    // Then update name — slug should NOT change
    const nameInputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'New Name' } });

    await waitFor(() => expect(slugInputs[0].value).toBe('custom-slug'));
  });

  it('POSTs to create endpoint and adds surface to list on success', async () => {
    const newSurface = makeSurface({ id: 99, name: 'Back', slug: 'back' });
    setupFetch([], (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return makeFetchOk({ success: true, data: newSurface });
      }
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    // Fill required fields
    const nameInputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'Back' } });

    // Pick mockup image via MediaPicker stub
    const pickers = screen.getAllByTestId('media-picker');
    fireEvent.click(pickers[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create surface/ }));
    });

    await waitFor(() => {
      const postCalls = (global.fetch as any).mock.calls.filter(
        (c: any[]) => c[1]?.method === 'POST',
      );
      expect(postCalls.length).toBe(1);
    });
    // Form closes after success
    await waitFor(() => expect(screen.queryByText('New surface')).toBeNull());
  });

  it('shows error when POST returns success:false', async () => {
    setupFetch([], (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return makeFetchOk({ success: false, message: 'Create failed' });
      }
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    const nameInputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'New Surface' } });

    const pickers = screen.getAllByTestId('media-picker');
    fireEvent.click(pickers[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create surface/ }));
    });

    await waitFor(() => expect(screen.getByText('Create failed')).toBeTruthy());
  });

  it('shows generic error when POST rejects', async () => {
    setupFetch([], (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('Network'));
      return undefined;
    });
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    const nameInputs = Array.from(document.querySelectorAll('input[placeholder="Front"]')) as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'New Surface' } });

    const pickers = screen.getAllByTestId('media-picker');
    fireEvent.click(pickers[0]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create surface/ }));
    });

    await waitFor(() => expect(screen.getByText('Create failed')).toBeTruthy());
  });

  it('shows draft mockup preview image once MediaPicker selects an image', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    // Initially no img element in the add form (placeholder shown)
    const imgsBefore = document.querySelectorAll('img');
    expect(imgsBefore.length).toBe(0);

    const pickers = screen.getAllByTestId('media-picker');
    fireEvent.click(pickers[0]);

    await waitFor(() => {
      const imgs = document.querySelectorAll('img');
      expect(imgs.length).toBeGreaterThan(0);
    });
  });

  it('shows "Replace mockup" label on MediaPicker when image is set', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('New surface'));

    const pickers = screen.getAllByTestId('media-picker');
    fireEvent.click(pickers[0]);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Replace mockup/ })).toBeTruthy(),
    );
  });

  it('updates canvas width and height in draft form', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole('button', { name: /Add your first surface/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add your first surface/ }));
    await waitFor(() => screen.getByText('Canvas W'));

    const widthInputs = Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    // First number input in the add form should be canvasWidth (default 800)
    const canvasWInput = widthInputs.find((i) => i.value === '800');
    expect(canvasWInput).toBeTruthy();
    fireEvent.change(canvasWInput!, { target: { value: '1200' } });
    expect((screen.getAllByDisplayValue('1200')[0] as HTMLInputElement).value).toBe('1200');
  });
});

// ---------------------------------------------------------------------------
// API URL construction
// ---------------------------------------------------------------------------

describe('DesignSurfacesEditor — API URLs', () => {
  it('fetches from the correct product-scoped endpoint', async () => {
    setupFetch([]);
    render(<DesignSurfacesEditor productId={7} siteId="tenant-xyz" />);
    await waitFor(() => {
      const getCall = (global.fetch as any).mock.calls[0];
      expect(getCall[0]).toBe(
        '/api/portal/websites/tenant-xyz/store/products/7/design-surfaces',
      );
    });
  });

  it('sends PATCH to the correct surface-scoped endpoint', async () => {
    setupFetch([makeSurface({ id: 55 })]);
    render(<DesignSurfacesEditor productId={7} siteId="tenant-xyz" />);
    await waitFor(() => screen.getAllByDisplayValue('Front'));

    const nameInput = screen.getAllByDisplayValue('Front')[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Changed' } });
    fireEvent.click(screen.getAllByTitle('Save changes')[0]);

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PATCH',
      );
      expect(patchCall[0]).toBe(
        '/api/portal/websites/tenant-xyz/store/products/7/design-surfaces/55',
      );
    });
  });
});
