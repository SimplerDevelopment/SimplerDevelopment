// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));

import AppsStudio from '@/app/portal/apps/_components/AppsStudio';

const apps: any[] = [{ slug: 'crm-plus', name: 'CRM Plus', icon: 'hub', manifestStale: false, navItems: [{ label: 'Leads' }, { label: 'Reports' }] }];

describe('AppsStudio (PUX-197)', () => {
  it('cards keep the navItems caption and Open target; Available asks via a prefilled ticket; the rail inset lists the app', () => {
    render(<AppsStudio apps={apps} />);
    expect(screen.getAllByText('Leads · Reports').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open').closest('a')?.getAttribute('href')).toBe('/portal/apps/crm-plus');
    expect(screen.getByText('Available on request').closest('a')?.getAttribute('href')).toContain('/portal/tickets/new?subject=');
    expect(screen.getByLabelText('Where apps live').textContent).toContain('CRM Plus');
  });
  it('empty: one ghost that asks the account manager', () => {
    render(<AppsStudio apps={[]} />);
    expect(screen.getByText('No apps installed yet')).toBeTruthy();
    expect(screen.queryByText('Available on request')).toBeNull();
  });
});
