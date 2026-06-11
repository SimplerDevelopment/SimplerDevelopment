// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// jsdom stubs: scrollIntoView, window.parent.postMessage
// ---------------------------------------------------------------------------

// jsdom never implements scrollIntoView — stub it so the ref effect doesn't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// The component calls postParent() which checks `window.parent && window.parent !== window`.
// In jsdom, window.parent === window, so postMessage is never called. Override parent so
// tests that care about postMessage can spy on it.
const postMessageMock = vi.fn();
Object.defineProperty(window, 'parent', {
  get: () => ({ postMessage: postMessageMock }),
  configurable: true,
});

// ---------------------------------------------------------------------------
// EventSource mock (jsdom has none)
// ---------------------------------------------------------------------------

type ESListener = (ev: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  _listeners: Record<string, ESListener[]> = {};
  onerror: (() => void) | null = null;
  readyState = 1;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: ESListener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: ESListener) {
    this._listeners[type] = (this._listeners[type] ?? []).filter((l) => l !== cb);
  }

  dispatchSSE(type: string, data: unknown) {
    const evt = { data: JSON.stringify(data) } as MessageEvent;
    for (const cb of this._listeners[type] ?? []) {
      cb(evt);
    }
  }

  close() {
    this.readyState = 2;
  }
}

// Install before component import
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {};
let localStorageThrows = false;
const localStorageMock = {
  getItem: vi.fn((key: string) => {
    if (localStorageThrows) throw new Error('storage blocked');
    return localStorageStore[key] ?? null;
  }),
  setItem: vi.fn((key: string, val: string) => {
    if (localStorageThrows) throw new Error('storage blocked');
    localStorageStore[key] = val;
  }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; }),
  length: 0,
  key: vi.fn(() => null),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ---------------------------------------------------------------------------
// Component under test (imported after mocks)
// ---------------------------------------------------------------------------

import ChatBootstrap from '@/app/widget/chat/chat-bootstrap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const sessionData = {
  conversationId: 42,
  widgetId: 7,
  ephemeralToken: 'tok_abc',
  greetingMessage: 'Hello! How can I help you?',
  primaryColor: '#ff6600',
  position: 'bottom-right',
  awayMessage: null,
};

function defaultFetch(url: string): unknown {
  if (url === '/api/public/chat/start') {
    return { success: true, data: sessionData };
  }
  if (url === '/api/public/chat/messages') {
    return {
      success: true,
      data: {
        id: 100,
        authorKind: 'visitor',
        authorName: null,
        body: 'Thanks!',
        occurredAt: new Date().toISOString(),
      },
    };
  }
  return {};
}

function renderWidget(widgetId = '7') {
  return render(<ChatBootstrap widgetId={widgetId} />);
}

// Open the widget and flush session establishment
async function openAndFlush(widgetId = '7') {
  const result = renderWidget(widgetId);
  await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
  await flush();
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatBootstrap', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    postMessageMock.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageThrows = false;
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
    localStorageStore['sd-chat-visitor-id'] = 'v_existing123';
    installFetchMock(defaultFetch);
    // Reset scrollIntoView stub
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    MockEventSource.instances = [];
    // Re-stub scrollIntoView after restore
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  // ── Closed (bubble) state ──────────────────────────────────────────────────

  it('renders the open-chat button initially (closed state)', () => {
    renderWidget();
    expect(screen.getByLabelText('Open chat')).toBeTruthy();
  });

  it('does not render the chat panel when closed', () => {
    renderWidget();
    expect(screen.queryByText('Live chat')).toBeNull();
  });

  it('chat bubble contains a chat_bubble icon', () => {
    renderWidget();
    const icons = document.querySelectorAll('span.material-icons');
    expect(Array.from(icons).some((el) => el.textContent === 'chat_bubble')).toBe(true);
  });

  it('applies default primary color #0070f3 as rgb to bubble before session', () => {
    renderWidget();
    const btn = screen.getByLabelText('Open chat') as HTMLButtonElement;
    // jsdom converts hex to rgb
    expect(btn.style.background).toMatch(/0070f3|0, 112, 243/);
  });

  // ── Opening the chat ───────────────────────────────────────────────────────

  it('clicking the bubble opens the chat panel', async () => {
    await openAndFlush();
    expect(screen.getByText('Live chat')).toBeTruthy();
  });

  it('open state renders a Close chat button', async () => {
    await openAndFlush();
    expect(screen.getByLabelText('Close chat')).toBeTruthy();
  });

  it('sends sd-chat:resize postMessage with expanded=true when opened', async () => {
    await openAndFlush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:resize', expanded: true }),
      '*',
    );
  });

  it('sends sd-chat:resize with expanded=false when closed', async () => {
    await openAndFlush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Close chat')); });
    await flush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:resize', expanded: false }),
      '*',
    );
  });

  it('sends sd-chat:close postMessage when close button is clicked', async () => {
    await openAndFlush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Close chat')); });
    await flush();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sd-chat:close' }),
      '*',
    );
  });

  it('closing the chat returns to bubble view', async () => {
    await openAndFlush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Close chat')); });
    await flush();
    expect(screen.getByLabelText('Open chat')).toBeTruthy();
    expect(screen.queryByText('Live chat')).toBeNull();
  });

  // ── Session start ──────────────────────────────────────────────────────────

  it('calls /api/public/chat/start on first open', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/chat/start',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes widgetId and visitorId in start request body', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush('7');
    const startCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/start');
    const body = JSON.parse((startCall![1] as RequestInit).body as string);
    expect(body.widgetId).toBe(7);
    expect(typeof body.visitorId).toBe('string');
    expect(body.visitorId.length).toBeGreaterThan(0);
  });

  it('shows greeting message from session after open', async () => {
    await openAndFlush();
    expect(screen.getByText('Hello! How can I help you?')).toBeTruthy();
  });

  it('does not show greeting message when greetingMessage is null', async () => {
    installFetchMock((url) => {
      if (url === '/api/public/chat/start') {
        return { success: true, data: { ...sessionData, greetingMessage: null } };
      }
      return defaultFetch(url);
    });
    await openAndFlush();
    expect(screen.queryByText('Hello! How can I help you?')).toBeNull();
  });

  it('applies primaryColor from session to header background', async () => {
    await openAndFlush();
    const header = document.querySelector('header') as HTMLElement;
    // primary from sessionData is '#ff6600' → jsdom stores as rgb
    expect(header.style.background).toMatch(/ff6600|255, 102, 0/);
  });

  it('shows error message when /api/public/chat/start returns ok=false', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url === '/api/public/chat/start') {
        return {
          ok: false,
          json: async () => ({ success: false, message: 'Widget not found' }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => defaultFetch(url) } as unknown as Response;
    }) as unknown as typeof fetch;
    await openAndFlush();
    expect(screen.getByText('Widget not found')).toBeTruthy();
  });

  it('shows fetch error message when start fetch throws', async () => {
    // Component: `e instanceof Error ? e.message : 'Could not connect'`
    // Throwing an Error object → error state shows e.message.
    globalThis.fetch = vi.fn(async () => { throw new Error('Could not connect'); }) as unknown as typeof fetch;
    renderWidget();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await flush();
    expect(screen.getByText('Could not connect')).toBeTruthy();
  });

  it('does not call start again if session already established', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const callsAfterFirst = fetchMock.mock.calls.filter(([url]) => url === '/api/public/chat/start').length;
    // Close then reopen — session is already set, should not call start again
    await act(async () => { fireEvent.click(screen.getByLabelText('Close chat')); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await flush();
    const callsAfterSecond = fetchMock.mock.calls.filter(([url]) => url === '/api/public/chat/start').length;
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  // ── SSE subscription ───────────────────────────────────────────────────────

  it('opens an EventSource after session is established', async () => {
    await openAndFlush();
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain('/api/public/chat/stream');
    expect(es.url).toContain('conversationId=42');
  });

  it('SSE URL includes encoded ephemeralToken', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    expect(es.url).toContain(encodeURIComponent('tok_abc'));
  });

  it('renders SSE message arriving in message list', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const incomingMsg = {
      data: {
        id: 99,
        authorKind: 'agent',
        authorName: 'Support',
        body: 'How can I help?',
        occurredAt: new Date().toISOString(),
      },
    };
    await act(async () => { es.dispatchSSE('message', incomingMsg); });
    expect(screen.getByText('How can I help?')).toBeTruthy();
  });

  it('deduplicates SSE messages with same id', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const msg = {
      data: {
        id: 55,
        authorKind: 'agent',
        authorName: null,
        body: 'Duplicate message',
        occurredAt: new Date().toISOString(),
      },
    };
    await act(async () => {
      es.dispatchSSE('message', msg);
      es.dispatchSSE('message', msg);
    });
    const allDupes = screen.queryAllByText('Duplicate message');
    expect(allDupes.length).toBe(1);
  });

  it('ignores SSE message events with malformed JSON', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const fakeEvt = { data: '{not valid json' } as MessageEvent;
    await act(async () => {
      for (const cb of es._listeners['message'] ?? []) {
        cb(fakeEvt);
      }
    });
    // Greeting should still be present, no crash
    expect(screen.getByText('Hello! How can I help you?')).toBeTruthy();
  });

  it('closes EventSource on unmount', async () => {
    const { unmount } = await openAndFlush();
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.readyState).toBe(2);
  });

  // ── Sending messages ───────────────────────────────────────────────────────

  it('renders the message input when chat is open and session active', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('input is disabled before session is established', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWidget();
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    // Deliberately no flush — session never resolves
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('typing into the input updates draft value', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Hello there!' } });
    });
    expect(input.value).toBe('Hello there!');
  });

  it('submitting the form with a draft sends a message to API', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Hi agent!' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    const msgCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/messages');
    expect(msgCall).toBeTruthy();
    const body = JSON.parse((msgCall![1] as RequestInit).body as string);
    expect(body.body).toBe('Hi agent!');
    expect(body.conversationId).toBe(42);
  });

  it('clears draft input after sending', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Test draft' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(input.value).toBe('');
  });

  it('optimistically adds sent message to the list from API response', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'My question here' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    // API response body is "Thanks!"
    expect(screen.getByText('Thanks!')).toBeTruthy();
  });

  it('send button is disabled when draft is empty', async () => {
    await openAndFlush();
    const sendBtn = screen.getByLabelText('Send message') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it('send button is enabled when draft has text and session is active', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'some text' } }); });
    const sendBtn = screen.getByLabelText('Send message') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);
  });

  it('does not send when draft is only whitespace', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: '   ' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    const msgCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/public/chat/messages');
    expect(msgCalls.length).toBe(0);
  });

  it('shows error when send returns ok=false', async () => {
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/public/chat/messages') {
        return { ok: false, json: async () => ({ success: false, message: 'Send failed' }) } as unknown as Response;
      }
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'hello' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.getByText('Send failed')).toBeTruthy();
  });

  it('shows error message when send fetch throws', async () => {
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/public/chat/messages') throw new Error('network error');
      return { ok: true, json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'hello' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    expect(screen.getByText('network error')).toBeTruthy();
  });

  // ── Material Icons font injection ──────────────────────────────────────────

  it('injects sd-chat-mi style element into document.head on mount', () => {
    renderWidget();
    const style = document.getElementById('sd-chat-mi');
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain('Material Icons');
  });

  it('does not inject sd-chat-mi style if it already exists', () => {
    renderWidget();
    // Second render — id already exists, no duplicate
    const { unmount } = renderWidget();
    unmount();
    const styles = document.querySelectorAll('#sd-chat-mi');
    expect(styles.length).toBe(1);
  });

  // ── widgetId parsing ───────────────────────────────────────────────────────

  it('parses widgetId string to integer for API call', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush('42');
    const startCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/start');
    const body = JSON.parse((startCall![1] as RequestInit).body as string);
    expect(body.widgetId).toBe(42);
    expect(typeof body.widgetId).toBe('number');
  });

  it('does not call start when widgetId is NaN (empty string)', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    renderWidget('');
    await act(async () => { fireEvent.click(screen.getByLabelText('Open chat')); });
    await flush();
    const startCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/public/chat/start');
    expect(startCalls.length).toBe(0);
  });

  // ── visitorId from localStorage ────────────────────────────────────────────

  it('uses existing visitorId from localStorage', async () => {
    localStorageStore['sd-chat-visitor-id'] = 'v_preexisting';
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const startCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/start');
    const body = JSON.parse((startCall![1] as RequestInit).body as string);
    expect(body.visitorId).toBe('v_preexisting');
  });

  it('generates and stores a new visitorId when localStorage has no entry', async () => {
    delete localStorageStore['sd-chat-visitor-id'];
    localStorageMock.getItem.mockImplementationOnce(() => null);
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const startCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/start');
    const body = JSON.parse((startCall![1] as RequestInit).body as string);
    expect(body.visitorId).toMatch(/^v_/);
  });

  it('falls back to vt_ prefix when localStorage.getItem throws', async () => {
    localStorageThrows = true;
    const fetchMock = installFetchMock(defaultFetch);
    await openAndFlush();
    const startCall = fetchMock.mock.calls.find(([url]) => url === '/api/public/chat/start');
    const body = JSON.parse((startCall![1] as RequestInit).body as string);
    expect(body.visitorId).toMatch(/^vt_/);
  });

  // ── Message list rendering / alignment ────────────────────────────────────

  it('renders visitor messages aligned to flex-end', async () => {
    await openAndFlush();
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Visitor msg' } }); });
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    await flush();
    // API returns {authorKind: 'visitor', body: 'Thanks!'}
    const msgContainer = screen.getByText('Thanks!').closest('div')?.parentElement;
    expect(msgContainer?.style.justifyContent).toBe('flex-end');
  });

  it('renders agent messages aligned to flex-start', async () => {
    await openAndFlush();
    const es = MockEventSource.instances[0];
    const agentMsg = {
      data: {
        id: 200,
        authorKind: 'agent',
        authorName: 'Agent',
        body: 'Agent reply here',
        occurredAt: new Date().toISOString(),
      },
    };
    await act(async () => { es.dispatchSSE('message', agentMsg); });
    const msgContainer = screen.getByText('Agent reply here').closest('div')?.parentElement;
    expect(msgContainer?.style.justifyContent).toBe('flex-start');
  });

  it('renders system messages aligned to flex-start', async () => {
    // Greeting from session data (authorKind: 'system') appears as flex-start
    await openAndFlush();
    const greetingEl = screen.getByText('Hello! How can I help you?');
    const container = greetingEl.closest('div')?.parentElement;
    expect(container?.style.justifyContent).toBe('flex-start');
  });

  // ── scrollIntoView called on message update ────────────────────────────────

  it('calls scrollIntoView when messages change', async () => {
    await openAndFlush();
    // Greeting sets messages — scrollIntoView should have been called
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  // ── waitFor-based session greeting ─────────────────────────────────────────

  it('greeting message appears after opening (waitFor variant)', async () => {
    renderWidget();
    fireEvent.click(screen.getByLabelText('Open chat'));
    await waitFor(() => {
      expect(screen.getByText('Hello! How can I help you?')).toBeTruthy();
    });
  });
});
