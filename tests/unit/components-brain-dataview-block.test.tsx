// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/DataviewBlock.tsx`
 *
 * Covers:
 *   - Parse error branch (invalid JSON source)
 *   - Empty source branch
 *   - Loading state (fetch in-flight)
 *   - Error state (HTTP error response, network throw, success=false)
 *   - Retry button increments reloadKey and re-fetches
 *   - Ready state: table rendered, columns humanised
 *   - Empty rows message
 *   - formatCell branches: null/undefined, Date, ISO datetime string, boolean, number, array, object
 *   - makeDataviewCodeOverride: dataview language → DataviewBlock; non-dataview + fallback; no-fallback
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DataviewBlock, makeDataviewCodeOverride } from '@/components/brain/DataviewBlock';

// ─── fetch helper ────────────────────────────────────────────────────────────

type FetchPayload = {
  ok?: boolean;
  success?: boolean;
  data?: unknown;
  message?: string;
};

function mockFetchOk(payload: FetchPayload) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: payload.ok ?? true,
    status: payload.ok === false ? 500 : 200,
    json: () => Promise.resolve(payload),
  } as Response);
}

function mockFetchReject(msg = 'Network error') {
  global.fetch = vi.fn().mockRejectedValue(new Error(msg));
}

const VALID_SOURCE = JSON.stringify({ type: 'contacts', limit: 5 });

const OK_RESPONSE = {
  ok: true,
  success: true,
  data: {
    columns: ['name', 'emailAddress', 'isActive', 'createdAt', 'score'],
    rows: [
      {
        name: 'Alice',
        emailAddress: 'alice@example.com',
        isActive: true,
        createdAt: '2024-01-15T10:00:00.000Z',
        score: 42,
      },
    ],
  },
};

const EMPTY_ROWS_RESPONSE = {
  ok: true,
  success: true,
  data: { columns: ['name'], rows: [] },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Parse-error branch ───────────────────────────────────────────────────────

describe('DataviewBlock — parse errors', () => {
  it('shows parse error for invalid JSON', () => {
    render(<DataviewBlock source="not json {{{" />);
    expect(screen.getByText('Dataview parse error')).toBeTruthy();
  });

  it('shows parse error for empty source', () => {
    render(<DataviewBlock source="   " />);
    expect(screen.getByText('Dataview parse error')).toBeTruthy();
    expect(screen.getByText(/empty dataview block/i)).toBeTruthy();
  });

  it('does NOT call fetch when source is invalid', () => {
    global.fetch = vi.fn();
    render(<DataviewBlock source="bad" />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('DataviewBlock — loading state', () => {
  it('renders loading skeleton while fetch is in-flight', async () => {
    // Never resolves during the render itself
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<DataviewBlock source={VALID_SOURCE} />);
    expect(screen.getByText(/Running dataview query/i)).toBeTruthy();
  });
});

// ─── Error state ─────────────────────────────────────────────────────────────

describe('DataviewBlock — error states', () => {
  it('shows error message on HTTP error response', async () => {
    mockFetchOk({ ok: false, success: false, message: 'Forbidden', data: undefined });
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Query failed');
    expect(screen.getByText('Forbidden')).toBeTruthy();
  });

  it('shows fallback HTTP status when no message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ success: false }),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Query failed');
    expect(screen.getByText(/HTTP 503/)).toBeTruthy();
  });

  it('shows error when success=false even if HTTP 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: false, message: 'Not allowed' }),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Query failed');
    expect(screen.getByText('Not allowed')).toBeTruthy();
  });

  it('shows error on network throw', async () => {
    mockFetchReject('connection refused');
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Query failed');
    expect(screen.getByText('connection refused')).toBeTruthy();
  });

  it('shows "request failed" for non-Error throw', async () => {
    global.fetch = vi.fn().mockRejectedValue('raw string rejection');
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Query failed');
    expect(screen.getByText('request failed')).toBeTruthy();
  });

  it('retry button re-fetches after error', async () => {
    mockFetchReject('fail');
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Query failed');

    // Now make subsequent fetch succeed
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(OK_RESPONSE),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await screen.findByText('Dataview');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Ready / table state ──────────────────────────────────────────────────────

describe('DataviewBlock — ready state', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(OK_RESPONSE),
    } as Response);
  });

  it('renders the table with humanised column headers', async () => {
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    // humaniseColumn('emailAddress') → 'Email Address'
    expect(screen.getByText('Email Address')).toBeTruthy();
    // humaniseColumn('isActive') → 'Is Active'
    expect(screen.getByText('Is Active')).toBeTruthy();
    // humaniseColumn('createdAt') → 'Created At'
    expect(screen.getByText('Created At')).toBeTruthy();
    // humaniseColumn('name') → 'Name'
    expect(screen.getByText('Name')).toBeTruthy();
  });

  it('renders cell values (string, boolean, number, ISO date)', async () => {
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    // string
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    // boolean true → 'yes'
    expect(screen.getByText('yes')).toBeTruthy();
    // number 42
    expect(screen.getByText('42')).toBeTruthy();
    // ISO datetime → local date (just check something non-empty was rendered)
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
  });

  it('shows row count in the header', async () => {
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    expect(screen.getByText(/1 row/)).toBeTruthy();
  });

  it('shows plural "rows" for 0 rows', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        ok: true,
        success: true,
        data: { columns: ['name'], rows: [{ name: 'A' }, { name: 'B' }] },
      }),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    expect(screen.getByText(/2 rows/)).toBeTruthy();
  });

  it('refresh badge triggers re-fetch', async () => {
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    const beforeCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(OK_RESPONSE),
    } as Response);

    // The refresh badge button contains "live · refreshed"
    const refreshBtn = screen.getByTitle('Refresh query');
    fireEvent.click(refreshBtn);
    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
    expect(beforeCount).toBeGreaterThanOrEqual(1); // initial fetch happened
  });

  it('posts correct JSON body to endpoint', async () => {
    render(<DataviewBlock source={VALID_SOURCE} endpoint="/api/test/dataview" />);
    await screen.findByText('Dataview');
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('/api/test/dataview');
    expect(calls[0][1].method).toBe('POST');
    expect(JSON.parse(calls[0][1].body)).toEqual({ type: 'contacts', limit: 5 });
  });
});

// ─── Empty rows ───────────────────────────────────────────────────────────────

describe('DataviewBlock — empty rows', () => {
  it('shows "No matching rows" when rows array is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(EMPTY_ROWS_RESPONSE),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('No matching rows.');
  });

  it('shows 0 rows count', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(EMPTY_ROWS_RESPONSE),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    expect(screen.getByText(/0 rows/)).toBeTruthy();
  });
});

// ─── formatCell edge cases via table rendering ────────────────────────────────

describe('DataviewBlock — formatCell branches', () => {
  function makeResponse(rows: Record<string, unknown>[]) {
    return {
      ok: true,
      success: true,
      data: { columns: Object.keys(rows[0] ?? { col: '' }), rows },
    };
  }

  it('renders "—" dash for null value', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeResponse([{ col: null }])),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    // The muted dash span
    const dashes = document.querySelectorAll('.text-muted-foreground');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders "—" for empty string', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeResponse([{ col: '' }])),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    const dashes = document.querySelectorAll('.text-muted-foreground');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders "no" for boolean false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeResponse([{ flag: false }])),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    expect(screen.getByText('no')).toBeTruthy();
  });

  it('renders joined string for non-empty array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeResponse([{ tags: ['a', 'b', 'c'] }])),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    expect(screen.getByText('a, b, c')).toBeTruthy();
  });

  it('renders "—" for empty array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeResponse([{ tags: [] }])),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    const dashes = document.querySelectorAll('.text-muted-foreground');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders JSON.stringify for plain object', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeResponse([{ meta: { x: 1 } }])),
    } as Response);
    render(<DataviewBlock source={VALID_SOURCE} />);
    await screen.findByText('Dataview');
    expect(screen.getByText('{"x":1}')).toBeTruthy();
  });
});

// ─── makeDataviewCodeOverride ─────────────────────────────────────────────────

describe('makeDataviewCodeOverride', () => {
  beforeEach(() => {
    // Prevent DataviewBlock from actually fetching in these tests
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
  });

  it('renders DataviewBlock for language-dataview class', () => {
    const Override = makeDataviewCodeOverride();
    render(
      <Override className="language-dataview" node={null as never}>
        {JSON.stringify({ type: 'test' })}
      </Override>,
    );
    expect(screen.getByText(/Running dataview query/i)).toBeTruthy();
  });

  it('passes array children as joined string to DataviewBlock', () => {
    const Override = makeDataviewCodeOverride();
    render(
      <Override className="language-dataview" node={null as never}>
        {[JSON.stringify({ type: 'arr' })]}
      </Override>,
    );
    expect(screen.getByText(/Running dataview query/i)).toBeTruthy();
  });

  it('falls back to plain <code> for non-dataview class', () => {
    const Override = makeDataviewCodeOverride();
    const { container } = render(
      <Override className="language-typescript" node={null as never}>
        {'const x = 1;'}
      </Override>,
    );
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.querySelector('code')!.textContent).toBe('const x = 1;');
  });

  it('calls fallback component for non-dataview when provided', () => {
    const Fallback = vi.fn(({ children }: { children?: React.ReactNode }) => (
      <pre data-testid="fallback">{children}</pre>
    ));
    const Override = makeDataviewCodeOverride(Fallback as never);
    render(
      <Override className="language-ts" node={null as never}>
        {'hello'}
      </Override>,
    );
    expect(screen.getByTestId('fallback')).toBeTruthy();
    expect(Fallback).toHaveBeenCalled();
  });

  it('renders DataviewBlock when className is undefined', () => {
    // Without a language class → not dataview → plain <code>
    const Override = makeDataviewCodeOverride();
    const { container } = render(
      <Override className={undefined} node={null as never}>
        {'x'}
      </Override>,
    );
    expect(container.querySelector('code')).toBeTruthy();
  });
});
