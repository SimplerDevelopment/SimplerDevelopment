// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { rate, scheduledLabel } from '@/lib/email/campaign-rates';
import CampaignsStudioTable from '@/components/portal/email/CampaignsStudioTable';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('@/components/portal/onboarding/DomainGetStarted', () => ({ default: () => null }));
vi.mock('@/components/portal/billing/RelatedModulesStrip', () => ({ RelatedModulesStrip: () => null }));
import PortalEmailPage from '@/app/portal/email/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const camp = (o: Partial<Parameters<typeof CampaignsStudioTable>[0]['campaigns'][number]> & { id: number }) => ({
  name: `C${o.id}`, subject: 'Subject', status: 'sent', totalSent: 100, totalOpened: 44, totalClicked: 9, listName: 'All subscribers', ...o,
});

describe('PUX-174 Email home (studio)', () => {
  it('rates: whole percents, null before anything is sent; scheduled label reads as a weekday time', () => {
    expect(rate(44, 100)).toBe(44);
    expect(rate(1, 3)).toBe(33);
    expect(rate(0, 0)).toBeNull();
    expect(scheduledLabel(null)).toBeNull();
    expect(scheduledLabel('not a date')).toBeNull();
    const soon = new Date(Date.now() + 2 * 86_400_000);
    expect(scheduledLabel(soon.toISOString(), new Date())).toMatch(/\d\d:\d\d/);
  });

  it('table: open/click bars for sent, dashes otherwise, send time beside a Scheduled pill, delete only for draft/scheduled', () => {
    const { container } = render(<CampaignsStudioTable campaigns={[camp({ id: 1 }), camp({ id: 2, status: 'scheduled', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() }), camp({ id: 3, status: 'draft' })]} onOpen={() => {}} onDelete={() => {}} />);
    expect(container.textContent).toContain('44%');
    expect(container.textContent).toContain('9%');
    const rows = container.querySelectorAll('tbody tr');
    expect(rows[1].textContent).toMatch(/Scheduled.*\d\d:\d\d/i);
    expect(rows[1].textContent).toContain('—');
    expect(container.querySelectorAll('button[aria-label^="Delete"]').length).toBe(2);
  });

  it('page: five tab links, one teal New campaign, three tiles, the table', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ data:
      url.includes('/campaigns') ? [camp({ id: 1 })] : [{ id: 1, name: 'All', subscriberCount: 1860 }, { id: 2, name: 'Guests', subscriberCount: 1204 }] }) })));
    const { container } = render(<PortalEmailPage />);
    await waitFor(() => expect(container.textContent).toContain('subscribers across 2 lists'));
    expect(Array.from(container.querySelectorAll('nav a')).map((a) => a.textContent)).toEqual(['Campaigns', 'Lists', 'Segments', 'Templates', 'Analytics']);
    const teal = Array.from(container.querySelectorAll('a')).filter((a) => a.className.includes('bg-primary'));
    expect(teal.map((a) => a.textContent)).toEqual(['addNew campaign']);
    expect(container.textContent).toContain('Avg click');
    expect(container.textContent).toContain('1 campaign ·');
  });
});
