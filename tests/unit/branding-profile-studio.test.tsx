// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('@/components/portal/ContrastMatrix', () => ({ ContrastMatrix: () => null }));
vi.mock('@/components/portal/branding/PaletteFromImage', () => ({ PaletteFromImage: () => null }));

import { ColorsTab } from '@/app/portal/branding/profiles/[profileId]/_components/ColorsTab';
import { AppliedToCard } from '@/app/portal/branding/profiles/[profileId]/_components/AppliedToCard';
import { BrandAuditPanel } from '@/components/portal/BrandAuditPanel';

const profile: any = { primaryColor: '#0f766e', secondaryColor: '#123456', accentColor: '#abcdef', backgroundColor: '#ffffff', textColor: '#bbbbbb', navBackground: '#0b1f3a', navTextColor: '#f5f5f5', linkColor: '#0f766e', linkHoverColor: '#0f766e', darkMode: {} };

describe('brand profile under the flag (PUX-189)', () => {
  it('ColorsTab shows a contrast pill on paired swatches only when studio', () => {
    const { container, rerender } = render(<ColorsTab profile={profile} update={() => {}} updateDark={() => {}} />);
    expect(container.textContent).not.toMatch(/Fails ·/);
    rerender(<ColorsTab profile={profile} update={() => {}} updateDark={() => {}} studio />);
    expect(screen.getAllByText(/Fails · /).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/AAA · |AA · |Fails · /).length).toBeGreaterThanOrEqual(3);
  });

  it('AppliedToCard lists sites from the usage route', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ success: true, data: { sites: [{ id: 11, name: 'Main site' }], surveys: 1 } }) })) as any;
    render(<AppliedToCard profileId={3} />);
    expect((await screen.findByText('Main site')).closest('a')?.getAttribute('href')).toBe('/portal/websites/11');
    expect(screen.getByText(/1 survey$/)).toBeTruthy();
  });

  it('BrandAuditPanel compact folds the report into one summary line', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, report: { counts: { error: 1, warn: 2, info: 0 }, issues: [{ id: 'a', severity: 'error', category: 'contrast', message: 'Body text fails' }] } }) })) as any;
    render(<BrandAuditPanel profileId={3} compact />);
    fireEvent.click(screen.getByText('Run audit'));
    await waitFor(() => expect(screen.getByTestId('brand-audit-compact')).toBeTruthy());
    expect(screen.getByText('1 error · 2 warn')).toBeTruthy();
  });
});
