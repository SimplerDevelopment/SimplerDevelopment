// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));

import SettingsTabs from '@/components/portal/websites/SettingsTabs';
import CustomDomainForm from '@/components/portal/CustomDomainForm';

describe('site settings under the flag (PUX-190)', () => {
  it('SettingsTabs hides inactive panes without unmounting them', () => {
    render(<SettingsTabs panes={[
      { id: 'general', label: 'General', icon: 'tune', node: <input aria-label="Site name" defaultValue="" /> },
      { id: 'danger', label: 'Danger', icon: 'warning', node: <p>Delete this site</p> },
    ]} />);
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'Acme' } });
    expect(screen.getByText('Delete this site').closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: /Danger/ }));
    expect(screen.getByText('Delete this site').closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(false);
    expect((screen.getByLabelText('Site name') as HTMLInputElement).value).toBe('Acme'); // still mounted
    expect(screen.getByRole('tab', { name: /Danger/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('CustomDomainForm shows the DNS records without a toggle', () => {
    render(<CustomDomainForm siteId={1} initialDomains={[{ id: 5, domain: 'acme.com', isPrimary: true, status: 'pending', verifiedAt: null }]} />);
    expect(screen.queryByText(/Show DNS Records/)).toBeNull();
    expect(screen.getByText('cname.vercel-dns.com')).toBeTruthy();
    expect(screen.getByText('76.76.21.21')).toBeTruthy();
  });
});
