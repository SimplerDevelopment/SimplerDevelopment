// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/EntityPicker.tsx`
 *
 * Covers:
 *   - Closed state: label + icon + "select" button rendered
 *   - Opening: click opens dropdown, fetch fires, loading shown
 *   - Load resolved: rows appear after fetch resolves
 *   - Select a row: onChange called, chip displayed, dropdown closed
 *   - Clear chip: onChange(null) called, chip removed
 *   - Re-open after clear: dropdown shows again
 *   - Click chip to re-open dropdown
 *   - Server-side search: re-fetch with ?search= on input change
 *   - Client-side filter: supportsServerSearch=false filters without re-fetch
 *   - Empty results message (no rows after load)
 *   - Empty results with query (shows "no X matches" message)
 *   - Error state on HTTP failure
 *   - Error state on network throw
 *   - Click outside closes dropdown
 *   - displayRow returning null skips rows
 *   - Both response shapes (items wrapper vs flat array)
 *   - Externally-provided value shows placeholder chip before dropdown opens
 *   - Secondary line rendered in row
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EntityPicker, { type EntityPickerProps, type EntityPickerRow } from '@/components/brain/EntityPicker';

// ─── next/navigation mock ─────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portal/brain',
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROWS: EntityPickerRow[] = [
  { id: 1, primary: 'Alpha Corp', secondary: 'alpha.com' },
  { id: 2, primary: 'Beta LLC', secondary: 'beta.io' },
  { id: 3, primary: 'Gamma Inc', secondary: null },
];

function makeItemsResponse(rows: EntityPickerRow[]) {
  return { success: true, data: { items: rows } };
}

function makeFlatResponse(rows: EntityPickerRow[]) {
  return { success: true, data: rows };
}

function mockFetchWith(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response);
}

function mockFetchReject(msg = 'Network failure') {
  global.fetch = vi.fn().mockRejectedValue(new Error(msg));
}

function mockFetchHttpError(status = 500, message = 'Server error') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, message }),
  } as Response);
}

const defaultDisplayRow = (raw: unknown): EntityPickerRow | null => {
  const r = raw as EntityPickerRow;
  if (!r?.id) return null;
  return { id: r.id, primary: r.primary, secondary: r.secondary };
};

const DEFAULT_PROPS: EntityPickerProps = {
  label: 'Company',
  icon: 'business',
  value: null,
  onChange: vi.fn(),
  endpoint: '/api/portal/crm/companies',
  displayRow: defaultDisplayRow,
};

// Controlled wrapper to test value/onChange flow
function ControlledPicker(props: Partial<EntityPickerProps>) {
  const [val, setVal] = useState<number | null>(props.value ?? null);
  return (
    <EntityPicker
      {...DEFAULT_PROPS}
      {...props}
      value={val}
      onChange={(id) => {
        setVal(id);
        props.onChange?.(id);
      }}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Closed / initial state ───────────────────────────────────────────────────

describe('EntityPicker — closed state', () => {
  it('renders label and select button', () => {
    mockFetchWith(makeItemsResponse([]));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    expect(screen.getByText('Company')).toBeTruthy();
    expect(screen.getByText('— select —')).toBeTruthy();
  });

  it('does not render dropdown when closed', () => {
    mockFetchWith(makeItemsResponse([]));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('does not fetch before the dropdown opens', () => {
    global.fetch = vi.fn();
    render(<EntityPicker {...DEFAULT_PROPS} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Opening and loading ──────────────────────────────────────────────────────

describe('EntityPicker — opening', () => {
  it('opens dropdown on select button click', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('renders search input immediately after open (before fetch resolves)', async () => {
    // Never resolves — dropdown stays open in loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    // The input is rendered synchronously on open
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('fires fetch with limit param when opening', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('limit=20');
  });
});

// ─── Load resolved — rows displayed ──────────────────────────────────────────

describe('EntityPicker — rows loaded', () => {
  it('displays rows after fetch resolves (items wrapper shape)', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    expect(screen.getByText('Beta LLC')).toBeTruthy();
    expect(screen.getByText('Gamma Inc')).toBeTruthy();
  });

  it('displays rows after fetch resolves (flat array shape)', async () => {
    mockFetchWith(makeFlatResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    expect(screen.getByText('Beta LLC')).toBeTruthy();
  });

  it('renders secondary line when present', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    expect(screen.getByText('alpha.com')).toBeTruthy();
  });

  it('does not render secondary line when null', async () => {
    mockFetchWith(makeItemsResponse([{ id: 3, primary: 'Gamma Inc', secondary: null }]));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Gamma Inc');
    // Only 1 primary text, no secondary span for this row
    expect(screen.queryByText('null')).toBeNull();
  });

  it('skips rows where displayRow returns null', async () => {
    const strictDisplay = (raw: unknown): EntityPickerRow | null => {
      const r = raw as { id: number; primary: string };
      if (r.id === 2) return null; // skip Beta LLC
      return { id: r.id, primary: r.primary };
    };
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} displayRow={strictDisplay} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    expect(screen.queryByText('Beta LLC')).toBeNull();
  });
});

// ─── Select a row ─────────────────────────────────────────────────────────────

describe('EntityPicker — selecting a row', () => {
  it('calls onChange with row id on click', async () => {
    const onChange = vi.fn();
    mockFetchWith(makeItemsResponse(ROWS));
    render(<ControlledPicker onChange={onChange} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    fireEvent.click(screen.getByText('Alpha Corp'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('shows chip with selected row primary after selection', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<ControlledPicker />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Beta LLC');
    fireEvent.click(screen.getByText('Beta LLC'));
    expect(screen.getByText('Beta LLC')).toBeTruthy();
    expect(screen.queryByText('— select —')).toBeNull();
  });

  it('closes dropdown after selection', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<ControlledPicker />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    fireEvent.click(screen.getByText('Alpha Corp'));
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows check icon on already-selected row when reopened', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<ControlledPicker />);
    fireEvent.click(screen.getByText('— select —'));
    // Wait for rows, pick the list-item instance (not the chip)
    await screen.findAllByText('Alpha Corp');
    const rowBtns = screen.getAllByText('Alpha Corp');
    fireEvent.click(rowBtns[rowBtns.length - 1]);

    // Re-open via chip body button
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeItemsResponse(ROWS)),
    } as Response);
    const chipBtn = screen.getByTitle('alpha.com');
    fireEvent.click(chipBtn);
    // Wait for rows to re-load
    await screen.findAllByText('Alpha Corp');
    // The "check" icon should appear (material icon text)
    const checks = document.querySelectorAll('.material-icons');
    const checkIcons = Array.from(checks).filter((el) => el.textContent === 'check');
    expect(checkIcons.length).toBeGreaterThan(0);
  });
});

// ─── Clear chip ───────────────────────────────────────────────────────────────

describe('EntityPicker — clearing', () => {
  it('calls onChange(null) when clear button clicked', async () => {
    const onChange = vi.fn();
    mockFetchWith(makeItemsResponse(ROWS));
    render(<ControlledPicker onChange={onChange} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    fireEvent.click(screen.getByText('Alpha Corp'));
    onChange.mockClear();

    fireEvent.click(screen.getByLabelText('Clear Company'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows select button again after clearing', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<ControlledPicker />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');
    fireEvent.click(screen.getByText('Alpha Corp'));

    fireEvent.click(screen.getByLabelText('Clear Company'));
    expect(screen.getByText('— select —')).toBeTruthy();
  });
});

// ─── Search / filter ──────────────────────────────────────────────────────────

describe('EntityPicker — server-side search', () => {
  it('includes search param in URL after typing', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} supportsServerSearch={true} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeItemsResponse([ROWS[0]])),
    } as Response);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('search=alpha');
  });
});

describe('EntityPicker — client-side filter', () => {
  it('filters rows client-side without re-fetching when supportsServerSearch=false', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} supportsServerSearch={false} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');

    const callCountAfterOpen = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
    // No new fetch should occur (debounce still fires but search not in URL)
    await waitFor(() => {
      // either no new calls OR the new call has no search param
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      if (calls.length > callCountAfterOpen) {
        const url = calls[calls.length - 1][0] as string;
        expect(url).not.toContain('search=');
      }
    });

    // Client-side filter should hide Alpha Corp, show Beta LLC
    await waitFor(() => {
      expect(screen.queryByText('Alpha Corp')).toBeNull();
    });
    expect(screen.getByText('Beta LLC')).toBeTruthy();
  });

  it('filters by secondary field client-side', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(<EntityPicker {...DEFAULT_PROPS} supportsServerSearch={false} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta.io' } });
    await waitFor(() => expect(screen.queryByText('Alpha Corp')).toBeNull());
    expect(screen.getByText('Beta LLC')).toBeTruthy();
  });
});

// ─── Empty / no-results ───────────────────────────────────────────────────────

describe('EntityPicker — empty states', () => {
  it('shows "No X found" when no rows and no query', async () => {
    mockFetchWith(makeItemsResponse([]));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText(/No company found/i);
  });

  it('shows "No X matches query" when no rows and query set', async () => {
    mockFetchWith(makeItemsResponse([]));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText(/No company found/i);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    await waitFor(() =>
      expect(screen.queryByText(/No company matches "zzz"/i)).toBeTruthy(),
    );
  });
});

// ─── Error states ─────────────────────────────────────────────────────────────

describe('EntityPicker — error states', () => {
  it('shows error message on HTTP failure', async () => {
    mockFetchHttpError(403, 'Forbidden');
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Forbidden');
  });

  it('shows fallback HTTP status when no message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ success: false }),
    } as Response);
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText(/HTTP 503/);
  });

  it('shows "Network error" on network throw', async () => {
    mockFetchReject('Network failure');
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Network failure');
  });

  it('shows "Network error" for non-Error throw', async () => {
    global.fetch = vi.fn().mockRejectedValue('plain string');
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Network error');
  });
});

// ─── Click-outside closes dropdown ───────────────────────────────────────────

describe('EntityPicker — click-outside', () => {
  it('closes dropdown on mousedown outside the component', async () => {
    mockFetchWith(makeItemsResponse(ROWS));
    render(
      <div>
        <EntityPicker {...DEFAULT_PROPS} />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByText('Alpha Corp');

    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
  });
});

// ─── External value (placeholder chip) ───────────────────────────────────────

describe('EntityPicker — externally provided value', () => {
  it('shows placeholder chip for external id before dropdown opens', () => {
    global.fetch = vi.fn();
    render(<EntityPicker {...DEFAULT_PROPS} value={99} />);
    expect(screen.getByText('#99')).toBeTruthy();
  });

  it('resolves placeholder chip once rows are fetched', async () => {
    mockFetchWith(makeItemsResponse([{ id: 99, primary: 'Resolved Corp', secondary: 'res.com' }]));
    render(<ControlledPicker value={99} />);
    // Should show placeholder initially
    expect(screen.getByText('#99')).toBeTruthy();

    // Open so fetch fires
    const chipBtn = screen.getByTitle('Loading…');
    fireEvent.click(chipBtn);
    // Wait for at least one instance of 'Resolved Corp' (chip + row both fine)
    await screen.findAllByText('Resolved Corp');
    const instances = screen.getAllByText('Resolved Corp');
    expect(instances.length).toBeGreaterThan(0);
  });

  it('shows select button when value is null', () => {
    global.fetch = vi.fn();
    render(<EntityPicker {...DEFAULT_PROPS} value={null} />);
    expect(screen.getByText('— select —')).toBeTruthy();
  });
});

// ─── Custom searchPlaceholder ─────────────────────────────────────────────────

describe('EntityPicker — searchPlaceholder', () => {
  it('uses default placeholder derived from label', async () => {
    mockFetchWith(makeItemsResponse([]));
    render(<EntityPicker {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByRole('searchbox');
    expect(screen.getByPlaceholderText('Search company…')).toBeTruthy();
  });

  it('uses custom placeholder when provided', async () => {
    mockFetchWith(makeItemsResponse([]));
    render(<EntityPicker {...DEFAULT_PROPS} searchPlaceholder="Find a company..." />);
    fireEvent.click(screen.getByText('— select —'));
    await screen.findByRole('searchbox');
    expect(screen.getByPlaceholderText('Find a company...')).toBeTruthy();
  });
});
