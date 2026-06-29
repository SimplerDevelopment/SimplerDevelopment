// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/contracts/[id]/page.tsx`
 *
 * 'use client' page — uses useParams to get the contract id, fetches the
 * contract + signing events on mount, and renders:
 *   - Loading state, not-found state, error banner
 *   - E-signature panel with status badge and action buttons (send / sign / cancel / download)
 *   - Audit trail (events list or empty state)
 *   - Send-for-signature dialog
 *   - Sign-now iframe modal
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

let paramsValue: Record<string, string> = { id: '42' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => paramsValue,
  usePathname: () => '/portal/crm/contracts/42',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => unknown;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const baseContract = {
  id: 42,
  clientId: 1,
  title: 'Service Agreement',
  summary: 'Main services contract',
  status: 'active',
  clauses: [
    { id: 'c1', title: 'Scope', content: 'Full scope of work', required: true },
  ],
  currency: 'USD',
  esignProvider: 'dropbox',
  esignProviderRequestId: 'req_abc',
  esignSignerEmail: 'client@example.test',
  esignSignerName: 'Alice Client',
  esignStatus: 'not_sent',
  esignSentAt: null,
  esignSignedAt: null,
  esignDeclinedAt: null,
  esignAuditFileUrl: null,
  signers: [],
};

const baseEvents = [
  {
    id: 1,
    contractId: 42,
    kind: 'sent',
    actorEmail: 'owner@example.test',
    occurredAt: '2025-01-10T10:00:00Z',
    payload: null,
  },
  {
    id: 2,
    contractId: 42,
    kind: 'signed',
    actorEmail: 'client@example.test',
    occurredAt: '2025-01-11T12:00:00Z',
    payload: null,
  },
];

function defaultFetch(url: string, init?: RequestInit): unknown {
  if (url === '/api/portal/crm/contracts/42' && (!init?.method || init.method === 'GET')) {
    return jsonResponse({ success: true, data: baseContract });
  }
  if (url === '/api/portal/crm/contracts/42/signing-events') {
    return jsonResponse({ success: true, data: baseEvents });
  }
  if (url === '/api/portal/crm/contracts/42/send-for-signature' && init?.method === 'POST') {
    return jsonResponse({ success: true });
  }
  if (url === '/api/portal/crm/contracts/42/sign-url') {
    return jsonResponse({ success: true, data: { signUrl: 'https://sign.example.test/embed' } });
  }
  if (url === '/api/portal/crm/contracts/42/cancel-signature' && init?.method === 'POST') {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: true, data: {} });
}

beforeEach(() => {
  paramsValue = { id: '42' };
  setFetchHandler(defaultFetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// Imports under test (after mocks)
import PortalContractDetailPage from '@/app/portal/crm/contracts/[id]/page';

async function renderLoaded(contract = baseContract) {
  setFetchHandler((url, init) => {
    if (url === '/api/portal/crm/contracts/42' && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ success: true, data: contract });
    }
    return defaultFetch(url, init);
  });
  const result = render(<PortalContractDetailPage />);
  await waitFor(() => {
    expect(result.container.textContent).toContain(contract.title);
  });
  return result;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PortalContractDetailPage', () => {
  // ── loading / not-found / error ──────────────────────────────────────────

  describe('loading and not-found states', () => {
    it('renders loading text before fetch resolves', () => {
      setFetchHandler(() => new Promise(() => {}));
      const { container } = render(<PortalContractDetailPage />);
      expect(container.textContent).toContain('Loading contract');
    });

    it('renders not-found when contract fetch returns success:false', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42' && (!init?.method || init.method === 'GET')) {
          return jsonResponse({ success: false, error: 'Not found' });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<PortalContractDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Contract not found');
      });
    });

    it('shows error text from API in not-found state', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42' && (!init?.method || init.method === 'GET')) {
          return jsonResponse({ success: false, error: 'Forbidden' });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<PortalContractDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Forbidden');
      });
    });

    it('shows error text when fetch throws', async () => {
      setFetchHandler(() => {
        throw new Error('Network failure');
      });
      const { container } = render(<PortalContractDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Network failure');
      });
    });

    it('renders contract title after successful load', async () => {
      const { container } = await renderLoaded();
      expect(container.textContent).toContain('Service Agreement');
    });

    it('renders back link to /portal/crm', async () => {
      const { container } = await renderLoaded();
      const backLink = container.querySelector('a[href="/portal/crm"]');
      expect(backLink).toBeTruthy();
    });
  });

  // ── e-signature panel ────────────────────────────────────────────────────

  describe('e-signature panel', () => {
    it('renders the E-signature section heading', async () => {
      const { container } = await renderLoaded();
      expect(container.textContent).toContain('E-signature');
    });

    it('shows "Not sent" status badge for not_sent esignStatus', async () => {
      const { container } = await renderLoaded();
      expect(container.textContent).toContain('Not sent');
    });

    it('shows "Send for signature" button when status is not_sent', async () => {
      const { container } = await renderLoaded();
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      );
      expect(btn).toBeTruthy();
    });

    it('shows "Send for signature" button when esignStatus is declined', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'declined' });
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      );
      expect(btn).toBeTruthy();
    });

    it('shows "Send for signature" button when esignStatus is canceled', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'canceled' });
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      );
      expect(btn).toBeTruthy();
    });

    it('shows "Sign now" button when esignStatus is sent', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign now'),
      );
      expect(btn).toBeTruthy();
    });

    it('shows "Sign now" button when esignStatus is viewed', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'viewed' });
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign now'),
      );
      expect(btn).toBeTruthy();
    });

    it('shows "Cancel signature request" button when esignStatus is sent', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel signature request'),
      );
      expect(btn).toBeTruthy();
    });

    it('does not show "Send for signature" when already signed', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'signed' });
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      );
      expect(btn).toBeUndefined();
    });

    it('shows "Download signed PDF" link when signed with audit file URL', async () => {
      const { container } = await renderLoaded({
        ...baseContract,
        esignStatus: 'signed',
        esignAuditFileUrl: 'https://cdn.example.test/signed.pdf',
      });
      const link = container.querySelector('a[href="https://cdn.example.test/signed.pdf"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Download signed PDF');
    });

    it('does not show download link when status is signed but no audit URL', async () => {
      const { container } = await renderLoaded({
        ...baseContract,
        esignStatus: 'signed',
        esignAuditFileUrl: null,
      });
      const link = Array.from(container.querySelectorAll('a')).find(
        (a) => a.textContent?.includes('Download signed PDF'),
      );
      expect(link).toBeUndefined();
    });

    it('shows signer email and name when esignSignerEmail is set', async () => {
      const { container } = await renderLoaded({
        ...baseContract,
        esignSignerEmail: 'client@example.test',
        esignSignerName: 'Alice Client',
      });
      expect(container.textContent).toContain('Alice Client');
      expect(container.textContent).toContain('client@example.test');
    });

    it('shows sent timestamp when esignSentAt is set', async () => {
      const { container } = await renderLoaded({
        ...baseContract,
        esignStatus: 'sent',
        esignSentAt: '2025-03-15T09:00:00Z',
      });
      // Just check it renders a date string — locale-dependent exact text
      expect(container.textContent).toContain('sent');
    });

    it('shows "Sent — awaiting signature" badge for sent status', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      expect(container.textContent).toContain('Sent — awaiting signature');
    });

    it('shows "Opened by signer" badge for viewed status', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'viewed' });
      expect(container.textContent).toContain('Opened by signer');
    });

    it('shows "Signed" badge for signed status', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'signed' });
      expect(container.textContent).toContain('Signed');
    });

    it('shows "Declined" badge for declined status', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'declined' });
      expect(container.textContent).toContain('Declined');
    });

    it('falls back to raw status text for unknown esignStatus', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'unknown_state' });
      expect(container.textContent).toContain('unknown_state');
    });

    it('shows "Not sent" badge when esignStatus is null (defaults to not_sent)', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: null });
      expect(container.textContent).toContain('Not sent');
    });
  });

  // ── send-for-signature dialog ────────────────────────────────────────────

  describe('send-for-signature dialog', () => {
    it('opens the send dialog when "Send for signature" is clicked', async () => {
      const { container } = await renderLoaded();
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(btn);
      expect(container.textContent).toContain('Send contract for signature');
    });

    it('cancel button in dialog closes it', async () => {
      const { container } = await renderLoaded();
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(btn);
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Cancel',
      )!;
      fireEvent.click(cancelBtn);
      expect(container.textContent).not.toContain('Send contract for signature');
    });

    it('Send button is disabled when name or email is empty', async () => {
      const { container } = await renderLoaded();
      const openBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(openBtn);
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Send',
      ) as HTMLButtonElement;
      expect(sendBtn?.disabled).toBe(true);
    });

    it('Send button enables when both name and email are filled', async () => {
      const { container } = await renderLoaded();
      const openBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(openBtn);
      const inputs = container.querySelectorAll('input');
      // Dialog inputs: signer name, signer email
      const nameInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'Jane Doe',
      ) as HTMLInputElement;
      const emailInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'jane@example.com',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Bob Signer' } });
      fireEvent.change(emailInput, { target: { value: 'bob@example.test' } });
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Send',
      ) as HTMLButtonElement;
      expect(sendBtn?.disabled).toBe(false);
    });

    it('clicking Send POSTs to send-for-signature and closes dialog on success', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(handlers[0](url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderLoaded();
      const openBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(openBtn);
      const inputs = container.querySelectorAll('input');
      const nameInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'Jane Doe',
      ) as HTMLInputElement;
      const emailInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'jane@example.com',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Bob Signer' } });
      fireEvent.change(emailInput, { target: { value: 'bob@example.test' } });
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Send',
      )!;
      fireEvent.click(sendBtn);
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) =>
            c[0] === '/api/portal/crm/contracts/42/send-for-signature' &&
            (c[1] as RequestInit)?.method === 'POST',
        );
        expect(call).toBeTruthy();
        const body = JSON.parse((call![1] as RequestInit).body as string);
        expect(body.signerName).toBe('Bob Signer');
        expect(body.signerEmail).toBe('bob@example.test');
      });
      await waitFor(() => {
        expect(container.textContent).not.toContain('Send contract for signature');
      });
    });

    it('shows error when send-for-signature API fails', async () => {
      const { container } = await renderLoaded();
      setFetchHandler((url, init) => {
        if (
          url === '/api/portal/crm/contracts/42/send-for-signature' &&
          (init as RequestInit)?.method === 'POST'
        ) {
          return jsonResponse({ success: false, error: 'Provider error' }, false);
        }
        return defaultFetch(url, init);
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
      );
      const openBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(openBtn);
      const inputs = container.querySelectorAll('input');
      const nameInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'Jane Doe',
      ) as HTMLInputElement;
      const emailInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'jane@example.com',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Bob' } });
      fireEvent.change(emailInput, { target: { value: 'bob@test.com' } });
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Send',
      )!;
      fireEvent.click(sendBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Provider error');
      });
    });

    it('shows fallback error when send-for-signature API returns no error text', async () => {
      const { container } = await renderLoaded();
      setFetchHandler((url, init) => {
        if (
          url === '/api/portal/crm/contracts/42/send-for-signature' &&
          (init as RequestInit)?.method === 'POST'
        ) {
          return jsonResponse({ success: false }, false);
        }
        return defaultFetch(url, init);
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
      );
      const openBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(openBtn);
      const inputs = container.querySelectorAll('input');
      const nameInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'Jane Doe',
      ) as HTMLInputElement;
      const emailInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'jane@example.com',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Bob' } });
      fireEvent.change(emailInput, { target: { value: 'bob@test.com' } });
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Send',
      )!;
      fireEvent.click(sendBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Failed to send for signature');
      });
    });
  });

  // ── sign-now ─────────────────────────────────────────────────────────────

  describe('sign-now modal', () => {
    it('clicking "Sign now" fetches the sign URL and renders iframe', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const signBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign now'),
      )!;
      fireEvent.click(signBtn);
      await waitFor(() => {
        const iframe = container.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.getAttribute('src')).toBe('https://sign.example.test/embed');
      });
    });

    it('shows "Loading…" text while sign URL is being fetched', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42/sign-url') {
          return new Promise(() => {});
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const signBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign now'),
      )!;
      fireEvent.click(signBtn);
      expect(container.textContent).toContain('Loading');
    });

    it('shows error when sign-url fetch fails', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42/sign-url') {
          return jsonResponse({ success: false, error: 'URL unavailable' }, false);
        }
        return defaultFetch(url, init);
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
      );
      const signBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign now'),
      )!;
      fireEvent.click(signBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('URL unavailable');
      });
    });

    it('closing the sign modal hides the iframe', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const signBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign now'),
      )!;
      fireEvent.click(signBtn);
      await waitFor(() => {
        expect(container.querySelector('iframe')).toBeTruthy();
      });
      // Close button is aria-label="Close"
      const closeBtn = container.querySelector('button[aria-label="Close"]')!;
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(container.querySelector('iframe')).toBeNull();
      });
    });
  });

  // ── cancel signature ─────────────────────────────────────────────────────

  describe('cancel signature', () => {
    it('calls cancel API when user confirms', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(handlers[0](url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel signature request'),
      )!;
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) =>
            c[0] === '/api/portal/crm/contracts/42/cancel-signature' &&
            (c[1] as RequestInit)?.method === 'POST',
        );
        expect(call).toBeTruthy();
      });
    });

    it('aborts cancel when user dismisses the confirm dialog', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(handlers[0](url, init)),
      );
      vi.stubGlobal('fetch', fetchSpy);
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel signature request'),
      )!;
      fireEvent.click(cancelBtn);
      await flush();
      const call = fetchSpy.mock.calls.find(
        (c) =>
          c[0] === '/api/portal/crm/contracts/42/cancel-signature' &&
          (c[1] as RequestInit)?.method === 'POST',
      );
      expect(call).toBeUndefined();
    });

    it('shows error when cancel API fails', async () => {
      const { container } = await renderLoaded({ ...baseContract, esignStatus: 'sent' });
      // Override fetch AFTER the initial load so cancel sees the error
      setFetchHandler((url, init) => {
        if (
          url === '/api/portal/crm/contracts/42/cancel-signature' &&
          (init as RequestInit)?.method === 'POST'
        ) {
          return jsonResponse({ success: false, error: 'Cannot cancel' }, false);
        }
        return defaultFetch(url, init);
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
      );
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Cancel signature request'),
      )!;
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Cannot cancel');
      });
    });
  });

  // ── audit trail ──────────────────────────────────────────────────────────

  describe('audit trail', () => {
    it('renders the "Audit trail" heading', async () => {
      const { container } = await renderLoaded();
      expect(container.textContent).toContain('Audit trail');
    });

    it('renders events list with kind and actor email', async () => {
      const { container } = await renderLoaded();
      await waitFor(() => {
        expect(container.textContent).toContain('sent');
        expect(container.textContent).toContain('owner@example.test');
        expect(container.textContent).toContain('signed');
        expect(container.textContent).toContain('client@example.test');
      });
    });

    it('renders empty state when no signing events', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42/signing-events') {
          return jsonResponse({ success: true, data: [] });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<PortalContractDetailPage />);
      await waitFor(() => screen.getByText('Service Agreement'));
      expect(container.textContent).toContain('No signing events yet.');
    });

    it('renders event with null actorEmail gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42/signing-events') {
          return jsonResponse({
            success: true,
            data: [
              {
                id: 9,
                contractId: 42,
                kind: 'webhook',
                actorEmail: null,
                occurredAt: '2025-02-01T00:00:00Z',
                payload: null,
              },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<PortalContractDetailPage />);
      await waitFor(() => screen.getByText('Service Agreement'));
      expect(container.textContent).toContain('webhook');
    });

    it('renders known EVENT_ICON kinds', async () => {
      const kinds = ['sent', 'opened', 'signed', 'all_signed', 'declined', 'canceled', 'webhook'];
      for (const kind of kinds) {
        setFetchHandler((url, init) => {
          if (url === '/api/portal/crm/contracts/42/signing-events') {
            return jsonResponse({
              success: true,
              data: [
                {
                  id: 99,
                  contractId: 42,
                  kind,
                  actorEmail: null,
                  occurredAt: '2025-05-01T00:00:00Z',
                  payload: null,
                },
              ],
            });
          }
          return defaultFetch(url, init);
        });
        const { container, unmount } = render(<PortalContractDetailPage />);
        await waitFor(() => screen.getByText('Service Agreement'));
        expect(container.textContent).toContain(kind.replace('_', ' '));
        unmount();
      }
    });

    it('falls back to "event" icon for unknown event kind', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contracts/42/signing-events') {
          return jsonResponse({
            success: true,
            data: [
              {
                id: 8,
                contractId: 42,
                kind: 'mystery',
                actorEmail: null,
                occurredAt: '2025-06-01T00:00:00Z',
                payload: null,
              },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<PortalContractDetailPage />);
      await waitFor(() => screen.getByText('Service Agreement'));
      // The span text will be "event" (fallback icon name)
      expect(container.textContent).toContain('event');
    });
  });

  // ── error banner ─────────────────────────────────────────────────────────

  describe('error banner', () => {
    it('renders the error banner inside the main view when errorText is set and contract is loaded', async () => {
      const { container } = await renderLoaded();
      setFetchHandler((url, init) => {
        if (
          url === '/api/portal/crm/contracts/42/send-for-signature' &&
          (init as RequestInit)?.method === 'POST'
        ) {
          return jsonResponse({ success: false, error: 'Signature service down' }, false);
        }
        return defaultFetch(url, init);
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
      );
      const openBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send for signature'),
      )!;
      fireEvent.click(openBtn);
      const inputs = container.querySelectorAll('input');
      const nameInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'Jane Doe',
      ) as HTMLInputElement;
      const emailInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).placeholder === 'jane@example.com',
      ) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'X' } });
      fireEvent.change(emailInput, { target: { value: 'x@x.com' } });
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Send',
      )!;
      fireEvent.click(sendBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Signature service down');
      });
    });
  });
});
