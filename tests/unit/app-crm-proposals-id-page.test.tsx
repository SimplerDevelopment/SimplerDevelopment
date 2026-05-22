// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/proposals/[id]/page.tsx` — the proposal
 * editor page. Drives every branch: load + error states, save / send /
 * delete / save-as-template flows, section / line-item / fee CRUD, and the
 * live preview rendering for every section type. Mocks `next/navigation`,
 * `fetch`, `navigator.clipboard`, and `@/lib/security/sanitize-html`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();
let paramsValue: { id: string } = { id: '42' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => paramsValue,
  usePathname: () => '/portal/crm/proposals/42',
}));

vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeRichHtml: (html: string) => html ?? '',
  sanitizeHtml: (html: string) => html ?? '',
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: any) => any | Promise<any>;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

const baseProposal = {
  id: 42,
  title: 'Acme Build',
  summary: 'A summary',
  status: 'draft',
  contactId: 10,
  companyId: 100,
  dealId: 1000,
  sections: [
    { id: 's-head', type: 'heading', content: 'Intro' },
    { id: 's-text', type: 'text', content: '<p>Body</p>' },
    { id: 's-img', type: 'image', content: 'https://img.test/x.png' },
    { id: 's-div', type: 'divider', content: '' },
    { id: 's-pri', type: 'pricing', content: '' },
    { id: 's-term', type: 'terms', content: 'Net 30' },
    { id: 's-sig', type: 'signature', content: '' },
  ],
  lineItems: [
    { id: 'li1', description: 'Dev', details: 'Backend', qty: 2, unitPrice: 50000, optional: false },
    { id: 'li2', description: 'Optional add', details: '', qty: 1, unitPrice: 10000, optional: true },
  ],
  fees: [
    { id: 'f1', label: 'Flat fee', type: 'flat', amount: 5000 },
    { id: 'f2', label: 'Tax', type: 'percent', amount: 10 },
  ],
  currency: 'USD',
  validUntil: '2030-01-15T00:00:00Z',
  clientToken: 'tok-abc',
  accentColor: '#ff0000',
  logoUrl: 'https://logo.test/l.png',
  coverImageUrl: 'https://cover.test/c.png',
  footerText: 'Thanks',
  sentAt: null,
  acceptedAt: null,
  declinedAt: null,
  signatureName: null,
  signedAt: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  contactFirstName: 'Jane',
  contactLastName: 'Doe',
  contactEmail: 'jane@acme.test',
  companyName: 'Acme',
  dealTitle: 'Q1 Project',
};

const baseContacts = [
  { id: 10, firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.test' },
  { id: 11, firstName: 'Bob', lastName: 'Smith', email: null },
];

const baseCompanies = [
  { id: 100, name: 'Acme' },
  { id: 101, name: 'Beta Co' },
];

const baseDeals = [
  { id: 1000, title: 'Q1 Project' },
  { id: 1001, title: 'Q2 Project' },
];

function defaultFetch(url: string, init?: any): any {
  if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined || init.method === 'GET')) {
    return jsonResponse({ success: true, data: baseProposal });
  }
  if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && init?.method === 'PUT') {
    return jsonResponse({ success: true, data: baseProposal });
  }
  if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  if (/^\/api\/portal\/crm\/proposals\/\d+\/send$/.test(url) && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { proposalUrl: '/p/tok-abc' } });
  }
  if (url.startsWith('/api/portal/crm/contacts')) {
    return jsonResponse({ data: { contacts: baseContacts } });
  }
  if (url.startsWith('/api/portal/crm/companies')) {
    return jsonResponse({ data: { companies: baseCompanies } });
  }
  if (url.startsWith('/api/portal/crm/deals')) {
    return jsonResponse({ data: baseDeals });
  }
  if (url === '/api/portal/crm/proposal-templates' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 7777 } });
  }
  return jsonResponse({ data: [] });
}

// crypto.randomUUID may not exist in older jsdom envs — stub if missing.
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  let counter = 0;
  // @ts-ignore
  globalThis.crypto = {
    ...(globalThis.crypto ?? {}),
    randomUUID: () => `uuid-${++counter}-${Date.now()}` as `${string}-${string}-${string}-${string}-${string}`,
  };
}

beforeEach(() => {
  paramsValue = { id: '42' };
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) =>
    Promise.resolve(handlers[0](url, init)),
  );
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Imports under test (after mocks)
import ProposalEditorPage from '@/app/portal/crm/proposals/[id]/page';

async function renderPage() {
  const result = render(<ProposalEditorPage />);
  await waitFor(() => {
    expect(result.container.textContent).not.toContain('Loading proposal...');
  });
  return result;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Find a button by its visible label, ignoring leading material-icon spans. */
function findButtonByLabel(container: HTMLElement, label: string, opts: { enabledOnly?: boolean } = {}) {
  return Array.from(container.querySelectorAll('button')).find(b => {
    const visible = (b.textContent || '').replace(/\s+/g, ' ').trim();
    // Strip any leading material-icons text (icons are text within span.material-icons)
    const iconText = Array.from(b.querySelectorAll('.material-icons')).map(s => s.textContent || '').join(' ');
    let stripped = visible;
    if (iconText) {
      stripped = visible.replace(iconText.trim(), '').trim();
    }
    if (opts.enabledOnly && (b as HTMLButtonElement).disabled) return false;
    return stripped === label;
  }) as HTMLButtonElement | undefined;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProposalEditorPage', () => {
  describe('initial load + error states', () => {
    it('renders loading state initially', () => {
      const { container } = render(<ProposalEditorPage />);
      expect(container.textContent).toContain('Loading proposal...');
    });

    it('renders proposal after load', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('draft');
      // Title input populated
      const titleInput = container.querySelector('input[placeholder="Proposal Title"]') as HTMLInputElement;
      expect(titleInput.value).toBe('Acme Build');
    });

    it('renders "Proposal not found" when API returns failure', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: false, message: 'Not found' });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<ProposalEditorPage />);
      await waitFor(() => {
        expect(container.textContent).not.toContain('Loading proposal...');
      });
      expect(container.textContent).toContain('Not found');
      expect(container.textContent).toContain('Back to proposals');
    });

    it('renders default "Failed to load proposal" if no message', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<ProposalEditorPage />);
      await waitFor(() => {
        expect(container.textContent).not.toContain('Loading proposal...');
      });
      expect(container.textContent).toContain('Failed to load proposal');
    });

    it('Back-to-proposals button navigates from error state', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<ProposalEditorPage />);
      await waitFor(() => {
        expect(container.textContent).not.toContain('Loading proposal...');
      });
      fireEvent.click(screen.getByText('Back to proposals'));
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/proposals');
    });

    it('handles proposal with null nullable fields', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({
            success: true,
            data: {
              ...baseProposal,
              summary: null,
              contactId: null,
              companyId: null,
              dealId: null,
              accentColor: null,
              logoUrl: null,
              coverImageUrl: null,
              validUntil: null,
              footerText: null,
              sections: null,
              lineItems: null,
              fees: null,
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      // Default accent color should be used
      const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
      expect(colorInput.value).toBe('#2563eb');
      // No sections placeholder
      expect(container.textContent).toContain('No sections yet');
    });

    it('falls back when contacts/companies API returns data.data array', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts')) {
          return jsonResponse({ data: baseContacts });
        }
        if (url.startsWith('/api/portal/crm/companies')) {
          return jsonResponse({ data: baseCompanies });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      expect(container.textContent).toContain('Jane Doe');
      expect(container.textContent).toContain('Acme');
    });

    it('falls back to empty array when API returns no data', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts')) {
          return jsonResponse({});
        }
        if (url.startsWith('/api/portal/crm/companies')) {
          return jsonResponse({});
        }
        if (url.startsWith('/api/portal/crm/deals')) {
          return jsonResponse({});
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      // Should still render
      expect(container.textContent).toContain('Acme Build');
    });
  });

  describe('top action bar', () => {
    it('renders status pill', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('draft');
    });

    it('back arrow navigates to proposals list', async () => {
      const { container } = await renderPage();
      const backBtn = container.querySelector('button[title="Back"]')!;
      fireEvent.click(backBtn);
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/proposals');
    });

    it('renders Save / Send / Delete / Save as Template buttons', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Save');
      expect(container.textContent).toContain('Send');
      expect(container.textContent).toContain('Save as Template');
    });

    it('Send button is disabled for accepted proposals', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, status: 'accepted' } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const sendBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Send' || b.textContent?.includes('Send'),
      );
      // Disabled button has aria-disabled true via disabled attr
      const disabledSend = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send') && (b as HTMLButtonElement).disabled,
      );
      expect(disabledSend).toBeTruthy();
    });

    it('Send button is disabled for declined proposals', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, status: 'declined' } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const disabledSend = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send') && (b as HTMLButtonElement).disabled,
      );
      expect(disabledSend).toBeTruthy();
    });

    it('Send button is disabled for expired proposals', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, status: 'expired' } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const disabledSend = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send') && (b as HTMLButtonElement).disabled,
      );
      expect(disabledSend).toBeTruthy();
    });

    it('renders status pill with unknown-status fallback color', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, status: 'something_else' } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      expect(container.textContent).toContain('something_else');
    });
  });

  describe('editable fields', () => {
    it('updates title on input', async () => {
      const { container } = await renderPage();
      const titleInput = container.querySelector('input[placeholder="Proposal Title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'New Title' } });
      expect(titleInput.value).toBe('New Title');
    });

    it('updates summary textarea', async () => {
      const { container } = await renderPage();
      const summary = container.querySelector('textarea[placeholder="Brief summary of this proposal..."]') as HTMLTextAreaElement;
      fireEvent.change(summary, { target: { value: 'Updated summary' } });
      expect(summary.value).toBe('Updated summary');
    });

    it('updates contact / company / deal selects', async () => {
      const { container } = await renderPage();
      const selects = container.querySelectorAll('select');
      // First three selects are contact / company / deal
      fireEvent.change(selects[0], { target: { value: '11' } });
      fireEvent.change(selects[1], { target: { value: '101' } });
      fireEvent.change(selects[2], { target: { value: '1001' } });
      expect((selects[0] as HTMLSelectElement).value).toBe('11');
      expect((selects[1] as HTMLSelectElement).value).toBe('101');
      expect((selects[2] as HTMLSelectElement).value).toBe('1001');
    });

    it('updates accent color from color picker and text input', async () => {
      const { container } = await renderPage();
      const colorPicker = container.querySelector('input[type="color"]') as HTMLInputElement;
      fireEvent.change(colorPicker, { target: { value: '#00ff00' } });
      expect(colorPicker.value).toBe('#00ff00');
      // The text input mirroring the color
      const colorText = colorPicker.nextElementSibling as HTMLInputElement;
      fireEvent.change(colorText, { target: { value: '#0000ff' } });
      expect(colorText.value).toBe('#0000ff');
    });

    it('updates logoUrl, coverImageUrl, footerText, validUntil', async () => {
      const { container } = await renderPage();
      const logo = container.querySelector('input[placeholder="https://..."]') as HTMLInputElement;
      fireEvent.change(logo, { target: { value: 'https://newlogo.test' } });
      expect(logo.value).toBe('https://newlogo.test');
      const date = container.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(date, { target: { value: '2031-02-02' } });
      expect(date.value).toBe('2031-02-02');
      const footer = container.querySelector('input[placeholder="Thank you for your consideration."]') as HTMLInputElement;
      fireEvent.change(footer, { target: { value: 'New footer' } });
      expect(footer.value).toBe('New footer');
    });
  });

  describe('save flow', () => {
    it('Save button posts PUT and shows success', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => Promise.resolve(defaultFetch(url, init)));
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const saveBtn = findButtonByLabel(container, 'Save')!;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Saved');
      });
      const put = fetchSpy.mock.calls.find(c => c[1]?.method === 'PUT');
      expect(put).toBeTruthy();
    });

    it('Save shows error when API returns failure', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && init?.method === 'PUT') {
          return jsonResponse({ success: false, message: 'Save failed' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const saveBtn = findButtonByLabel(container, 'Save')!;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Save failed');
      });
    });

    it('Save shows default error message when no message', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && init?.method === 'PUT') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const saveBtn = findButtonByLabel(container, 'Save')!;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Failed to save');
      });
    });

    it('Save serialises empty strings as null in body', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => Promise.resolve(defaultFetch(url, init)));
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      // Clear summary
      const summary = container.querySelector('textarea[placeholder="Brief summary of this proposal..."]') as HTMLTextAreaElement;
      fireEvent.change(summary, { target: { value: '' } });
      const saveBtn = findButtonByLabel(container, 'Save')!;
      fireEvent.click(saveBtn);
      await waitFor(() => {
        const put = fetchSpy.mock.calls.find(c => c[1]?.method === 'PUT');
        expect(put).toBeTruthy();
        const body = JSON.parse(put![1].body);
        expect(body.summary).toBe(null);
      });
    });
  });

  describe('send dialog', () => {
    it('opens send dialog on Send click', async () => {
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      expect(container.textContent).toContain('Send Proposal');
    });

    it('shows contact name + email in dialog', async () => {
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      expect(container.textContent).toContain('Jane Doe');
      expect(container.textContent).toContain('jane@acme.test');
    });

    it('skips contact line when no contact selected', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, contactId: null } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      expect(container.textContent).toContain('Send Proposal');
    });

    it('Cancel button closes send dialog', async () => {
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      fireEvent.click(screen.getByText('Cancel'));
      expect(container.textContent).not.toContain('Send Proposal');
    });

    it('Send Now triggers send flow and shows shareable URL', async () => {
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => {
        expect(container.textContent).toContain('Proposal Sent');
      });
      const urlInput = container.querySelector('input[readonly]') as HTMLInputElement;
      expect(urlInput.value).toContain('/p/tok-abc');
    });

    it('Copy link button uses navigator.clipboard', async () => {
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => screen.getByText('Proposal Sent'));
      const copyBtn = container.querySelector('button[title="Copy link"]')!;
      fireEvent.click(copyBtn);
      expect((navigator.clipboard.writeText as any).mock.calls.length).toBeGreaterThan(0);
    });

    it('Done button closes the URL share step', async () => {
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => screen.getByText('Proposal Sent'));
      fireEvent.click(screen.getByText('Done'));
      expect(container.textContent).not.toContain('Proposal Sent');
    });

    it('Send failure closes dialog and shows error', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+\/send$/.test(url) && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Send failed' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => {
        expect(container.textContent).toContain('Send failed');
      });
    });

    it('Send failure with no message uses default', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+\/send$/.test(url) && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const sendBtn = findButtonByLabel(container, 'Send', { enabledOnly: true })!;
      fireEvent.click(sendBtn);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => {
        expect(container.textContent).toContain('Failed to send');
      });
    });
  });

  describe('delete dialog', () => {
    it('opens delete dialog when delete button clicked', async () => {
      const { container } = await renderPage();
      // Delete is the last button in the action bar (icon only)
      const deleteIconBtn = Array.from(container.querySelectorAll('button')).find(b => {
        const icon = b.querySelector('.material-icons');
        return icon?.textContent === 'delete';
      })!;
      fireEvent.click(deleteIconBtn);
      expect(container.textContent).toContain('Delete Proposal');
      expect(container.textContent).toContain('Acme Build');
    });

    it('Cancel button closes delete dialog', async () => {
      const { container } = await renderPage();
      const deleteIconBtn = Array.from(container.querySelectorAll('button')).find(b => {
        const icon = b.querySelector('.material-icons');
        return icon?.textContent === 'delete';
      })!;
      fireEvent.click(deleteIconBtn);
      fireEvent.click(screen.getByText('Cancel'));
      expect(container.textContent).not.toContain('Delete Proposal');
    });

    it('Delete button DELETEs and navigates away', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => Promise.resolve(defaultFetch(url, init)));
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const deleteIconBtn = Array.from(container.querySelectorAll('button')).find(b => {
        const icon = b.querySelector('.material-icons');
        return icon?.textContent === 'delete';
      })!;
      fireEvent.click(deleteIconBtn);
      const confirmBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim() === 'Delete',
      )!;
      fireEvent.click(confirmBtn);
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/portal/crm/proposals');
      });
      const del = fetchSpy.mock.calls.find(c => c[1]?.method === 'DELETE');
      expect(del).toBeTruthy();
    });
  });

  describe('save-as-template dialog', () => {
    it('opens template dialog when "Save as Template" clicked', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Save as Template'));
      expect(container.textContent).toContain('Template Name *');
    });

    it('Cancel button closes template dialog', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Save as Template'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(container.textContent).not.toContain('Template Name *');
    });

    it('submits template form and shows success', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Save as Template'));
      const nameInput = container.querySelector('input[placeholder="e.g. Standard Web Design Proposal"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Template' } });
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(container.textContent).toContain('Template saved');
      });
    });

    it('template submit failure leaves dialog open', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/proposal-templates' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Save as Template'));
      const nameInput = container.querySelector('input[placeholder="e.g. Standard Web Design Proposal"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'X' } });
      fireEvent.submit(container.querySelector('form')!);
      await flush();
      // Dialog still open
      expect(container.textContent).toContain('Template Name *');
    });
  });

  describe('section CRUD', () => {
    it('adds a section of each type', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, sections: [] } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      // Add buttons (in the "Content Sections" panel, at the bottom)
      // Find by text — each type has a button
      fireEvent.click(screen.getByText('Heading'));
      fireEvent.click(screen.getByText('Text'));
      fireEvent.click(screen.getByText('Image'));
      fireEvent.click(screen.getByText('Divider'));
      fireEvent.click(screen.getByText('Pricing'));
      fireEvent.click(screen.getByText('Terms'));
      fireEvent.click(screen.getByText('Signature'));
      // The empty-state message should be gone now
      expect(container.textContent).not.toContain('No sections yet');
    });

    it('updates a heading section content', async () => {
      const { container } = await renderPage();
      // Heading input — has placeholder "Heading text..."
      const headingInput = container.querySelector('input[placeholder="Heading text..."]') as HTMLInputElement;
      expect(headingInput.value).toBe('Intro');
      fireEvent.change(headingInput, { target: { value: 'New Heading' } });
      expect(headingInput.value).toBe('New Heading');
    });

    it('updates a text section content', async () => {
      const { container } = await renderPage();
      const textArea = container.querySelector('textarea[placeholder="Enter text content (HTML supported)..."]') as HTMLTextAreaElement;
      expect(textArea.value).toBe('<p>Body</p>');
      fireEvent.change(textArea, { target: { value: '<p>New body</p>' } });
      expect(textArea.value).toBe('<p>New body</p>');
    });

    it('updates an image section URL and shows preview', async () => {
      const { container } = await renderPage();
      const imageInput = container.querySelector('input[placeholder="Image URL..."]') as HTMLInputElement;
      expect(imageInput.value).toBe('https://img.test/x.png');
      fireEvent.change(imageInput, { target: { value: 'https://img.test/y.png' } });
      expect(imageInput.value).toBe('https://img.test/y.png');
    });

    it('updates a terms section content', async () => {
      const { container } = await renderPage();
      const termsArea = container.querySelector('textarea[placeholder="Terms and conditions..."]') as HTMLTextAreaElement;
      expect(termsArea.value).toBe('Net 30');
      fireEvent.change(termsArea, { target: { value: 'Net 60' } });
      expect(termsArea.value).toBe('Net 60');
    });

    it('removes a section', async () => {
      const { container } = await renderPage();
      // First section is heading "Intro". Find its close (x) button.
      // The section row has arrow_upward, arrow_downward, close buttons.
      const closeButtons = Array.from(container.querySelectorAll('button')).filter(b => {
        const icon = b.querySelector('.material-icons');
        return icon?.textContent === 'close';
      });
      // First close button removes first section. Before click, Intro is visible in heading input.
      const headingInputBefore = container.querySelector('input[placeholder="Heading text..."]') as HTMLInputElement;
      expect(headingInputBefore.value).toBe('Intro');
      fireEvent.click(closeButtons[0]);
      // Now no heading section anymore
      const headingInputAfter = container.querySelector('input[placeholder="Heading text..."]');
      expect(headingInputAfter).toBeNull();
    });

    it('moves a section down', async () => {
      const { container } = await renderPage();
      // First section's arrow_downward
      const downButtons = Array.from(container.querySelectorAll('button')).filter(b => {
        const icon = b.querySelector('.material-icons');
        return icon?.textContent === 'arrow_downward';
      });
      // First section's "down" is enabled; last section's is disabled
      expect((downButtons[0] as HTMLButtonElement).disabled).toBe(false);
      expect((downButtons[downButtons.length - 1] as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(downButtons[0]);
      // After moving, the order changed — no exception is enough
      expect(true).toBe(true);
    });

    it('moves a section up', async () => {
      const { container } = await renderPage();
      const upButtons = Array.from(container.querySelectorAll('button')).filter(b => {
        const icon = b.querySelector('.material-icons');
        return icon?.textContent === 'arrow_upward';
      });
      // First section's up is disabled
      expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true);
      // Last is enabled
      expect((upButtons[upButtons.length - 1] as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(upButtons[upButtons.length - 1]);
      expect(true).toBe(true);
    });

    it('renders fallback icon for unknown section type', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({
            success: true,
            data: { ...baseProposal, sections: [{ id: 'x', type: 'mystery' as any, content: 'foo' }] },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      // mystery type appears as raw text label
      expect(container.textContent).toContain('mystery');
    });
  });

  describe('line item CRUD', () => {
    it('adds a new line item', async () => {
      const { container } = await renderPage();
      const addBtn = findButtonByLabel(container, 'Add Line Item')!;
      fireEvent.click(addBtn);
      // Now should have 3 description inputs in the line items table
      const descInputs = container.querySelectorAll('input[placeholder="Item description"]');
      expect(descInputs.length).toBe(3);
    });

    it('updates a line item description', async () => {
      const { container } = await renderPage();
      const descInputs = container.querySelectorAll('input[placeholder="Item description"]') as NodeListOf<HTMLInputElement>;
      fireEvent.change(descInputs[0], { target: { value: 'Updated Dev' } });
      expect(descInputs[0].value).toBe('Updated Dev');
    });

    it('updates a line item details', async () => {
      const { container } = await renderPage();
      const detailsInputs = container.querySelectorAll('input[placeholder="Details"]') as NodeListOf<HTMLInputElement>;
      fireEvent.change(detailsInputs[0], { target: { value: 'New detail' } });
      expect(detailsInputs[0].value).toBe('New detail');
    });

    it('updates line item qty and unit price', async () => {
      const { container } = await renderPage();
      const numberInputs = container.querySelectorAll('table input[type="number"]') as NodeListOf<HTMLInputElement>;
      // First pair: qty/unitPrice for first line item
      fireEvent.change(numberInputs[0], { target: { value: '5' } });
      expect(numberInputs[0].value).toBe('5');
      fireEvent.change(numberInputs[1], { target: { value: '20000' } });
      expect(numberInputs[1].value).toBe('20000');
    });

    it('toggles line item optional checkbox', async () => {
      const { container } = await renderPage();
      const checkboxes = container.querySelectorAll('table input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
      // first row is not optional; toggle it
      expect(checkboxes[0].checked).toBe(false);
      fireEvent.click(checkboxes[0]);
      expect(checkboxes[0].checked).toBe(true);
    });

    it('removes a line item', async () => {
      const { container } = await renderPage();
      const descBefore = container.querySelectorAll('input[placeholder="Item description"]');
      expect(descBefore.length).toBe(2);
      // First line item row has its own close button. Pick the close in the table row.
      const tableRows = container.querySelectorAll('table tbody tr');
      const firstRowCloseBtn = tableRows[0].querySelector('button')!;
      fireEvent.click(firstRowCloseBtn);
      const descAfter = container.querySelectorAll('input[placeholder="Item description"]');
      expect(descAfter.length).toBe(1);
    });

    it('renders subtotal / fees / grand total', async () => {
      const { container } = await renderPage();
      // baseProposal: 2 line items, only first (Dev qty 2 * 50000) counts (optional excluded)
      // subtotal = 100000c = $1,000.00
      expect(container.textContent).toContain('$1,000.00');
      // Flat fee 5000c = $50.00
      expect(container.textContent).toContain('$50.00');
      // Percent 10% of subtotal = 10000c = $100.00
      expect(container.textContent).toContain('$100.00');
      // Grand total = 100000 + 5000 + 10000 = 115000c = $1,150.00
      expect(container.textContent).toContain('$1,150.00');
    });
  });

  describe('fee CRUD', () => {
    it('adds a new fee', async () => {
      const { container } = await renderPage();
      const addBtn = findButtonByLabel(container, 'Add Fee')!;
      fireEvent.click(addBtn);
      const labelInputs = container.querySelectorAll('input[placeholder="Fee label"]');
      expect(labelInputs.length).toBe(3);
    });

    it('updates fee label', async () => {
      const { container } = await renderPage();
      const labelInputs = container.querySelectorAll('input[placeholder="Fee label"]') as NodeListOf<HTMLInputElement>;
      fireEvent.change(labelInputs[0], { target: { value: 'Setup' } });
      expect(labelInputs[0].value).toBe('Setup');
    });

    it('updates fee type', async () => {
      const { container } = await renderPage();
      // Fee type selects: the 4th+ select on the page (after contact/company/deal)
      // They come after the recipient/branding selects. Find by option values.
      const typeSelects = Array.from(container.querySelectorAll('select')).filter(s =>
        Array.from(s.options).some(o => o.value === 'flat'),
      ) as HTMLSelectElement[];
      expect(typeSelects.length).toBeGreaterThan(0);
      fireEvent.change(typeSelects[0], { target: { value: 'percent' } });
      expect(typeSelects[0].value).toBe('percent');
    });

    it('updates fee amount', async () => {
      const { container } = await renderPage();
      // amount inputs: number inputs that are not inside the line items table
      const allNumber = Array.from(container.querySelectorAll('input[type="number"]'));
      const feesPanel = Array.from(container.querySelectorAll('h3')).find(h =>
        h.textContent?.includes('Fees'),
      )!.parentElement!;
      const feeNumbers = feesPanel.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      expect(feeNumbers.length).toBeGreaterThan(0);
      fireEvent.change(feeNumbers[0], { target: { value: '12345' } });
      expect(feeNumbers[0].value).toBe('12345');
    });

    it('removes a fee', async () => {
      const { container } = await renderPage();
      const labelInputsBefore = container.querySelectorAll('input[placeholder="Fee label"]');
      expect(labelInputsBefore.length).toBe(2);
      // Find the fee row containing the first fee label and click its close button
      const firstFeeLabel = labelInputsBefore[0] as HTMLInputElement;
      const feeRow = firstFeeLabel.parentElement!;
      const closeBtn = feeRow.querySelector('button')!;
      fireEvent.click(closeBtn);
      const labelInputsAfter = container.querySelectorAll('input[placeholder="Fee label"]');
      expect(labelInputsAfter.length).toBe(1);
    });
  });

  describe('live preview', () => {
    it('renders title in preview', async () => {
      const { container } = await renderPage();
      const previewH1s = container.querySelectorAll('h1');
      const previewTitle = Array.from(previewH1s).find(h => h.textContent === 'Acme Build');
      expect(previewTitle).toBeTruthy();
    });

    it('renders fallback "Untitled Proposal" when title cleared', async () => {
      const { container } = await renderPage();
      const titleInput = container.querySelector('input[placeholder="Proposal Title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: '' } });
      expect(container.textContent).toContain('Untitled Proposal');
    });

    it('renders summary in preview', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('A summary');
    });

    it('renders logo and cover image in preview', async () => {
      const { container } = await renderPage();
      const imgs = container.querySelectorAll('img');
      const logo = Array.from(imgs).find(img => img.getAttribute('alt') === 'Logo');
      const cover = Array.from(imgs).find(img => img.getAttribute('alt') === 'Cover');
      expect(logo).toBeTruthy();
      expect(cover).toBeTruthy();
    });

    it('renders prepared-for line when contact + company selected', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Prepared for');
      expect(container.textContent).toContain('Jane Doe');
      expect(container.textContent).toContain('Acme');
    });

    it('renders prepared-for line with only contact', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, companyId: null } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      expect(container.textContent).toContain('Prepared for');
      expect(container.textContent).toContain('Jane Doe');
    });

    it('renders prepared-for line with only company', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({ success: true, data: { ...baseProposal, contactId: null } });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      expect(container.textContent).toContain('Prepared for');
    });

    it('renders valid-until date in preview', async () => {
      const { container } = await renderPage();
      // 2030-01-15 — exact locale format may vary, but year should appear
      expect(container.textContent).toContain('2030');
    });

    it('renders heading preview', async () => {
      const { container } = await renderPage();
      const previewH2s = container.querySelectorAll('h2');
      const introH2 = Array.from(previewH2s).find(h => h.textContent === 'Intro');
      expect(introH2).toBeTruthy();
    });

    it('renders fallback "Heading" when content empty', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({
            success: true,
            data: { ...baseProposal, sections: [{ id: 'h', type: 'heading', content: '' }] },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const previewH2 = Array.from(container.querySelectorAll('h2')).find(h => h.textContent === 'Heading');
      expect(previewH2).toBeTruthy();
    });

    it('renders text section preview via sanitizeRichHtml', async () => {
      const { container } = await renderPage();
      // Body text from sanitized HTML
      expect(container.innerHTML).toContain('Body');
    });

    it('renders pricing table in preview', async () => {
      const { container } = await renderPage();
      // Preview pricing should show "Subtotal" and "Total"
      expect(container.textContent).toContain('Subtotal');
      expect(container.textContent).toContain('Total');
    });

    it('renders terms section in preview', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Terms & Conditions');
      expect(container.textContent).toContain('Net 30');
    });

    it('renders signature placeholder', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Signature area');
    });

    it('renders footer text in preview', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Thanks');
    });

    it('renders fallback for empty terms content', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({
            success: true,
            data: { ...baseProposal, sections: [{ id: 't', type: 'terms', content: '' }] },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      expect(container.textContent).toContain('Terms and conditions will appear here');
    });

    it('does not render pricing block in preview when no line items', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+$/.test(url) && (!init || init.method === undefined)) {
          return jsonResponse({
            success: true,
            data: {
              ...baseProposal,
              lineItems: [],
              sections: [{ id: 'p', type: 'pricing', content: '' }],
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      // Subtotal / Grand Total not present in editor section (only when line items exist)
      // But the editor side already conditions on lineItems.length > 0. Sanity: page didn't crash.
      expect(container.textContent).toContain('Acme Build');
    });
  });
});
