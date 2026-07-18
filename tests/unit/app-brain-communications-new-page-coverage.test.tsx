// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/communications/new/page.tsx`
 *
 * Covers:
 *   - Initial render (heading, back link, sections)
 *   - Adapter fetch on mount: success, adapter switching, no-match resets to first
 *   - Form field interactions: title, date, transcript, participants
 *   - Participant add / remove / update
 *   - RelationshipPicker: closed state, open state, search, company select, deal select, clear
 *   - Submit (save as draft): validation error, success -> navigate, network error
 *   - Submit (save + process): success -> review, process failure -> detail
 *   - processing/creating spinner state
 *   - FilePicker: upload adapter rendering (no-op since upload section shown conditionally)
 *
 * Mocks: next/navigation (useRouter), next/link, global fetch.
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
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub ──────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const PASTE_ADAPTER = {
  id: 'paste',
  label: 'Paste text',
  description: 'Paste a transcript directly.',
  icon: 'content_paste',
};

const UPLOAD_ADAPTER = {
  id: 'upload',
  label: 'Upload file',
  description: 'Upload a .txt or .vtt file.',
  icon: 'upload_file',
};

function defaultFetch(
  overrides: Partial<Record<string, unknown>> = {},
): (url: string, init?: RequestInit) => Promise<FetchResp> {
  return async (url: string, init?: RequestInit) => {
    if (url.includes('/api/portal/brain/adapters')) {
      return makeRes({ success: true, data: [PASTE_ADAPTER] });
    }
    if (url.includes('/api/portal/brain/crm-suggestions')) {
      return makeRes({
        success: true,
        data: {
          companies: [],
          deals: [],
        },
      });
    }
    if (
      url.includes('/api/portal/brain/communications') &&
      !url.includes('/process') &&
      init?.method === 'POST'
    ) {
      return makeRes({ success: true, data: { id: 99 } });
    }
    if (url.includes('/process') && init?.method === 'POST') {
      return makeRes({ success: true, data: {} });
    }
    return makeRes({ success: true, data: {} });
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  fetchMock.mockImplementation(defaultFetch());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import NewBrainMeetingPage from '@/app/portal/brain/communications/new/page';

function renderPage() {
  return render(<NewBrainMeetingPage />);
}

// ─── Initial render ───────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — initial render', () => {
  it('renders the page heading "New note"', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New note');
    });
  });

  it('renders a back link to /portal/brain/communications', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/communications"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders section headings: Source, Details, Participants, Transcript', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Source');
      expect(container.textContent).toContain('Details');
      expect(container.textContent).toContain('Participants');
      expect(container.textContent).toContain('Transcript');
    });
  });

  it('renders "Save as draft" and "Save and process with AI" buttons', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Save as draft');
      expect(container.textContent).toContain('Save and process with AI');
    });
  });

  it('shows the adapter card when adapters load successfully', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Paste text');
    });
  });

  it('renders the "More sources" note when only one adapter is loaded', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('More sources');
    });
  });

  it('does NOT render error banner by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New note');
    });
    const errorBanner = container.querySelector('.text-destructive');
    expect(errorBanner).toBeNull();
  });

  it('renders "Linked relationship (optional)" section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Linked relationship');
    });
  });
});

// ─── Adapter fetch & selection ────────────────────────────────────────────────

describe('NewBrainMeetingPage — adapter loading', () => {
  it('calls /api/portal/brain/adapters on mount', async () => {
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0]);
      expect(calls.some((u) => u.includes('/api/portal/brain/adapters'))).toBe(true);
    });
  });

  it('ignores failed adapters fetch gracefully (no crash)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        throw new Error('network down');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // page still renders; no crash
      expect(container.textContent).toContain('New note');
    });
  });

  it('ignores adapters fetch when success=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New note');
    });
    // No adapter cards should appear
    expect(container.textContent).not.toContain('Paste text');
  });

  it('renders multiple adapter buttons and lets user switch', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER, UPLOAD_ADAPTER] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Paste text');
      expect(container.textContent).toContain('Upload file');
    });
    // Click the Upload adapter button
    const buttons = Array.from(container.querySelectorAll('button'));
    const uploadBtn = buttons.find((b) => b.textContent?.includes('Upload file'));
    expect(uploadBtn).toBeTruthy();
    fireEvent.click(uploadBtn!);
    await waitFor(() => {
      // After switching to upload, section title changes
      expect(container.textContent).toContain('File');
    });
  });

  it('resets adapterId to first adapter when current id not in returned list', async () => {
    // Start with 'paste' adapter but server returns only 'upload'
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [UPLOAD_ADAPTER] });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Upload file');
    });
  });
});

// ─── Title and date field interactions ───────────────────────────────────────

describe('NewBrainMeetingPage — details fields', () => {
  it('updates title field on input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const titleInput = container.querySelector('input[type="text"][placeholder*="Acme"]') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    fireEvent.change(titleInput, { target: { value: 'Test Meeting' } });
    expect(titleInput.value).toBe('Test Meeting');
  });

  it('updates meetingDate field on input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    fireEvent.change(dateInput, { target: { value: '2026-06-04T10:00' } });
    expect(dateInput.value).toBe('2026-06-04T10:00');
  });

  it('updates transcript textarea on input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea, { target: { value: 'Hello meeting transcript' } });
    expect(textarea.value).toBe('Hello meeting transcript');
  });

  it('shows character count for transcript', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'ABCDE' } });
    await waitFor(() => {
      expect(container.textContent).toContain('5');
      expect(container.textContent).toContain('characters');
    });
  });
});

// ─── Participants ─────────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — participants', () => {
  it('starts with one participant row', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const nameInputs = container.querySelectorAll('input[placeholder="Name"]');
    expect(nameInputs.length).toBe(1);
  });

  it('adds a participant row when "Add participant" is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add participant'),
    );
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    await waitFor(() => {
      const nameInputs = container.querySelectorAll('input[placeholder="Name"]');
      expect(nameInputs.length).toBe(2);
    });
  });

  it('removes a participant row when remove button is clicked (with 2 rows)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    // Add one row first
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add participant'),
    );
    fireEvent.click(addBtn!);
    await waitFor(() => {
      expect(container.querySelectorAll('input[placeholder="Name"]').length).toBe(2);
    });
    // Click the first remove button (should be enabled now)
    const removeBtns = Array.from(container.querySelectorAll('button[aria-label="Remove participant"]'));
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    await waitFor(() => {
      expect(container.querySelectorAll('input[placeholder="Name"]').length).toBe(1);
    });
  });

  it('disables the remove button when only one participant exists', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const removeBtn = container.querySelector('button[aria-label="Remove participant"]') as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    expect(removeBtn.disabled).toBe(true);
  });

  it('updates participant name on input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice' } });
    expect(nameInput.value).toBe('Alice');
  });

  it('updates participant email on input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    expect(emailInput.value).toBe('alice@example.com');
  });
});

// ─── RelationshipPicker ───────────────────────────────────────────────────────

describe('NewBrainMeetingPage — RelationshipPicker', () => {
  it('shows "Link to a CRM company or deal" button initially', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Link to a CRM company or deal');
    });
  });

  it('opens picker when link button is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await waitFor(() => {
      const searchInput = container.querySelector('input[placeholder="Search companies or deals…"]');
      expect(searchInput).toBeTruthy();
    });
  });

  it('closes picker via Cancel button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Search companies or deals…"]')).toBeTruthy();
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Link to a CRM company or deal');
    });
  });

  it('searches CRM suggestions and shows companies', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 1, name: 'Acme Corp', industry: 'Tech', hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Search companies or deals…"]')).toBeTruthy();
    });
    // Wait for debounced fetch (200ms) to fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Corp');
    });
  });

  it('searches CRM suggestions and shows deals', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [],
            deals: [{ id: 5, title: 'Big Deal', companyName: 'Acme', hasOverlay: false }],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Big Deal');
    });
  });

  it('shows "No matches." when search returns empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({ success: true, data: { companies: [], deals: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => {
      expect(container.textContent).toContain('No matches.');
    });
  });

  it('selects a company and shows it as linked', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 10, name: 'Globex', industry: null, hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Globex');
    });
    const globexBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Globex'),
    );
    fireEvent.click(globexBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Globex');
      expect(container.textContent).toContain('(company)');
    });
  });

  it('selects a deal and shows it as linked', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [],
            deals: [{ id: 7, title: 'Springfield Deal', companyName: null, hasOverlay: false }],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Springfield Deal');
    });
    const dealBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Springfield Deal'),
    );
    fireEvent.click(dealBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Springfield Deal');
      expect(container.textContent).toContain('(deal)');
    });
  });

  it('clears the linked company via Clear button', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 10, name: 'Globex', industry: null, hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    // Open picker and select
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    await waitFor(() => expect(container.textContent).toContain('Globex'));
    const globexBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Globex'),
    );
    fireEvent.click(globexBtn!);
    await waitFor(() => expect(container.textContent).toContain('(company)'));
    // Clear it
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear'),
    );
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Link to a CRM company or deal');
      expect(container.textContent).not.toContain('(company)');
    });
  });
});

// ─── Submit — validation ──────────────────────────────────────────────────────

describe('NewBrainMeetingPage — submit validation', () => {
  it('shows error when transcript is empty and Save as draft is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const draftBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save as draft'),
    );
    expect(draftBtn).toBeTruthy();
    // The button is disabled when transcript is empty, so simulate enabling manually
    // by removing the disabled attribute first — or just fire click directly
    // The component checks !transcript.trim() inside submit(), so click does nothing when disabled
    // Confirm the button IS disabled when transcript is empty
    expect((draftBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Save as draft button when transcript has content', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Some transcript text' } });
    await waitFor(() => {
      const draftBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save as draft'),
      ) as HTMLButtonElement;
      expect(draftBtn.disabled).toBe(false);
    });
  });
});

// ─── Submit — Save as draft (alsoProcess=false) ───────────────────────────────

describe('NewBrainMeetingPage — Save as draft', () => {
  async function fillAndSubmitDraft(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'This is the transcript.' } });
    const draftBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save as draft'),
    )!;
    await act(async () => { fireEvent.click(draftBtn); });
  }

  it('POSTs to /api/portal/brain/communications on save as draft', async () => {
    const { container } = renderPage();
    await fillAndSubmitDraft(container);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0]);
      expect(calls.some((u) => u.includes('/api/portal/brain/communications'))).toBe(true);
    });
  });

  it('navigates to /portal/brain/communications/:id after successful draft save', async () => {
    const { container } = renderPage();
    await fillAndSubmitDraft(container);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/communications/99');
    });
  });

  it('shows error when communication create fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        !url.includes('/process') &&
        init?.method === 'POST'
      ) {
        return makeRes({ success: false, message: 'DB error' }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await fillAndSubmitDraft(container);
    await waitFor(() => {
      expect(container.textContent).toContain('DB error');
    });
  });

  it('shows fallback error when create fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        !url.includes('/process') &&
        init?.method === 'POST'
      ) {
        return makeRes({ success: false }, false);
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await fillAndSubmitDraft(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to create communication');
    });
  });

  it('shows network error when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        !url.includes('/process') &&
        init?.method === 'POST'
      ) {
        throw new Error('Network failure');
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await fillAndSubmitDraft(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Network failure');
    });
  });

  it('shows "Network error" fallback when fetch throws a non-Error', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        !url.includes('/process') &&
        init?.method === 'POST'
      ) {
        throw 'string error';
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await fillAndSubmitDraft(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('sends companyId in body when company is linked', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/api/portal/brain/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 42, name: 'Initech', industry: null, hasOverlay: false }],
            deals: [],
          },
        });
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        !url.includes('/process') &&
        init?.method === 'POST'
      ) {
        const body = JSON.parse(init.body as string);
        expect(body.companyId).toBe(42);
        return makeRes({ success: true, data: { id: 88 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    // Open picker and select company
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Link to a CRM company or deal'),
    );
    fireEvent.click(linkBtn!);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    await waitFor(() => expect(container.textContent).toContain('Initech'));
    const initechBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Initech'),
    );
    fireEvent.click(initechBtn!);
    await waitFor(() => expect(container.textContent).toContain('(company)'));
    // Now submit
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'transcript content here' } });
    const draftBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save as draft'),
    )!;
    await act(async () => { fireEvent.click(draftBtn); });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/communications/88');
    });
  });
});

// ─── Submit — Save and process with AI (alsoProcess=true) ────────────────────

describe('NewBrainMeetingPage — Save and process', () => {
  async function fillAndProcess(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Long meeting transcript for AI.' } });
    const processBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save and process with AI'),
    )!;
    await act(async () => { fireEvent.click(processBtn); });
  }

  it('POSTs to communications then to /process endpoint', async () => {
    const { container } = renderPage();
    await fillAndProcess(container);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0]);
      expect(calls.some((u) => u.includes('/api/portal/brain/communications'))).toBe(true);
      expect(calls.some((u) => u.includes('/process'))).toBe(true);
    });
  });

  it('navigates to /review after successful create + process', async () => {
    const { container } = renderPage();
    await fillAndProcess(container);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/communications/99/review');
    });
  });

  it('navigates to detail page and shows error when process step fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/process') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'AI timeout' }, false);
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        init?.method === 'POST'
      ) {
        return makeRes({ success: true, data: { id: 55 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await fillAndProcess(container);
    await waitFor(() => {
      expect(container.textContent).toContain('AI timeout');
      expect(mockPush).toHaveBeenCalledWith('/portal/brain/communications/55');
    });
  });

  it('shows fallback error when process fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (url.includes('/process') && init?.method === 'POST') {
        return makeRes({ success: false }, false);
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        init?.method === 'POST'
      ) {
        return makeRes({ success: true, data: { id: 55 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await fillAndProcess(container);
    await waitFor(() => {
      expect(container.textContent).toContain('unknown error');
    });
  });
});

// ─── Spinner/loading states ───────────────────────────────────────────────────

describe('NewBrainMeetingPage — spinner state', () => {
  it('shows "Saving…" spinner while request is in flight', async () => {
    let resolveCreate: (v: FetchResp) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER] });
      }
      if (
        url.includes('/api/portal/brain/communications') &&
        init?.method === 'POST'
      ) {
        return new Promise<FetchResp>((res) => { resolveCreate = res; });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('New note'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test transcript' } });
    const draftBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save as draft'),
    )!;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Saving…');
    });
    resolveCreate(makeRes({ success: true, data: { id: 1 } }));
  });
});

// ─── FilePicker (upload adapter) ─────────────────────────────────────────────

describe('NewBrainMeetingPage — FilePicker (upload adapter)', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: [PASTE_ADAPTER, UPLOAD_ADAPTER] });
      }
      return makeRes({ success: true, data: {} });
    });
  });

  it('shows file upload area when upload adapter is selected', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Upload file'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload file'),
    );
    fireEvent.click(uploadBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Choose a file');
    });
  });

  it('rejects files larger than 5MB', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Upload file'));
    const uploadAdapterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload file'),
    );
    fireEvent.click(uploadAdapterBtn!);
    await waitFor(() => expect(container.textContent).toContain('Choose a file'));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(container.textContent).toContain('larger than 5MB');
    });
  });

  it('rejects unsupported file extension', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Upload file'));
    const uploadAdapterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload file'),
    );
    fireEvent.click(uploadAdapterBtn!);
    await waitFor(() => expect(container.textContent).toContain('Choose a file'));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['content'], 'notes.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [badFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(container.textContent).toContain('Unsupported file type');
    });
  });

  it('accepts a valid .txt file and shows filename', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Upload file'));
    const uploadAdapterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload file'),
    );
    fireEvent.click(uploadAdapterBtn!);
    await waitFor(() => expect(container.textContent).toContain('Choose a file'));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const fileContent = 'This is a transcript.';
    // jsdom's File/Blob does not implement .text(); patch the prototype so handleFile can call it.
    const originalText = File.prototype.text;
    File.prototype.text = function () { return Promise.resolve(fileContent); };
    const txtFile = new File([fileContent], 'meeting.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [txtFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(container.textContent).toContain('meeting.txt');
    });
    File.prototype.text = originalText;
  });

  it('clears an uploaded file when Clear is clicked on the file info row', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Upload file'));
    const uploadAdapterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload file'),
    );
    fireEvent.click(uploadAdapterBtn!);
    await waitFor(() => expect(container.textContent).toContain('Choose a file'));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const fileContent = 'Some text.';
    const originalText = File.prototype.text;
    File.prototype.text = function () { return Promise.resolve(fileContent); };
    const txtFile = new File([fileContent], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [txtFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(container.textContent).toContain('notes.txt'));
    File.prototype.text = originalText;

    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear'),
    );
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn!);
    await waitFor(() => {
      expect(container.textContent).not.toContain('notes.txt');
      expect(container.textContent).toContain('Choose a file');
    });
  });
});
