// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/portal/media', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

const items = [
  { id: 1, filename: 'hero.jpg', url: 'https://cdn/hero.jpg', mimeType: 'image/jpeg', fileSize: 1200, createdAt: '2026-08-01T00:00:00Z' },
  { id: 2, filename: 'brochure.pdf', url: 'https://cdn/brochure.pdf', mimeType: 'application/pdf', fileSize: 5000, createdAt: '2026-08-02T00:00:00Z' },
];
beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    const json = url.includes('/usages')
      ? { success: true, data: { count: 1, capped: false, pages: [{ id: 5, title: 'Home', websiteId: 3 }] } }
      : { success: true, data: items, brandingProfiles: [], pagination: { limit: 20, offset: 0, total: 2 } };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(json) } as Response);
  }) as any;
});

import PortalMediaPage from '@/app/portal/media/page';

describe('media page under the flag (PUX-188)', () => {
  it('filters live in a left column, selecting a tile opens a side panel with Used on, no full-screen dialog', async () => {
    const { container } = render(<PortalMediaPage />);
    await screen.findByText('hero.jpg');
    expect(screen.getByLabelText('Media filters')).toBeTruthy();
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    fireEvent.click(screen.getByText('hero.jpg'));
    expect(screen.getByLabelText('Media details')).toBeTruthy();
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    expect(screen.getAllByText('hero.jpg')[0].closest('.ring-2')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Used on 1 page')).toBeTruthy());
    expect(screen.getByText('Home').getAttribute('href')).toBe('/portal/websites/3/posts/5/edit');
  });
});
