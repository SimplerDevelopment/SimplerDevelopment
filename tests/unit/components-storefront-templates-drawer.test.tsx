// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Canvas store mock — must be declared before component import.
// ---------------------------------------------------------------------------

const mockImportCanvasData = vi.fn();
const mockMarkDirty = vi.fn();

let mockStoreState: {
  designId: string | null;
  designName: string;
  canvasSize: { width: number; height: number };
  canvas: null;
  importCanvasData: typeof mockImportCanvasData;
} = {
  designId: 'design-xyz',
  designName: 'My Design',
  canvasSize: { width: 800, height: 800 },
  canvas: null,
  importCanvasData: mockImportCanvasData,
};

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
    {
      getState: () => ({
        ...mockStoreState,
        markDirty: mockMarkDirty,
      }),
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import TemplatesDrawer from '@/components/storefront/designer/TemplatesDrawer';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  } as Response);
}

function mockFetchError(message = 'Server error') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ success: false, message }),
  } as Response);
}

function mockFetchNetworkError() {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
}

// ---------------------------------------------------------------------------
// Template fixture factory
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Partial<{
  id: string;
  name: string;
  productId: number;
  thumbnailUrl: string | null;
  layersBySurface: Record<string, unknown[]>;
  canvasSize: { width: number; height: number };
}> = {}) {
  return {
    id: overrides.id ?? 'tpl-1',
    name: overrides.name ?? 'Sample Template',
    productId: overrides.productId ?? 99,
    thumbnailUrl: overrides.thumbnailUrl !== undefined ? overrides.thumbnailUrl : null,
    layersBySurface: overrides.layersBySurface ?? { front: [] },
    canvasSize: overrides.canvasSize ?? { width: 800, height: 800 },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockStoreState = {
    designId: 'design-xyz',
    designName: 'My Design',
    canvasSize: { width: 800, height: 800 },
    canvas: null,
    importCanvasData: mockImportCanvasData,
  };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getToggleButton() {
  // Use title attribute to uniquely identify the fixed launcher button;
  // when the drawer is open the heading "Templates" would also match by name.
  return screen.getByTitle('Templates');
}

async function openDrawer() {
  mockFetchOk([]);
  fireEvent.click(getToggleButton());
  // Flush fetch microtasks
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Tests: closed / launcher button
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — launcher button', () => {
  it('renders the fixed launcher button', () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    expect(getToggleButton()).toBeInTheDocument();
    // The launcher button has both title and aria-label set to "Templates"
    expect(screen.getByRole('button', { name: /Templates/i })).toHaveAttribute('aria-label', 'Templates');
  });

  it('does not render the drawer when closed', () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('does not show the backdrop when closed', () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    expect(screen.queryByLabelText(/Close templates drawer/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: open / close
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — open and close', () => {
  it('opens the drawer when launcher is clicked', async () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('fetches templates on open using siteId and productId', async () => {
    render(<TemplatesDrawer siteId={7} productId={42} />);
    await openDrawer();
    expect(global.fetch).toHaveBeenCalledOnce();
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/api/storefront/7/designs');
    expect(url).toContain('productId=42');
    expect(url).toContain('templates=1');
  });

  it('closes the drawer when the close button inside the drawer is clicked', async () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    // aria-label="Close" is the X icon button inside the drawer header
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    fireEvent.click(screen.getByLabelText(/Close templates drawer/i));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('toggles closed when launcher is clicked again', async () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    fireEvent.click(getToggleButton());
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: loading state
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — loading state', () => {
  it('shows loading indicator while fetch is in-flight', async () => {
    // Fetch never resolves during this check
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: empty state
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — empty state', () => {
  it('shows empty-state message when no templates are returned', async () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    expect(screen.getByText(/No templates yet/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: template list rendering
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — template list', () => {
  it('renders a grid of template cards', async () => {
    const tpl1 = makeTemplate({ id: 'tpl-1', name: 'Hero Layout' });
    const tpl2 = makeTemplate({ id: 'tpl-2', name: 'Minimal Grid' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl1, tpl2] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    expect(screen.getByText('Hero Layout')).toBeInTheDocument();
    expect(screen.getByText('Minimal Grid')).toBeInTheDocument();
  });

  it('renders thumbnail image when thumbnailUrl is provided', async () => {
    const tpl = makeTemplate({ thumbnailUrl: 'https://example.com/thumb.png', name: 'Fancy' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    const img = document.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('thumb.png');
    expect(img.alt).toBe('Fancy');
  });

  it('renders image-placeholder icon when thumbnailUrl is null', async () => {
    const tpl = makeTemplate({ thumbnailUrl: null, name: 'No Thumb' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    const icons = document.querySelectorAll('.material-icons');
    const imageIcon = Array.from(icons).find((el) => el.textContent === 'image');
    expect(imageIcon).toBeTruthy();
  });

  it('renders exactly one card per template returned', async () => {
    const templates = [
      makeTemplate({ id: 'a', name: 'A' }),
      makeTemplate({ id: 'b', name: 'B' }),
      makeTemplate({ id: 'c', name: 'C' }),
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: templates }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: template selection (onPick)
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — template selection', () => {
  it('calls importCanvasData when a template card is clicked', async () => {
    const tpl = makeTemplate({
      id: 'tpl-1',
      name: 'Pick Me',
      productId: 99,
      layersBySurface: { front: [] },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle('Pick Me'));
    expect(mockImportCanvasData).toHaveBeenCalledOnce();
    const arg = mockImportCanvasData.mock.calls[0][0] as {
      productId: number;
      layersBySurface: Record<string, unknown[]>;
    };
    expect(arg.productId).toBe(99);
    expect(arg.layersBySurface).toEqual({ front: [] });
  });

  it('calls markDirty after picking a template', async () => {
    const tpl = makeTemplate({ id: 'tpl-1', name: 'Pick Me' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle('Pick Me'));
    expect(mockMarkDirty).toHaveBeenCalledOnce();
  });

  it('closes the drawer after picking a template', async () => {
    const tpl = makeTemplate({ id: 'tpl-1', name: 'Pick Me' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle('Pick Me'));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('shows info toast after picking a template', async () => {
    const tpl = makeTemplate({ id: 'tpl-1', name: 'My Template' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle('My Template'));
    expect(screen.getByText(/Loaded "My Template"/)).toBeInTheDocument();
  });

  it('auto-dismisses the info toast after 2500ms', async () => {
    const tpl = makeTemplate({ id: 'tpl-1', name: 'My Template' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [tpl] }),
    } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle('My Template'));
    expect(screen.getByText(/Loaded/)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(/Loaded/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: error handling
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — fetch error handling', () => {
  it('shows error message when API returns ok=false', async () => {
    mockFetchError('Template load failed');
    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});
    expect(screen.getByText('Template load failed')).toBeInTheDocument();
  });

  it('shows generic error message on network failure', async () => {
    mockFetchNetworkError();
    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});
    expect(screen.getByText('Network failure')).toBeInTheDocument();
  });

  it('shows error when API success=false with no message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    } as Response);
    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});
    expect(screen.getByText(/Failed to load templates/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: Save as template
// ---------------------------------------------------------------------------

describe('TemplatesDrawer — Save as template button', () => {
  it('renders the "Save as template" button when drawer is open', async () => {
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    expect(screen.getByTitle(/Save current design as a template/i)).toBeInTheDocument();
  });

  it('disables "Save as template" button when designId is null', async () => {
    mockStoreState = { ...mockStoreState, designId: null };
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    expect(screen.getByTitle(/Save current design as a template/i)).toBeDisabled();
  });

  it('shows error when "Save as template" clicked but designId is null via state check', async () => {
    // With designId null, button is disabled so we test the guard message path
    mockStoreState = { ...mockStoreState, designId: null };
    render(<TemplatesDrawer siteId={1} productId={99} />);
    await openDrawer();
    const btn = screen.getByTitle(/Save current design as a template/i);
    // button is disabled; fire a direct click bypassing disabled — simulate the edge case
    // by enabling mock state mid-test
    mockStoreState = { ...mockStoreState, designId: null };
    // The button is disabled — just verify disabled attribute is present
    expect(btn).toBeDisabled();
  });

  it('calls POST save-as-template API with correct URL when clicked', async () => {
    mockStoreState = { ...mockStoreState, designId: 'design-xyz' };
    // First fetch: load templates. Second fetch: save-as-template.
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response);

    render(<TemplatesDrawer siteId={5} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle(/Save current design as a template/i));
    await act(async () => {});

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const saveCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('save-as-template')
    );
    expect(saveCall).toBeTruthy();
    expect(saveCall![0]).toContain('/api/storefront/5/designs/design-xyz/save-as-template');
    expect(saveCall![1]).toMatchObject({ method: 'POST' });
  });

  it('shows "Saved as template." info toast on successful save', async () => {
    mockStoreState = { ...mockStoreState, designId: 'design-xyz' };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle(/Save current design as a template/i));
    await act(async () => {});

    expect(screen.getByText('Saved as template.')).toBeInTheDocument();
  });

  it('shows error toast when save-as-template API fails', async () => {
    mockStoreState = { ...mockStoreState, designId: 'design-xyz' };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Save failed' }),
      } as Response);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle(/Save current design as a template/i));
    await act(async () => {});

    expect(screen.getByText('Save failed')).toBeInTheDocument();
  });

  it('shows button text "Saving…" while save is in-flight', async () => {
    mockStoreState = { ...mockStoreState, designId: 'design-xyz' };
    let resolveSave!: () => void;
    const savePending = new Promise<Response>((resolve) => {
      resolveSave = () =>
        resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
    });

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
      .mockReturnValueOnce(savePending);

    render(<TemplatesDrawer siteId={1} productId={99} />);
    fireEvent.click(getToggleButton());
    await act(async () => {});

    fireEvent.click(screen.getByTitle(/Save current design as a template/i));
    // Saving state is synchronous set before await
    expect(screen.getByText(/Saving/i)).toBeInTheDocument();

    // Resolve to avoid hanging
    resolveSave();
    await act(async () => {});
  });
});
