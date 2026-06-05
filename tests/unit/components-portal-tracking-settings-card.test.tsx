// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Router mock — must be declared before imports that use it
// ---------------------------------------------------------------------------
const mockRouterRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import TrackingSettingsCard from '@/components/portal/TrackingSettingsCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function makeFetchFail(body: unknown) {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve(body),
  } as Response);
}

const SITE_ID = 42;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => makeFetchOk({ success: true, data: {} }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------
function renderCard(
  initialConfig: Parameters<typeof TrackingSettingsCard>[0]['initialConfig'] = null,
) {
  return render(
    <TrackingSettingsCard siteId={SITE_ID} initialConfig={initialConfig} />,
  );
}

// ---------------------------------------------------------------------------
// Smoke
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — render', () => {
  it('renders the card heading', () => {
    renderCard();
    expect(screen.getByText('Tracking & Analytics')).toBeTruthy();
  });

  it('renders the enable toggle with correct default aria-pressed (true when no config)', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /Toggle tracking/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders aria-pressed=false when initialConfig.enabled is false', () => {
    renderCard({ enabled: false });
    const toggle = screen.getByRole('button', { name: /Toggle tracking/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the save button', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /Save Tracking Settings/i })).toBeTruthy();
  });

  it('save button is disabled when form is pristine', () => {
    renderCard();
    const btn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders Analytics & Tag Managers section heading', () => {
    renderCard();
    expect(screen.getByText('Analytics & Tag Managers')).toBeTruthy();
  });

  it('renders Search-engine verification section heading', () => {
    renderCard();
    expect(screen.getByText('Search-engine verification')).toBeTruthy();
  });

  it('renders Advanced HTML toggle button', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /Advanced HTML/i })).toBeTruthy();
  });

  it('does not show advanced HTML fields by default', () => {
    renderCard();
    // customHeadHtml and customBodyHtml labels are only rendered when expanded
    expect(screen.queryByLabelText(/Custom.*head HTML/i)).toBeNull();
  });

  it('shows advanced HTML textareas when expanded', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Advanced HTML/i }));
    // After expansion, textareas for custom head/body HTML appear
    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('renders GA4 measurement ID input', () => {
    renderCard();
    expect(screen.getByPlaceholderText('G-XXXXXXXXXX')).toBeTruthy();
  });

  it('populates fields from initialConfig', () => {
    renderCard({ gaMeasurementId: 'G-TESTID1234' });
    const input = screen.getByPlaceholderText('G-XXXXXXXXXX') as HTMLInputElement;
    expect(input.value).toBe('G-TESTID1234');
  });
});

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — enable toggle', () => {
  it('toggling enable makes form dirty (enables save button)', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /Toggle tracking/i });
    fireEvent.click(toggle);
    const saveBtn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('toggling twice returns to pristine (disables save button)', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /Toggle tracking/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    const saveBtn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('updates aria-pressed when toggled off', () => {
    renderCard();
    const toggle = screen.getByRole('button', { name: /Toggle tracking/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows suppressed-tracking description when disabled', () => {
    renderCard({ enabled: false });
    expect(
      screen.getByText(/All tracking is suppressed/i),
    ).toBeTruthy();
  });

  it('shows emitting description when enabled', () => {
    renderCard();
    expect(
      screen.getByText(/Configured scripts and meta tags are emitted/i),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Field edits + validation
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — field edits', () => {
  it('typing a valid GA4 ID enables the save button', () => {
    renderCard();
    const input = screen.getByPlaceholderText('G-XXXXXXXXXX');
    fireEvent.change(input, { target: { value: 'G-ABC12345' } });
    const saveBtn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('typing an invalid GA4 ID shows a validation error and disables save', () => {
    renderCard();
    const input = screen.getByPlaceholderText('G-XXXXXXXXXX');
    fireEvent.change(input, { target: { value: 'INVALID' } });
    // save button must be disabled due to hasErrors
    const saveBtn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    // Error text visible
    expect(
      screen.getByText(/Must start with G-/i),
    ).toBeTruthy();
  });

  it('shows "Fix the errors above" message when there are field errors and no status message', () => {
    renderCard();
    fireEvent.change(screen.getByPlaceholderText('G-XXXXXXXXXX'), {
      target: { value: 'BAD' },
    });
    expect(screen.getByText(/Fix the errors above/i)).toBeTruthy();
  });

  it('typing a valid GTM ID enables save', () => {
    renderCard();
    fireEvent.change(screen.getByPlaceholderText('GTM-XXXXXXX'), {
      target: { value: 'GTM-ABCD1234' },
    });
    expect(
      (screen.getByRole('button', { name: /Save Tracking Settings/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('invalid GTM ID shows error', () => {
    renderCard();
    fireEvent.change(screen.getByPlaceholderText('GTM-XXXXXXX'), {
      target: { value: 'GTM-AB' },   // too short — only 2 chars after GTM-
    });
    expect(
      screen.getByText(/Must start with GTM-/i),
    ).toBeTruthy();
  });

  it('typing an invalid Meta Pixel ID shows error', () => {
    renderCard();
    fireEvent.change(screen.getByPlaceholderText('1234567890123456'), {
      target: { value: 'not-a-pixel-id' },
    });
    expect(screen.getByText(/Must be 10–20 digits/i)).toBeTruthy();
  });

  it('clearing a previously set field removes validation error', () => {
    renderCard({ gaMeasurementId: 'G-ABCDEF1234' });
    const input = screen.getByPlaceholderText('G-XXXXXXXXXX') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'INVALID' } });
    // Error shows
    expect(screen.getByText(/Must start with G-/i)).toBeTruthy();
    // Clear back to empty — empty passes (no error)
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByText(/Must start with G-/i)).toBeNull();
  });

  it('rawHtml with javascript: URL shows validation error', () => {
    renderCard();
    // Expand advanced section
    fireEvent.click(screen.getByRole('button', { name: /Advanced HTML/i }));
    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);
    fireEvent.change(textareas[0], { target: { value: '<a href="javascript:alert(1)">x</a>' } });
    expect(screen.getByText(/Cannot contain javascript:/i)).toBeTruthy();
  });

  it('valid rawHtml does not show error', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Advanced HTML/i }));
    const textareas = document.querySelectorAll('textarea');
    fireEvent.change(textareas[0], {
      target: { value: '<script src="https://cdn.example.com/a.js" async></script>' },
    });
    expect(screen.queryByText(/Cannot contain javascript:/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Save — success branch
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — save success', () => {
  it('calls PUT to the correct URL on save', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: { enabled: true } }),
    );
    renderCard();
    // Make form dirty
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/portal/cms/websites/${SITE_ID}/tracking`,
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  it('shows success message after save', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: { enabled: true } }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Tracking settings saved/i)).toBeTruthy(),
    );
  });

  it('calls router.refresh() after successful save', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: { enabled: true } }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it('save button becomes disabled again after successful save (form no longer dirty)', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: { enabled: false } }),
    );
    renderCard();
    // Toggle to enabled=false → dirty
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => screen.getByText(/Tracking settings saved/i));
    // After success the baseline is reset so form is clean again
    const saveBtn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('server-returned normalized values update the inputs after save', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({
        success: true,
        data: { enabled: true, gaMeasurementId: 'G-NORMALIZED01' },
      }),
    );
    renderCard();
    const input = screen.getByPlaceholderText('G-XXXXXXXXXX') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'g-normalized01' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => screen.getByText(/Tracking settings saved/i));
    expect(input.value).toBe('G-NORMALIZED01');
  });

  it('sends only changed keys in the PUT body', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: { enabled: true } }),
    );
    renderCard();
    const input = screen.getByPlaceholderText('G-XXXXXXXXXX');
    fireEvent.change(input, { target: { value: 'G-ABCDEF1234' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    // gaMeasurementId should be present; unrelated GTM key should not be
    expect(body).toHaveProperty('gaMeasurementId', 'G-ABCDEF1234');
    expect(body).not.toHaveProperty('gtmContainerId');
  });
});

// ---------------------------------------------------------------------------
// Save — error branches
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — save error', () => {
  it('shows server error message when success=false with a message', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: false, message: 'Invalid pixel ID format.' }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() =>
      expect(screen.getByText('Invalid pixel ID format.')).toBeTruthy(),
    );
  });

  it('shows fallback error message when success=false with no message', async () => {
    global.fetch = vi.fn(() => makeFetchOk({ success: false }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Failed to save tracking settings/i)).toBeTruthy(),
    );
  });

  it('shows error message when fetch rejects (network error)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network down')));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() =>
      expect(screen.getByText(/Failed to save tracking settings/i)).toBeTruthy(),
    );
  });

  it('does not call router.refresh() on error', async () => {
    global.fetch = vi.fn(() => makeFetchOk({ success: false }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => screen.getByText(/Failed to save tracking settings/i));
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it('does not submit when form has validation errors', async () => {
    global.fetch = vi.fn(() => makeFetchOk({ success: true, data: {} }));
    renderCard();
    // Introduce an error
    fireEvent.change(screen.getByPlaceholderText('G-XXXXXXXXXX'), {
      target: { value: 'BADVALUE' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    // fetch should NOT have been called for the tracking PUT
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/tracking'),
      expect.anything(),
    );
  });

  it('does not submit when form is not dirty', async () => {
    global.fetch = vi.fn(() => makeFetchOk({ success: true, data: {} }));
    renderCard();
    // Save button is disabled; clicking has no effect
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// In-flight / loading state
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — loading state', () => {
  it('shows "Saving..." text while the request is in flight', async () => {
    let resolveReq: (r: Response) => void;
    const pending = new Promise<Response>((res) => { resolveReq = res; });
    global.fetch = vi.fn(() => pending);

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Saving\.\.\./i)).toBeTruthy(),
    );

    // Resolve to clean up
    act(() => {
      resolveReq!({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      } as Response);
    });
  });

  it('save button is disabled while saving', async () => {
    let resolveReq: (r: Response) => void;
    const pending = new Promise<Response>((res) => { resolveReq = res; });
    global.fetch = vi.fn(() => pending);

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });

    await waitFor(() => screen.getByText(/Saving\.\.\./i));
    const saveBtn = screen.getByText(/Saving\.\.\./i).closest('button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    act(() => {
      resolveReq!({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      } as Response);
    });
  });
});

// ---------------------------------------------------------------------------
// Message clearing
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — message clearing', () => {
  it('clears status message when a field is edited after a save', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: { enabled: true } }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Tracking Settings/i }));
    });
    await waitFor(() => screen.getByText(/Tracking settings saved/i));

    // Now make another field change — the success message should clear
    fireEvent.click(screen.getByRole('button', { name: /Toggle tracking/i }));
    fireEvent.change(screen.getByPlaceholderText('G-XXXXXXXXXX'), {
      target: { value: 'G-NEWVALUE12' },
    });
    expect(screen.queryByText(/Tracking settings saved/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Advanced section toggle
// ---------------------------------------------------------------------------
describe('TrackingSettingsCard — advanced HTML section', () => {
  it('toggles advanced section open and closed', () => {
    renderCard();
    const advBtn = screen.getByRole('button', { name: /Advanced HTML/i });
    expect(advBtn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(advBtn);
    expect(advBtn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(advBtn);
    expect(advBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows custom head/body textareas when advanced is open', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Advanced HTML/i }));
    const textareas = document.querySelectorAll('textarea');
    // Both custom head and body HTML textareas
    expect(textareas.length).toBeGreaterThanOrEqual(2);
  });

  it('populates custom head HTML from initialConfig', () => {
    renderCard({ customHeadHtml: '<meta name="custom" />' });
    fireEvent.click(screen.getByRole('button', { name: /Advanced HTML/i }));
    const textareas = document.querySelectorAll('textarea');
    const headTextarea = Array.from(textareas).find(
      (t) => (t as HTMLTextAreaElement).value.includes('<meta'),
    ) as HTMLTextAreaElement | undefined;
    expect(headTextarea).toBeTruthy();
    expect(headTextarea!.value).toBe('<meta name="custom" />');
  });

  it('rawHtml field edit enables save button', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Advanced HTML/i }));
    const textareas = document.querySelectorAll('textarea');
    fireEvent.change(textareas[0], {
      target: { value: '<script src="https://cdn.example.com/a.js"></script>' },
    });
    const saveBtn = screen.getByRole('button', { name: /Save Tracking Settings/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
