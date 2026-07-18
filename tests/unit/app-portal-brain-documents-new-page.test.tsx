// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/documents/new/page.tsx`
 *
 * 'use client' create form — rendered directly with @testing-library/react.
 * Covers:
 *  - Renders form fields: title, category, confidentiality, owner, topics, note-source
 *  - Breadcrumb "Documents" back link rendered
 *  - Cancel link points to /portal/brain/documents
 *  - Category dropdown: all six options present
 *  - Confidentiality dropdown: standard/restricted/confidential
 *  - Owner dropdown populated from mentionable-users API
 *  - Owner dropdown defaults to "Unassigned"
 *  - mentionable-users failure is non-fatal (form still renders)
 *  - Validation: empty title with no note selected shows error
 *  - Submit success (plain create path): fetch POST, redirect to edit page
 *  - Submit error (plain create path): shows error message from API
 *  - Submit network error: shows Error.message
 *  - "Seed from note" checkbox: hidden section shown when checked
 *  - Note search: renders search input when seed-section open
 *  - Note search results list rendered
 *  - Note list "No notes found." when empty result
 *  - Picking a note item selects it (highlighted)
 *  - Promote-from-note path: POST to promote-from-note endpoint on submit
 *  - Promote-from-note success: redirect to edit page
 *  - Promote-from-note error: shows error message
 *  - ?source=note param pre-opens note section
 *  - Submitting spinner shown while submitting
 *  - TopicPicker stub renders
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ─────────────────────────────────────

const pushMock = vi.fn();
const replaceMock = vi.fn();

let searchParamsMap: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsMap[key] ?? null,
    toString: () => new URLSearchParams(searchParamsMap).toString(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// TopicPicker stub — renders a labelled div so we can assert it's present.
vi.mock('@/components/brain/TopicPicker', () => ({
  default: ({ placeholder }: any) =>
    React.createElement('div', { 'data-testid': 'topic-picker' }, placeholder ?? 'TopicPicker'),
}));

// @/lib/brain/documents is only used for the BrainDocumentCategory type import
// (type-only, elided at runtime). No runtime stub needed.

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Default fetch handler ─────────────────────────────────────────────────

const defaultUsers = [
  { id: 1, name: 'Alice Owner' },
  { id: 2, name: 'Bob Owner' },
];

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/mentionable-users')) {
    return makeRes({ success: true, data: defaultUsers });
  }
  if (url.includes('/api/portal/brain/knowledge')) {
    return makeRes({ success: true, data: { items: [] } });
  }
  if (url.includes('/api/portal/brain/documents/promote-from-note')) {
    return makeRes({ success: true, data: { document: { id: 42 } } });
  }
  if (url.includes('/api/portal/brain/documents')) {
    return makeRes({ success: true, data: { document: { id: 99 } } });
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  searchParamsMap = {};
  pushMock.mockReset();
  replaceMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────

import BrainDocumentNewPage from '@/app/portal/brain/documents/new/page';

function renderPage() {
  return render(React.createElement(BrainDocumentNewPage));
}

// ─── Basic render ──────────────────────────────────────────────────────────

describe('BrainDocumentNewPage — basic render', () => {
  it('renders "New document" heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New document');
    });
  });

  it('renders breadcrumb "Documents" back link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders Cancel link pointing to /portal/brain/documents', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const links = Array.from(container.querySelectorAll('a[href="/portal/brain/documents"]'));
      expect(links.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Title input', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('#doc-title') as HTMLInputElement;
      expect(input).toBeTruthy();
    });
  });

  it('renders TopicPicker stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="topic-picker"]')).toBeTruthy();
    });
  });

  it('renders "Create & open editor" submit button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Create');
    });
  });

  it('renders description sub-text about promoting notes', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('promote an existing note');
    });
  });
});

// ─── Category dropdown ─────────────────────────────────────────────────────

describe('BrainDocumentNewPage — category dropdown', () => {
  it('renders category select with id="doc-cat"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-cat') as HTMLSelectElement;
      expect(select).toBeTruthy();
    });
  });

  it('populates all six category options', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-cat') as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain('sop');
      expect(values).toContain('policy');
      expect(values).toContain('guide');
      expect(values).toContain('reference');
      expect(values).toContain('announcement');
      expect(values).toContain('other');
    });
  });

  it('defaults to "reference" category', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-cat') as HTMLSelectElement;
      expect(select.value).toBe('reference');
    });
  });

  it('changing category updates select value', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#doc-cat')).toBeTruthy();
    });
    const select = container.querySelector('#doc-cat') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'sop' } });
    expect(select.value).toBe('sop');
  });

  it('shows SOP label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('SOP');
    });
  });
});

// ─── Confidentiality dropdown ──────────────────────────────────────────────

describe('BrainDocumentNewPage — confidentiality dropdown', () => {
  it('renders confidentiality select with id="doc-conf"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-conf') as HTMLSelectElement;
      expect(select).toBeTruthy();
    });
  });

  it('has standard, restricted, confidential options', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-conf') as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain('standard');
      expect(values).toContain('restricted');
      expect(values).toContain('confidential');
    });
  });

  it('defaults to "standard"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-conf') as HTMLSelectElement;
      expect(select.value).toBe('standard');
    });
  });

  it('changing confidentiality updates select', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('#doc-conf')).toBeTruthy());
    const select = container.querySelector('#doc-conf') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'confidential' } });
    expect(select.value).toBe('confidential');
  });
});

// ─── Owner dropdown ────────────────────────────────────────────────────────

describe('BrainDocumentNewPage — owner dropdown', () => {
  it('renders owner select with id="doc-owner"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('#doc-owner') as HTMLSelectElement;
      expect(select).toBeTruthy();
    });
  });

  it('shows "Unassigned" default option', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Unassigned');
    });
  });

  it('populates owner options from mentionable-users API', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Owner');
      expect(container.textContent).toContain('Bob Owner');
    });
  });

  it('fetches mentionable-users on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/mentionable-users'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('shows "User #N" fallback when user has no name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: [{ id: 5, name: null }] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #5');
    });
  });

  it('mentionable-users failure is non-fatal (form still renders)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        throw new Error('users endpoint down');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New document');
    });
  });

  it('mentionable-users non-success response is non-fatal', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: false }, true);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New document');
    });
  });
});

// ─── Validation ────────────────────────────────────────────────────────────

describe('BrainDocumentNewPage — validation', () => {
  it('shows validation error when title is empty and no note picked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Title is required');
    });
  });

  it('does not call fetch when validation fails', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    fetchMock.mockClear();
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(container.textContent).toContain('Title is required'));
    const docPostCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/api/portal/brain/documents') && c[1]?.method === 'POST',
    );
    expect(docPostCalls.length).toBe(0);
  });
});

// ─── Submit — plain create path ────────────────────────────────────────────

describe('BrainDocumentNewPage — plain create submit', () => {
  async function fillAndSubmit(container: Element) {
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My New Doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
  }

  it('POSTs to /api/portal/brain/documents on valid submit', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await fillAndSubmit(container);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes('/api/portal/brain/documents') &&
          !String(c[0]).includes('promote-from-note') &&
          c[1]?.method === 'POST',
      );
      expect(call).toBeTruthy();
    });
  });

  it('redirects to edit page on success', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await fillAndSubmit(container);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/documents/99/edit');
    });
  });

  it('sends title in POST body', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await fillAndSubmit(container);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes('/api/portal/brain/documents') &&
          !String(c[0]).includes('promote-from-note') &&
          c[1]?.method === 'POST',
      );
      const body = JSON.parse(String(call![1]?.body));
      expect(body.title).toBe('My New Doc');
    });
  });

  it('shows error message when API returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (
        url.includes('/api/portal/brain/documents') &&
        !url.includes('promote-from-note')
      ) {
        return makeRes({ success: false, message: 'Create failed.' }, false, 500);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Failing doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Create failed.');
    });
  });

  it('shows fallback error when API !ok with no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (
        url.includes('/api/portal/brain/documents') &&
        !url.includes('promote-from-note')
      ) {
        return makeRes({ success: false }, false, 500);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Failing doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Create failed');
    });
  });

  it('shows Error.message on network throw', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (
        url.includes('/api/portal/brain/documents') &&
        !url.includes('promote-from-note')
      ) {
        throw new Error('Network offline');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Failing doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Network offline');
    });
  });

  it('shows "Network error" for non-Error throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (
        url.includes('/api/portal/brain/documents') &&
        !url.includes('promote-from-note')
      ) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain string error';
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Failing doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Source-note section ───────────────────────────────────────────────────

describe('BrainDocumentNewPage — source-note section', () => {
  it('renders "Seed this document from an existing note" checkbox label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Seed this document from an existing note');
    });
  });

  it('note search section is hidden by default', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    // note search input only appears after checking the box
    const noteSearchInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder?.toLowerCase().includes('search notes'),
    );
    expect(noteSearchInput).toBeUndefined();
  });

  it('checking the "Seed from note" checkbox reveals the note search section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Seed this document'));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      const noteSearchInput = Array.from(container.querySelectorAll('input')).find(
        (i) => i.placeholder?.toLowerCase().includes('search notes'),
      );
      expect(noteSearchInput).toBeTruthy();
    });
  });

  it('unchecking the box hides the note section again', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Seed this document'));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder*="Search notes"]') ??
        Array.from(container.querySelectorAll('input')).find(
          (i) => i.placeholder?.toLowerCase().includes('search notes'),
        ),
      ).toBeTruthy();
    });
    // uncheck
    fireEvent.click(checkbox);
    await waitFor(() => {
      const noteSearchInput = Array.from(container.querySelectorAll('input')).find(
        (i) => i.placeholder?.toLowerCase().includes('search notes'),
      );
      expect(noteSearchInput).toBeUndefined();
    });
  });

  it('opens note section when ?source=note is in URL', async () => {
    searchParamsMap = { source: 'note' };
    const { container } = renderPage();
    await waitFor(() => {
      const noteSearchInput = Array.from(container.querySelectorAll('input')).find(
        (i) => i.placeholder?.toLowerCase().includes('search notes'),
      );
      expect(noteSearchInput).toBeTruthy();
    });
  });

  it('fetches notes on mount when ?source=note', async () => {
    searchParamsMap = { source: 'note' };
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/brain/knowledge'),
      );
      expect(call).toBeTruthy();
    });
  });
});

// ─── Note search results ───────────────────────────────────────────────────

describe('BrainDocumentNewPage — note search results', () => {
  async function openNoteSection(container: Element) {
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      const noteSearchInput = Array.from(container.querySelectorAll('input')).find(
        (i) => i.placeholder?.toLowerCase().includes('search notes'),
      );
      expect(noteSearchInput).toBeTruthy();
    });
  }

  it('shows "No notes found." when knowledge API returns empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openNoteSection(container);
    await waitFor(() => {
      expect(container.textContent).toContain('No notes found');
    });
  });

  it('renders note options returned by knowledge API', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (url.includes('/api/portal/brain/knowledge')) {
        return makeRes({
          success: true,
          data: {
            items: [
              { id: 10, title: 'Note Alpha' },
              { id: 11, title: 'Note Beta' },
            ],
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openNoteSection(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Note Alpha');
      expect(container.textContent).toContain('Note Beta');
    });
  });

  it('clicking a note item marks it as selected', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (url.includes('/api/portal/brain/knowledge')) {
        return makeRes({
          success: true,
          data: { items: [{ id: 10, title: 'Note Alpha' }] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openNoteSection(container);
    await waitFor(() => expect(container.textContent).toContain('Note Alpha'));
    const noteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Note Alpha'),
    ) as HTMLButtonElement;
    fireEvent.click(noteBtn);
    // After click, the button should have the selected styling class
    expect(noteBtn.className).toContain('bg-primary');
  });

  it('typing in note search box triggers a fetch', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openNoteSection(container);
    vi.useFakeTimers();
    const noteSearchInput = Array.from(container.querySelectorAll('input')).find(
      (i) => i.placeholder?.toLowerCase().includes('search notes'),
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(noteSearchInput, { target: { value: 'onboarding' } });
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).includes('/api/portal/brain/knowledge') &&
          String(c[0]).includes('search=onboarding'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('shows "Note #N" fallback for notes with empty title', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (url.includes('/api/portal/brain/knowledge')) {
        return makeRes({
          success: true,
          data: { items: [{ id: 77, title: '' }] },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openNoteSection(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Note #77');
    });
  });
});

// ─── Promote-from-note submit path ────────────────────────────────────────

describe('BrainDocumentNewPage — promote-from-note submit', () => {
  async function openAndPickNote(container: Element) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (url.includes('/api/portal/brain/knowledge')) {
        return makeRes({
          success: true,
          data: { items: [{ id: 20, title: 'Source Note' }] },
        });
      }
      if (url.includes('/api/portal/brain/documents/promote-from-note')) {
        return makeRes({ success: true, data: { document: { id: 42 } } });
      }
      return defaultFetch(url);
    });

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(container.textContent).toContain('Source Note'));
    const noteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Source Note'),
    ) as HTMLButtonElement;
    fireEvent.click(noteBtn);
  }

  it('POSTs to promote-from-note endpoint when note is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openAndPickNote(container);

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('promote-from-note') && c[1]?.method === 'POST',
      );
      expect(call).toBeTruthy();
    });
  });

  it('redirects to edit page with docId from promote response', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openAndPickNote(container);

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/documents/42/edit');
    });
  });

  it('shows error when promote-from-note fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (url.includes('/api/portal/brain/knowledge')) {
        return makeRes({
          success: true,
          data: { items: [{ id: 20, title: 'Source Note' }] },
        });
      }
      if (url.includes('promote-from-note')) {
        return makeRes({ success: false, message: 'Promote failed.' }, false);
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(container.textContent).toContain('Source Note'));
    const noteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Source Note'),
    ) as HTMLButtonElement;
    fireEvent.click(noteBtn);
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Promote failed.');
    });
  });

  it('sends noteId and category in promote-from-note body', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    await openAndPickNote(container);

    const catSelect = container.querySelector('#doc-cat') as HTMLSelectElement;
    fireEvent.change(catSelect, { target: { value: 'guide' } });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('promote-from-note') && c[1]?.method === 'POST',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call![1]?.body));
      expect(body.noteId).toBe(20);
      expect(body.category).toBe('guide');
    });
  });
});

// ─── Submitting state ──────────────────────────────────────────────────────

describe('BrainDocumentNewPage — submitting state', () => {
  it('shows "Creating…" text while submitting', async () => {
    // Make the POST hang so we can observe the submitting state
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (
        url.includes('/api/portal/brain/documents') &&
        !url.includes('promote-from-note')
      ) {
        return new Promise(() => {});
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Pending doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Creating');
    });
  });

  it('submit button is disabled while submitting', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/mentionable-users')) {
        return makeRes({ success: true, data: defaultUsers });
      }
      if (
        url.includes('/api/portal/brain/documents') &&
        !url.includes('promote-from-note')
      ) {
        return new Promise(() => {});
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New document'));
    const titleInput = container.querySelector('#doc-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Pending doc' } });
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
    });
    await waitFor(() => {
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });
  });
});
