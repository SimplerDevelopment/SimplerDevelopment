// @vitest-environment jsdom
/**
 * Unit tests for WebhookConsole
 * (app/portal/settings/webhooks/WebhookConsole.tsx)
 *
 * Covers: filter chips (source / status / failing-only), empty states,
 * row rendering (events, enabled/disabled, failing badge, copy-URL,
 * rotate-secret success + error + confirm-cancel, deliveries panel
 * open/close/loading/error/empty/data, hasDeliveryLog=false branch).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import WebhookConsole, { type UnifiedWebhookRow } from '@/app/portal/settings/webhooks/WebhookConsole';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<UnifiedWebhookRow> = {}): UnifiedWebhookRow {
  return {
    source: 'project',
    sourceId: 1,
    sourceLabel: 'Acme Project',
    sourceHref: '/portal/projects/1',
    id: 10,
    url: 'https://example.com/hook',
    events: ['post.created'],
    enabled: true,
    lastDeliveryAt: null,
    lastStatus: null,
    secretLast4: 'ab12',
    failing: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    hasDeliveryLog: true,
    ...overrides,
  };
}

function makeFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function makeFetchFail(body: unknown, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: deliveries fetch returns empty list
  global.fetch = vi.fn(() =>
    makeFetchOk({ success: true, data: [] }),
  ) as unknown as typeof fetch;

  // Clipboard stub
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  // confirm defaults to true
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Empty-state tests
// ---------------------------------------------------------------------------

describe('WebhookConsole — empty states', () => {
  it('shows "No webhooks configured" when rows is empty', () => {
    render(<WebhookConsole rows={[]} />);
    expect(screen.getByText('No webhooks configured')).toBeTruthy();
  });

  it('shows filter-mismatch message when rows exist but filters exclude all', () => {
    const row = makeRow({ enabled: true });
    render(<WebhookConsole rows={[row]} />);
    // Switch to "disabled" filter so the enabled row is excluded
    fireEvent.click(screen.getByRole('button', { name: /disabled/i }));
    expect(screen.getByText(/No webhooks match the current filters/)).toBeTruthy();
  });

  it('shows count "0 of 1" when filter excludes the only row', () => {
    render(<WebhookConsole rows={[makeRow({ enabled: true })]} />);
    fireEvent.click(screen.getByRole('button', { name: /disabled/i }));
    expect(screen.getByText('0 of 1')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Filter chip tests
// ---------------------------------------------------------------------------

describe('WebhookConsole — source filter chips', () => {
  it('renders all four source filter buttons', () => {
    render(<WebhookConsole rows={[]} />);
    // Source filter buttons include a Material Icon span whose text is prepended to
    // the accessible name by the browser: "folder_specialProject", "pollSurvey", etc.
    expect(screen.getByRole('button', { name: /All sources/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /folder_specialProject/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pollSurvey/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /languageSite/ })).toBeTruthy();
  });

  it('filters to only project rows when Project chip clicked', () => {
    const rows = [
      makeRow({ source: 'project', id: 1, sourceLabel: 'P-Row' }),
      makeRow({ source: 'survey', id: 2, sourceLabel: 'S-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /folder_specialProject/ }));
    expect(screen.getByText('P-Row')).toBeTruthy();
    expect(screen.queryByText('S-Row')).toBeNull();
  });

  it('filters to only survey rows when Survey chip clicked', () => {
    const rows = [
      makeRow({ source: 'project', id: 1, sourceLabel: 'P-Row' }),
      makeRow({ source: 'survey', id: 2, sourceLabel: 'S-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /pollSurvey/ }));
    expect(screen.getByText('S-Row')).toBeTruthy();
    expect(screen.queryByText('P-Row')).toBeNull();
  });

  it('shows all rows after returning to "All sources"', () => {
    const rows = [
      makeRow({ source: 'project', id: 1, sourceLabel: 'P-Row' }),
      makeRow({ source: 'survey', id: 2, sourceLabel: 'S-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /folder_specialProject/ }));
    fireEvent.click(screen.getByRole('button', { name: /All sources/i }));
    expect(screen.getByText('P-Row')).toBeTruthy();
    expect(screen.getByText('S-Row')).toBeTruthy();
  });
});

describe('WebhookConsole — status filter chips', () => {
  it('renders Any status, enabled, disabled buttons', () => {
    render(<WebhookConsole rows={[]} />);
    expect(screen.getByRole('button', { name: /Any status/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^enabled$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^disabled$/i })).toBeTruthy();
  });

  it('shows only enabled rows when enabled filter active', () => {
    const rows = [
      makeRow({ id: 1, enabled: true, sourceLabel: 'En-Row' }),
      makeRow({ id: 2, enabled: false, sourceLabel: 'Dis-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /^enabled$/i }));
    expect(screen.getByText('En-Row')).toBeTruthy();
    expect(screen.queryByText('Dis-Row')).toBeNull();
  });

  it('shows only disabled rows when disabled filter active', () => {
    const rows = [
      makeRow({ id: 1, enabled: true, sourceLabel: 'En-Row' }),
      makeRow({ id: 2, enabled: false, sourceLabel: 'Dis-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /^disabled$/i }));
    expect(screen.getByText('Dis-Row')).toBeTruthy();
    expect(screen.queryByText('En-Row')).toBeNull();
  });
});

describe('WebhookConsole — failing-only filter', () => {
  it('renders "Failing only" toggle button', () => {
    render(<WebhookConsole rows={[]} />);
    expect(screen.getByRole('button', { name: /Failing only/i })).toBeTruthy();
  });

  it('hides non-failing rows when Failing only is toggled', () => {
    const rows = [
      makeRow({ id: 1, failing: true, sourceLabel: 'Bad-Row' }),
      makeRow({ id: 2, failing: false, sourceLabel: 'Ok-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /Failing only/i }));
    expect(screen.getByText('Bad-Row')).toBeTruthy();
    expect(screen.queryByText('Ok-Row')).toBeNull();
  });

  it('restores all rows when Failing only is toggled off', () => {
    const rows = [
      makeRow({ id: 1, failing: true, sourceLabel: 'Bad-Row' }),
      makeRow({ id: 2, failing: false, sourceLabel: 'Ok-Row' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /Failing only/i }));
    fireEvent.click(screen.getByRole('button', { name: /Failing only/i }));
    expect(screen.getByText('Bad-Row')).toBeTruthy();
    expect(screen.getByText('Ok-Row')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

describe('WebhookConsole — row rendering', () => {
  it('renders source label as a link', () => {
    render(<WebhookConsole rows={[makeRow()]} />);
    const link = screen.getByRole('link', { name: /Acme Project/i });
    expect(link.getAttribute('href')).toBe('/portal/projects/1');
  });

  it('renders truncated URL in a code element', () => {
    const url = 'https://example.com/hook';
    render(<WebhookConsole rows={[makeRow({ url })]} />);
    expect(screen.getByText(url)).toBeTruthy();
  });

  it('truncates URLs longer than 48 characters', () => {
    const url = 'https://example.com/' + 'x'.repeat(40);
    render(<WebhookConsole rows={[makeRow({ url })]} />);
    // The truncated text is 47 chars + ellipsis char
    const code = document.querySelector('code');
    expect(code).toBeTruthy();
    expect(code!.textContent!.length).toBeLessThanOrEqual(49);
    expect(code!.textContent).toContain('…');
  });

  it('shows secret last 4', () => {
    render(<WebhookConsole rows={[makeRow({ secretLast4: 'z9x1' })]} />);
    expect(screen.getByText(/…z9x1/)).toBeTruthy();
  });

  it('shows "----" when secretLast4 is null', () => {
    render(<WebhookConsole rows={[makeRow({ secretLast4: null })]} />);
    expect(screen.getByText(/…----/)).toBeTruthy();
  });

  it('shows "Enabled" badge when webhook is enabled', () => {
    render(<WebhookConsole rows={[makeRow({ enabled: true })]} />);
    expect(screen.getByText('Enabled')).toBeTruthy();
  });

  it('shows "Disabled" badge when webhook is disabled', () => {
    render(<WebhookConsole rows={[makeRow({ enabled: false })]} />);
    expect(screen.getByText('Disabled')).toBeTruthy();
  });

  it('shows Failing badge when failing=true', () => {
    render(<WebhookConsole rows={[makeRow({ failing: true })]} />);
    expect(screen.getByText('Failing')).toBeTruthy();
  });

  it('does not show Failing badge when failing=false', () => {
    render(<WebhookConsole rows={[makeRow({ failing: false })]} />);
    expect(screen.queryByText('Failing')).toBeNull();
  });

  it('renders event badges for up to 3 events', () => {
    render(<WebhookConsole rows={[makeRow({ events: ['a', 'b', 'c'] })]} />);
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });

  it('shows overflow count badge when more than 3 events', () => {
    render(<WebhookConsole rows={[makeRow({ events: ['a', 'b', 'c', 'd', 'e'] })]} />);
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('shows "all" when events array is empty', () => {
    render(<WebhookConsole rows={[makeRow({ events: [] })]} />);
    expect(screen.getByText('all')).toBeTruthy();
  });

  it('shows "Never" for null lastDeliveryAt', () => {
    render(<WebhookConsole rows={[makeRow({ lastDeliveryAt: null })]} />);
    expect(screen.getByText('Never')).toBeTruthy();
  });

  it('shows "HTTP —" when lastStatus is null', () => {
    render(<WebhookConsole rows={[makeRow({ lastStatus: null })]} />);
    expect(screen.getByText('HTTP —')).toBeTruthy();
  });

  it('shows HTTP status code when lastStatus is set', () => {
    render(<WebhookConsole rows={[makeRow({ lastStatus: 200 })]} />);
    expect(screen.getByText('HTTP 200')).toBeTruthy();
  });

  it('shows count "N of M" in the filter bar', () => {
    const rows = [makeRow({ id: 1 }), makeRow({ id: 2 })];
    render(<WebhookConsole rows={rows} />);
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Copy URL
// ---------------------------------------------------------------------------

describe('WebhookConsole — copy URL', () => {
  it('calls clipboard.writeText with the webhook URL', async () => {
    render(<WebhookConsole rows={[makeRow()]} />);
    const copyBtn = screen.getByTitle('Copy URL');
    await act(async () => { fireEvent.click(copyBtn); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/hook');
  });
});

// ---------------------------------------------------------------------------
// Rotate secret
// ---------------------------------------------------------------------------

describe('WebhookConsole — rotate secret', () => {
  it('does NOT call fetch when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<WebhookConsole rows={[makeRow()]} />);
    const rotateBtn = screen.getByRole('button', { name: /Rotate secret/i });
    await act(async () => { fireEvent.click(rotateBtn); });
    // Only the deliveries fetch should ever fire — rotate fetch must not be called
    const rotateCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/rotate'),
    );
    expect(rotateCalls).toHaveLength(0);
  });

  it('calls POST /rotate and shows new secret on success', async () => {
    global.fetch = vi.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('/rotate')) {
        return makeFetchOk({ success: true, data: { secret: 'newsecret-xyz' } });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    const rotateBtn = screen.getByRole('button', { name: /Rotate secret/i });
    await act(async () => { fireEvent.click(rotateBtn); });

    await waitFor(() => {
      expect(screen.getByText('newsecret-xyz')).toBeTruthy();
    });
    expect(screen.getByText(/New signing secret/)).toBeTruthy();
  });

  it('shows error message when rotate API returns !ok', async () => {
    global.fetch = vi.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('/rotate')) {
        return makeFetchFail({ success: false, message: 'Unauthorized' });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rotate secret/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeTruthy();
    });
  });

  it('shows "HTTP 500" fallback when rotate API has no message', async () => {
    global.fetch = vi.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('/rotate')) {
        return makeFetchFail({ success: false }, 500);
      }
      return makeFetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rotate secret/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('HTTP 500')).toBeTruthy();
    });
  });

  it('shows error message when rotate fetch throws a network error', async () => {
    global.fetch = vi.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('/rotate')) {
        return Promise.reject(new Error('net::ERR_FAILED'));
      }
      return makeFetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rotate secret/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('net::ERR_FAILED')).toBeTruthy();
    });
  });

  it('shows "Rotating…" label while request is in-flight', async () => {
    let resolveRotate: (v: unknown) => void;
    const pending = new Promise((res) => { resolveRotate = res; });

    global.fetch = vi.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('/rotate')) return pending as Promise<Response>;
      return makeFetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Rotate secret/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Rotating…')).toBeTruthy();
    });

    // Resolve to clean up
    act(() => {
      resolveRotate!({ ok: true, json: () => Promise.resolve({ success: true, data: { secret: 's' } }) });
    });
  });
});

// ---------------------------------------------------------------------------
// Deliveries panel
// ---------------------------------------------------------------------------

describe('WebhookConsole — deliveries panel', () => {
  it('opens deliveries panel when "Deliveries" button is clicked', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: [] }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('No delivery attempts recorded yet.')).toBeTruthy();
    });
  });

  it('closes deliveries panel when clicked again ("Hide" button)', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: [] }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });
    await waitFor(() => screen.getByText('No delivery attempts recorded yet.'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Hide/i }));
    });
    expect(screen.queryByText('No delivery attempts recorded yet.')).toBeNull();
  });

  it('shows delivery rows when API returns data', async () => {
    const deliveries = [
      { id: 1, event: 'post.created', status: 200, error: null, createdAt: '2026-01-01T12:00:00.000Z' },
      { id: 2, event: 'post.updated', status: 500, error: 'timeout', createdAt: '2026-01-02T12:00:00.000Z' },
    ];
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: deliveries }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    await waitFor(() => {
      // 'post.created' also appears as an events badge — getAllByText handles the duplicate
      expect(screen.getAllByText('post.created').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('post.updated')).toBeTruthy();
      expect(screen.getByText('timeout')).toBeTruthy();
    });
  });

  it('shows delivery status codes in the table', async () => {
    const deliveries = [
      { id: 1, event: 'post.created', status: 200, error: null, createdAt: '2026-01-01T12:00:00.000Z' },
    ];
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: deliveries }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('200')).toBeTruthy();
    });
  });

  it('shows error state when deliveries fetch returns !ok', async () => {
    global.fetch = vi.fn(() =>
      makeFetchFail({ success: false }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load deliveries.')).toBeTruthy();
    });
  });

  it('shows error state when deliveries fetch throws', async () => {
    global.fetch = vi.fn((url: unknown) => {
      if (typeof url === 'string' && url.includes('/deliveries')) {
        return Promise.reject(new Error('network down'));
      }
      return makeFetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to load deliveries.')).toBeTruthy();
    });
  });

  it('does not re-fetch deliveries if already cached', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: [] }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    // Open
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });
    await waitFor(() => screen.getByText('No delivery attempts recorded yet.'));

    const callCountAfterFirstOpen = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/deliveries'),
    ).length;

    // Close then re-open
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hide/i })); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    const callCountAfterSecondOpen = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/deliveries'),
    ).length;

    expect(callCountAfterSecondOpen).toBe(callCountAfterFirstOpen);
  });

  it('shows "no delivery log" message when hasDeliveryLog=false', async () => {
    render(<WebhookConsole rows={[makeRow({ hasDeliveryLog: false })]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Delivery log is not yet recorded/i)).toBeTruthy();
    });
  });

  it('shows null delivery status as "—" in delivery table', async () => {
    const deliveries = [
      { id: 1, event: 'post.created', status: null, error: null, createdAt: '2026-01-01T12:00:00.000Z' },
    ];
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: deliveries }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });

    await waitFor(() => {
      // The delivery table contains "—" for null status (formatStatus returns '—')
      const cells = Array.from(document.querySelectorAll('td'));
      const dashCell = cells.find((c) => c.textContent === '—');
      expect(dashCell).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-row / combined-filter tests
// ---------------------------------------------------------------------------

describe('WebhookConsole — multi-row + combined filters', () => {
  it('renders the deliveries table header columns', async () => {
    const deliveries = [
      { id: 1, event: 'survey.submitted', status: 201, error: null, createdAt: '2026-03-01T08:00:00.000Z' },
    ];
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: deliveries }),
    ) as unknown as typeof fetch;

    render(<WebhookConsole rows={[makeRow()]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Deliveries/i }));
    });
    await waitFor(() => screen.getByText('survey.submitted'));

    expect(screen.getByText('When')).toBeTruthy();
    expect(screen.getByText('Event')).toBeTruthy();
    // 'Status' also appears in the main webhook table header — getAllByText handles duplicate
    expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Error')).toBeTruthy();
  });

  it('source filter + status filter compose correctly', () => {
    const rows = [
      makeRow({ source: 'project', id: 1, enabled: true, sourceLabel: 'P-En' }),
      makeRow({ source: 'project', id: 2, enabled: false, sourceLabel: 'P-Dis' }),
      makeRow({ source: 'survey', id: 3, enabled: true, sourceLabel: 'S-En' }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /folder_specialProject/ }));
    fireEvent.click(screen.getByRole('button', { name: /^enabled$/i }));
    expect(screen.getByText('P-En')).toBeTruthy();
    expect(screen.queryByText('P-Dis')).toBeNull();
    expect(screen.queryByText('S-En')).toBeNull();
  });

  it('shows "2 of 3" count after source filter narrows list', () => {
    const rows = [
      makeRow({ source: 'project', id: 1 }),
      makeRow({ source: 'project', id: 2 }),
      makeRow({ source: 'survey', id: 3 }),
    ];
    render(<WebhookConsole rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /folder_specialProject/ }));
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });
});
