// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// react-markdown — render children as plain text so assertions are simple
vi.mock('react-markdown', () => ({
  __esModule: true,
  default: function ReactMarkdownStub({ children }: { children: string }) {
    return React.createElement('span', { 'data-testid': 'markdown' }, children);
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import AIChatWidget from '@/components/portal/AIChatWidget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchJson(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function openWidget() {
  fireEvent.click(screen.getByTitle('AI Assistant'));
}

function getSendBtn() {
  return document.querySelector('button[class*="shrink-0"]') as HTMLButtonElement;
}

async function typeAndSend(text: string) {
  const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  await act(async () => { fireEvent.click(getSendBtn()); });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  // jsdom does not implement scrollIntoView — the component calls it inside a
  // useEffect after messages update. Stub it globally so it doesn't throw.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIChatWidget', () => {
  // ---- open / close --------------------------------------------------------

  it('renders the floating toggle button', () => {
    render(<AIChatWidget />);
    expect(screen.getByTitle('AI Assistant')).toBeTruthy();
  });

  it('chat panel is hidden initially', () => {
    render(<AIChatWidget />);
    // "AI Assistant" text only appears inside the open panel header
    expect(screen.queryByText('Powered by Claude')).toBeNull();
  });

  it('opens the chat panel when the toggle button is clicked', () => {
    render(<AIChatWidget />);
    openWidget();
    expect(screen.getByText('AI Assistant')).toBeTruthy();
    expect(screen.getByText('Powered by Claude')).toBeTruthy();
  });

  it('closes the chat panel when toggle is clicked again', () => {
    render(<AIChatWidget />);
    openWidget();
    expect(screen.getByText('Powered by Claude')).toBeTruthy();
    fireEvent.click(screen.getByTitle('AI Assistant'));
    expect(screen.queryByText('Powered by Claude')).toBeNull();
  });

  // ---- empty state ---------------------------------------------------------

  it('shows "How can I help you?" when no messages exist', () => {
    render(<AIChatWidget />);
    openWidget();
    expect(screen.getByText('How can I help you?')).toBeTruthy();
  });

  it('renders suggestion chips when there are no messages', () => {
    render(<AIChatWidget />);
    openWidget();
    expect(screen.getByText('Give me an overview of my account')).toBeTruthy();
    expect(screen.getByText('Do I have any outstanding invoices?')).toBeTruthy();
  });

  it('clicking a suggestion populates the textarea', () => {
    render(<AIChatWidget />);
    openWidget();
    fireEvent.click(screen.getByText('Give me an overview of my account'));
    const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Give me an overview of my account');
  });

  // ---- input controls ------------------------------------------------------

  it('send button is disabled when input is empty', () => {
    render(<AIChatWidget />);
    openWidget();
    const sendBtn = getSendBtn();
    expect(sendBtn.disabled).toBe(true);
  });

  it('typing in the textarea updates the input value', () => {
    render(<AIChatWidget />);
    openWidget();
    const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello there' } });
    expect(textarea.value).toBe('Hello there');
  });

  it('does NOT send on Shift+Enter', () => {
    render(<AIChatWidget />);
    openWidget();
    const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'No send' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ---- send message — success ----------------------------------------------

  it('sends a message on send button click and shows the user message', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: { conversationId: 42, reply: 'Hello from assistant', toolCalls: [] },
    }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Hi there');

    await waitFor(() => expect(screen.getByText('Hi there')).toBeTruthy());
  });

  it('renders assistant reply after a successful send', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: { conversationId: 42, reply: 'Hello from assistant', toolCalls: [] },
    }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Hi');

    await waitFor(() => expect(screen.getByText('Hello from assistant')).toBeTruthy());
  });

  it('clears the textarea after sending', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: { conversationId: 1, reply: 'Ack', toolCalls: [] },
    }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Will be cleared');

    const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('optimistically adds the user message before fetch resolves', async () => {
    let resolveChat!: (val: unknown) => void;
    (global.fetch as any).mockReturnValueOnce(
      new Promise(res => { resolveChat = res; })
    );

    render(<AIChatWidget />);
    openWidget();

    await act(async () => { await typeAndSend('Optimistic message'); });

    // User message must appear immediately, before fetch resolves
    expect(screen.getByText('Optimistic message')).toBeTruthy();

    // Resolve the pending promise so the component cleans up
    await act(async () => {
      resolveChat({
        ok: true,
        json: async () => ({ success: true, data: { conversationId: 1, reply: 'ok', toolCalls: [] } }),
      });
    });
  });

  it('shows typing indicator while fetch is in-flight', async () => {
    let resolveChat!: (val: unknown) => void;
    (global.fetch as any).mockReturnValueOnce(
      new Promise(res => { resolveChat = res; })
    );

    render(<AIChatWidget />);
    openWidget();

    await act(async () => { await typeAndSend('Typing?'); });

    // Three bouncing dots are rendered while loading === true
    const dots = document.querySelectorAll('.animate-bounce');
    expect(dots.length).toBe(3);

    await act(async () => {
      resolveChat({
        ok: true,
        json: async () => ({ success: true, data: { conversationId: 1, reply: 'done', toolCalls: [] } }),
      });
    });
  });

  // ---- send message — API failure -----------------------------------------

  it('shows error message when API returns success:false', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({ success: false }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Fail me');

    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy()
    );
  });

  it('shows network error message when fetch throws', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network down'));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Network fail');

    await waitFor(() =>
      expect(screen.getByText('Unable to reach the assistant. Please check your connection.')).toBeTruthy()
    );
  });

  // ---- Enter key send -------------------------------------------------------

  it('sends message on Enter key (not Shift+Enter)', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: { conversationId: 5, reply: 'From Enter', toolCalls: [] },
    }));

    render(<AIChatWidget />);
    openWidget();

    const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Enter send' } });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    });

    await waitFor(() => expect(screen.getByText('Enter send')).toBeTruthy());
  });

  // ---- history view --------------------------------------------------------

  it('switches to history view when history button is clicked', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({ success: true, data: [] }));

    render(<AIChatWidget />);
    openWidget();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Conversation history'));
    });

    await waitFor(() => expect(screen.getByText('Recent Conversations')).toBeTruthy());
  });

  it('shows empty state when no conversations exist', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({ success: true, data: [] }));

    render(<AIChatWidget />);
    openWidget();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Conversation history'));
    });

    await waitFor(() => expect(screen.getByText('No conversations yet.')).toBeTruthy());
  });

  it('renders conversation list items when conversations exist', async () => {
    const convs = [
      { id: 1, title: 'First chat', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 2, title: 'Second chat', updatedAt: '2026-01-02T00:00:00Z' },
    ];
    (global.fetch as any).mockReturnValue(makeFetchJson({ success: true, data: convs }));

    render(<AIChatWidget />);
    openWidget();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Conversation history'));
    });

    await waitFor(() => {
      expect(screen.getByText('First chat')).toBeTruthy();
      expect(screen.getByText('Second chat')).toBeTruthy();
    });
  });

  it('loads a conversation and switches back to chat view when clicked', async () => {
    const convs = [{ id: 7, title: 'Old convo', updatedAt: '2026-01-01T00:00:00Z' }];

    // First call: loadConversations; second call: loadConversation(7)
    (global.fetch as any)
      .mockReturnValueOnce(makeFetchJson({ success: true, data: convs }))
      .mockReturnValueOnce(makeFetchJson({
        success: true,
        data: { messages: [{ role: 'user', content: 'Resumed message', toolCalls: null }] },
      }));

    render(<AIChatWidget />);
    openWidget();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Conversation history'));
    });

    await waitFor(() => screen.getByText('Old convo'));

    await act(async () => {
      fireEvent.click(screen.getByText('Old convo'));
    });

    await waitFor(() => expect(screen.getByText('Resumed message')).toBeTruthy());
  });

  it('returns to chat view via back button in history view', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({ success: true, data: [] }));

    render(<AIChatWidget />);
    openWidget();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Conversation history'));
    });

    await waitFor(() => screen.getByTitle('Back to chat'));
    fireEvent.click(screen.getByTitle('Back to chat'));

    expect(screen.getByPlaceholderText('Ask me anything…')).toBeTruthy();
  });

  // ---- new conversation ----------------------------------------------------

  it('clears messages when "New conversation" button is clicked', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: { conversationId: 1, reply: 'Hi', toolCalls: [] },
    }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('A message');

    await waitFor(() => screen.getByText('A message'));

    fireEvent.click(screen.getByTitle('New conversation'));
    expect(screen.getByText('How can I help you?')).toBeTruthy();
  });

  // ---- navigation tool call -----------------------------------------------

  it('calls router.push when a navigate_to tool call is in the response', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: {
        conversationId: 99,
        reply: 'Navigating now',
        toolCalls: [{ name: 'navigate_to', input: { path: '/portal/invoices' } }],
      },
    }));

    render(<AIChatWidget />);
    openWidget();

    const textarea = screen.getByPlaceholderText('Ask me anything…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Take me to invoices' } });

    await act(async () => {
      fireEvent.click(getSendBtn());
      // Flush microtasks so the fetch resolves
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Advance past the 300 ms setTimeout that calls router.push
    act(() => { vi.advanceTimersByTime(400); });

    expect(mockRouterPush).toHaveBeenCalledWith('/portal/invoices');
  });

  // ---- tool chips ----------------------------------------------------------

  it('renders tool chips for assistant messages with toolCalls', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: {
        conversationId: 10,
        reply: 'Here are your invoices',
        toolCalls: [{ name: 'get_my_invoices', input: {} }],
      },
    }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Show invoices');

    await waitFor(() => expect(screen.getByText('Looked up invoices')).toBeTruthy());
  });

  it('renders unknown tool name verbatim in the chip', async () => {
    (global.fetch as any).mockReturnValue(makeFetchJson({
      success: true,
      data: {
        conversationId: 11,
        reply: 'Done',
        toolCalls: [{ name: 'some_unknown_tool', input: {} }],
      },
    }));

    render(<AIChatWidget />);
    openWidget();
    await typeAndSend('Do something');

    await waitFor(() => expect(screen.getByText('some_unknown_tool')).toBeTruthy());
  });
});
