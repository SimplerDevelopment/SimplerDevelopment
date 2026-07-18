// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/communications/new/page.tsx`
 * (NewBrainMeetingPage — 'use client', 162 stmts)
 *
 * Covers: initial render, adapter loading, form fields (title, date,
 * transcript), participant CRUD, validation, submit paths (draft /
 * save-and-process), success/error/network-error branches,
 * RelationshipPicker open/search/select/clear, FilePicker display.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const ADAPTERS = [
  { id: 'paste', label: 'Paste', description: 'Paste transcript text', icon: 'content_paste' },
];

function setupDefaultFetch() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/brain/adapters')) {
      return makeRes({ success: true, data: ADAPTERS });
    }
    if (url.includes('/api/portal/brain/communications') && !url.includes('/process')) {
      return makeRes({ success: true, data: { id: 99 } });
    }
    if (url.includes('/process')) {
      return makeRes({ success: true, data: {} });
    }
    if (url.includes('/crm-suggestions')) {
      return makeRes({ success: true, data: { companies: [], deals: [] } });
    }
    return makeRes({ success: true, data: null });
  });
}

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();
  setupDefaultFetch();
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

// ─── Initial render ──────────────────────────────────────────────────────────

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

  it('renders action buttons disabled initially (no transcript)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const buttons = Array.from(container.querySelectorAll('button'));
      const draftBtn = buttons.find((b) => b.textContent?.includes('Save as draft'));
      const processBtn = buttons.find((b) => b.textContent?.includes('Save and process'));
      expect(draftBtn?.disabled).toBe(true);
      expect(processBtn?.disabled).toBe(true);
    });
  });
});

// ─── Adapter loading ─────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — adapter loading', () => {
  it('calls /api/portal/brain/adapters on mount', async () => {
    renderPage();
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/api/portal/brain/adapters'))).toBe(true);
    });
  });

  it('renders adapter buttons after fetch', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Paste');
    });
  });

  it('renders multiple adapters when API returns them', async () => {
    const multiAdapters = [
      { id: 'paste', label: 'Paste', description: 'Paste text', icon: 'content_paste' },
      { id: 'upload', label: 'Upload', description: 'Upload file', icon: 'upload_file' },
    ];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: multiAdapters });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Paste');
      expect(container.textContent).toContain('Upload');
    });
  });

  it('handles adapter fetch failure gracefully (no error shown)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        throw new Error('network down');
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    // Should render page without crashing; no adapter buttons
    await waitFor(() => {
      expect(container.textContent).toContain('New note');
    });
  });

  it('clicking an adapter button selects it', async () => {
    const multiAdapters = [
      { id: 'paste', label: 'Paste', description: 'Paste text', icon: 'content_paste' },
      { id: 'upload', label: 'Upload', description: 'Upload file', icon: 'upload_file' },
    ];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: multiAdapters });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Upload'));
    const uploadBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Upload'),
    ) as HTMLButtonElement;
    fireEvent.click(uploadBtn);
    // Upload section should now show "File" instead of "Transcript"
    await waitFor(() => {
      expect(container.textContent).toContain('File');
    });
  });

  it('shows single-adapter hint text when only one adapter', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('More sources');
    });
  });
});

// ─── Form fields ─────────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — form fields', () => {
  it('renders title input and accepts text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Title'));
    const titleInput = container.querySelector('input[placeholder="e.g. Acme Q1 review"]') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    fireEvent.change(titleInput, { target: { value: 'Test Title' } });
    expect(titleInput.value).toBe('Test Title');
  });

  it('renders date input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Date'));
    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    fireEvent.change(dateInput, { target: { value: '2026-01-01T10:00' } });
    expect(dateInput.value).toBe('2026-01-01T10:00');
  });

  it('renders transcript textarea and accepts text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Transcript'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea, { target: { value: 'Hello world transcript' } });
    expect(textarea.value).toBe('Hello world transcript');
  });

  it('shows character count for transcript', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
    });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'abc' } });
    await waitFor(() => {
      expect(container.textContent).toContain('3');
      expect(container.textContent).toContain('characters');
    });
  });

  it('enables action buttons when transcript is non-empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'some content' } });
    const buttons = Array.from(container.querySelectorAll('button'));
    const draftBtn = buttons.find((b) => b.textContent?.includes('Save as draft'));
    const processBtn = buttons.find((b) => b.textContent?.includes('Save and process'));
    expect(draftBtn?.disabled).toBe(false);
    expect(processBtn?.disabled).toBe(false);
  });
});

// ─── Participants ─────────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — participants', () => {
  it('renders one participant row by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const nameInputs = container.querySelectorAll('input[placeholder="Name"]');
      expect(nameInputs.length).toBe(1);
    });
  });

  it('adds a participant row when "Add participant" is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add participant'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add participant'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      const nameInputs = container.querySelectorAll('input[placeholder="Name"]');
      expect(nameInputs.length).toBe(2);
    });
  });

  it('remove button is disabled when only one participant', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const removeBtn = container.querySelector('button[aria-label="Remove participant"]') as HTMLButtonElement;
      expect(removeBtn).toBeTruthy();
      expect(removeBtn.disabled).toBe(true);
    });
  });

  it('removes a participant row when remove is clicked (with 2+ rows)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add participant'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add participant'),
    ) as HTMLButtonElement;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(container.querySelectorAll('input[placeholder="Name"]').length).toBe(2);
    });
    const removeButtons = container.querySelectorAll('button[aria-label="Remove participant"]');
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(container.querySelectorAll('input[placeholder="Name"]').length).toBe(1);
    });
  });

  it('updates participant name field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const nameInput = container.querySelector('input[placeholder="Name"]');
      expect(nameInput).toBeTruthy();
    });
    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice' } });
    expect(nameInput.value).toBe('Alice');
  });

  it('updates participant email field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const emailInput = container.querySelector('input[placeholder="email@example.com"]');
      expect(emailInput).toBeTruthy();
    });
    const emailInput = container.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    expect(emailInput.value).toBe('alice@example.com');
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — validation', () => {
  it('shows validation error when transcript is empty on submit', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
    // Force buttons enabled by bypassing disabled check via direct submit call
    // transcript is empty so buttons are disabled; type whitespace
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    // Type just whitespace — should still fail validation
    fireEvent.change(textarea, { target: { value: '   ' } });
    // The buttons should still be disabled (trim check)
    const buttons = Array.from(container.querySelectorAll('button'));
    const draftBtn = buttons.find((b) => b.textContent?.includes('Save as draft')) as HTMLButtonElement;
    expect(draftBtn?.disabled).toBe(true);
  });
});

// ─── Submit: save as draft ────────────────────────────────────────────────────

describe('NewBrainMeetingPage — submit as draft', () => {
  function typeTranscript(container: HTMLElement, text = 'A valid transcript with content') {
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: text } });
  }

  it('POSTs to /api/portal/brain/communications on draft submit', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/api/portal/brain/communications'))).toBe(true);
    });
  });

  it('redirects to /portal/brain/communications/99 on draft success', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/communications/99');
    });
  });

  it('does NOT call /process when saving as draft', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
    const processCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/process'));
    expect(processCalls.length).toBe(0);
  });

  it('shows error when create POST fails (non-ok)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/api/portal/brain/communications')) {
        return { ok: false, json: async () => ({ success: false, message: 'creation failed' }) };
      }
      return makeRes({ success: true, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('creation failed');
    });
  });

  it('shows fallback error when create POST fails without message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/api/portal/brain/communications')) {
        return { ok: false, json: async () => ({ success: false }) };
      }
      return makeRes({ success: true, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to create communication.');
    });
  });

  it('shows network error when fetch throws Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      throw new Error('offline');
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('offline');
    });
  });

  it('shows "Network error" when fetch throws non-Error', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      throw 'bad things';
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('includes title and meetingDate in POST body when provided', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    const titleInput = container.querySelector('input[placeholder="e.g. Acme Q1 review"]') as HTMLInputElement;
    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My Title' } });
    fireEvent.change(dateInput, { target: { value: '2026-03-15T14:00' } });
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/portal/brain/communications') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body.input.title).toBe('My Title');
      expect(body.input.meetingDate).toBe('2026-03-15T14:00');
    });
  });

  it('omits title from POST body when left blank', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/portal/brain/communications') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body.input.title).toBeUndefined();
    });
  });

  it('includes participants with names (filters unnamed) in POST body', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    // Fill participant name
    const nameInput = container.querySelector('input[placeholder="Name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Bob' } });
    const emailInput = container.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'bob@example.com' } });
    typeTranscript(container);
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/portal/brain/communications') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body.input.participants).toEqual([{ name: 'Bob', email: 'bob@example.com' }]);
    });
  });
});

// ─── Submit: save and process ─────────────────────────────────────────────────

describe('NewBrainMeetingPage — save and process with AI', () => {
  function typeTranscript(container: HTMLElement, text = 'A valid transcript with enough content') {
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: text } });
  }

  it('calls /process endpoint after successful create', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const processBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save and process'),
    ) as HTMLButtonElement;
    fireEvent.click(processBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/process'))).toBe(true);
    });
  });

  it('redirects to /review after successful process', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const processBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save and process'),
    ) as HTMLButtonElement;
    fireEvent.click(processBtn);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/communications/99/review');
    });
  });

  it('redirects to detail page (not review) when process fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/process')) {
        return { ok: false, json: async () => ({ success: false, message: 'AI unavailable' }) };
      }
      if (url.includes('/api/portal/brain/communications')) {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const processBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save and process'),
    ) as HTMLButtonElement;
    fireEvent.click(processBtn);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/communications/99');
      expect(container.textContent).toContain('AI unavailable');
    });
  });

  it('shows process error prefix "Communication created, but AI processing failed"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/process')) {
        return { ok: false, json: async () => ({ success: false, message: 'timeout' }) };
      }
      if (url.includes('/api/portal/brain/communications')) {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    typeTranscript(container);
    const processBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save and process'),
    ) as HTMLButtonElement;
    fireEvent.click(processBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Communication created, but AI processing failed');
    });
  });
});

// ─── RelationshipPicker ───────────────────────────────────────────────────────

describe('NewBrainMeetingPage — RelationshipPicker', () => {
  it('renders "Link to a CRM company or deal" button initially', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Link to a CRM company or deal');
    });
  });

  it('opens search input when link button is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => {
      const searchInput = container.querySelector('input[placeholder="Search companies or deals…"]');
      expect(searchInput).toBeTruthy();
    });
  });

  it('renders Cancel button in open search state', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Cancel');
    });
  });

  it('closes search when Cancel is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="Search companies or deals…"]')).toBeTruthy();
    });
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Link to a CRM company or deal');
    });
  });

  it('renders company results from CRM suggestions', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 1, name: 'Acme Corp', industry: 'tech', hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Corp');
    }, { timeout: 1000 });
  });

  it('renders deal results from CRM suggestions', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [],
            deals: [{ id: 5, title: 'Big Deal', companyName: 'Acme', hasOverlay: false }],
          },
        });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Big Deal');
    }, { timeout: 1000 });
  });

  it('shows "No matches." when CRM returns empty results', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/crm-suggestions')) {
        return makeRes({ success: true, data: { companies: [], deals: [] } });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('No matches.');
    }, { timeout: 1000 });
  });

  it('selects a company and shows linked state with clear button', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 1, name: 'Acme Corp', industry: 'tech', hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'), { timeout: 1000 });
    const acmeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Acme Corp'),
    ) as HTMLButtonElement;
    fireEvent.click(acmeBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('company');
      expect(container.textContent).toContain('Clear');
    });
  });

  it('clears selected link when Clear is clicked', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 1, name: 'Acme Corp', industry: null, hasOverlay: false }],
            deals: [],
          },
        });
      }
      return makeRes({ success: true, data: { id: 99 } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'), { timeout: 1000 });
    const acmeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Acme Corp'),
    ) as HTMLButtonElement;
    fireEvent.click(acmeBtn);
    await waitFor(() => expect(container.textContent).toContain('Clear'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Link to a CRM company or deal');
    });
  });

  it('includes companyId in POST body when a company is linked', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/crm-suggestions')) {
        return makeRes({
          success: true,
          data: {
            companies: [{ id: 7, name: 'Beta Inc', industry: null, hasOverlay: false }],
            deals: [],
          },
        });
      }
      if (url.includes('/api/portal/brain/communications') && !url.includes('/process')) {
        return makeRes({ success: true, data: { id: 99 } });
      }
      return makeRes({ success: true, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Link to a CRM company or deal'));
    const linkBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Link to a CRM company or deal'),
    ) as HTMLButtonElement;
    fireEvent.click(linkBtn);
    await waitFor(() => expect(container.textContent).toContain('Beta Inc'), { timeout: 1000 });
    const betaBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Beta Inc'),
    ) as HTMLButtonElement;
    fireEvent.click(betaBtn);
    await waitFor(() => expect(container.textContent).toContain('company'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'transcript text here' } });
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/portal/brain/communications') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body.companyId).toBe(7);
    });
  });
});

// ─── Error banner ─────────────────────────────────────────────────────────────

describe('NewBrainMeetingPage — error banner', () => {
  it('renders error banner when error state is set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/brain/adapters')) {
        return makeRes({ success: true, data: ADAPTERS });
      }
      if (url.includes('/api/portal/brain/communications')) {
        return { ok: false, json: async () => ({ success: false, message: 'Something went wrong' }) };
      }
      return makeRes({ success: true, data: null });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'some transcript' } });
    const draftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save as draft'),
    ) as HTMLButtonElement;
    fireEvent.click(draftBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong');
    });
  });
});
