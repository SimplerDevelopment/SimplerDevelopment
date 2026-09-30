// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/portal/email/analytics', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import AnalyticsPage from '@/app/portal/email/analytics/page';
import TemplatesPage from '@/app/portal/email/templates/page';

describe('email analytics & templates under the flag (PUX-205)', () => {
  it('analytics: tabs, a trend built from sent campaigns, the table unchanged', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {
      overview: { totalCampaigns: 1, totalSent: 100, totalOpened: 40, totalClicked: 5, totalBounced: 0, totalUnsubscribed: 1, openRate: '40.0', clickRate: '5.0' },
      subscribers: { total: 120, active: 110, totalLists: 2, listBreakdown: [] },
      recentCampaigns: [{ id: 1, name: 'August news', subject: 'Hi', sentAt: new Date().toISOString(), totalSent: 100, totalOpened: 40, totalClicked: 5, totalBounced: 0 }],
    } }) })) as any;
    render(<AnalyticsPage />);
    expect(await screen.findByText('August news')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Twelve-week trend').querySelectorAll('polyline')).toHaveLength(3);
    expect(screen.getByText('Campaign Performance')).toBeTruthy();
  });
  it('templates: tabs, teal New Template, ghost preview instead of a fake thumbnail', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [{ id: 1, name: 'Welcome', description: null, category: 'welcome', subject: null, htmlContent: '<p/>', isGlobal: false, usageCount: 2, createdAt: '2026-08-01' }] }) })) as any;
    render(<TemplatesPage />);
    expect((await screen.findAllByText('Welcome')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('New Template').closest('button')?.className).toContain('bg-primary');
    expect(screen.getByTitle(/No rendered preview yet/)).toBeTruthy();
  });
});
