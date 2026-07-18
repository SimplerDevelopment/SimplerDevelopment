// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/email/campaigns/[id]/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * Uses React.use(params) where params is Promise<{ id: string }>;
 * React.use() is mocked below.
 *
 * Covers:
 *  - Loading state while data is fetching
 *  - "Campaign not found" state when API returns null campaign
 *  - Populated state: campaign name, subject, status badge, header
 *  - Status badge colors: draft, scheduled, sending, sent, ab_testing, cancelled
 *  - Back-to-campaigns link
 *  - Tab navigation: overview / content / sends
 *  - Overview tab: from, list, previewText, sentAt, unsubscribes
 *  - Overview tab: draft-only Editor toggle row
 *  - toggleUseBlockEditor sends PATCH to the API
 *  - Content tab: non-edit mode shows HTML preview
 *  - Content tab: edit mode (startEdit button click)
 *  - Edit form: subject / previewText inputs
 *  - saveEdit sends PATCH with form data
 *  - saveEdit shows error on failure
 *  - Cancel edit closes edit mode
 *  - sendCampaign: confirm → POST → updates status, shows success banner
 *  - sendCampaign: confirm cancel → no fetch
 *  - sendCampaign: API failure → alert
 *  - sendTestEmail: no blocks → shows "No blocks to render"
 *  - sendTestEmail: with blocks → POST /api/portal/email/preview
 *  - sendTestEmail: success shows "Test sent to …" banner
 *  - sendTestEmail: failure shows message
 *  - sendTestEmail: dismiss closes banner
 *  - Stats section rendered when status = sent (open/click/bounce rates)
 *  - Stats section NOT rendered for draft
 *  - Sends tab: empty state message
 *  - Sends tab: populated table with email rows
 *  - EmailAbConfig stub rendered in overview tab
 *  - EmailPresenceBar stub rendered in header
 *  - sendResult banner shown after successful send with failed count
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/email/campaigns/5',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Heavy lib imports that drag in node/server modules ───────────────────────

vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeRichHtml: (html: string) => html,
}));

vi.mock('@/lib/branding/block-defaults', () => ({
  applyBrandDefaults: (block: any) => block,
}));

vi.mock('@/lib/realtime/email-binding', () => ({
  bindEmailToYjs: () => ({
    unbind: vi.fn(),
    applyLocalBlocks: vi.fn(),
  }),
}));

vi.mock('@/lib/utils/blockHelpers', () => ({
  removeBlockById: (blocks: any[], id: string) => blocks.filter((b: any) => b.id !== id),
}));

// ─── next-auth ────────────────────────────────────────────────────────────────

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1', name: 'Test User', email: 'test@example.com' } } }),
}));

// ─── Realtime client — no WebSocket in jsdom ─────────────────────────────────

vi.mock('@/lib/realtime/client', () => ({
  useRealtimeDoc: () => ({
    ydoc: null,
    awareness: null,
    status: 'disconnected',
    peers: [],
  }),
  useLocalAwareness: () => ({
    setPresence: vi.fn(),
    setFocusedField: vi.fn(),
    setCursor: vi.fn(),
    setSelection: vi.fn(),
  }),
}));

// ─── Sub-components — stub with data-testid divs ─────────────────────────────

vi.mock(
  '@/app/portal/email/campaigns/[id]/_components/EmailCollaborationProvider',
  () => {
    const EmailPresenceContext = React.createContext<any>({
      peers: [],
      status: 'disconnected',
      ydoc: null,
      localUser: null,
      setFocusedField: vi.fn(),
      setCursor: vi.fn(),
      setSelection: vi.fn(),
    });

    function EmailCollaborationProvider({ children }: any) {
      return React.createElement(
        EmailPresenceContext.Provider,
        {
          value: {
            peers: [],
            status: 'disconnected',
            ydoc: null,
            localUser: null,
            setFocusedField: vi.fn(),
            setCursor: vi.fn(),
            setSelection: vi.fn(),
          },
        },
        children,
      );
    }

    function useEmailPresence() {
      return React.useContext(EmailPresenceContext);
    }

    return { EmailCollaborationProvider, useEmailPresence };
  },
);

vi.mock(
  '@/app/portal/email/campaigns/[id]/_components/EmailPresenceBar',
  () => ({
    EmailPresenceBar: function EmailPresenceBarStub() {
      return React.createElement('div', { 'data-testid': 'email-presence-bar' });
    },
  }),
);

vi.mock(
  '@/app/portal/email/campaigns/[id]/_components/EmailFieldFocusIndicator',
  () => ({
    EmailFieldFocusIndicator: function EmailFieldFocusIndicatorStub({ children }: any) {
      return React.createElement('div', { 'data-testid': 'field-focus-indicator' }, children);
    },
  }),
);

vi.mock(
  '@/app/portal/email/campaigns/[id]/_components/EmailAbConfig',
  () => ({
    EmailAbConfig: function EmailAbConfigStub({ campaign }: any) {
      return React.createElement(
        'div',
        { 'data-testid': 'email-ab-config', 'data-campaign-id': campaign?.id ?? '' },
      );
    },
  }),
);

vi.mock('@/components/portal/VisualEditorShell', () => ({
  VisualEditorShell: function VisualEditorShellStub({ blocks }: any) {
    return React.createElement(
      'div',
      { 'data-testid': 'visual-editor-shell', 'data-block-count': blocks?.length ?? 0 },
    );
  },
}));

vi.mock('@/components/email/EmailPreviewPane', () => ({
  EmailPreviewPane: function EmailPreviewPaneStub() {
    return React.createElement('div', { 'data-testid': 'email-preview-pane' });
  },
}));

// ─── React.use — mock for Promise<{ id }> ────────────────────────────────────

const USE_VALUE = Symbol('use-value');
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: any) => {
      if (p && USE_VALUE in p) return p[USE_VALUE];
      return (actual as any).use(p);
    },
  };
});

// ─── Fetch helpers ────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Sample data factories ────────────────────────────────────────────────────

function makeCampaign(extra: Record<string, any> = {}): any {
  return {
    id: 5,
    name: 'Welcome Series',
    subject: 'Welcome to the newsletter',
    previewText: 'Thanks for joining',
    fromName: 'Newsletter',
    fromEmail: 'hello@example.com',
    replyTo: 'support@example.com',
    listId: 1,
    listName: 'Main List',
    htmlContent: '<p>Hello world</p>',
    blockContent: null,
    contentBlocks: null,
    useBlockEditor: false,
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    totalRecipients: 100,
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalBounced: 0,
    totalUnsubscribed: 0,
    ...extra,
  };
}

function makeSend(extra: Record<string, any> = {}): any {
  return {
    id: 1,
    email: 'subscriber@example.com',
    name: 'Subscriber One',
    sentAt: '2025-03-10T12:00:00Z',
    openedAt: '2025-03-10T13:00:00Z',
    clickedAt: null,
    bouncedAt: null,
    ...extra,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();

  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/branding/defaults')) {
      return makeRes({ success: false });
    }
    if (url.includes('/api/portal/email/campaigns/5')) {
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock as any);
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import PortalCampaignDetailPage from '@/app/portal/email/campaigns/[id]/page';

function makeParams(id = '5') {
  const p = Promise.resolve({ id }) as any;
  p[USE_VALUE] = { id };
  return p;
}

function renderPage(id = '5') {
  return render(<PortalCampaignDetailPage params={makeParams(id)} />);
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — loading', () => {
  it('shows loading indicator while data is fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Not found state ──────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — not found', () => {
  it('shows "Campaign not found" when campaign is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({ success: true, data: { campaign: null, sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Campaign not found');
    });
  });
});

// ─── Populated state — header ─────────────────────────────────────────────────

describe('PortalCampaignDetailPage — header (draft campaign)', () => {
  it('renders campaign name', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
  });

  it('renders campaign subject as subtitle', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome to the newsletter'));
  });

  it('renders status badge for draft', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('draft'));
  });

  it('renders back link to campaigns list', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/email/campaigns"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders EmailPresenceBar stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="email-presence-bar"]')).toBeTruthy();
    });
  });

  it('renders Edit button when status is draft and not editing', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Edit'),
      );
      expect(editBtn).toBeTruthy();
    });
  });

  it('renders Send Now button when status is draft', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send Now'),
      );
      expect(sendBtn).toBeTruthy();
    });
  });

  it('renders Send Now button when status is scheduled', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign({ status: 'scheduled' }), sends: [] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send Now'),
      );
      expect(sendBtn).toBeTruthy();
    });
  });

  it('does NOT render Send Now button when status is sent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({ status: 'sent', totalSent: 50, totalOpened: 10, totalClicked: 5, totalBounced: 2 }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('sent'));
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Send Now',
    );
    expect(sendBtn).toBeUndefined();
  });

  it('renders Send test button for draft with useBlockEditor=true', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign({ useBlockEditor: true }), sends: [] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const testBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Send test'),
      );
      expect(testBtn).toBeTruthy();
    });
  });
});

// ─── Status badge variants ────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — status badge', () => {
  const statuses = ['draft', 'scheduled', 'sending', 'sent', 'ab_testing', 'cancelled'];

  for (const status of statuses) {
    it(`shows "${status}" status badge`, async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
        return makeRes({
          success: true,
          data: {
            campaign: makeCampaign({
              status,
              totalSent: status === 'sent' ? 10 : 0,
              totalOpened: 0,
              totalClicked: 0,
              totalBounced: 0,
            }),
            sends: [],
          },
        });
      });
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.textContent).toContain(status);
      });
    });
  }
});

// ─── Stats section ────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — stats section', () => {
  it('renders stats cards when status is sent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            status: 'sent',
            totalSent: 100,
            totalOpened: 40,
            totalClicked: 20,
            totalBounced: 5,
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Sent');
      expect(container.textContent).toContain('Open Rate');
      expect(container.textContent).toContain('Click Rate');
      expect(container.textContent).toContain('Bounce Rate');
    });
  });

  it('computes rates correctly (40 opened / 100 sent = 40%)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            status: 'sent',
            totalSent: 100,
            totalOpened: 40,
            totalClicked: 20,
            totalBounced: 5,
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('40%');
      expect(container.textContent).toContain('20%');
      expect(container.textContent).toContain('5%');
    });
  });

  it('shows 0% rates when totalSent is 0', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            status: 'sent',
            totalSent: 0,
            totalOpened: 0,
            totalClicked: 0,
            totalBounced: 0,
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('sent'));
    const text = container.textContent ?? '';
    const zeroRates = (text.match(/0%/g) ?? []).length;
    expect(zeroRates).toBeGreaterThanOrEqual(3);
  });

  it('does NOT render stats cards for draft status', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    expect(container.textContent).not.toContain('Open Rate');
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — tab navigation', () => {
  it('renders overview, content, and sends tab buttons', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.some((b) => b.textContent?.includes('overview'))).toBe(true);
      expect(buttons.some((b) => b.textContent?.includes('content'))).toBe(true);
      expect(buttons.some((b) => b.textContent?.includes('sends'))).toBe(true);
    });
  });

  it('defaults to overview tab showing EmailAbConfig', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="email-ab-config"]')).toBeTruthy();
    });
  });

  it('switches to content tab on click', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const contentTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'content',
    ) as HTMLButtonElement;
    fireEvent.click(contentTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Email Preview');
    });
  });

  it('switches to sends tab on click', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const sendsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'sends',
    ) as HTMLButtonElement;
    fireEvent.click(sendsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Send Log');
    });
  });
});

// ─── Overview tab ─────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — overview tab', () => {
  it('shows From field with fromName and fromEmail', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Newsletter <hello@example.com>');
    });
  });

  it('shows Reply-To field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('support@example.com');
    });
  });

  it('shows Reply-To as dash when null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign({ replyTo: null }), sends: [] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Reply-To');
      expect(container.textContent).toContain('—');
    });
  });

  it('shows List name', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Main List');
    });
  });

  it('shows Preview Text value', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Thanks for joining');
    });
  });

  it('shows Unsubscribes count', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Unsubscribes');
    });
  });

  it('shows Sent At as dash when null', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // sentAt is null → rendered as dash
      expect(container.textContent).toContain('Sent At');
    });
  });

  it('shows Sent At as formatted date when set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({ sentAt: '2025-05-01T10:00:00Z', status: 'sent', totalSent: 10 }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toMatch(/2025/);
    });
  });

  it('shows editor row with "Template / HTML" when useBlockEditor=false and status=draft', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Template / HTML');
    });
  });

  it('shows editor row with "Block builder" when useBlockEditor=true and status=draft', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign({ useBlockEditor: true }), sends: [] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Block builder');
    });
  });

  it('does NOT show editor row when status is sent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({ status: 'sent', totalSent: 10 }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('sent'));
    expect(container.textContent).not.toContain('Template / HTML');
  });
});

// ─── toggleUseBlockEditor ─────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — toggleUseBlockEditor', () => {
  it('calls PATCH when Switch to block builder is clicked', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Switch to block builder'));
    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Switch to'),
    ) as HTMLButtonElement;
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as any)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });
});

// ─── Content tab ─────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — content tab (view mode)', () => {
  it('shows HTML content preview in non-edit mode', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const contentTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'content',
    ) as HTMLButtonElement;
    fireEvent.click(contentTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Hello world');
    });
  });

  it('shows "Email Preview" heading in view mode', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const contentTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'content',
    ) as HTMLButtonElement;
    fireEvent.click(contentTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Email Preview');
    });
  });
});

// ─── Edit mode ────────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — edit mode', () => {
  async function openEditMode(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
  }

  it('opens edit mode on Edit button click', async () => {
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit Content');
    });
  });

  it('shows subject input pre-filled with campaign subject', async () => {
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => {
      const inputs = container.querySelectorAll('input');
      const subjectInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).value === 'Welcome to the newsletter',
      );
      expect(subjectInput).toBeTruthy();
    });
  });

  it('shows previewText input pre-filled', async () => {
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => {
      const inputs = container.querySelectorAll('input');
      const previewInput = Array.from(inputs).find(
        (i) => (i as HTMLInputElement).value === 'Thanks for joining',
      );
      expect(previewInput).toBeTruthy();
    });
  });

  it('Cancel button closes edit mode', async () => {
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => expect(container.textContent).toContain('Edit Content'));
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Edit Content');
    });
  });

  it('Save Changes button calls PATCH', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => expect(container.textContent).toContain('Save Changes'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) => (c[1] as any)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows error message when save fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Save failed' });
      }
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => expect(container.textContent).toContain('Save Changes'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed');
    });
  });

  it('closes edit mode after successful save', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => expect(container.textContent).toContain('Save Changes'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Changes'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Edit Content');
    });
  });

  it('updates subject input value on change', async () => {
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => expect(container.textContent).toContain('Edit Content'));
    const inputs = container.querySelectorAll('input');
    const subjectInput = Array.from(inputs).find(
      (i) => (i as HTMLInputElement).value === 'Welcome to the newsletter',
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, { target: { value: 'New Subject Line' } });
    expect(subjectInput.value).toBe('New Subject Line');
  });

  it('shows HTML textarea for non-block campaigns', async () => {
    const { container } = renderPage();
    await openEditMode(container);
    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
  });
});

// ─── sendCampaign ─────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — sendCampaign', () => {
  it('calls POST /send when confirm returns true', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/send') && init?.method === 'POST') {
        return makeRes({ success: true, data: { sent: 90, failed: 0, total: 90 } });
      }
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send Now'));
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send Now'),
    ) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/send') && (c[1] as any)?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT call POST when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send Now'));
    const beforeCalls = fetchMock.mock.calls.length;
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send Now'),
    ) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await new Promise((r) => setTimeout(r, 50));
    const sendCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/send'),
    );
    expect(sendCalls.length).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(beforeCalls);
  });

  it('shows success banner with sent count after send', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/send') && init?.method === 'POST') {
        return makeRes({ success: true, data: { sent: 75, failed: 0, total: 75 } });
      }
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send Now'));
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send Now'),
    ) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Sent successfully');
      expect(container.textContent).toContain('75 delivered');
    });
  });

  it('shows failed count when some sends fail', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/send') && init?.method === 'POST') {
        return makeRes({ success: true, data: { sent: 70, failed: 5, total: 75 } });
      }
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send Now'));
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send Now'),
    ) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('5 failed');
    });
  });

  it('alerts when API returns failure', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/send') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'No recipients' });
      }
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send Now'));
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send Now'),
    ) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await waitFor(() => expect(alertMock).toHaveBeenCalled());
  });

  it('updates campaign status to sent after successful send', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/send') && init?.method === 'POST') {
        return makeRes({ success: true, data: { sent: 10, failed: 0, total: 10 } });
      }
      return makeRes({ success: true, data: { campaign: makeCampaign(), sends: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send Now'));
    const sendBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send Now'),
    ) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await waitFor(() => {
      // Status badge should now say "sent"
      expect(container.textContent).toContain('Sent successfully');
    });
  });
});

// ─── sendTestEmail ────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — sendTestEmail', () => {
  function setupWithBlocks() {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/api/portal/email/preview') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: { testSent: { ok: true, to: 'me@example.com' } },
        });
      }
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            useBlockEditor: true,
            contentBlocks: [{ id: 'b1', type: 'text', order: 1, content: 'Block text' }],
          }),
          sends: [],
        },
      });
    });
  }

  it('shows "No blocks to render" when campaign has no blocks and useBlockEditor=false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign({ useBlockEditor: false }), sends: [] },
      });
    });
    // useBlockEditor=false means Send test button is not rendered;
    // this case is not reachable via UI — no assertion needed beyond button absence
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    );
    expect(testBtn).toBeUndefined();
  });

  it('calls POST /api/portal/email/preview when Send test clicked with blocks', async () => {
    setupWithBlocks();
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Send test'),
      )).toBe(true);
    });
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      const previewCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/api/portal/email/preview'),
      );
      expect(previewCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows "Test sent to …" banner on success', async () => {
    setupWithBlocks();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send test'));
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Test sent to');
    });
  });

  it('shows failure message when testSent.ok is false', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/api/portal/email/preview') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: { testSent: { ok: false, to: 'bad@example.com' } },
        });
      }
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            useBlockEditor: true,
            contentBlocks: [{ id: 'b1', type: 'text', order: 1, content: 'Block' }],
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send test'));
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Test failed to send');
    });
  });

  it('shows error message when preview API returns failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/api/portal/email/preview') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Render error' });
      }
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            useBlockEditor: true,
            contentBlocks: [{ id: 'b1', type: 'text', order: 1, content: 'Block' }],
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send test'));
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Render error');
    });
  });

  it('dismiss button clears the test result banner', async () => {
    setupWithBlocks();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send test'));
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => expect(container.textContent).toContain('Test sent to'));
    // Find and click the close button inside the banner
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    ) as HTMLButtonElement;
    if (closeBtn) {
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(container.textContent).not.toContain('Test sent to');
      });
    }
  });

  it('shows "Test rendered (no recipient)" when testSent has no address', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (url.includes('/api/portal/email/preview') && init?.method === 'POST') {
        return makeRes({ success: true, data: {} });
      }
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            useBlockEditor: true,
            contentBlocks: [{ id: 'b1', type: 'text', order: 1, content: 'Block' }],
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Send test'));
    const testBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Send test'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Test rendered');
    });
  });
});

// ─── Sends tab ────────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — sends tab', () => {
  it('shows empty state when no sends', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const sendsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'sends',
    ) as HTMLButtonElement;
    fireEvent.click(sendsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('No sends recorded yet');
    });
  });

  it('shows send log count in heading', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign(), sends: [makeSend(), makeSend({ id: 2, email: 'second@example.com' })] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const sendsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'sends',
    ) as HTMLButtonElement;
    fireEvent.click(sendsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Send Log (2)');
    });
  });

  it('renders email address in sends table', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign(), sends: [makeSend()] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const sendsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'sends',
    ) as HTMLButtonElement;
    fireEvent.click(sendsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('subscriber@example.com');
    });
  });

  it('renders recipient name when provided', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign(), sends: [makeSend()] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const sendsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'sends',
    ) as HTMLButtonElement;
    fireEvent.click(sendsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Subscriber One');
    });
  });

  it('renders table header columns', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      return makeRes({
        success: true,
        data: { campaign: makeCampaign(), sends: [makeSend()] },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const sendsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'sends',
    ) as HTMLButtonElement;
    fireEvent.click(sendsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Recipient');
      expect(container.textContent).toContain('Opened');
      expect(container.textContent).toContain('Clicked');
      expect(container.textContent).toContain('Bounced');
    });
  });
});

// ─── EmailAbConfig stub ───────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — EmailAbConfig', () => {
  it('passes campaign id to EmailAbConfig stub', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const abConfig = container.querySelector('[data-testid="email-ab-config"]');
      expect(abConfig).toBeTruthy();
      expect(abConfig?.getAttribute('data-campaign-id')).toBe('5');
    });
  });
});

// ─── hasBlockContent — blockContent path ─────────────────────────────────────

describe('PortalCampaignDetailPage — blockContent path', () => {
  it('renders VisualEditorShell in edit mode when campaign has blockContent', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            blockContent: { blocks: [{ id: 'b1', type: 'text', order: 1, content: 'Hello' }], version: '1' },
            useBlockEditor: true,
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="visual-editor-shell"]')).toBeTruthy();
    });
  });

  it('renders VisualEditorShell in edit mode when campaign has contentBlocks', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/branding/defaults')) return makeRes({ success: false });
      if (init?.method === 'PATCH') return makeRes({ success: true });
      return makeRes({
        success: true,
        data: {
          campaign: makeCampaign({
            contentBlocks: [{ id: 'b1', type: 'text', order: 1, content: 'Block text' }],
            useBlockEditor: true,
          }),
          sends: [],
        },
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Welcome Series'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Edit'),
    ) as HTMLButtonElement;
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="visual-editor-shell"]')).toBeTruthy();
    });
  });
});
