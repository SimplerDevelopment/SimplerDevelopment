// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock the canvas store — all selectors are intercepted here.
// ---------------------------------------------------------------------------

const mockImportCanvasData = vi.fn();
const mockSetMockupTint = vi.fn();

// Default store state — tests override via mockStoreState
let mockStoreState: Record<string, any> = {
  designId: 'design-abc',
  layersBySurface: { front: [{ id: 'l1' }, { id: 'l2' }] },
  mockupTint: null,
  importCanvasData: mockImportCanvasData,
  setMockupTint: mockSetMockupTint,
  productId: 42,
  designName: 'Test Design',
  canvasSize: { width: 800, height: 800 },
  status: 'draft',
  canvas: null, // no canvas — captureCanvasThumbnail returns null safely
};

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: any) => any) => selector(mockStoreState),
}));

// Patch getState so captureCanvasThumbnail() (called outside React) also gets null canvas
vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (selector: (s: any) => any) => selector(mockStoreState),
    {
      getState: () => mockStoreState,
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import SnapshotsDropdown from '@/components/storefront/designer/SnapshotsDropdown';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------
const STORAGE_PREFIX = 'designer:snapshots:';

function makeSnap(overrides: Partial<{
  id: string;
  name: string;
  createdAt: string;
  layersBySurface: Record<string, any[]>;
  mockupTint: string | null;
  thumbnail: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'snap-1',
    name: overrides.name ?? 'My Snapshot',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    layersBySurface: overrides.layersBySurface ?? { front: [{ id: 'l1' }] },
    mockupTint: overrides.mockupTint ?? null,
    thumbnail: overrides.thumbnail !== undefined ? overrides.thumbnail : null,
  };
}

function seedLocalStorage(designId: string, snaps: ReturnType<typeof makeSnap>[]) {
  window.localStorage.setItem(STORAGE_PREFIX + designId, JSON.stringify(snaps));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // Reset to a design with an id
  mockStoreState = {
    designId: 'design-abc',
    layersBySurface: { front: [{ id: 'l1' }, { id: 'l2' }] },
    mockupTint: null,
    importCanvasData: mockImportCanvasData,
    setMockupTint: mockSetMockupTint,
    productId: 42,
    designName: 'Test Design',
    canvasSize: { width: 800, height: 800 },
    status: 'draft',
    canvas: null,
  };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helper: open the dropdown
// The trigger button has title="Snapshots — named restore points"; its
// accessible name comes from the inner Material Icon text ("photo_camera"),
// so we locate it by title attribute.
// ---------------------------------------------------------------------------
function getTrigger() {
  return screen.getByTitle(/Snapshots/i);
}

function openDropdown() {
  fireEvent.click(getTrigger());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SnapshotsDropdown — closed state', () => {
  it('renders the trigger button without showing the popover', () => {
    render(<SnapshotsDropdown />);
    // The camera icon button must be present (matched by title attribute)
    expect(getTrigger()).toBeInTheDocument();
    // Popover (role=menu) must NOT be in the DOM
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('trigger button has aria-expanded=false when closed', () => {
    render(<SnapshotsDropdown />);
    expect(getTrigger()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SnapshotsDropdown — opening and closing', () => {
  it('shows the popover when the trigger is clicked', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Snapshots')).toBeInTheDocument();
  });

  it('sets aria-expanded=true when open', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes when the trigger is clicked a second time', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Second click
    fireEvent.click(getTrigger());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on outside mousedown', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape key press', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('SnapshotsDropdown — empty snapshot list', () => {
  it('shows the empty-state message when there are no snapshots', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    expect(
      screen.getByText(/Take a snapshot to save the current canvas/i),
    ).toBeInTheDocument();
  });

  it('shows the "New" button when not in naming mode', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
  });
});

describe('SnapshotsDropdown — snapshot list rendering', () => {
  it('renders a list of saved snapshots from localStorage', () => {
    const snap1 = makeSnap({ id: 'snap-1', name: 'Before color swap' });
    const snap2 = makeSnap({ id: 'snap-2', name: 'After resize' });
    seedLocalStorage('design-abc', [snap1, snap2]);

    render(<SnapshotsDropdown />);
    openDropdown();

    expect(screen.getByText('Before color swap')).toBeInTheDocument();
    expect(screen.getByText('After resize')).toBeInTheDocument();
  });

  it('renders layer count in the snapshot subtitle', () => {
    const snap = makeSnap({
      id: 'snap-1',
      name: 'One layer shot',
      layersBySurface: { front: [{ id: 'l1' }] },
    });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    // "1 layer" (singular)
    expect(screen.getByText(/1 layer$/)).toBeInTheDocument();
  });

  it('uses plural "layers" when count is not 1', () => {
    const snap = makeSnap({
      id: 'snap-1',
      name: 'Multi layer',
      layersBySurface: { front: [{ id: 'l1' }, { id: 'l2' }] },
    });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    expect(screen.getByText(/2 layers/)).toBeInTheDocument();
  });

  it('renders a photo icon placeholder when thumbnail is null', () => {
    const snap = makeSnap({ thumbnail: null });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    // The material-icon placeholder span with text "photo" must appear
    const icons = document.querySelectorAll('.material-icons');
    const photoIcon = Array.from(icons).find((el) => el.textContent === 'photo');
    expect(photoIcon).toBeTruthy();
  });

  it('renders an img element when snapshot has a thumbnail', () => {
    const snap = makeSnap({ thumbnail: 'data:image/png;base64,abc' });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    const img = document.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('data:image/png');
  });

  it('renders a delete button for each snapshot', () => {
    const snap1 = makeSnap({ id: 'snap-1', name: 'First' });
    const snap2 = makeSnap({ id: 'snap-2', name: 'Second' });
    seedLocalStorage('design-abc', [snap1, snap2]);

    render(<SnapshotsDropdown />);
    openDropdown();

    const deleteButtons = screen.getAllByRole('button', { name: /Delete snapshot/i });
    expect(deleteButtons).toHaveLength(2);
  });
});

describe('SnapshotsDropdown — naming form', () => {
  it('shows the inline form when "New" is clicked', () => {
    render(<SnapshotsDropdown />);
    openDropdown();

    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    // The label element has no `for` attr, so use getByText + getByPlaceholderText
    expect(screen.getByText(/Snapshot name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Before color swap/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('hides the "New" button when naming form is open', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    // "New" button should no longer be visible
    expect(screen.queryByRole('button', { name: /^New$/i })).toBeNull();
  });

  it('pre-populates the name input with "Snapshot N"', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toMatch(/Snapshot \d+/);
  });

  it('Cancel button dismisses the naming form', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
  });

  it('Escape key closes the naming form without closing the dropdown', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    fireEvent.keyDown(window, { key: 'Escape' });

    // Form gone, dropdown still open
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('saves snapshot on form submit and shows status message', async () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My custom name' } });

    fireEvent.submit(input.closest('form')!);

    // Status banner appears
    await screen.findByRole('status');
    expect(screen.getByRole('status').textContent).toContain('Saved "My custom name"');

    // Snapshot is now persisted in localStorage
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_PREFIX + 'design-abc') ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('My custom name');
  });

  it('uses fallback name when input is left blank', () => {
    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_PREFIX + 'design-abc') ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toMatch(/Snapshot \d+/);
  });
});

describe('SnapshotsDropdown — restore action (two-step)', () => {
  it('first click on snapshot sets confirming state (amber highlight)', () => {
    const snap = makeSnap({ id: 'snap-1', name: 'My Snap' });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    const restoreBtn = screen.getByTitle(/Restore this snapshot/i);
    fireEvent.click(restoreBtn);

    // Now in confirming state — title changes
    expect(screen.getByTitle(/Click again to replace/i)).toBeInTheDocument();
    // Amber text hint appears
    expect(screen.getByText(/Click again to replace current canvas/i)).toBeInTheDocument();
  });

  it('second click imports canvas data and closes dropdown', () => {
    const snap = makeSnap({
      id: 'snap-1',
      name: 'My Snap',
      layersBySurface: { front: [] },
      mockupTint: '#ff0000',
    });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    const restoreBtn = screen.getByTitle(/Restore this snapshot/i);
    // First click — stage confirm
    fireEvent.click(restoreBtn);
    // Second click — confirm restore
    fireEvent.click(screen.getByTitle(/Click again to replace/i));

    expect(mockImportCanvasData).toHaveBeenCalledOnce();
    expect(mockSetMockupTint).toHaveBeenCalledWith('#ff0000');
    // Dropdown closes
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape key clears confirm state without closing dropdown', () => {
    const snap = makeSnap({ id: 'snap-1', name: 'My Snap' });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    fireEvent.click(screen.getByTitle(/Restore this snapshot/i));
    expect(screen.getByTitle(/Click again to replace/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    // Confirm cleared, dropdown still open
    expect(screen.queryByTitle(/Click again to replace/i)).toBeNull();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

describe('SnapshotsDropdown — delete action', () => {
  it('removes the snapshot from the list and localStorage', () => {
    const snap1 = makeSnap({ id: 'snap-1', name: 'First' });
    const snap2 = makeSnap({ id: 'snap-2', name: 'Second' });
    seedLocalStorage('design-abc', [snap1, snap2]);

    render(<SnapshotsDropdown />);
    openDropdown();

    const deleteButtons = screen.getAllByRole('button', { name: /Delete snapshot/i });
    fireEvent.click(deleteButtons[0]); // delete "First"

    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_PREFIX + 'design-abc') ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Second');
  });

  it('also clears confirmId when deleting the currently-confirming snapshot', () => {
    const snap = makeSnap({ id: 'snap-1', name: 'My Snap' });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    // Stage confirm
    fireEvent.click(screen.getByTitle(/Restore this snapshot/i));
    expect(screen.getByTitle(/Click again to replace/i)).toBeInTheDocument();

    // Delete the same snapshot
    fireEvent.click(screen.getByRole('button', { name: /Delete snapshot My Snap/i }));

    // Snapshot gone, no amber state
    expect(screen.queryByText('My Snap')).toBeNull();
    expect(screen.queryByTitle(/Click again to replace/i)).toBeNull();
  });
});

describe('SnapshotsDropdown — no designId guard', () => {
  it('shows status message instead of naming form when designId is null', () => {
    mockStoreState = { ...mockStoreState, designId: null };

    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));

    // Status banner instead of naming form
    expect(
      screen.getByText(/Save your design first to enable snapshots/i),
    ).toBeInTheDocument();
    // No text input should appear
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('SnapshotsDropdown — status banner auto-dismiss', () => {
  it('status banner disappears after 2500ms', async () => {
    vi.useFakeTimers();

    render(<SnapshotsDropdown />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);

    // Banner appears
    await act(async () => { /* flush microtasks */ });
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Advance past the 2500 ms timer
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.queryByRole('status')).toBeNull();

    vi.useRealTimers();
  });
});

describe('SnapshotsDropdown — relativeTime branches', () => {
  it('shows "just now" for a snapshot created <60 seconds ago', () => {
    const snap = makeSnap({
      createdAt: new Date(Date.now() - 5_000).toISOString(),
    });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    expect(screen.getByText(/just now/)).toBeInTheDocument();
  });

  it('shows "N min ago" for snapshots 1–59 minutes old', () => {
    const snap = makeSnap({
      createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    expect(screen.getByText(/min ago/)).toBeInTheDocument();
  });

  it('shows "N hr ago" for snapshots 1–23 hours old', () => {
    const snap = makeSnap({
      createdAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    expect(screen.getByText(/hr ago/)).toBeInTheDocument();
  });

  it('shows a locale date string for snapshots older than 24 hours', () => {
    const old = new Date(Date.now() - 48 * 60 * 60_000);
    const snap = makeSnap({ createdAt: old.toISOString() });
    seedLocalStorage('design-abc', [snap]);

    render(<SnapshotsDropdown />);
    openDropdown();

    // The date string is inline with " · N layer(s)" in the same span;
    // use a partial-text function matcher.
    const dateStr = old.toLocaleDateString();
    expect(
      screen.getByText((content) => content.includes(dateStr)),
    ).toBeInTheDocument();
  });
});

describe('SnapshotsDropdown — dropdown re-opens cleanly', () => {
  it('rehydrates snapshots and resets form state on re-open', () => {
    render(<SnapshotsDropdown />);
    // Open and enter naming mode
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: /New/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Close
    fireEvent.click(getTrigger());

    // Seed a snapshot before re-opening
    const snap = makeSnap({ name: 'Persisted snap' });
    seedLocalStorage('design-abc', [snap]);

    // Re-open
    fireEvent.click(getTrigger());

    // Naming form should be gone, snapshot visible
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Persisted snap')).toBeInTheDocument();
  });
});
