// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

import AgencyPage from '@/app/portal/agency/page';

describe('agency hub under the flag (PUX-196)', () => {
  it('renders the branding form inline beside a preview that follows the colour', async () => {
    global.fetch = vi.fn((url: string) => {
      const data = url.includes('custom-domain')
        ? { customDomain: 'portal.ridgeline.co', verifiedAt: '2026-08-01', whiteLabelEnabled: false }
        : { agencyName: 'Ridgeline', agencyLogoUrl: null, agencyPrimaryColor: '#6b2d5c', whiteLabelEnabled: false };
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) } as Response);
    }) as any;
    render(<AgencyPage />);
    const box = (await screen.findByLabelText('White-label preview')) as HTMLElement;
    await waitFor(() => expect(box.style.getPropertyValue('--agency-primary')).toBe('#6b2d5c'));
    expect(screen.queryByText('Agency Branding')).toBeNull(); // the link card is gone; the form is here
    const hex = screen.getAllByDisplayValue('#6b2d5c').find((el) => (el as HTMLInputElement).type === 'text') as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#123456' } });
    expect(box.style.getPropertyValue('--agency-primary')).toBe('#123456');
    expect(screen.getByText('Save').closest('button')?.className ?? screen.getByText(/Save/).closest('button')?.className).toContain('bg-primary');
  });
});
