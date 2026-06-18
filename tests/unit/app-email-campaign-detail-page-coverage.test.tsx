// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/email/campaigns/[id]/page.tsx` — the Campaign
 * Detail page. Covers: initial load/loading state, campaign-not-found, tab
 * switching, stat calculations, edit flow (block + html variants), send
 * campaign, send test email, toggleUseBlockEditor, sendResult/testResult
 * banners, sends log table, and the statusColor map.
 *
 * All heavy dependencies (Yjs, VisualEditorShell, EmailPreviewPane, realtime
 * hooks, next-auth session, branding API) are mocked so no real services are
 * hit.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── react.use stub ───────────────────────────────────────────────────────────
// The page calls `use(params)` which triggers Suspense in the real runtime.
// In jsdom/Vitest we stub `react.use` to synchronously unwrap any Promise-like
// value so the outer shell renders immediately without suspending.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: <T,>(p: Promise<T> | T): T => {
      if (p && typeof (p as Promise<T>).then === 'function') {
        return p as unknown as T;
      }
      return p as T;
    },
  };
});

// ─── next/navigation mock ─────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/email/campaigns/1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── next-auth mock ───────────────────────────────────────────────────────────

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1', name: 'Test User', email: 'test@example.com' } } }),
}));

// ─── Realtime / Yjs mocks ─────────────────────────────────────────────────────

vi.mock('@/lib/realtime/client', () => ({
  useRealtimeDoc: () => ({ ydoc: null, awareness: null, status: 'disconnected', peers: [] }),
  useLocalAwareness: () => ({
    setPresence: vi.fn(),
    setFocusedField: vi.fn(),
    setCursor: vi.fn(),
    setSelection: vi.fn(),
  }),
}));

vi.mock('@/lib/realtime/email-binding', () => ({
  bindEmailToYjs: () => ({ applyLocalBlocks: vi.fn(), unbind: vi.fn() }),
}));

// ─── Branding mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/branding/block-defaults', () => ({
  applyBrandDefaults: (_block: unknown, _ctx: unknown) => _block,
}));

// ─── Security / sanitize mock ─────────────────────────────────────────────────

vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeRichHtml: (html: string) => html,
}));

// ─── Block helpers mock ───────────────────────────────────────────────────────

vi.mock('@/lib/utils/blockHelpers', () => ({
  removeBlockById: (blocks: unknown[], id: string) =>
    (blocks as Array<{ id: string }>).filter(b => b.id !== id),
}));

// ─── Heavy child component mocks ──────────────────────────────────────────────

vi.mock('@/components/portal/VisualEditorShell', () => ({
  VisualEditorShell: () => React.createElement('div', { 'data-testid': 'visual-editor-shell' }, 'VisualEditorShell'),
}));

vi.mock('@/components/email/EmailPreviewPane', () => ({
  EmailPreviewPane: () => React.createElement('div', { 'data-testid': 'email-preview-pane' }, 'EmailPreviewPane'),
}));

// ─── Fetch stub helpers ───────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();
const alertMock = vi.fn();
const confirmMock = vi.fn();

// ─── Fixture data ─────────────────────────────────────────────────────────────

const baseCampaign = {
  id: 1,
  name: 'My Campaign',
  subject: 'Hello World',
  previewText: 'Preview here',
  fromName: 'Sender',
  fromEmail: 'sender@example.com',
  replyTo: 'reply@example.com',
  listId: 10,
  listName: 'Newsletter',
  htmlContent: '<p>Hi there</p>',
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
  totalUnsubscribed: 2,
  abEnabled: false,
  abSubjectB: null,
  abWinnerMetric: null,
  abTestSizePct: null,
  abWinnerSubject: null,
  abDecidedAt: null,
};

const baseSends = [
  { id: 1, email: 'alice@example.com', name: 'Alice', sentAt: '2025-01-01T00:00:00Z', openedAt: '2025-01-01T01:00:00Z', clickedAt: null, bouncedAt: null },
  { id: 2, email: 'bob@example.com', name: null, sentAt: null, openedAt: null, clickedAt: null, bouncedAt: '2025-01-01T02:00:00Z' },
];

function makeCampaignRes(overrides: Partial<typeof baseCampaign> = {}) {
  return makeRes({ data: { campaign: { ...baseCampaign, ...overrides }, sends: baseSends } });
}

function defaultFetch(url: string, init?: RequestInit): FetchResp {
  if (url.includes('/api/portal/branding/defaults')) {
    return makeRes({ success: true, data: { logoUrl: null, companyName: 'Test Co' } });
  }
  if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && !init?.method) {
    return makeCampaignRes();
  }
  if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && init?.method === 'PATCH') {
    return makeRes({ success: true });
  }
  if (/\/api\/portal\/email\/campaigns\/\d+\/send$/.test(url) && init?.method === 'POST') {
    return makeRes({ success: true, data: { sent: 95, failed: 5, total: 100 } });
  }
  if (url.includes('/api/portal/email/preview') && init?.method === 'POST') {
    return makeRes({ success: true, data: { testSent: { ok: true, to: 'me@example.com' } } });
  }
  if (/\/api\/portal\/email\/campaigns\/\d+\/promote-winner/.test(url) && !init?.method) {
    return makeRes({ success: false });
  }
  return makeRes({});
}

beforeEach(() => {
  fetchMock.mockReset();
  alertMock.mockReset();
  confirmMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('alert', alertMock);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Page under test (imported AFTER mocks)
import PortalCampaignDetailPage from '@/app/portal/email/campaigns/[id]/page';

/**
 * renderPage — renders the campaign detail page and waits for it to load.
 *
 * IMPORTANT: call this AFTER setting up any fetchMock overrides in your test.
 * `renderPage` does NOT touch fetchMock — it uses whatever implementation is
 * currently installed (set in beforeEach or overridden per-test). The `overrides`
 * param patches the campaign fixture returned by the default mock only; if your
 * test has replaced fetchMock entirely, `overrides` is ignored.
 *
 * If you need campaign-specific overrides AND a clean default mock for other
 * endpoints, set the mock before calling renderPage:
 *
 *   fetchMock.mockImplementation(async (url, init) => {
 *     if (/campaigns\/\d+$/.test(url) && !init?.method) return makeCampaignRes({status:'sent'});
 *     return defaultFetch(url, init);
 *   });
 *   const { container } = await renderPage();
 */
async function renderPage(overrides: Partial<typeof baseCampaign> = {}) {
  // Only override the campaign GET if overrides are provided and no custom
  // implementation has already replaced the mock in this test.
  if (Object.keys(overrides).length > 0) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && !init?.method) {
        return makeCampaignRes(overrides);
      }
      return defaultFetch(url, init);
    });
  }

  // With the react.use stub the non-thenable path returns p directly.
  // Cast a plain object as Promise<{id}> so TypeScript is satisfied while
  // the stub hands the object straight back to the destructure.
  const params = { id: '1' } as unknown as Promise<{ id: string }>;
  const result = render(<PortalCampaignDetailPage params={params} />);
  await waitFor(() => {
    expect(result.container.textContent).toContain('My Campaign');
  });
  return result;
}

// ─── Initial render + loading ─────────────────────────────────────────────────

describe('PortalCampaignDetailPage — initial render', () => {
  it('shows loading state before fetch resolves', async () => {
    let resolve: (v: FetchResp) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<FetchResp>((res) => { resolve = res; }),
    );
    const params = { id: '1' } as unknown as Promise<{ id: string }>;
    const { container } = render(<PortalCampaignDetailPage params={params} />);
    expect(container.textContent).toContain('Loading');
    await act(async () => { resolve(makeCampaignRes()); });
  });

  it('shows campaign-not-found when campaign is null', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ data: { campaign: null, sends: [] } }),
    );
    const params = { id: '999' } as unknown as Promise<{ id: string }>;
    render(<PortalCampaignDetailPage params={params} />);
    await waitFor(() => {
      expect(screen.getByText(/Campaign not found/i)).toBeTruthy();
    });
  });

  it('renders campaign name and subject in header', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('My Campaign');
    expect(container.textContent).toContain('Hello World');
  });

  it('renders status badge with correct label', async () => {
    const { container } = await renderPage();
    const spans = Array.from(container.querySelectorAll('span'));
    const badge = spans.find(s => s.textContent === 'draft');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain('bg-gray-100');
  });

  it('renders back link to /portal/email/campaigns', async () => {
    const { container } = await renderPage();
    const link = container.querySelector('a[href="/portal/email/campaigns"]');
    expect(link).toBeTruthy();
  });

  it('renders tabs: overview, content, sends', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('overview');
    expect(container.textContent).toContain('content');
    expect(container.textContent).toContain('sends');
  });

  it('renders overview fields (From, Reply-To, List)', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('Sender <sender@example.com>');
    expect(container.textContent).toContain('reply@example.com');
    expect(container.textContent).toContain('Newsletter');
  });

  it('renders unsubscribes count', async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain('2');
  });

  it('renders Edit button for draft campaigns', async () => {
    await renderPage();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('renders Send Now button for draft campaigns', async () => {
    await renderPage();
    expect(screen.getByText('Send Now')).toBeTruthy();
  });

  it('does not render Edit button for sent campaigns', async () => {
    await renderPage({ status: 'sent', totalSent: 100, totalOpened: 40, totalClicked: 10, totalBounced: 5 });
    expect(screen.queryByText('Edit')).toBeNull();
  });
});

// ─── Status colors ────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — statusColor map', () => {
  const cases: Array<[string, string]> = [
    ['scheduled', 'bg-blue-100'],
    ['sending', 'bg-yellow-100'],
    ['ab_testing', 'bg-purple-100'],
    ['sent', 'bg-green-100'],
    ['cancelled', 'bg-red-100'],
  ];

  for (const [status, expectedClass] of cases) {
    it(`status "${status}" renders with class ${expectedClass}`, async () => {
      await renderPage({ status, totalSent: 100, totalOpened: 50, totalClicked: 10, totalBounced: 2 });
      const spans = Array.from(document.querySelectorAll('span'));
      const badge = spans.find(s => s.textContent === status);
      expect(badge?.className).toContain(expectedClass);
    });
  }

  it('unknown status falls back to bg-gray-100', async () => {
    await renderPage({ status: 'unknown_state' });
    const spans = Array.from(document.querySelectorAll('span'));
    const badge = spans.find(s => s.textContent === 'unknown_state');
    expect(badge?.className).toContain('bg-gray-100');
  });
});

// ─── Stats panel (sent) ───────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — stats panel', () => {
  it('renders stats for sent campaign with correct rates', async () => {
    const { container } = await renderPage({
      status: 'sent',
      totalSent: 100,
      totalOpened: 40,
      totalClicked: 10,
      totalBounced: 5,
    });
    expect(container.textContent).toContain('40%');  // open rate
    expect(container.textContent).toContain('10%');  // click rate
    expect(container.textContent).toContain('5%');   // bounce rate
    expect(container.textContent).toContain('100');  // totalSent
  });

  it('renders 0% rates when totalSent is 0', async () => {
    const { container } = await renderPage({ status: 'sent', totalSent: 0 });
    const text = container.textContent ?? '';
    // 0% for all rates
    const zeroPercents = (text.match(/0%/g) ?? []).length;
    expect(zeroPercents).toBeGreaterThanOrEqual(3);
  });

  it('does not render stats panel when campaign is not sent', async () => {
    const { container } = await renderPage({ status: 'draft' });
    // "Sent" stat card label shouldn't appear (Send Now button might but not the stat label)
    const statLabels = Array.from(container.querySelectorAll('.bg-card .text-xs'));
    expect(statLabels.some(el => el.textContent === 'Sent')).toBe(false);
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — tab switching', () => {
  it('clicking "content" tab renders html content preview', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('content'));
    expect(container.textContent).toContain('Email Preview');
  });

  it('clicking "sends" tab renders the send log', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('sends'));
    expect(container.textContent).toContain('Send Log');
    expect(container.textContent).toContain('alice@example.com');
  });

  it('clicking "overview" tab returns to overview content', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('content'));
    fireEvent.click(screen.getByText('overview'));
    expect(container.textContent).toContain('From');
    expect(container.textContent).toContain('Reply-To');
  });
});

// ─── Send log ─────────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — sends tab', () => {
  it('renders recipient emails in sends table', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('sends'));
    expect(container.textContent).toContain('alice@example.com');
    expect(container.textContent).toContain('bob@example.com');
  });

  it('renders recipient name when available', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('sends'));
    expect(container.textContent).toContain('Alice');
  });

  it('shows "No sends recorded" when sends list is empty', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && !init?.method) {
        return makeRes({ data: { campaign: { ...baseCampaign }, sends: [] } });
      }
      return defaultFetch(url, init);
    });
    const params = { id: '1' } as unknown as Promise<{ id: string }>;
    render(<PortalCampaignDetailPage params={params} />);
    await waitFor(() => screen.getByText('My Campaign'));
    fireEvent.click(screen.getByText('sends'));
    expect(screen.getByText(/No sends recorded yet/i)).toBeTruthy();
  });

  it('renders check_circle icons for sent/opened sends', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('sends'));
    const checks = Array.from(container.querySelectorAll('.material-icons')).filter(
      el => el.textContent === 'check_circle',
    );
    expect(checks.length).toBeGreaterThan(0);
  });

  it('renders error icon for bounced send', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('sends'));
    const errorIcons = Array.from(container.querySelectorAll('.material-icons')).filter(
      el => el.textContent === 'error',
    );
    expect(errorIcons.length).toBeGreaterThan(0);
  });
});

// ─── Edit flow (HTML variant) ─────────────────────────────────────────────────

describe('PortalCampaignDetailPage — edit flow (HTML content)', () => {
  it('clicking Edit opens the edit form with current subject', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    expect(container.textContent).toContain('Edit Content');
  });

  it('edit form shows subject and preview text inputs', async () => {
    await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByText('Subject *')).toBeTruthy();
      expect(screen.getByText('Preview Text')).toBeTruthy();
    });
  });

  it('clicking Cancel closes the edit form', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(container.textContent).toContain('Edit Content'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(container.textContent).not.toContain('Edit Content');
    });
  });

  it('clicking Save Changes calls PATCH and closes edit mode on success', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, init]) => typeof u === 'string' && u.includes('/api/portal/email/campaigns/') && init?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).not.toContain('Edit Content');
    });
  });

  it('shows error message when save fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: false, message: 'Save failed error' });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed error');
    });
  });

  it('falls back to "Save failed" when message missing', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && init?.method === 'PATCH') {
        return makeRes({ success: false });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeTruthy());
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(container.textContent).toContain('Save failed');
    });
  });

  it('content tab shows textarea for HTML content in non-block mode', async () => {
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(container.textContent).toContain('Edit Content'));
    fireEvent.click(screen.getByText('content'));
    const textareas = container.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);
  });
});

// ─── Edit flow (block editor variant) ────────────────────────────────────────

describe('PortalCampaignDetailPage — edit flow (block content)', () => {
  const blockCampaign = {
    contentBlocks: [
      { id: 'b1', type: 'text', order: 1, content: 'Hello' },
    ],
    blockContent: { blocks: [{ id: 'b1', type: 'text', order: 1, content: 'Hello' }], version: '1' },
    useBlockEditor: true,
  };

  it('renders VisualEditorShell in block edit mode', async () => {
    const { container } = await renderPage(blockCampaign);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="visual-editor-shell"]')).toBeTruthy();
    });
  });

  it('renders Preview toggle button in block edit mode', async () => {
    await renderPage(blockCampaign);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeTruthy();
    });
  });

  it('clicking Preview toggles the email preview pane', async () => {
    const { container } = await renderPage(blockCampaign);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="email-preview-pane"]')).toBeTruthy();
    });
    // Toggle off
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="email-preview-pane"]')).toBeNull();
    });
  });

  it('renders "Send test" button when draft + block content', async () => {
    await renderPage(blockCampaign);
    expect(screen.getByText('Send test')).toBeTruthy();
  });
});

// ─── Send campaign ────────────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — send campaign', () => {
  it('does not send when confirm is cancelled', async () => {
    confirmMock.mockReturnValue(false);
    await renderPage();
    fireEvent.click(screen.getByText('Send Now'));
    expect(fetchMock.mock.calls.filter(
      ([u, init]) => typeof u === 'string' && u.includes('/send') && init?.method === 'POST',
    ).length).toBe(0);
  });

  it('calls send endpoint and shows success banner on confirm', async () => {
    confirmMock.mockReturnValue(true);
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send Now'));
    await waitFor(() => {
      expect(container.textContent).toContain('Sent successfully');
      expect(container.textContent).toContain('95 delivered');
    });
  });

  it('shows failure count in banner when failed > 0', async () => {
    confirmMock.mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/send$/.test(url) && init?.method === 'POST') {
        return makeRes({ success: true, data: { sent: 90, failed: 10, total: 100 } });
      }
      return defaultFetch(url, init);
    });
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send Now'));
    await waitFor(() => {
      expect(container.textContent).toContain('10 failed');
    });
  });

  it('shows alert when send fails', async () => {
    confirmMock.mockReturnValue(true);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (/\/send$/.test(url) && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Send error!' });
      }
      return defaultFetch(url, init);
    });
    await renderPage();
    fireEvent.click(screen.getByText('Send Now'));
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Send error!');
    });
  });

  it('Send Now also renders for scheduled campaigns', async () => {
    await renderPage({ status: 'scheduled' });
    expect(screen.getByText('Send Now')).toBeTruthy();
  });
});

// ─── Send test email ──────────────────────────────────────────────────────────

// Shared block-campaign fixture used by all send-test tests.
// We set up a complete fetch mock (campaign GET + per-test endpoint override)
// BEFORE calling renderPage() so renderPage doesn't clobber any override.
const blockCampaignFixture = {
  contentBlocks: [{ id: 'b1', type: 'text', order: 1, content: 'Hello' }],
  blockContent: { blocks: [{ id: 'b1', type: 'text', order: 1, content: 'Hello' }], version: '1' },
  useBlockEditor: true,
};

function makeBlockCampaignMock(
  previewOverride?: (url: string, init?: RequestInit) => FetchResp | null,
) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (/\/api\/portal\/email\/campaigns\/\d+$/.test(url) && !init?.method) {
      return makeCampaignRes(blockCampaignFixture);
    }
    if (url.includes('/api/portal/email/preview') && init?.method === 'POST' && previewOverride) {
      const result = previewOverride(url, init);
      if (result !== null) return result;
    }
    return defaultFetch(url, init);
  });
}

describe('PortalCampaignDetailPage — send test email', () => {
  it('shows "Test sent to" banner on success', async () => {
    makeBlockCampaignMock();
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send test'));
    await waitFor(() => {
      expect(container.textContent).toContain('Test sent to me@example.com');
    });
  });

  it('closing the test result banner clears it', async () => {
    makeBlockCampaignMock();
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send test'));
    await waitFor(() => expect(container.textContent).toContain('Test sent to'));
    // Find the close button in the blue banner
    const closeBtns = Array.from(container.querySelectorAll('button')).filter(b =>
      b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(closeBtns[0]);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Test sent to');
    });
  });

  it('shows "Test failed to send" when testSent.ok is false', async () => {
    makeBlockCampaignMock(() =>
      makeRes({ success: true, data: { testSent: { ok: false, to: 'fail@example.com' } } }),
    );
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send test'));
    await waitFor(() => {
      expect(container.textContent).toContain('Test failed to send to fail@example.com');
    });
  });

  it('shows "Test rendered" when testSent data is absent', async () => {
    makeBlockCampaignMock(() => makeRes({ success: true, data: {} }));
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send test'));
    await waitFor(() => {
      expect(container.textContent).toContain('Test rendered (no recipient)');
    });
  });

  it('shows error message when preview API fails', async () => {
    makeBlockCampaignMock(() => makeRes({ success: false, message: 'Preview error' }));
    const { container } = await renderPage();
    fireEvent.click(screen.getByText('Send test'));
    await waitFor(() => {
      expect(container.textContent).toContain('Preview error');
    });
  });

  it('shows "No blocks to render" when there are no blocks', async () => {
    const noblockCampaign = {
      contentBlocks: [] as unknown[],
      blockContent: { blocks: [] as unknown[], version: '1' },
      useBlockEditor: true,
    };
    const { container } = await renderPage(noblockCampaign as Partial<typeof baseCampaign>);
    fireEvent.click(screen.getByText('Send test'));
    await waitFor(() => {
      expect(container.textContent).toContain('No blocks to render');
    });
  });
});

// ─── toggleUseBlockEditor ─────────────────────────────────────────────────────

describe('PortalCampaignDetailPage — toggleUseBlockEditor', () => {
  it('clicking Switch to block builder calls PATCH with useBlockEditor: true', async () => {
    const { container } = await renderPage({ useBlockEditor: false });
    // Overview tab should show the switch button
    const switchBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Switch to block builder'),
    );
    expect(switchBtn).toBeTruthy();
    fireEvent.click(switchBtn!);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, init]) => typeof u === 'string' && u.includes('/campaigns/') && init?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.useBlockEditor).toBe(true);
    });
  });

  it('clicking Switch to template calls PATCH with useBlockEditor: false', async () => {
    const { container } = await renderPage({ useBlockEditor: true });
    const switchBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Switch to template'),
    );
    expect(switchBtn).toBeTruthy();
    fireEvent.click(switchBtn!);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, init]) => typeof u === 'string' && u.includes('/campaigns/') && init?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.useBlockEditor).toBe(false);
    });
  });
});

// ─── Overview fields (various campaign states) ────────────────────────────────

describe('PortalCampaignDetailPage — overview tab fields', () => {
  it('shows — for null replyTo', async () => {
    const { container } = await renderPage({ replyTo: null });
    expect(container.textContent).toContain('—');
  });

  it('shows — for null listName', async () => {
    const { container } = await renderPage({ listName: null });
    // "—" appears for null fields
    expect(container.textContent).toContain('—');
  });

  it('shows — for null previewText', async () => {
    const { container } = await renderPage({ previewText: null });
    expect(container.textContent).toContain('—');
  });

  it('shows formatted sentAt when present', async () => {
    const { container } = await renderPage({ sentAt: '2025-06-01T12:00:00Z', status: 'sent', totalSent: 50, totalOpened: 10, totalClicked: 5, totalBounced: 1 });
    // Should show some date string (locale-dependent, but not "—")
    const sentAtRow = Array.from(container.querySelectorAll('.flex.px-5.py-3.gap-4')).find(
      el => el.textContent?.includes('Sent At'),
    );
    expect(sentAtRow?.textContent).not.toContain('—');
  });

  it('shows — for null sentAt', async () => {
    const { container } = await renderPage({ sentAt: null });
    expect(container.textContent).toContain('—');
  });
});

// ─── branding defaults fetch ──────────────────────────────────────────────────

describe('PortalCampaignDetailPage — branding defaults', () => {
  it('fetches branding defaults on mount', async () => {
    await renderPage();
    const brandingCall = fetchMock.mock.calls.find(
      ([u]) => typeof u === 'string' && u.includes('/api/portal/branding/defaults'),
    );
    expect(brandingCall).toBeTruthy();
  });

  it('handles branding fetch failure gracefully', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/portal/branding/defaults')) {
        throw new Error('network error');
      }
      return defaultFetch(url, init);
    });
    // Should not throw — campaign still renders
    const { container } = await renderPage();
    expect(container.textContent).toContain('My Campaign');
  });
});

// ─── Content tab — HTML preview ───────────────────────────────────────────────

describe('PortalCampaignDetailPage — content tab (non-edit)', () => {
  it('shows sanitized html content in the preview pane', async () => {
    const { container } = await renderPage({ htmlContent: '<p>Hello from HTML</p>' });
    fireEvent.click(screen.getByText('content'));
    expect(container.innerHTML).toContain('Hello from HTML');
  });
});
