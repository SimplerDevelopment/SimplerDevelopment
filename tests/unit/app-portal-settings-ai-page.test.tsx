// @vitest-environment jsdom
/**
 * Unit tests for app/portal/settings/ai/page.tsx
 *
 * 'use client' component — tested via jsdom + @testing-library/react.
 * All network calls are mocked via globalThis.fetch.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (declared before importing the module under test)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal/settings/ai',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const baseConversations = [
  {
    id: 1,
    title: '[Email] Order inquiry',
    flagged: false,
    totalInputTokens: 500,
    totalOutputTokens: 200,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 2,
    title: 'Chat about project',
    flagged: true,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const baseCredits = {
  balance: 8500,
  monthlyGrant: 10000,
  payAsYouGo: false,
  ledger: [
    {
      id: 1,
      type: 'grant',
      amount: 10000,
      balanceAfter: 10000,
      description: 'Monthly grant',
      serviceCategory: null,
      referenceId: null,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 2,
      type: 'usage',
      amount: -1500,
      balanceAfter: 8500,
      description: 'AI assistant usage',
      serviceCategory: 'chat',
      referenceId: null,
      createdAt: new Date(Date.now() - 43200000).toISOString(),
    },
  ],
  monthlyUsage: 1500,
};

const baseProfile = {
  success: true,
  data: { emailPrefix: 'mycompany' },
};

const baseImageUsage = {
  todayCount: 3,
  monthCount: 47,
  dailyCap: 10,
  perDesignCap: 5,
  recentEvents: [
    {
      id: 1,
      recordedAt: new Date(Date.now() - 3600000).toISOString(),
      amount: 2,
      source: 'platform' as const,
      period: '2026-06',
    },
    {
      id: 2,
      recordedAt: new Date(Date.now() - 7200000).toISOString(),
      amount: 1,
      source: 'byok' as const,
      period: '2026-06',
    },
  ],
};

function defaultFetch(url: string, init?: RequestInit): unknown {
  if (url === '/api/portal/ai/conversations') return { data: baseConversations };
  if (url === '/api/portal/credits?limit=100') return baseCredits;
  if (url === '/api/portal/settings/profile' && (!init?.method || init.method === 'GET')) return baseProfile;
  if (url === '/api/portal/ai/image-usage') return baseImageUsage;
  if (url.startsWith('/api/portal/ai/conversations/')) {
    return {
      data: {
        messages: [
          {
            id: 10,
            role: 'user',
            content: 'Hello',
            toolCalls: null,
            inputTokens: 50,
            outputTokens: 0,
            createdAt: new Date(Date.now() - 3600000).toISOString(),
          },
          {
            id: 11,
            role: 'assistant',
            content: 'Hi there! How can I help?',
            toolCalls: [{ name: 'get_crm_contacts', input: {}, result: null }],
            inputTokens: 100,
            outputTokens: 80,
            createdAt: new Date(Date.now() - 3500000).toISOString(),
          },
        ],
      },
    };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Import module under test (after all vi.mock calls)
// ---------------------------------------------------------------------------

import AISettingsPage from '@/app/portal/settings/ai/page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AISettingsPage', () => {
  beforeEach(() => {
    installFetchMock(defaultFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading spinner initially', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<AISettingsPage />);
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    const hasRefresh = icons.some((el) => el.textContent === 'refresh');
    expect(hasRefresh).toBe(true);
  });

  // ── Overview cards after load ──────────────────────────────────────────────

  it('renders Email Requests card after load', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('Email Requests')).toBeTruthy();
  });

  it('renders Chat Conversations card after load', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('Chat Conversations')).toBeTruthy();
  });

  it('renders Credits Remaining card after load', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('Credits Remaining')).toBeTruthy();
  });

  it('displays correct email conversation count', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // 1 email conversation in baseConversations
    const cards = document.querySelectorAll('.bg-card');
    const emailCard = Array.from(cards).find((c) => c.textContent?.includes('Email Requests'));
    expect(emailCard?.textContent).toContain('1');
  });

  it('displays correct chat conversation count', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // 1 chat conversation in baseConversations
    const cards = document.querySelectorAll('.bg-card');
    const chatCard = Array.from(cards).find((c) => c.textContent?.includes('Chat Conversations'));
    expect(chatCard?.textContent).toContain('1');
  });

  it('displays formatted credit balance', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // 8500 formatted as 8,500
    expect(document.body.textContent).toContain('8,500');
  });

  it('shows --- for credits when credit fetch fails', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/credits?limit=100') throw new Error('fail');
      return defaultFetch(url);
    });
    // Override to catch rejection on credits
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/credits?limit=100') {
        // Promise.all's .catch(() => null) swallows this
        return { ok: false, json: async () => { throw new Error('fail'); } } as unknown as Response;
      }
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;

    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('---');
  });

  // ── Image usage section ────────────────────────────────────────────────────

  it('renders AI Images today card with todayCount/dailyCap', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('3/10');
  });

  it('renders AI Image Generations section when recentEvents is non-empty', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('AI Image Generations')).toBeTruthy();
  });

  it('renders BYOK badge for byok source events', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('BYOK');
  });

  it('renders platform badge for platform source events', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('platform');
  });

  it('does NOT render AI Image Generations when recentEvents is empty', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/ai/image-usage') return { ...baseImageUsage, recentEvents: [] };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.queryByText('AI Image Generations')).toBeNull();
  });

  it('shows --- for AI images when image-usage fetch returns no todayCount', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/ai/image-usage') return { notValid: true };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // No valid imageUsage, so card shows ---
    const cards = document.querySelectorAll('.bg-card');
    const imgCard = Array.from(cards).find((c) => c.textContent?.includes('AI Images today'));
    expect(imgCard?.textContent).toContain('---');
  });

  // ── Token Receipts section ─────────────────────────────────────────────────

  it('renders Token Receipts heading', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('Token Receipts')).toBeTruthy();
  });

  it('renders the monthly usage count in Token Receipts', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('1,500');
  });

  it('renders ledger rows in Token Receipts table', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // grant row
    expect(document.body.textContent).toContain('Monthly grant');
    // usage row
    expect(document.body.textContent).toContain('AI assistant usage');
  });

  it('renders "No token activity yet." when ledger is empty', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/credits?limit=100') return { ...baseCredits, ledger: [], monthlyUsage: 0 };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('No token activity yet.')).toBeTruthy();
  });

  it('shows View all button when ledger has >5 entries', async () => {
    const manyLedger = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      type: 'usage',
      amount: -(i + 1) * 100,
      balanceAfter: 9000 - i * 100,
      description: `Usage ${i + 1}`,
      serviceCategory: null,
      referenceId: null,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    }));
    installFetchMock((url) => {
      if (url === '/api/portal/credits?limit=100') return { ...baseCredits, ledger: manyLedger };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText(/View all/)).toBeTruthy();
  });

  it('toggles Show all / Show less in Token Receipts', async () => {
    const manyLedger = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      type: 'usage',
      amount: -(i + 1) * 100,
      balanceAfter: 9000 - i * 100,
      description: `Entry ${i + 1}`,
      serviceCategory: null,
      referenceId: null,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    }));
    installFetchMock((url) => {
      if (url === '/api/portal/credits?limit=100') return { ...baseCredits, ledger: manyLedger };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const viewAllBtn = screen.getByText(/View all/);
    await act(async () => { fireEvent.click(viewAllBtn); });
    expect(screen.getByText('Show less')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText('Show less')); });
    expect(screen.getByText(/View all/)).toBeTruthy();
  });

  // ── AI Email Address section ───────────────────────────────────────────────

  it('renders AI Email Address section heading', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('AI Email Address')).toBeTruthy();
  });

  it('populates email prefix input from profile fetch', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    const input = document.querySelector('input[placeholder="your-company"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('mycompany');
  });

  it('shows the @simplerdevelopment.com suffix', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('@simplerdevelopment.com');
  });

  it('renders active email address when emailPrefix is set', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(document.body.textContent).toContain('mycompany@simplerdevelopment.com');
  });

  it('does not show active email line when emailPrefix is empty', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: { emailPrefix: '' } };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // Active email line has check_circle + "Active:"
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    const hasCheckCircle = icons.some((el) => el.textContent === 'check_circle');
    expect(hasCheckCircle).toBe(false);
  });

  it('shows Saved message on successful email prefix save', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') {
        return { success: true };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const saveBtn = screen.getByText('Save');
    await act(async () => { fireEvent.click(saveBtn); });
    await flush();

    expect(document.body.textContent).toContain('Saved');
  });

  it('shows Failed message on unsuccessful email prefix save', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') {
        return { success: false };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const saveBtn = screen.getByText('Save');
    await act(async () => { fireEvent.click(saveBtn); });
    await flush();

    expect(document.body.textContent).toContain('Failed');
  });

  it('shows custom error message from API on email prefix save failure', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') {
        return { success: false, message: 'Prefix already taken.' };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const saveBtn = screen.getByText('Save');
    await act(async () => { fireEvent.click(saveBtn); });
    await flush();

    expect(document.body.textContent).toContain('Prefix already taken.');
  });

  it('disables Save button while saving', async () => {
    let resolvePatch!: (v: unknown) => void;
    const patchPromise = new Promise((r) => { resolvePatch = r; });

    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') {
        await patchPromise;
        return { ok: true, json: async () => ({ success: true }) } as unknown as Response;
      }
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;

    await act(async () => { render(<AISettingsPage />); });
    await flush();

    act(() => { fireEvent.click(screen.getByText('Save')); });

    await waitFor(() => {
      const btn = document.querySelector('button[disabled]') as HTMLButtonElement;
      expect(btn).toBeTruthy();
    });

    resolvePatch(undefined);
    await flush();
  });

  it('clears email message when prefix input changes', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') {
        return { success: true };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    // Save to get message
    await act(async () => { fireEvent.click(screen.getByText('Save')); });
    await flush();
    expect(document.body.textContent).toContain('Saved');

    // Change input — message should clear
    const input = document.querySelector('input[placeholder="your-company"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'newprefix' } }); });
    expect(document.body.textContent).not.toContain('Saved');
  });

  it('sends emailPrefix in PATCH body', async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') return { success: true };
      return defaultFetch(url, init);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const input = document.querySelector('input[placeholder="your-company"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'testprefix' } }); });
    await act(async () => { fireEvent.click(screen.getByText('Save')); });
    await flush();

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/portal/settings/profile' && (init as RequestInit)?.method === 'PATCH'
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.emailPrefix).toBe('testprefix');
  });

  // ── Request Log section ────────────────────────────────────────────────────

  it('renders Request Log heading', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('Request Log')).toBeTruthy();
  });

  it('renders All / Email / Chat filter buttons', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('shows both conversations in All filter', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // Email title (cleanTitle removes [Email] prefix)
    expect(document.body.textContent).toContain('Order inquiry');
    expect(document.body.textContent).toContain('Chat about project');
  });

  it('filters to email only when Email button clicked', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const emailBtn = screen.getByText('Email');
    await act(async () => { fireEvent.click(emailBtn); });

    expect(document.body.textContent).toContain('Order inquiry');
    expect(document.body.textContent).not.toContain('Chat about project');
  });

  it('filters to chat only when Chat button clicked', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const chatBtn = screen.getByText('Chat');
    await act(async () => { fireEvent.click(chatBtn); });

    expect(document.body.textContent).not.toContain('Order inquiry');
    expect(document.body.textContent).toContain('Chat about project');
  });

  it('shows empty state when filter yields no results', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/ai/conversations') return { data: [] };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    expect(screen.getByText('No AI activity yet.')).toBeTruthy();
  });

  it('shows email empty state when Email filter yields no results', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/ai/conversations') {
        // only chat conversations
        return { data: [{ ...baseConversations[1] }] };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const emailBtn = screen.getByText('Email');
    await act(async () => { fireEvent.click(emailBtn); });

    expect(screen.getByText('No email requests yet. Send an email to your AI address to get started.')).toBeTruthy();
  });

  it('shows chat empty state when Chat filter yields no results', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/ai/conversations') {
        // only email conversations
        return { data: [{ ...baseConversations[0] }] };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const chatBtn = screen.getByText('Chat');
    await act(async () => { fireEvent.click(chatBtn); });

    expect(screen.getByText('No chat conversations yet. Use the chat widget to talk to the AI.')).toBeTruthy();
  });

  it('shows conversation detail placeholder when nothing selected', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    expect(screen.getByText('Select a request to view the conversation')).toBeTruthy();
  });

  it('opens a conversation and fetches messages on click', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const convBtn = screen.getByText('Order inquiry').closest('button');
    await act(async () => { fireEvent.click(convBtn!); });
    await flush();

    // Messages rendered
    expect(document.body.textContent).toContain('Hello');
    expect(document.body.textContent).toContain('Hi there! How can I help?');
  });

  it('renders tool call chips in conversation detail', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const convBtn = screen.getByText('Order inquiry').closest('button');
    await act(async () => { fireEvent.click(convBtn!); });
    await flush();

    // toolLabels['get_crm_contacts'] = 'Looked up contacts'
    expect(document.body.textContent).toContain('Looked up contacts');
  });

  it('renders Token Receipt footer after loading messages', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const convBtn = screen.getByText('Order inquiry').closest('button');
    await act(async () => { fireEvent.click(convBtn!); });
    await flush();

    expect(screen.getByText('Token Receipt')).toBeTruthy();
  });

  it('deselects conversation when filter changes', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();

    const convBtn = screen.getByText('Order inquiry').closest('button');
    await act(async () => { fireEvent.click(convBtn!); });
    await flush();

    // Switch filter
    await act(async () => { fireEvent.click(screen.getByText('Chat')); });
    // Detail panel should return to placeholder
    expect(screen.getByText('Select a request to view the conversation')).toBeTruthy();
  });

  it('shows flag icon for flagged conversations', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // conv id=2 is flagged
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    const hasFlag = icons.some((el) => el.textContent === 'flag');
    expect(hasFlag).toBe(true);
  });

  // ── relativeTime helper (exercised indirectly) ─────────────────────────────

  it('displays relative time for recent conversations', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // Conversations were created within last 2 hours — should show "m ago" or "h ago"
    const body = document.body.textContent ?? '';
    expect(/\d+(m|h) ago/.test(body)).toBe(true);
  });

  // ── No conversations at all ────────────────────────────────────────────────

  it('handles empty conversations array gracefully', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/ai/conversations') return { data: [] };
      return defaultFetch(url);
    });
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // Should not crash; overview cards still render
    expect(screen.getByText('Email Requests')).toBeTruthy();
  });

  // ── Image usage — monthCount display ──────────────────────────────────────

  it('renders this month count in image usage card', async () => {
    await act(async () => { render(<AISettingsPage />); });
    await flush();
    // monthCount = 47
    expect(document.body.textContent).toContain('47');
  });
});
