// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConversationList from '@/components/brain/ask/ConversationList';
import ConversationThread from '@/components/brain/ask/ConversationThread';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('@/components/portal/MarkdownView', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });

describe('PUX-167 Ask (studio)', () => {
  it('ConversationList: lists threads, selects one, New clears the selection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok([
      { id: 5, title: 'Which trips sold out fastest', updatedAt: new Date().toISOString() },
      { id: 4, title: 'Guide roster for fall', updatedAt: new Date(Date.now() - 864e5).toISOString() },
    ])));
    const onSelect = vi.fn();
    render(<ConversationList selectedId={5} onSelect={onSelect} />);
    await waitFor(() => expect(screen.getByText('Guide roster for fall')).toBeTruthy());
    fireEvent.click(screen.getByText('Guide roster for fall'));
    expect(onSelect).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('ConversationList: empty is a ghost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok([])));
    render(<ConversationList selectedId={null} onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeTruthy());
  });

  it('ConversationThread: renders the past turns read-only with a New conversation exit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({
      conversation: { id: 5, title: 'Which trips sold out fastest' },
      messages: [
        { id: 1, role: 'user', content: 'Which trips sold out fastest?', createdAt: '2026-08-27T00:00:00Z' },
        { id: 2, role: 'assistant', content: 'Sunrise Summit sold out fastest.', createdAt: '2026-08-27T00:00:02Z' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const onNew = vi.fn();
    render(<ConversationThread id={5} onNew={onNew} />);
    await waitFor(() => expect(screen.getByText('Sunrise Summit sold out fastest.')).toBeTruthy());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portal/ai/conversations/5');
    expect(screen.getByText('Brain')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /New conversation/ }));
    expect(onNew).toHaveBeenCalled();
  });
});
