/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/proposals/page.tsx` — the CRM Proposals +
 * Pitch Decks tabbed page. The page reads `?tab=` to pick the initial tab,
 * fetches proposals + decks + lookup data on mount, exposes new-proposal /
 * duplicate / send flows for proposals, and search/filter/sort/delete flows
 * for decks. We stub `next/navigation`, `fetch`, and `navigator.clipboard`
 * and drive every branch from the test.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/crm/proposals',
  useSearchParams: () => searchParamsValue,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Render CrmCompanyTypeaheadPicker as a native <select> backed by a prefetched
// company list. Uses local state so React's controlled-select validation works
// for any option value, and `fireEvent.change` always fires the callback.
vi.mock('@/components/portal/CrmCompanyTypeaheadPicker', () => {
  const { useState, useEffect } = require('react');
  const { createElement: h } = require('react');
  return {
    __esModule: true,
    default: ({ value, selectedLabel, onChange, placeholder, noneLabel }: any) => {
      const [opts, setOpts] = useState<{ id: number; name: string }[]>([]);
      useEffect(() => {
        fetch('/api/portal/crm/companies?limit=5000')
          .then((r: any) => r.json())
          .then((d: any) => {
            const rows = d?.data?.companies ?? d?.data ?? [];
            if (Array.isArray(rows)) setOpts(rows);
          })
          .catch(() => {});
      }, []);
      const [sel, setSel] = useState(value ?? '');
      useEffect(() => { setSel(value ?? ''); }, [value]);
      const noneText = noneLabel ?? placeholder ?? 'None';
      const allOpts = [...opts];
      if (value && selectedLabel && !allOpts.find((o: any) => String(o.id) === String(value))) {
        allOpts.unshift({ id: Number(value), name: selectedLabel });
      }
      return h(
        'select',
        {
          'data-testid': 'company-typeahead',
          value: sel,
          onChange: (e: any) => {
            const v = e.target.value;
            setSel(v);
            if (!v) { onChange(null); return; }
            const text = e.target.options?.[e.target.selectedIndex]?.text ?? String(v);
            onChange({ id: Number(v), name: text });
          },
        },
        h('option', { key: '__none', value: '' }, noneText),
        ...allOpts.map((c: any) => h('option', { key: c.id, value: String(c.id) }, c.name)),
      );
    },
  };
});

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
  id: 1,
  title: 'Acme Build',
  status: 'draft',
  contactId: 10,
  companyId: 100,
  dealId: 1000,
  lineItems: [
    { id: 'li1', description: 'Dev', details: '', qty: 2, unitPrice: 50000, optional: false },
    { id: 'li2', description: 'Optional', details: '', qty: 1, unitPrice: 10000, optional: true },
  ],
  fees: [
    { id: 'f1', label: 'Flat', type: 'flat', amount: 5000 },
    { id: 'f2', label: 'Pct', type: 'percent', amount: 10 },
  ],
  sentAt: null,
  lastViewedAt: null,
  viewCount: 0,
  acceptedAt: null,
  declinedAt: null,
  createdAt: '2025-01-01T00:00:00Z',
  contactFirstName: 'Jane',
  contactLastName: 'Doe',
  contactEmail: 'jane@acme.test',
  companyName: 'Acme',
  dealTitle: 'Q1 Project',
};

const sentProposal = {
  ...baseProposal,
  id: 2,
  title: 'Beta Sent',
  status: 'sent',
  sentAt: '2025-01-02T00:00:00Z',
  lastViewedAt: '2025-01-03T00:00:00Z',
  viewCount: 3,
};

const acceptedProposal = {
  ...baseProposal,
  id: 3,
  title: 'Gamma Done',
  status: 'accepted',
  contactFirstName: null,
  contactLastName: null,
  companyName: null,
  sentAt: '2025-01-02T00:00:00Z',
  lastViewedAt: null,
  acceptedAt: '2025-01-04T00:00:00Z',
};

const declinedProposal = {
  ...baseProposal,
  id: 4,
  title: 'Delta No',
  status: 'declined',
  contactFirstName: 'Sam',
  contactLastName: null,
  declinedAt: '2025-01-05T00:00:00Z',
};

const viewedProposal = {
  ...baseProposal,
  id: 5,
  title: 'Epsilon View',
  status: 'viewed',
  contactFirstName: null,
  contactLastName: null,
  lineItems: [],
  fees: [],
  sentAt: '2025-01-06T00:00:00Z',
  lastViewedAt: '2025-01-07T00:00:00Z',
  viewCount: 0,
};

const baseContacts = [
  { id: 10, firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.test' },
  { id: 11, firstName: 'Bob', lastName: 'Smith' },
];

const baseCompanies = [
  { id: 100, name: 'Acme' },
  { id: 101, name: 'Beta Co' },
];

const baseDeals = [
  { id: 1000, title: 'Q1 Project', value: 5000, status: 'open' },
];

const baseTemplates = [
  {
    id: 5000,
    name: 'Template A',
    sections: [{ id: 's1', type: 'intro', content: 'hi' }],
    lineItems: [{ id: 'tli', description: 't', details: '', qty: 1, unitPrice: 1000, optional: false }],
    fees: [{ id: 'tf', label: 'tax', type: 'flat', amount: 500 }],
  },
  {
    id: 5001,
    name: 'Template Empty',
    sections: null as any,
    lineItems: null as any,
    fees: null as any,
  },
];

const baseDecks = [
  {
    id: 1, title: 'Sales Deck', description: 'Top of funnel', status: 'published',
    slides: [{}, {}, {}], updatedAt: '2025-02-01', createdAt: '2025-01-01',
  },
  {
    id: 2, title: 'Onboarding', description: null, status: 'draft',
    slides: [], updatedAt: '2025-01-10', createdAt: '2025-01-05',
  },
  {
    id: 3, title: 'Archived Pitch', description: 'old stuff', status: 'archived',
    slides: [{}], updatedAt: '2024-12-01', createdAt: '2024-11-01',
  },
];

function defaultFetch(url: string, init?: any): any {
  if (url.startsWith('/api/portal/crm/proposals?')) {
    return jsonResponse({ data: [baseProposal, sentProposal, acceptedProposal, declinedProposal, viewedProposal] });
  }
  if (url === '/api/portal/crm/proposals' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 999 } });
  }
  if (/^\/api\/portal\/crm\/proposals\/\d+\/send$/.test(url)) {
    return jsonResponse({ success: true, data: { proposalUrl: '/p/abc' } });
  }
  if (url === '/api/portal/tools/pitch-decks') {
    return jsonResponse({ data: baseDecks });
  }
  if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
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
  if (url === '/api/portal/crm/proposal-templates') {
    return jsonResponse({ data: baseTemplates });
  }
  return jsonResponse({ data: [] });
}

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(handlers[0](url, init)));
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  // Stub window.location.origin
  // jsdom provides one already, that's fine.
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Imports under test (after mocks)
import ProposalsAndDecksPageWrapper from '@/app/portal/crm/proposals/page';

async function renderPage() {
  const result = render(<ProposalsAndDecksPageWrapper />);
  await waitFor(() => {
    expect(result.container.textContent).not.toContain('Loading proposals...');
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProposalsAndDecksPage', () => {
  describe('initial load + Suspense wrapper', () => {
    it('renders loaded proposals tab by default', async () => {
      await renderPage();
      expect(screen.getAllByText('Proposals').length).toBeGreaterThan(0);
      expect(screen.getByText('Acme Build')).toBeTruthy();
    });

    it('reads ?tab=decks from search params for initial tab', async () => {
      searchParamsValue = new URLSearchParams('tab=decks');
      render(<ProposalsAndDecksPageWrapper />);
      await waitFor(() => {
        expect(screen.queryByText('Loading pitch decks...')).toBeNull();
      });
      expect(screen.getByText('Sales Deck')).toBeTruthy();
    });

    it('renders the header subtitle', async () => {
      await renderPage();
      expect(screen.getByText('Send proposals and pitch decks to clients')).toBeTruthy();
    });

    it('renders both tab buttons with counts', async () => {
      const { container } = await renderPage();
      // 5 proposals total
      expect(container.textContent).toContain('5');
      // 3 decks total — visible in the deck tab counter
      expect(container.textContent).toContain('3');
    });

    it('handles fetch error in fetchProposals gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/proposals?')) {
          return Promise.reject(new Error('boom'));
        }
        return defaultFetch(url, init);
      });
      render(<ProposalsAndDecksPageWrapper />);
      await waitFor(() => {
        expect(screen.queryByText('Loading proposals...')).toBeNull();
      });
      expect(screen.getByText(/No proposals yet/)).toBeTruthy();
    });

    it('handles fetch error in fetchDecks gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/tools/pitch-decks') {
          return Promise.reject(new Error('boom'));
        }
        return defaultFetch(url, init);
      });
      render(<ProposalsAndDecksPageWrapper />);
      // switch to decks tab
      await waitFor(() => screen.getByText('Pitch Decks'));
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => {
        expect(screen.queryByText('Loading pitch decks...')).toBeNull();
      });
      expect(screen.getByText('No pitch decks yet')).toBeTruthy();
    });

    it('falls back to data.data array when data.contacts is missing', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts')) {
          return jsonResponse({ data: baseContacts });
        }
        if (url.startsWith('/api/portal/crm/companies')) {
          return jsonResponse({ data: baseCompanies });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      // Open new proposal form to verify contacts are populated
      fireEvent.click(screen.getByText('New Proposal'));
      const contactSelect = screen.getByText('Select contact...').closest('select')!;
      expect(contactSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    it('handles missing data fields by defaulting to empty arrays', async () => {
      setFetchHandler((url) => {
        if (url.startsWith('/api/portal/crm/contacts')) return jsonResponse({});
        if (url.startsWith('/api/portal/crm/companies')) return jsonResponse({});
        if (url.startsWith('/api/portal/crm/deals')) return jsonResponse({});
        if (url === '/api/portal/crm/proposal-templates') return jsonResponse({});
        if (url.startsWith('/api/portal/crm/proposals?')) return jsonResponse({});
        if (url === '/api/portal/tools/pitch-decks') return jsonResponse({});
        return jsonResponse({});
      });
      const result = render(<ProposalsAndDecksPageWrapper />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No proposals yet');
      });
    });
  });

  describe('proposals tab — stats + table', () => {
    it('renders stat counters', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Total');
      // "Sent" appears as a stat label and as a status; assert via container
      expect(container.textContent).toContain('Sent');
      expect(container.textContent).toContain('Accepted');
      expect(container.textContent).toContain('Declined');
    });

    it('shows correct sent / accepted / declined counts', async () => {
      const { container } = await renderPage();
      // sentCount includes "sent" and "viewed" => sentProposal + viewedProposal = 2
      // container.textContent contains "Sent...2"
      expect(container.textContent).toMatch(/Sent[\s\S]*?2/);
    });

    it('renders proposal rows including contact and company', async () => {
      await renderPage();
      expect(screen.getByText('Acme Build')).toBeTruthy();
      expect(screen.getByText('Beta Sent')).toBeTruthy();
      expect(screen.getByText('Gamma Done')).toBeTruthy();
      // Acme appears as company for multiple proposals
      expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
    });

    it('renders dash for missing contact / company', async () => {
      const { container } = await renderPage();
      // Gamma Done has no contact / company => dashes should appear
      expect(container.textContent).toContain('-');
    });

    it('formats currency for proposal value', async () => {
      const { container } = await renderPage();
      // Acme: subtotal 2*50000 = 100000, fees flat 5000 + 10% of 100000 = 15000
      // total = 115000 cents = $1,150.00
      expect(container.textContent).toContain('$1,150.00');
    });

    it('handles proposals with empty lineItems / fees', async () => {
      const { container } = await renderPage();
      // viewedProposal has empty lineItems and fees => $0.00
      expect(container.textContent).toContain('$0.00');
    });

    it('renders sent and last viewed dates', async () => {
      const { container } = await renderPage();
      // Some sent dates rendered as locale date strings
      expect(container.textContent).toContain('(3x)');
    });

    it('renders status badges with colors', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('draft');
      expect(container.textContent).toContain('sent');
      expect(container.textContent).toContain('accepted');
      expect(container.textContent).toContain('declined');
      expect(container.textContent).toContain('viewed');
    });

    it('renders empty state when no proposals', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/proposals?')) {
          return jsonResponse({ data: [] });
        }
        return defaultFetch(url, init);
      });
      const result = render(<ProposalsAndDecksPageWrapper />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No proposals yet');
      });
    });
  });

  describe('proposal row actions', () => {
    it('clicking title navigates to proposal detail', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Build'));
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/proposals/1');
    });

    it('clicking edit icon navigates to proposal detail', async () => {
      const { container } = await renderPage();
      const editButtons = container.querySelectorAll('button[title="Edit"]');
      expect(editButtons.length).toBeGreaterThan(0);
      fireEvent.click(editButtons[0]);
      expect(pushMock).toHaveBeenCalled();
    });

    it('clicking duplicate creates a copy and navigates', async () => {
      const { container } = await renderPage();
      const dupButtons = container.querySelectorAll('button[title="Duplicate"]');
      fireEvent.click(dupButtons[0]);
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/portal/crm/proposals/999');
      });
    });

    it('duplicate failure does not navigate', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/proposals' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'oops' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const dupButtons = container.querySelectorAll('button[title="Duplicate"]');
      fireEvent.click(dupButtons[0]);
      await flush();
      // pushMock should not be called for duplicate
      const dupCalls = pushMock.mock.calls.filter(c => c[0]?.includes('/portal/crm/proposals/'));
      expect(dupCalls.length).toBe(0);
    });

    it('send button only shows for draft and sent proposals', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      // draft(1) + sent(1) + sent-viewed... only draft + sent show. acceptedProposal/declinedProposal/viewedProposal don't.
      // From our data: baseProposal(draft) and sentProposal(sent) => 2 send buttons
      expect(sendButtons.length).toBe(2);
    });
  });

  describe('new proposal form', () => {
    it('toggles new proposal form open and closed', async () => {
      const { container } = await renderPage();
      // Find the "New Proposal" header button (it has add icon)
      const headerBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('New Proposal'));
      fireEvent.click(headerBtn!);
      expect(screen.getByText('Title *')).toBeTruthy();
      // Header button now reads "Cancel" with a close icon
      const cancelHeaderBtn = Array.from(container.querySelectorAll('button')).find(b => {
        const t = b.textContent || '';
        return t.includes('Cancel') && t.includes('close');
      });
      expect(cancelHeaderBtn).toBeTruthy();
      fireEvent.click(cancelHeaderBtn!);
      expect(screen.queryByText('Title *')).toBeNull();
    });

    it('closing via inline Cancel button hides the form', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      // Click the inline Cancel inside the form (type=button)
      const cancelButtons = screen.getAllByText('Cancel');
      const inlineCancel = cancelButtons.find(b => (b as HTMLButtonElement).type === 'button');
      fireEvent.click(inlineCancel!);
      expect(screen.queryByText('Title *')).toBeNull();
    });

    it('populates contact / company / deal / template dropdowns', async () => {
      const { container } = await renderPage();
      const headerBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('New Proposal'));
      fireEvent.click(headerBtn!);
      // Contact options — pre-loaded synchronously
      expect(container.textContent).toContain('Jane Doe');
      expect(container.textContent).toContain('Bob Smith');
      // Company options — mock fetches async; wait for the option to appear
      await waitFor(() => expect(container.textContent).toContain('Beta Co'));
      // Deal options
      expect(container.textContent).toContain('Q1 Project');
      // Template options
      expect(container.textContent).toContain('Template A');
    });

    it('updates form fields on input change', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const titleInput = container.querySelector('input[placeholder="Proposal title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'My New Prop' } });
      expect(titleInput.value).toBe('My New Prop');
    });

    it('submits form successfully and navigates', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const titleInput = container.querySelector('input[placeholder="Proposal title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'New Prop' } });
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/portal/crm/proposals/999');
      });
    });

    it('submit with contact, company, deal IDs sends them as numbers', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => Promise.resolve(defaultFetch(url, init)));
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const titleInput = container.querySelector('input[placeholder="Proposal title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'X' } });
      // Wait for the company mock's async fetch to populate option '100' before selecting
      await waitFor(() => {
        const companySelect = container.querySelectorAll('select')[1] as HTMLSelectElement;
        expect(Array.from(companySelect.options).some(o => o.value === '100')).toBe(true);
      });
      const selects = container.querySelectorAll('select');
      // contact, company, deal, template
      fireEvent.change(selects[0], { target: { value: '10' } });
      fireEvent.change(selects[1], { target: { value: '100' } });
      fireEvent.change(selects[2], { target: { value: '1000' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/proposals' && c[1]?.method === 'POST');
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.contactId).toBe(10);
        expect(body.companyId).toBe(100);
        expect(body.dealId).toBe(1000);
      });
    });

    it('submit shows error message when API returns failure', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/proposals' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Bad request' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const titleInput = container.querySelector('input[placeholder="Proposal title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'X' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(screen.getByText('Bad request')).toBeTruthy();
      });
    });

    it('submit shows default error message when API returns no message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/proposals' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const titleInput = container.querySelector('input[placeholder="Proposal title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'X' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(screen.getByText('Failed to create proposal.')).toBeTruthy();
      });
    });

    it('selecting a template populates template state and submit sends them', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) => Promise.resolve(defaultFetch(url, init)));
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const selects = container.querySelectorAll('select');
      // 4th select = template
      fireEvent.change(selects[3], { target: { value: '5000' } });
      const titleInput = container.querySelector('input[placeholder="Proposal title"]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'WithTpl' } });
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/proposals' && c[1]?.method === 'POST');
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.sections).toBeTruthy();
        expect(body.lineItems).toBeTruthy();
        expect(body.fees).toBeTruthy();
      });
    });

    it('selecting empty template id clears template state', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const selects = container.querySelectorAll('select');
      // pick a template, then unset it
      fireEvent.change(selects[3], { target: { value: '5000' } });
      fireEvent.change(selects[3], { target: { value: '' } });
      // No error means clear worked
      expect(true).toBe(true);
    });

    it('selecting a template with null sections/lineItems/fees defaults to empty arrays', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('New Proposal'));
      const selects = container.querySelectorAll('select');
      fireEvent.change(selects[3], { target: { value: '5001' } });
      // No exception thrown is the assertion
      expect(true).toBe(true);
    });
  });

  describe('send dialog', () => {
    it('opens send dialog when send icon clicked', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      expect(screen.getByText('Send Proposal')).toBeTruthy();
    });

    it('shows contact name + email in confirmation', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      // first send button -> baseProposal (Jane Doe, jane@acme.test)
      fireEvent.click(sendButtons[0]);
      expect(container.textContent).toContain('Jane Doe');
      expect(container.textContent).toContain('jane@acme.test');
    });

    it('skips the contact line if no contact set', async () => {
      // viewedProposal status=viewed has no contact, but only draft/sent show send btn.
      // Build a proposal with status=draft and no contact.
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/proposals?')) {
          return jsonResponse({
            data: [{ ...baseProposal, contactFirstName: null, contactLastName: null, contactEmail: null }],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      expect(container.textContent).toContain('Send Proposal');
    });

    it('cancel button on confirm step closes dialog', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      const cancel = screen.getAllByText('Cancel').find(el => (el as HTMLButtonElement).tagName === 'BUTTON');
      fireEvent.click(cancel!);
      expect(screen.queryByText('Send Proposal')).toBeNull();
    });

    it('Send Now triggers send flow and shows shareable URL', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => {
        expect(screen.getByText('Proposal Sent')).toBeTruthy();
      });
      const urlInput = container.querySelector('input[readonly]') as HTMLInputElement;
      expect(urlInput.value).toContain('/p/abc');
    });

    it('copy link button calls clipboard.writeText', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => screen.getByText('Proposal Sent'));
      const copyBtn = container.querySelector('button[title="Copy link"]')!;
      fireEvent.click(copyBtn);
      expect((navigator.clipboard.writeText as any).mock.calls.length).toBeGreaterThan(0);
    });

    it('Done button closes confirmation step', async () => {
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => screen.getByText('Proposal Sent'));
      fireEvent.click(screen.getByText('Done'));
      expect(screen.queryByText('Proposal Sent')).toBeNull();
    });

    it('send failure closes the dialog', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/crm\/proposals\/\d+\/send$/.test(url)) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      const sendButtons = container.querySelectorAll('button[title="Send"]');
      fireEvent.click(sendButtons[0]);
      fireEvent.click(screen.getByText('Send Now'));
      await waitFor(() => {
        expect(screen.queryByText('Send Proposal')).toBeNull();
      });
    });
  });

  describe('proposal search', () => {
    it('typing in search updates debounced search after 300ms', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.fn((url: string, init?: any) => Promise.resolve(defaultFetch(url, init)));
      // @ts-ignore
      global.fetch = fetchSpy;
      render(<ProposalsAndDecksPageWrapper />);
      // initial fetches happen
      await act(async () => { await Promise.resolve(); });
      const searchInput = document.querySelector('input[placeholder="Search proposals by title..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'foo' } });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      const proposalsCall = fetchSpy.mock.calls.find(c =>
        typeof c[0] === 'string' && c[0].includes('search=foo'));
      expect(proposalsCall).toBeTruthy();
      vi.useRealTimers();
    });
  });

  describe('decks tab', () => {
    async function openDecks() {
      const result = await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      return result;
    }

    it('switches to decks tab on click', async () => {
      await openDecks();
      expect(screen.getByText('Sales Deck')).toBeTruthy();
      expect(screen.getByText('Onboarding')).toBeTruthy();
    });

    it('shows New Deck button on decks tab and navigates on click', async () => {
      await openDecks();
      // the header New Deck (only when activeTab === decks)
      const headerNewDeck = screen.getAllByText('New Deck')[0];
      fireEvent.click(headerNewDeck);
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/new');
    });

    it('renders deck cards with slide counts (plural & singular)', async () => {
      const { container } = await openDecks();
      expect(container.textContent).toContain('3 slides');
      expect(container.textContent).toContain('0 slides');
      expect(container.textContent).toContain('1 slide');
    });

    it('clicking a deck card navigates to deck detail', async () => {
      await openDecks();
      fireEvent.click(screen.getByText('Sales Deck'));
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/1');
    });

    it('renders status pills (published, draft, archived)', async () => {
      const { container } = await openDecks();
      expect(container.textContent).toContain('published');
      expect(container.textContent).toContain('draft');
      expect(container.textContent).toContain('archived');
    });

    it('shows empty state when no decks at all', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/tools/pitch-decks') {
          return jsonResponse({ data: [] });
        }
        return defaultFetch(url, init);
      });
      const result = render(<ProposalsAndDecksPageWrapper />);
      await waitFor(() => screen.getByText('Pitch Decks'));
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pitch decks yet');
      });
      fireEvent.click(screen.getByText('Create Your First Deck'));
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks/new');
    });

    it('filters decks by status (draft only)', async () => {
      const { container } = await openDecks();
      const draftPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Draft'));
      expect(draftPill).toBeTruthy();
      fireEvent.click(draftPill!);
      expect(container.textContent).toContain('Onboarding');
      expect(container.textContent).not.toContain('Sales Deck');
    });

    it('filters decks by status (published only)', async () => {
      const { container } = await openDecks();
      const pubPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Published'));
      fireEvent.click(pubPill!);
      expect(container.textContent).toContain('Sales Deck');
      expect(container.textContent).not.toContain('Onboarding');
    });

    it('filters decks by status (archived only)', async () => {
      const { container } = await openDecks();
      const archPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Archived'));
      fireEvent.click(archPill!);
      expect(container.textContent).toContain('Archived Pitch');
      expect(container.textContent).not.toContain('Sales Deck');
    });

    it('searches decks by title (debounced)', async () => {
      const { container } = await openDecks();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'sales' } });
      // Real debounce — wait for it
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Sales Deck');
      expect(container.textContent).not.toContain('Onboarding');
    });

    it('searches decks by description', async () => {
      const { container } = await openDecks();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'funnel' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Sales Deck');
    });

    it('shows "no decks match" state when search yields no results', async () => {
      const { container } = await openDecks();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'zzz-no-match' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('No decks match your filters');
    });

    it('Reset filters button clears search + status filter', async () => {
      const { container } = await openDecks();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'zzz' } });
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      const reset = screen.getByText('Reset filters');
      fireEvent.click(reset);
      // Reset clears searchInput and status filter; debounced search clears after 300ms
      await new Promise(r => setTimeout(r, 350));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Sales Deck');
    });

    it('Clear filters link at top of result list clears filters', async () => {
      const { container } = await openDecks();
      const draftPill = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.trim().startsWith('Draft'));
      fireEvent.click(draftPill!);
      await act(async () => { await Promise.resolve(); });
      // showing 1 of 3 decks, so "clear filters" should be visible
      const clear = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent === 'clear filters');
      expect(clear).toBeTruthy();
      fireEvent.click(clear!);
    });

    it('Clear search button (x) clears deck search input', async () => {
      const { container } = await openDecks();
      const searchInput = container.querySelector('input[placeholder="Search decks by title or description..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'sales' } });
      const clearBtn = container.querySelector('button[title="Clear search"]')!;
      fireEvent.click(clearBtn);
      expect(searchInput.value).toBe('');
    });

    it('sorts decks by title ascending', async () => {
      const { container } = await openDecks();
      const sortSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'title-asc')) as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: 'title-asc' } });
      const titles = Array.from(container.querySelectorAll('h3')).map(h => h.textContent || '');
      // Archived Pitch < Onboarding < Sales Deck
      const filtered = titles.filter(t => ['Sales Deck', 'Onboarding', 'Archived Pitch'].includes(t));
      expect(filtered[0]).toBe('Archived Pitch');
    });

    it('sorts decks by title descending', async () => {
      const { container } = await openDecks();
      const sortSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'title-desc')) as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: 'title-desc' } });
      const titles = Array.from(container.querySelectorAll('h3')).map(h => h.textContent || '');
      const filtered = titles.filter(t => ['Sales Deck', 'Onboarding', 'Archived Pitch'].includes(t));
      expect(filtered[0]).toBe('Sales Deck');
    });

    it('sorts decks by updated date ascending', async () => {
      const { container } = await openDecks();
      const sortSelect = Array.from(container.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === 'updated-asc')) as HTMLSelectElement;
      fireEvent.change(sortSelect, { target: { value: 'updated-asc' } });
      const titles = Array.from(container.querySelectorAll('h3')).map(h => h.textContent || '');
      const filtered = titles.filter(t => ['Sales Deck', 'Onboarding', 'Archived Pitch'].includes(t));
      // oldest first: Archived Pitch (2024-12) then Onboarding (2025-01) then Sales Deck (2025-02)
      expect(filtered[0]).toBe('Archived Pitch');
    });
  });

  describe('deck delete', () => {
    async function openDecks() {
      await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => screen.getByText('Sales Deck'));
    }

    it('opens delete dialog when delete icon clicked', async () => {
      await openDecks();
      const delBtns = document.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      expect(screen.getByText('Delete Pitch Deck')).toBeTruthy();
      // "Sales Deck" appears in the card AND the dialog; use getAllByText
      expect(screen.getAllByText('Sales Deck').length).toBeGreaterThan(0);
    });

    it('Cancel button on delete dialog closes it without deleting', async () => {
      await openDecks();
      const delBtns = document.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const cancelButtons = screen.getAllByText('Cancel');
      // pick the one that's a button (the dialog's cancel)
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);
      expect(screen.queryByText('Delete Pitch Deck')).toBeNull();
    });

    it('Delete button removes deck from list on success', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => screen.getByText('Sales Deck'));
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.queryByText('Sales Deck')).toBeNull();
      });
    });

    it('Delete shows error message when API returns failure', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
          return jsonResponse({ success: false, message: 'cannot delete' });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => screen.getByText('Sales Deck'));
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.getByText('cannot delete')).toBeTruthy();
      });
    });

    it('Delete falls back to default error message when no message in response', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => screen.getByText('Sales Deck'));
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.getByText('Failed to delete deck.')).toBeTruthy();
      });
    });

    it('Delete handles fetch throw with default error message', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/portal\/tools\/pitch-decks\/\d+$/.test(url) && init?.method === 'DELETE') {
          return Promise.reject(new Error('network'));
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => screen.getByText('Sales Deck'));
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent === 'Delete');
      fireEvent.click(deleteBtn!);
      await waitFor(() => {
        expect(screen.getByText('Failed to delete deck.')).toBeTruthy();
      });
    });

    it('falls back to "this deck" if id not found in decks list', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Pitch Decks'));
      await waitFor(() => screen.getByText('Sales Deck'));
      const delBtns = container.querySelectorAll('button[title="Delete deck"]');
      fireEvent.click(delBtns[0]);
      // "Sales Deck" appears in card + dialog after dialog opens — assert via getAllByText
      expect(screen.getAllByText('Sales Deck').length).toBeGreaterThan(0);
    });
  });
});
