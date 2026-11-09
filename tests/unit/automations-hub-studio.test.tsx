// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));
import AutomationsHub from '@/components/portal/automations/AutomationsHub';

describe('AutomationsHub (PUX-213)', () => {
  it('keeps the workflows warning verbatim, lists real rows, and copies /go/<slug>', async () => {
    global.fetch = vi.fn((url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: url.includes('trigger-links')
      ? { links: [{ id: 1, slug: 'spring', destinationUrl: 'https://x/spring', label: 'Spring promo', contactFieldKey: 'spring_lead', clickCount: 3 }] }
      : [{ id: 5, name: 'Welcome series', status: 'draft', trigger: { kind: 'contact.created' }, updatedAt: new Date().toISOString() }] }) })) as any;
    const write = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText: write } });
    render(<AutomationsHub />);
    expect(screen.getByText(/workflows do not execute yet/)).toBeTruthy();
    expect(await screen.findByText('Welcome series')).toBeTruthy();
    expect(screen.getByText('contact.created')).toBeTruthy();
    expect(await screen.findByText('Spring promo')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Copy link spring'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('/go/spring'));
    expect(screen.queryByText(/runs/)).toBeNull(); // no invented run counts
  });
});
