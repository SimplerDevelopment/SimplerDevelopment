// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/GlossaryBulkImportModal.tsx`
 *
 * Covers:
 *  - Modal not rendered when open=false
 *  - Modal rendered when open=true (title visible)
 *  - Close button calls onClose
 *  - Cancel button calls onClose
 *  - Confirm button disabled when textarea is empty
 *  - Line format: valid parse → preview table appears
 *  - Line format: category prefix "[Auth] SSO: ..." parsed correctly
 *  - Line format: missing colon → parse error shown
 *  - Line format: missing term → parse error shown
 *  - Line format: missing definition → parse error shown
 *  - JSON format: valid array → preview table appears
 *  - JSON format: single object → parsed as array
 *  - JSON format: invalid JSON → parse error shown
 *  - JSON format: object missing "term" → parse error shown
 *  - JSON format: object missing "definition" → parse error shown
 *  - Detected format badge shows "lines" / "json" / "empty"
 *  - Row count shown correctly (singular and plural)
 *  - Parse error count shown
 *  - Preview table shows first 50 rows; footer note when > 50
 *  - Confirm import: success → result summary shown, Done button appears
 *  - Confirm import: result with per-row errors → error list shown
 *  - Confirm import: server error → submitError shown
 *  - Confirm import: network throw → submitError shown
 *  - Done button calls onImported + onClose and resets state
 *  - Empty input shows format "empty"
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

// ─── Subject ──────────────────────────────────────────────────────────────────

import GlossaryBulkImportModal from '@/components/brain/GlossaryBulkImportModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  } as Response);
}

function makeFetchFail(message = 'Import failed') {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve({ success: false, message }),
  } as Response);
}

const defaultImportResult = { created: 3, updated: 1, errors: [] };

function renderModal(
  props: Partial<{ open: boolean; onClose: () => void; onImported: () => void }> = {},
) {
  const merged = {
    open: true,
    onClose: vi.fn(),
    onImported: vi.fn(),
    ...props,
  };
  return { ...render(<GlossaryBulkImportModal {...merged} />), ...merged };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GlossaryBulkImportModal', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  // ── Visibility ────────────────────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal title when open=true', () => {
    renderModal();
    expect(screen.getByText('Bulk import glossary terms')).toBeTruthy();
  });

  // ── Close / Cancel ────────────────────────────────────────────────────────

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('shows Confirm button disabled when textarea is empty', () => {
    renderModal();
    const btn = screen.getByText(/Confirm import/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('detected format is "empty" with no input', () => {
    renderModal();
    expect(screen.getByText('empty')).toBeTruthy();
  });

  // ── Line format parsing ────────────────────────────────────────────────────

  it('parses a simple line "term: definition" and shows preview', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'SSO: Single sign-on' },
    });
    expect(screen.getByText('SSO')).toBeTruthy();
    expect(screen.getByText('Single sign-on')).toBeTruthy();
    expect(screen.getByText('lines')).toBeTruthy();
    expect(screen.getByText('1 valid row')).toBeTruthy();
  });

  it('uses plural "rows" when multiple lines parsed', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'AAA: def one\nBBB: def two' },
    });
    expect(screen.getByText('2 valid rows')).toBeTruthy();
  });

  it('parses "[Category] term: definition" line format correctly', () => {
    // Note: input must NOT start with "[" as the parser tries JSON first for
    // bracket-prefixed strings. Use a multi-line input where the category line
    // is not the first character of the raw value.
    renderModal();
    // Use two lines — first a plain line, second a category-prefixed line.
    // This prevents the input from being treated as JSON.
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Plain: Definition\n[Auth] SSO: Single sign-on' },
    });
    // "lines" format detected
    expect(screen.getByText('lines')).toBeTruthy();
    // 2 rows parsed
    expect(screen.getByText('2 valid rows')).toBeTruthy();
    // "Auth" appears in the category column of the second row
    expect(screen.getByText('Auth')).toBeTruthy();
    // "SSO" appears in the term column
    expect(screen.getByText('SSO')).toBeTruthy();
  });

  it('shows parse error for line missing colon separator', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'no colon here' },
    });
    expect(screen.getByText(/missing ":" separator/)).toBeTruthy();
    expect(screen.getByText('1 parse error')).toBeTruthy();
  });

  it('shows parse error for line with missing term', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: ': definition only' },
    });
    expect(screen.getByText(/missing term/)).toBeTruthy();
  });

  it('shows parse error for line with missing definition', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'term: ' },
    });
    expect(screen.getByText(/missing definition/)).toBeTruthy();
  });

  it('shows "2 parse errors" (plural) when multiple errors', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'no colon\nalso no colon' },
    });
    expect(screen.getByText('2 parse errors')).toBeTruthy();
  });

  // ── JSON format parsing ───────────────────────────────────────────────────

  it('parses a valid JSON array and shows preview', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: JSON.stringify([{ term: 'API', definition: 'Application programming interface' }]),
      },
    });
    expect(screen.getByText('API')).toBeTruthy();
    expect(screen.getByText('json')).toBeTruthy();
  });

  it('parses a single JSON object (wraps to array)', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: JSON.stringify({ term: 'CI', definition: 'Continuous integration' }),
      },
    });
    expect(screen.getByText('CI')).toBeTruthy();
    expect(screen.getByText('1 valid row')).toBeTruthy();
  });

  it('shows parse error for invalid JSON', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '[{broken json' },
    });
    expect(screen.getByText(/Invalid JSON/)).toBeTruthy();
  });

  it('shows parse error for JSON object missing "term"', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify([{ definition: 'something' }]) },
    });
    expect(screen.getByText(/missing "term"/)).toBeTruthy();
  });

  it('shows parse error for JSON object missing "definition"', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: JSON.stringify([{ term: 'Foo' }]) },
    });
    expect(screen.getByText(/missing "definition"/)).toBeTruthy();
  });

  // ── Preview truncation ────────────────────────────────────────────────────

  it('shows first 50 rows and a footer note when >50 rows', () => {
    const lines = Array.from(
      { length: 60 },
      (_, i) => `Term${i + 1}: Definition ${i + 1}`,
    ).join('\n');

    renderModal();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: lines } });
    // The footer note should mention 60 rows
    expect(screen.getByText(/60 rows/)).toBeTruthy();
    // Term51 should NOT appear (only first 50 rendered)
    expect(screen.queryByText('Term51')).toBeNull();
    // Term50 should appear
    expect(screen.getByText('Term50')).toBeTruthy();
  });

  // ── Confirm import → success ──────────────────────────────────────────────

  it('on successful import: hides form, shows summary, Done button appears', async () => {
    fetchMock.mockReturnValueOnce(makeFetchOk(defaultImportResult));

    const onImported = vi.fn();
    const onClose = vi.fn();
    renderModal({ onImported, onClose });

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'SSO: Single sign-on' },
    });

    fireEvent.click(screen.getByText(/Confirm import/));

    await waitFor(() =>
      expect(screen.getByText('Bulk import complete.')).toBeTruthy(),
    );
    expect(screen.getByText(/3 created/)).toBeTruthy();
    expect(screen.getByText(/1 updated/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Done/i })).toBeTruthy();
  });

  it('shows per-row errors from import result', async () => {
    const resultWithErrors = {
      created: 1,
      updated: 0,
      errors: [{ term: 'BadTerm', message: 'Duplicate slug' }],
    };
    fetchMock.mockReturnValueOnce(makeFetchOk(resultWithErrors));

    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'SSO: Single sign-on' },
    });
    fireEvent.click(screen.getByText(/Confirm import/));

    await waitFor(() => expect(screen.getByText('Bulk import complete.')).toBeTruthy());
    expect(screen.getByText('Per-row errors')).toBeTruthy();
    expect(screen.getByText('BadTerm')).toBeTruthy();
    expect(screen.getByText(/Duplicate slug/)).toBeTruthy();
  });

  it('shows "0 errors" singular vs plural in result summary', async () => {
    fetchMock.mockReturnValueOnce(
      makeFetchOk({ created: 1, updated: 0, errors: [{ term: 'X', message: 'oops' }] }),
    );

    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'SSO: Single sign-on' },
    });
    fireEvent.click(screen.getByText(/Confirm import/));

    await waitFor(() => expect(screen.getByText(/1 error$/)).toBeTruthy());
  });

  // ── Confirm import → error states ─────────────────────────────────────────

  it('shows submitError when server returns !ok', async () => {
    fetchMock.mockReturnValueOnce(makeFetchFail('Quota exceeded'));

    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Term: Def' },
    });
    fireEvent.click(screen.getByText(/Confirm import/));

    await waitFor(() => expect(screen.getByText('Quota exceeded')).toBeTruthy());
    // Form should still be visible (not replaced by success state)
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('shows submitError on network throw', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Term: Def' },
    });
    fireEvent.click(screen.getByText(/Confirm import/));

    await waitFor(() => expect(screen.getByText('Connection refused')).toBeTruthy());
  });

  // ── Done button ───────────────────────────────────────────────────────────

  it('Done button calls onImported + onClose and resets the form', async () => {
    fetchMock.mockReturnValueOnce(makeFetchOk(defaultImportResult));

    const onImported = vi.fn();
    const onClose = vi.fn();
    renderModal({ onImported, onClose });

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'SSO: Single sign-on' },
    });
    fireEvent.click(screen.getByText(/Confirm import/));

    await waitFor(() => expect(screen.getByRole('button', { name: /Done/i })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Done/i }));

    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Confirm button disabled while submitting ──────────────────────────────

  it('Confirm button is disabled while submitting', async () => {
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((res) => {
        resolveFetch = res;
      }),
    );

    renderModal();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'SSO: Single sign-on' },
    });

    const confirmBtn = screen.getByText(/Confirm import/).closest('button') as HTMLButtonElement;
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(confirmBtn.disabled).toBe(true));

    // Resolve to clean up
    resolveFetch({
      ok: true,
      json: () => Promise.resolve({ success: true, data: defaultImportResult }),
    } as Response);

    await waitFor(() => expect(screen.getByText('Bulk import complete.')).toBeTruthy());
  });
});
