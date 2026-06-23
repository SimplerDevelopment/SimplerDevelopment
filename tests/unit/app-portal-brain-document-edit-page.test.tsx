// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/documents/[id]/edit/page.tsx`.
 *
 * Covers:
 *   - Loading state (spinner)
 *   - Load error (API !ok, API success=false, network throw, non-Error throw)
 *   - Happy-path render: nav breadcrumbs, heading, title field, category dropdown,
 *     summary field, change-notes textarea, editor, Publish button
 *   - Seed population: draft version > published version > blank fallback
 *   - Title/category controlled inputs
 *   - Debounced meta save (PATCH) triggered by title/category changes
 *   - Debounced version save (POST) triggered by body/summary/changeNotes changes
 *   - Publish flow: success (router.push), empty-body error message, generic error, throw
 *   - Publish button disabled when body is empty
 *   - Publishing spinner while in-flight
 *   - relativeTime helper (via saved indicator)
 *
 * Mocks: next/navigation, next/link, React.use (params), global fetch,
 *   DocumentMarkdownEditor (heavy child).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/documents/1/edit',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// DocumentMarkdownEditor: captures onChange and savedHint for testing.
let capturedMarkdownOnChange: ((v: string) => void) | null = null;

vi.mock('@/components/brain/DocumentMarkdownEditor', () => ({
  default: (props: {
    value: string;
    onChange: (v: string) => void;
    savedHint?: string;
    disabled?: boolean;
  }) => {
    capturedMarkdownOnChange = props.onChange;
    return React.createElement(
      'div',
      { 'data-testid': 'markdown-editor', 'data-saved-hint': props.savedHint ?? '' },
      [
        React.createElement('span', { key: 'value' }, props.value),
        props.savedHint
          ? React.createElement('span', { key: 'hint', 'data-testid': 'body-saved-hint' }, props.savedHint)
          : null,
      ],
    );
  },
}));

// React.use stub — same pattern used in playbook edit page tests.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | unknown) => {
      if (p && typeof (p as { _testId?: string })._testId === 'string') {
        return { id: (p as { _testId: string })._testId };
      }
      throw p;
    },
  };
});

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Data factories ───────────────────────────────────────────────────────────

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 10,
    title: 'My SOP',
    category: 'sop',
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    documentId: 1,
    body: '## Content',
    summary: 'A summary',
    changeNotes: 'Initial version',
    versionNumber: 1,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLoadResponse(overrides: {
  document?: Record<string, unknown>;
  currentDraftVersion?: Record<string, unknown> | null;
  currentPublishedVersion?: Record<string, unknown> | null;
} = {}) {
  return {
    success: true,
    data: {
      document: overrides.document ?? makeDocument(),
      currentDraftVersion: overrides.currentDraftVersion !== undefined
        ? overrides.currentDraftVersion
        : makeVersion({ status: 'draft', body: '## Draft', summary: 'draft summary', changeNotes: 'draft notes' }),
      currentPublishedVersion: overrides.currentPublishedVersion !== undefined
        ? overrides.currentPublishedVersion
        : makeVersion(),
    },
  };
}

// ─── Default fetch handler ────────────────────────────────────────────────────

function defaultFetch(url: string, init?: RequestInit): FetchResp {
  const method = (init as RequestInit | undefined)?.method;
  // POST publish (must come before load check — same base URL, different suffix)
  if (/\/publish$/.test(url) && method === 'POST') {
    return makeRes({ success: true });
  }
  // POST version
  if (/\/versions$/.test(url) && method === 'POST') {
    return makeRes({ success: true });
  }
  // PATCH document metadata
  if (/\/api\/portal\/brain\/documents\/\d+$/.test(url) && method === 'PATCH') {
    return makeRes({ success: true });
  }
  // Load document (GET with ?includeBody=true query string)
  if (/\/api\/portal\/brain\/documents\/\d+(\?|$)/.test(url) && !method) {
    return makeRes(makeLoadResponse());
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  capturedMarkdownOnChange = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  mockPush.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrainDocumentEditPage from '@/app/portal/brain/documents/[id]/edit/page';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParams(id: string): Promise<{ id: string }> & { _testId: string } {
  const p = Promise.resolve({ id }) as Promise<{ id: string }> & { _testId: string };
  p._testId = id;
  return p;
}

function renderPage(id = '1') {
  const params = makeParams(id);
  return render(React.createElement(BrainDocumentEditPage, { params }));
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('BrainDocumentEditPage — loading state', () => {
  it('shows loading spinner while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });

  it('shows progress_activity icon in loading state', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('progress_activity');
  });
});

// ─── Load error state ─────────────────────────────────────────────────────────

describe('BrainDocumentEditPage — load error state', () => {
  // Helper: match the document load URL (GET with ?includeBody=true)
  function isLoadUrl(url: string) {
    return /\/api\/portal\/brain\/documents\/\d+\?/.test(url);
  }

  it('shows error when API returns !ok with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        return makeRes({ success: false, message: 'Document not found' }, false);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Document not found');
    });
  });

  it('shows error when API returns ok=true but success=false', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        return makeRes({ success: false, message: 'DB error' }, true);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows error when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        throw new Error('network down');
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('shows "Network error" when a non-Error is thrown', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain string error';
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('renders error_outline icon in error state', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        return makeRes({ success: false, message: 'Gone' }, false);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error_outline');
    });
  });

  it('renders "Back to documents" link in error state', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        return makeRes({ success: false, message: 'Gone' }, false);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents"]');
      expect(link).toBeTruthy();
    });
  });

  it('shows error branch when success=false and message is falsy', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isLoadUrl(url)) {
        return makeRes({ success: false, message: null }, true);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      // loadError is set to '' from json.message, so !data branch shows "Not found"
      expect(container.textContent).toMatch(/not found|Couldn/i);
    });
  });
});

// ─── Happy-path render ────────────────────────────────────────────────────────

describe('BrainDocumentEditPage — happy-path render', () => {
  it('renders "Edit draft" heading after load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Edit draft');
    });
  });

  it('renders breadcrumb "Documents" link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders breadcrumb link to document detail page', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents/1"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders document title in breadcrumb', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('My SOP');
    });
  });

  it('renders title input with document title', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('My SOP');
    });
  });

  it('renders category dropdown with document category selected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-edit-cat') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.value).toBe('sop');
    });
  });

  it('renders all category options', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('SOP');
      expect(container.textContent).toContain('Policy');
      expect(container.textContent).toContain('Guide');
      expect(container.textContent).toContain('Reference');
      expect(container.textContent).toContain('Announcement');
      expect(container.textContent).toContain('Other');
    });
  });

  it('renders summary input populated from draft version', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-summary') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('draft summary');
    });
  });

  it('renders change-notes textarea populated from draft version', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const textarea = container.querySelector('#doc-edit-notes') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toBe('draft notes');
    });
  });

  it('renders DocumentMarkdownEditor with draft body', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editor = container.querySelector('[data-testid="markdown-editor"]');
      expect(editor).toBeTruthy();
      expect(container.textContent).toContain('## Draft');
    });
  });

  it('renders View button linking to document detail', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // There are two links to /portal/brain/documents/1 (breadcrumb + View button).
      // The View button is the one that contains "visibility" icon text and "View".
      const allLinks = Array.from(
        container.querySelectorAll('a[href="/portal/brain/documents/1"]'),
      ) as HTMLAnchorElement[];
      const viewLink = allLinks.find((l) => l.textContent?.includes('View'));
      expect(viewLink).toBeTruthy();
    });
  });

  it('renders Publish button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Publish'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders edit_note icon in heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('edit_note');
    });
  });
});

// ─── Seed population: draft vs published vs blank ─────────────────────────────

describe('BrainDocumentEditPage — seed population', () => {
  it('seeds body/summary/changeNotes from currentDraftVersion when available', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-summary') as HTMLInputElement;
      expect(input.value).toBe('draft summary');
    });
  });

  it('falls back to currentPublishedVersion when no draft version', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/documents\/\d+\?/.test(url)) {
        return makeRes({
          success: true,
          data: {
            document: makeDocument(),
            currentDraftVersion: null,
            currentPublishedVersion: makeVersion({
              body: '## Published',
              summary: 'pub summary',
              changeNotes: 'pub notes',
            }),
          },
        });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-summary') as HTMLInputElement;
      expect(input.value).toBe('pub summary');
    });
  });

  it('seeds blank fields when no draft and no published version', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/documents\/\d+\?/.test(url)) {
        return makeRes({
          success: true,
          data: {
            document: makeDocument(),
            currentDraftVersion: null,
            currentPublishedVersion: null,
          },
        });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-summary') as HTMLInputElement;
      expect(input.value).toBe('');
      const textarea = container.querySelector('#doc-edit-notes') as HTMLTextAreaElement;
      expect(textarea.value).toBe('');
    });
  });
});

// ─── Title input controlled behavior ─────────────────────────────────────────

describe('BrainDocumentEditPage — title input', () => {
  it('updates title field on change', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      expect(input.value).toBe('My SOP');
    });
    const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Title' } });
    expect(input.value).toBe('New Title');
  });

  it('category dropdown change updates selection', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-edit-cat') as HTMLSelectElement;
      expect(select.value).toBe('sop');
    });
    const select = container.querySelector('#doc-edit-cat') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'guide' } });
    expect(select.value).toBe('guide');
  });

  it('summary input updates on change', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#doc-edit-summary')).toBeTruthy();
    });
    const input = container.querySelector('#doc-edit-summary') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New summary' } });
    expect(input.value).toBe('New summary');
  });

  it('change-notes textarea updates on change', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#doc-edit-notes')).toBeTruthy();
    });
    const textarea = container.querySelector('#doc-edit-notes') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New notes' } });
    expect(textarea.value).toBe('New notes');
  });
});

// ─── Debounced meta save ──────────────────────────────────────────────────────

describe('BrainDocumentEditPage — debounced meta save (PATCH)', () => {
  it('PATCHes document after title change debounce fires', async () => {
    const { container } = renderPage();
    // Wait for the page to load
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      expect(input?.value).toBe('My SOP');
    });

    // Change title — this marks meta dirty and schedules 600ms debounce
    const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
    act(() => { fireEvent.change(input, { target: { value: 'Updated Title' } }); });

    // Wait up to 2s for the debounced PATCH to fire (debounce is 600ms)
    await waitFor(
      () => {
        const patchCalls = fetchMock.mock.calls.filter(
          ([u, i]) =>
            /\/api\/portal\/brain\/documents\/\d+$/.test(String(u)) &&
            (i as RequestInit)?.method === 'PATCH',
        );
        expect(patchCalls.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });
});

// ─── Debounced version save ───────────────────────────────────────────────────

describe('BrainDocumentEditPage — debounced version save (POST)', () => {
  it('POSTs version after body change debounce fires', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="markdown-editor"]')).toBeTruthy();
      expect(capturedMarkdownOnChange).toBeTruthy();
    });

    // Change body to something different from the seed — this marks version dirty
    act(() => { capturedMarkdownOnChange?.('## Completely new body content'); });

    // Wait up to 2s for the debounced POST to fire (debounce is 800ms)
    await waitFor(
      () => {
        const postCalls = fetchMock.mock.calls.filter(
          ([u, i]) => /\/versions$/.test(String(u)) && (i as RequestInit)?.method === 'POST',
        );
        expect(postCalls.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });
});

// ─── Publish button disabled when body empty ──────────────────────────────────

describe('BrainDocumentEditPage — publish button state', () => {
  it('Publish button is disabled when body is empty', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/documents\/\d+\?/.test(url)) {
        return makeRes({
          success: true,
          data: {
            document: makeDocument(),
            currentDraftVersion: makeVersion({ body: '' }),
            currentPublishedVersion: null,
          },
        });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Publish'),
      ) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(true);
    });
  });

  it('Publish button is enabled when body has content', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Publish'),
      ) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.disabled).toBe(false);
    });
  });
});

// ─── Publish flow ─────────────────────────────────────────────────────────────

// Helper: wait for Publish button to be enabled, then click it.
async function clickPublishButton(container: HTMLElement) {
  let publishBtn: HTMLButtonElement;
  await waitFor(() => {
    publishBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Publish') && !b.textContent?.includes('Publishing') && !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    expect(publishBtn).toBeTruthy();
  });
  await act(async () => { fireEvent.click(publishBtn!); });
}

describe('BrainDocumentEditPage — publish flow', () => {
  it('navigates to document detail on successful publish', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/publish$/.test(url) && (init as RequestInit | undefined)?.method === 'POST') {
        return makeRes({ success: true });
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await clickPublishButton(container);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/documents/1');
    });
  });

  it('shows "Add some content before publishing." for empty-body error from API', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/publish$/.test(url) && (init as RequestInit | undefined)?.method === 'POST') {
        return makeRes({ success: false, message: 'empty body — add content before publishing' }, false);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await clickPublishButton(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Add some content before publishing');
    });
  });

  it('shows generic error when publish API returns failure without empty-body message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/publish$/.test(url) && (init as RequestInit | undefined)?.method === 'POST') {
        return makeRes({ success: false, message: 'Server error occurred' }, false);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await clickPublishButton(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Server error occurred');
    });
  });

  it('shows "Publish failed." when publish fails with no message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/publish$/.test(url) && (init as RequestInit | undefined)?.method === 'POST') {
        return makeRes({ success: false, message: '' }, false);
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await clickPublishButton(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Publish failed.');
    });
  });

  it('shows error message when publish throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/publish$/.test(url) && (init as RequestInit | undefined)?.method === 'POST') {
        throw new Error('publish network error');
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await clickPublishButton(container);
    await waitFor(() => {
      expect(container.textContent).toContain('publish network error');
    });
  });

  it('shows Publishing… spinner while publish is in-flight', async () => {
    // Hold the publish request open so the spinner persists
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/publish$/.test(url) && (init as RequestInit | undefined)?.method === 'POST') {
        return new Promise<FetchResp>(() => {});
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    // Wait for the enabled Publish button then click without awaiting the result
    let publishBtn: HTMLButtonElement;
    await waitFor(() => {
      publishBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'publishPublish' ||
               (b.textContent?.includes('Publish') && !(b as HTMLButtonElement).disabled),
      ) as HTMLButtonElement;
      expect(publishBtn).toBeTruthy();
    });
    act(() => { fireEvent.click(publishBtn!); });
    await waitFor(() => {
      expect(container.textContent).toContain('Publishing…');
    });
  });
});

// ─── Saved indicators ─────────────────────────────────────────────────────────

describe('BrainDocumentEditPage — saved indicators', () => {
  it('shows "Saving…" indicator on title row while meta save is in-flight', async () => {
    // Hold the PATCH so savingTitle=true persists long enough to assert
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/brain\/documents\/\d+$/.test(String(url)) && (init as RequestInit)?.method === 'PATCH') {
        return new Promise<FetchResp>(() => {});
      }
      return defaultFetch(url, init);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      expect(input?.value).toBe('My SOP');
    });

    act(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Changed Title' } });
    });

    // Wait for debounce (600ms) + savingTitle to flip to true
    await waitFor(
      () => { expect(container.textContent).toContain('Saving'); },
      { timeout: 2000 },
    );
  });

  it('shows cloud_done saved indicator after successful meta save', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => defaultFetch(url, init));
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      expect(input?.value).toBe('My SOP');
    });

    act(() => {
      const input = container.querySelector('#doc-edit-title') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Saved Title' } });
    });

    // After successful PATCH, titleSavedAt is set and "Saved" / "cloud_done" appears
    await waitFor(
      () => { expect(container.textContent).toMatch(/Saved|cloud_done/); },
      { timeout: 2000 },
    );
  });
});

// ─── Body editor onChange ─────────────────────────────────────────────────────

describe('BrainDocumentEditPage — markdown editor', () => {
  it('markdown editor onChange updates body state', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(capturedMarkdownOnChange).toBeTruthy();
    });

    act(() => { capturedMarkdownOnChange?.('## New body'); });

    await waitFor(() => {
      expect(container.textContent).toContain('## New body');
    });
  });

  it('renders "Changes save automatically" hint text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Changes save automatically');
    });
  });
});

// ─── Subpath / id edge cases ──────────────────────────────────────────────────

describe('BrainDocumentEditPage — id handling', () => {
  it('fetches using the document id from params', async () => {
    renderPage('42');
    await waitFor(() => {
      const loadCalls = fetchMock.mock.calls.filter(
        ([u]) => String(u).includes('/documents/42'),
      );
      expect(loadCalls.length).toBeGreaterThan(0);
    });
  });
});
