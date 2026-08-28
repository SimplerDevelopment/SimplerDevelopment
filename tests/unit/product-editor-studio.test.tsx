// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useParams: () => ({ siteId: '3', productId: 'new' }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('@/components/admin/MediaUploadModal', () => ({ default: () => null }));
vi.mock('@/components/portal/store/PrintfulFulfillmentPanel', () => ({ PrintfulFulfillmentPanel: () => null }));
vi.mock('@/components/portal/store/ProductStylesPanel', () => ({ ProductStylesPanel: () => null }));

import ProductEditPage from '@/app/portal/websites/[siteId]/store/products/[productId]/page';

describe('product editor under the flag (PUX-210)', () => {
  it('stacks Details / Pricing / Inventory / Images / Variants as cards with the search preview and one teal Save', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })) as any;
    render(<ProductEditPage />);
    for (const t of ['Details', 'Pricing', 'Inventory', 'Images', 'Variants']) expect(await screen.findByLabelText(t)).toBeTruthy();
    expect(screen.getByLabelText('Search preview')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull(); // core tabs left the strip
    expect(screen.getByRole('button', { name: 'Shipping' })).toBeTruthy();
    const saves = screen.getAllByRole('button', { name: /Save/ });
    expect(saves.every((b) => b.className.includes('bg-primary'))).toBe(true);
  });
});
