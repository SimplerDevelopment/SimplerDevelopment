// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ usePathname: () => '/portal/crm/contacts/12' }));
vi.mock('@/components/brain/BrainAgentChat', () => ({ default: () => <div data-testid="chat">chat</div> }));

import AskPanel from '@/components/brain/ask/AskPanel';

describe('AskPanel (PUX-199)', () => {
  it('opens over the current record and saves a kept answer as a note linked to it', async () => {
    const calls: { url: string; body: string }[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => { calls.push({ url, body: init?.body as string }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { id: 1 } }) } as Response); }) as any;
    const onClose = vi.fn();
    render(<AskPanel open onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Ask the Brain' })).toBeTruthy();
    expect(screen.getByTestId('ask-context').textContent).toContain('this contact · #12');
    expect(screen.getByTestId('chat')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Keep an answer'), { target: { value: 'Luis prefers morning slots\nSaid so on the call.' } });
    fireEvent.click(screen.getByText('Save as note'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'));
    expect(calls[0].url).toBe('/api/portal/brain/knowledge');
    expect(JSON.parse(calls[0].body)).toMatchObject({ title: 'Luis prefers morning slots', contactId: 12 });
    fireEvent.click(screen.getByLabelText('Close Ask'));
    expect(onClose).toHaveBeenCalled();
  });
});
