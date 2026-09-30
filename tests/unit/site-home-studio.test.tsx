// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
import SiteHome from '@/components/portal/websites/SiteHome';

afterEach(cleanup);

describe('PUX-183 SiteHome', () => {
  it('hero, five rooms, tiles, changes waiting with one teal Review, store snapshot, domain verification', () => {
    const now = new Date().toISOString();
    const { container } = render(<SiteHome data={{
      site: { id: 5, name: 'Ridgeline Outfitters', subdomain: null, domain: 'ridgelineoutfitters.com', deploymentStatus: 'active', updatedAt: now },
      pages: { total: 14, drafts: 2, recent: [{ id: 1, title: 'Home', published: true, updatedAt: now }] },
      changes: [{ id: 9, summary: 'Spring Trips landing page — 6 blocks changed', entityType: 'post', at: now }, { id: 10, summary: 'Nav updated', entityType: 'site', at: now }],
      store: { products: 38, ordersWeek: 31, revenueWeekCents: 493000 },
      domain: { domain: 'ridgelineoutfitters.com', status: 'verified' },
    }} />);
    expect(screen.getByText('Live')).toBeTruthy();
    expect(Array.from(container.querySelectorAll('nav a')).map((a) => a.textContent)).toEqual(['Pages', 'Store', 'Media', 'Branding', 'Settings']);
    expect(container.textContent).toContain('$4,930 revenue');
    const teal = Array.from(container.querySelectorAll('a')).filter((a) => a.className.includes('bg-primary'));
    expect(teal.map((a) => a.textContent)).toEqual(['Review']);
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(container.textContent).not.toContain('SSL');
  });
  it('no store, no domain → no store card and an Add-a-domain ghost', () => {
    const { container } = render(<SiteHome data={{ site: { id: 6, name: 'Fall', subdomain: 'fall', domain: null, deploymentStatus: 'pending', updatedAt: null }, pages: { total: 0, drafts: 0, recent: [] }, changes: [], store: null, domain: null }} />);
    expect(screen.queryByLabelText('Store')).toBeNull();
    expect(screen.getByText('Add a domain')).toBeTruthy();
    expect(container.textContent).toContain('Nothing is waiting for your approval');
  });
});
