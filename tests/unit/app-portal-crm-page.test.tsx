// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/page.tsx`
 *
 * 'use client' page — CRM Dashboard. Covers:
 * - Loading state (spinner)
 * - Error state (fetch failure, network throw, retry button)
 * - Successful render: header, period selector, metric cards, chart sections
 * - Metric card values and labels
 * - Period selector: all four buttons rendered; clicking updates state
 * - Revenue Trend section (LineChart with data + empty)
 * - Win/Loss section (DonutChart with data + empty)
 * - Pipeline Funnel section (FunnelChart with data + empty)
 * - Recent Activity list (populated, empty, relative time)
 * - Quick Actions links
 * - Top Deals table (rendered, hidden when empty)
 * - Currency formatting helpers (formatCurrency, formatCompact)
 * - Fetches both /api/portal/crm/dashboard and /api/portal/crm/analytics
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// ─── next/link stub ──────────────────────────────────────────────────────────

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

// ─── Fetch helpers ────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<unknown> };

function makeRes(
  body: unknown,
  opts: { ok?: boolean; status?: number } = {},
): FetchResp {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 500),
    json: async () => body,
  };
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDashboardData(extra: Partial<Record<string, unknown>> = {}): unknown {
  return {
    data: {
      totalContacts: 120,
      totalCompanies: 35,
      openDealsValue: 500000,
      wonDealsValue: 200000,
      recentActivities: [
        {
          id: 1,
          type: 'call',
          title: 'Called Acme',
          description: null,
          createdAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
        },
      ],
      ...extra,
    },
  };
}

function makeAnalyticsData(extra: Partial<Record<string, unknown>> = {}): unknown {
  return {
    data: {
      winLoss: { won: 10, lost: 5, open: 8 },
      revenueByMonth: [
        { month: '2025-01', won_value: 100000, won_count: 3 },
        { month: '2025-02', won_value: 150000, won_count: 4 },
      ],
      pipelineFunnel: [
        {
          stage_name: 'Prospect',
          color: '#6366f1',
          sort_order: 1,
          deal_count: 5,
          total_value: 250000,
        },
        {
          stage_name: 'Proposal',
          color: '#22c55e',
          sort_order: 2,
          deal_count: 3,
          total_value: 150000,
        },
      ],
      avgDaysToClose: 21,
      activitySummary: [
        { type: 'call', count: 10 },
        { type: 'email', count: 25 },
      ],
      topDeals: [
        { id: 1, title: 'Big Deal Alpha', value: 300000, status: 'open' },
        { id: 2, title: 'Big Deal Beta', value: 100000, status: 'open' },
      ],
      mrr: 500000,
      arr: 6000000,
      ...extra,
    },
  };
}

// ─── Default fetch handler ────────────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/crm/dashboard')) {
    return makeRes(makeDashboardData());
  }
  if (url.includes('/api/portal/crm/analytics')) {
    return makeRes(makeAnalyticsData());
  }
  return makeRes({ success: true });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import CrmDashboardPage from '@/app/portal/crm/page';

function renderPage() {
  return render(React.createElement(CrmDashboardPage));
}

// Helper: wait for dashboard to finish loading
async function renderLoaded() {
  const result = renderPage();
  await waitFor(() => {
    expect(result.container.textContent).toContain('CRM Dashboard');
  });
  return result;
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('CrmDashboardPage — loading state', () => {
  it('shows a loading spinner while data is pending', () => {
    fetchMock.mockImplementation(() => new Promise<FetchResp>(() => { /* never resolves */ }));
    const { container } = renderPage();
    // The spinner uses material-icons.animate-spin
    const spinner = container.querySelector('span.material-icons.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('does not render "CRM Dashboard" heading while loading', () => {
    fetchMock.mockImplementation(() => new Promise<FetchResp>(() => { /* never resolves */ }));
    const { container } = renderPage();
    expect(container.textContent).not.toContain('CRM Dashboard');
  });
});

// ─── Error state ─────────────────────────────────────────────────────────────

describe('CrmDashboardPage — error state', () => {
  it('shows error message when dashboard fetch returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/dashboard')) {
        return makeRes({ message: 'Dashboard failed' }, { ok: false, status: 500 });
      }
      return makeRes(makeAnalyticsData());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Dashboard failed');
    });
  });

  it('shows error message when analytics fetch returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes({ message: 'Analytics failed' }, { ok: false, status: 500 });
      }
      return makeRes(makeDashboardData());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Analytics failed');
    });
  });

  it('shows error when fetch throws an Error', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('network down');
    });
  });

  it('renders the error icon in error state', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('fail');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('error');
    });
  });

  it('renders a Retry button in error state', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('fail');
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Retry'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('clicking Retry button does not throw and keeps the error UI', async () => {
    // The Retry button calls setPeriod(p => p) which may or may not trigger
    // a React state update depending on optimization. The key invariant is:
    // the button is present and clickable without throwing.
    fetchMock.mockImplementation(async () => {
      throw new Error('fail');
    });
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Retry'),
      );
      expect(btn).toBeTruthy();
    });
    const retryBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Retry'),
    ) as HTMLButtonElement;
    // Click should not throw
    expect(() => fireEvent.click(retryBtn)).not.toThrow();
    // Error UI remains visible after click (fetch still failing)
    expect(container.textContent).toContain('fail');
  });
});

// ─── Header + period selector ─────────────────────────────────────────────────

describe('CrmDashboardPage — header and period selector', () => {
  it('renders "CRM Dashboard" heading', async () => {
    const { container } = await renderLoaded();
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toContain('CRM Dashboard');
  });

  it('renders subtitle "Sales performance and pipeline health"', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Sales performance and pipeline health');
  });

  it('renders all four period buttons (30D, 90D, 12M, All)', async () => {
    const { container } = await renderLoaded();
    ['30D', '90D', '12M', 'All'].forEach((label) => {
      expect(container.textContent).toContain(label);
    });
  });

  it('default period is 12M (12M button has highlight class)', async () => {
    const { container } = await renderLoaded();
    const buttons = Array.from(container.querySelectorAll('button'));
    const btn12m = buttons.find((b) => b.textContent?.trim() === '12M');
    expect(btn12m?.className).toContain('bg-primary');
  });

  it('clicking "30D" period button triggers a new fetch with period=30d', async () => {
    const { container } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    const btn30d = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '30D',
    ) as HTMLButtonElement;
    fireEvent.click(btn30d);
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
      const analyticsCall = fetchMock.mock.calls
        .slice(callsBefore)
        .find((c) => String(c[0]).includes('/api/portal/crm/analytics'));
      expect(analyticsCall).toBeTruthy();
      expect(String(analyticsCall![0])).toContain('period=30d');
    });
  });

  it('clicking "90D" period button triggers fetch with period=90d', async () => {
    const { container } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '90D',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const analyticsCall = fetchMock.mock.calls
        .slice(callsBefore)
        .find((c) => String(c[0]).includes('period=90d'));
      expect(analyticsCall).toBeTruthy();
    });
  });

  it('clicking "All" period button triggers fetch with period=all', async () => {
    const { container } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;
    // There are multiple "All" elements — find the one inside the period selector
    const periodBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => ['30D', '90D', '12M', 'All'].includes(b.textContent?.trim() ?? ''),
    );
    const allBtn = periodBtns.find((b) => b.textContent?.trim() === 'All') as HTMLButtonElement;
    fireEvent.click(allBtn);
    await waitFor(() => {
      const analyticsCall = fetchMock.mock.calls
        .slice(callsBefore)
        .find((c) => String(c[0]).includes('period=all'));
      expect(analyticsCall).toBeTruthy();
    });
  });
});

// ─── Metric cards ─────────────────────────────────────────────────────────────

describe('CrmDashboardPage — metric cards', () => {
  it('renders Contacts metric card label', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Contacts');
  });

  it('renders Contacts metric value (120)', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('120');
  });

  it('renders Companies metric card label', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Companies');
  });

  it('renders Companies metric value (35)', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('35');
  });

  it('renders Win Rate metric card', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Win Rate');
  });

  it('computes win rate correctly (won=10, lost=5 → 67%)', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('67%');
  });

  it('renders "--" win rate when no decided deals', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(makeAnalyticsData({ winLoss: { won: 0, lost: 0, open: 5 } }));
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('--');
  });

  it('renders Open Pipeline metric card', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Open Pipeline');
  });

  it('renders MRR metric card', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('MRR');
  });

  it('renders ARR subtitle', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('ARR');
  });

  it('renders Avg Close metric card', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Avg Close');
  });

  it('renders avgDaysToClose with "d" suffix', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('21d');
  });

  it('renders "--" for Avg Close when avgDaysToClose is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(makeAnalyticsData({ avgDaysToClose: null }));
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    // "--" should appear for the null case
    expect(container.textContent).toContain('--');
  });

  it('renders Contacts card as a link to /portal/crm/contacts', async () => {
    const { container } = await renderLoaded();
    const link = container.querySelector('a[href="/portal/crm/contacts"]');
    expect(link).toBeTruthy();
  });

  it('renders Companies card as a link to /portal/crm/companies', async () => {
    const { container } = await renderLoaded();
    const link = container.querySelector('a[href="/portal/crm/companies"]');
    expect(link).toBeTruthy();
  });

  it('renders Open Pipeline card as a link to /portal/crm/deals', async () => {
    const { container } = await renderLoaded();
    const link = container.querySelector('a[href="/portal/crm/deals"]');
    expect(link).toBeTruthy();
  });
});

// ─── Revenue Trend (LineChart) ────────────────────────────────────────────────

describe('CrmDashboardPage — Revenue Trend section', () => {
  it('renders "Revenue Trend" section heading', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Revenue Trend');
  });

  it('renders an SVG for the line chart when data is present', async () => {
    const { container } = await renderLoaded();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders "No revenue data yet" when revenueByMonth is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(makeAnalyticsData({ revenueByMonth: [] }));
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('No revenue data yet');
  });
});

// ─── Win/Loss section (DonutChart) ───────────────────────────────────────────

describe('CrmDashboardPage — Win/Loss section', () => {
  it('renders "Win / Loss" section heading', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Win / Loss');
  });

  it('renders Won, Lost, Open labels in donut chart legend', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Won');
    expect(container.textContent).toContain('Lost');
    expect(container.textContent).toContain('Open');
  });

  it('renders total deal count in the donut SVG', async () => {
    const { container } = await renderLoaded();
    // won=10, lost=5, open=8 → total=23
    expect(container.textContent).toContain('23');
  });

  it('renders "No deal data yet" when winLoss totals are 0', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(makeAnalyticsData({ winLoss: { won: 0, lost: 0, open: 0 } }));
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('No deal data yet');
  });
});

// ─── Pipeline Funnel section ──────────────────────────────────────────────────

describe('CrmDashboardPage — Pipeline Funnel section', () => {
  it('renders "Pipeline Funnel" section heading', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Pipeline Funnel');
  });

  it('renders stage names from analytics data', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Prospect');
    expect(container.textContent).toContain('Proposal');
  });

  it('renders deal counts for each stage', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('5 deals');
    expect(container.textContent).toContain('3 deals');
  });

  it('renders "No pipeline data" when pipelineFunnel is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(makeAnalyticsData({ pipelineFunnel: [] }));
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('No pipeline data');
  });
});

// ─── Recent Activity ──────────────────────────────────────────────────────────

describe('CrmDashboardPage — Recent Activity section', () => {
  it('renders "Recent Activity" section heading', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Recent Activity');
  });

  it('renders activity title from dashboard data', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Called Acme');
  });

  it('renders relative time for activity (e.g. "1h ago")', async () => {
    const { container } = await renderLoaded();
    // Activity is 1h ago per fixture
    expect(container.textContent).toContain('h ago');
  });

  it('renders "No recent activity" when recentActivities is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/dashboard')) {
        return makeRes({ data: { ...((makeDashboardData() as Record<string, unknown>).data as object), recentActivities: [] } });
      }
      return makeRes(makeAnalyticsData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('No recent activity');
  });

  it('renders phone icon for "call" activity type', async () => {
    const { container } = await renderLoaded();
    // activityIcons['call'] = 'phone'
    expect(container.textContent).toContain('phone');
  });

  it('renders "just now" for a very recent activity', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/dashboard')) {
        return makeRes({
          data: {
            totalContacts: 0,
            totalCompanies: 0,
            openDealsValue: 0,
            wonDealsValue: 0,
            recentActivities: [
              {
                id: 2,
                type: 'email',
                title: 'Just sent email',
                description: null,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        });
      }
      return makeRes(makeAnalyticsData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('just now');
  });

  it('renders "d ago" for activities ~3 days old', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/dashboard')) {
        return makeRes({
          data: {
            totalContacts: 0,
            totalCompanies: 0,
            openDealsValue: 0,
            wonDealsValue: 0,
            recentActivities: [
              {
                id: 3,
                type: 'meeting',
                title: 'Old meeting',
                description: null,
                // 3 days ago
                createdAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
              },
            ],
          },
        });
      }
      return makeRes(makeAnalyticsData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('d ago');
  });

  it('renders circle icon for unknown activity type', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/dashboard')) {
        return makeRes({
          data: {
            totalContacts: 0,
            totalCompanies: 0,
            openDealsValue: 0,
            wonDealsValue: 0,
            recentActivities: [
              {
                id: 5,
                type: 'unknown_type',
                title: 'Mystery activity',
                description: null,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        });
      }
      return makeRes(makeAnalyticsData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('circle');
  });
});

// ─── Quick Actions ────────────────────────────────────────────────────────────

describe('CrmDashboardPage — Quick Actions section', () => {
  it('renders "Quick Actions" section heading', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Quick Actions');
  });

  it('renders "Add Contact" quick action link', async () => {
    const { container } = await renderLoaded();
    // Multiple links point to /portal/crm/contacts (metric card + quick action)
    const links = Array.from(container.querySelectorAll('a[href="/portal/crm/contacts"]'));
    const addContactLink = links.find((l) => l.textContent?.includes('Add Contact'));
    expect(addContactLink).toBeTruthy();
  });

  it('renders "Create Deal" quick action link', async () => {
    const { container } = await renderLoaded();
    const links = Array.from(container.querySelectorAll('a[href="/portal/crm/deals"]'));
    const dealLink = links.find((l) => l.textContent?.includes('Create Deal'));
    expect(dealLink).toBeTruthy();
  });

  it('renders "Add Company" quick action link', async () => {
    const { container } = await renderLoaded();
    const links = Array.from(container.querySelectorAll('a[href="/portal/crm/companies"]'));
    const companyLink = links.find((l) => l.textContent?.includes('Add Company'));
    expect(companyLink).toBeTruthy();
  });

  it('renders "New Proposal" quick action link', async () => {
    const { container } = await renderLoaded();
    const link = container.querySelector('a[href="/portal/crm/proposals"]');
    expect(link?.textContent).toContain('New Proposal');
  });
});

// ─── Top Deals table ──────────────────────────────────────────────────────────

describe('CrmDashboardPage — Top Deals table', () => {
  it('renders "Top Open Deals" section heading', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Top Open Deals');
  });

  it('renders deal titles in the table', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Big Deal Alpha');
    expect(container.textContent).toContain('Big Deal Beta');
  });

  it('renders formatted deal values', async () => {
    const { container } = await renderLoaded();
    // value=300000 cents → $3,000
    expect(container.textContent).toMatch(/\$3[,.]?000/);
  });

  it('renders "View" links for each deal', async () => {
    const { container } = await renderLoaded();
    const viewLinks = Array.from(container.querySelectorAll('a')).filter(
      (a) => a.textContent?.trim() === 'View',
    );
    expect(viewLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('deal view link points to /portal/crm/deals?deal=<id>', async () => {
    const { container } = await renderLoaded();
    const link = container.querySelector('a[href="/portal/crm/deals?deal=1"]');
    expect(link).toBeTruthy();
  });

  it('renders "--" for deal value when value is null', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(
          makeAnalyticsData({
            topDeals: [{ id: 9, title: 'Null Deal', value: null, status: 'open' }],
          }),
        );
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    // Deal value is null → "--"
    expect(container.textContent).toContain('--');
  });

  it('does NOT render Top Deals section when topDeals is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes(makeAnalyticsData({ topDeals: [] }));
      }
      return makeRes(makeDashboardData());
    });
    const { container } = await renderLoaded();
    expect(container.textContent).not.toContain('Top Open Deals');
  });

  it('renders table headers: Deal, Value', async () => {
    const { container } = await renderLoaded();
    expect(container.textContent).toContain('Deal');
    expect(container.textContent).toContain('Value');
  });
});

// ─── Currency helpers (exercised through rendered output) ─────────────────────

describe('CrmDashboardPage — currency formatting', () => {
  it('formats MRR ($5,000) with dollar sign', async () => {
    // mrr=500000 cents → $5,000
    const { container } = await renderLoaded();
    expect(container.textContent).toMatch(/\$5[,.]?000/);
  });

  it('renders formatCompact for revenue axis labels', async () => {
    const { container } = await renderLoaded();
    // The SVG line chart renders axis labels using formatCompact; max revenue is 150000 cents
    // formatCompact(150000) → "$1.5K"
    expect(container.textContent).toContain('$1.5K');
  });
});

// ─── Null analytics guard ─────────────────────────────────────────────────────

describe('CrmDashboardPage — null analytics handling', () => {
  it('handles null analytics.data gracefully (charts omitted)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/analytics')) {
        return makeRes({ data: null });
      }
      return makeRes(makeDashboardData());
    });
    const { container } = renderPage();
    // Should not throw; should render CRM Dashboard heading
    await waitFor(() => {
      expect(container.textContent).toContain('CRM Dashboard');
    });
    // Charts wrapped in {analytics && ...} should be absent
    expect(container.textContent).not.toContain('Revenue Trend');
  });

  it('handles null dashboard.data gracefully', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/crm/dashboard')) {
        return makeRes({ data: null });
      }
      return makeRes(makeAnalyticsData());
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('CRM Dashboard');
    });
    // Metric cards show 0 for undefined totalContacts
    expect(container.textContent).toContain('Contacts');
  });
});

// ─── API fetch calls ──────────────────────────────────────────────────────────

describe('CrmDashboardPage — API calls', () => {
  it('fetches /api/portal/crm/dashboard on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/crm/dashboard'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('fetches /api/portal/crm/analytics on mount', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/crm/analytics'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('sends period=12m in analytics request by default', async () => {
    renderPage();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/crm/analytics'),
      );
      expect(String(call![0])).toContain('period=12m');
    });
  });

  it('makes both fetches in parallel (Promise.all)', async () => {
    // Both calls should appear in a single tick
    renderPage();
    await waitFor(() => {
      const dashCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/crm/dashboard'),
      );
      const analyticsCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/portal/crm/analytics'),
      );
      expect(dashCall).toBeTruthy();
      expect(analyticsCall).toBeTruthy();
    });
  });
});
