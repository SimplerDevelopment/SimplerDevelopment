// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
import ConnectStudioIntro from '@/components/brain/connect/ConnectStudioIntro';

describe('ConnectStudioIntro (PUX-202)', () => {
  it('names the pitch, the catalogue by room, the real scopes, and approvals', () => {
    render(<ConnectStudioIntro />);
    expect(screen.getByText('Talk to your business from Claude.')).toBeTruthy();
    expect(screen.getByLabelText('What it can do').textContent).toContain('CRM — contacts, companies, deals');
    expect(screen.getByText('brain:approve')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Approvals' }).getAttribute('href')).toBe('/portal/approvals');
  });
});
