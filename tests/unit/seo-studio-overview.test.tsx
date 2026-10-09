// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
import { HealthRing } from '@/app/portal/seo/_components/HealthRing';
import { StudioOverview } from '@/app/portal/seo/_components/StudioOverview';
import type { SeoRun } from '@/app/portal/seo/_components/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const run = { id: 9, status: 'completed', pagesCrawled: 14, healthScore: 72, criticalCount: 3, warningCount: 9, noticeCount: 2, stats: {}, error: null, startedAt: null, finishedAt: null, createdAt: '2026-08-27T00:00:00Z' } as unknown as SeoRun;

describe('PUX-180 SEO studio overview', () => {
  it('HealthRing: the tier colour and the number', () => {
    const { container } = render(<HealthRing score={72} caption="3 critical · 9 warnings" />);
    expect(container.textContent).toContain('72');
    expect(container.querySelectorAll('circle')[1].getAttribute('class')).toContain('portal-warn');
    expect(screen.getByRole('img', { name: 'Health score 72' })).toBeTruthy();
  });
  it('overview: issues severity-first, five top pages by rank, sparkline from the GSC series, top recommendations, tab jumps', async () => {
    const onShowTab = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ success: true, data:
      url.endsWith('/issues') ? [
        { ruleId: 'alt', category: 'content', severity: 'warning', title: 'Image missing alt text', description: '', whyItMatters: '', howToFix: '', count: 18, pages: [{ id: 1, url: '/store', details: {} }] },
        { ruleId: 'meta', category: 'meta', severity: 'critical', title: 'Missing meta description', description: '', whyItMatters: '', howToFix: '', count: 4, pages: [{ id: 2, url: '/trips/ridge-traverse', details: {} }] },
      ]
      : url.endsWith('/pages') ? Array.from({ length: 7 }, (_, i) => ({ id: i + 1, url: `https://x.com/p${i + 1}`, httpStatus: 200, title: `P${i + 1}`, indexable: true, internalRank: 7 - i, incomingLinks: i }))
      : url.endsWith('/search-performance') ? { connected: true, siteUrl: 'x', lastDate: '2026-08-27', overview: { series: [{ date: 'a', clicks: 10, impressions: 100 }, { date: 'b', clicks: 30, impressions: 200 }], totals: { clicks: 4120, impressions: 61200, avgCtr: 0.06, avgPosition: 8.2 } }, reports: null }
      : url.endsWith('/recommendations') ? [{ id: 1, projectId: 1, runId: 9, title: 'Add a meta description to Ridge Traverse', body: '', impact: 'high', effort: 'low', confidence: 0.9, opportunityScore: 80, evidence: { summary: '' }, status: 'open', createdAt: '', updatedAt: '' }]
      : [] }) })));
    const { container } = render(<StudioOverview projectId={1} run={run} onShowTab={onShowTab} searchPerf={null} onSearchPerf={() => {}} recommendations={null} onRecommendations={() => {}} />);
    await waitFor(() => expect(screen.getByText('Missing meta description')).toBeTruthy());
    const issueRows = screen.getByLabelText('Issues').querySelectorAll('li');
    expect(issueRows[0].textContent).toContain('critical');
    expect(issueRows[0].textContent).toContain('incl. /trips/ridge-traverse');
    await waitFor(() => expect(screen.getByLabelText('Top pages').querySelectorAll('tbody tr').length).toBe(5));
    expect(screen.getByLabelText('Top pages').querySelector('tbody tr')?.textContent).toContain('/p7'); // rank 1
    expect(screen.getByText('Add a meta description to Ridge Traverse')).toBeTruthy();
    fireEvent.click(screen.getByText(/All 7 pages/));
    expect(onShowTab).toHaveBeenCalledWith('pages');
    expect(container.textContent).not.toContain('Fix on the page');
  });
  it('overview: search totals/sparkline come from the shell cache when present', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [] }) })));
    const { container } = render(<StudioOverview projectId={1} run={run} onShowTab={() => {}} searchPerf={{ connected: true, siteUrl: 'x', lastDate: 'd', overview: { series: [{ date: 'a', clicks: 1, impressions: 1 }, { date: 'b', clicks: 2, impressions: 2 }], totals: { clicks: 4120, impressions: 61200, avgCtr: 0.06, avgPosition: 8.2 } }, reports: null }} onSearchPerf={() => {}} recommendations={[]} onRecommendations={() => {}} />);
    expect(container.textContent).toContain('4,120');
    expect(container.querySelector('polyline')).toBeTruthy();
  });
});
