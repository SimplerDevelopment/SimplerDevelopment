// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ usePathname: () => '/portal/settings/team' }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import SettingsIndex from '@/app/portal/settings/_components/SettingsIndex';
import SettingsLayout from '@/app/portal/settings/layout';
import { SETTINGS_TABS } from '@/app/portal/settings/_lib/tabs';

describe('settings index (PUX-195)', () => {
  it('lists every real leaf once', () => {
    render(<SettingsIndex />);
    expect(SETTINGS_TABS).toHaveLength(10);
    expect(screen.getAllByRole('link')).toHaveLength(10);
    expect(screen.getByText('Two-factor authentication')).toBeTruthy();
  });
  it('layout draws the tabs as a left index under the flag', () => {
    render(<SettingsLayout><p>leaf</p></SettingsLayout>);
    const nav = screen.getByLabelText('Settings sections');
    expect(nav.querySelectorAll('a')).toHaveLength(10);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain('Team');
  });
});
