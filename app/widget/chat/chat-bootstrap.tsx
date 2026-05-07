'use client';

/**
 * Visitor-side chat UI rendered inside the widget iframe.
 *
 * Lifecycle:
 *   1. mount → POST /api/public/chat/start (issues conversationId + token)
 *   2. open SSE on /api/public/chat/stream
 *   3. visitor types → POST /api/public/chat/messages
 *
 * postMessage to parent window for resize / close. Material Icons via the
 * Google CDN (the iframe is its own document — we can include it freely).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface StartResponse {
  conversationId: number;
  widgetId: number;
  ephemeralToken: string;
  greetingMessage: string | null;
  primaryColor: string;
  position: string;
  awayMessage: string | null;
}

interface Message {
  id: number;
  authorKind: 'visitor' | 'agent' | 'system';
  authorName: string | null;
  body: string;
  occurredAt: string;
}

const VISITOR_KEY = 'sd-chat-visitor-id';

function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const fresh = `v_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    // Sandboxed iframes / third-party-cookie blocks — fall back to a
    // session-scoped id. The visitor will look like a new person on
    // every reload, but the widget keeps working.
    return `vt_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  }
}

function postParent(message: unknown) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  } catch {
    // ignore
  }
}

export default function ChatBootstrap({ widgetId }: { widgetId: string }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<StartResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const widgetIdNum = useMemo(() => Number.parseInt(widgetId, 10), [widgetId]);

  // Always-on Material Icons — webfont injected once per iframe.
  useEffect(() => {
    if (document.getElementById('sd-chat-mi')) return;
    const link = document.createElement('link');
    link.id = 'sd-chat-mi';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(link);
  }, []);

  // Tell the parent loader to expand/collapse.
  useEffect(() => {
    postParent({ type: 'sd-chat:resize', expanded: open, width: 380, height: 560 });
  }, [open]);

  // Establish the visitor session on first open.
  useEffect(() => {
    if (!open || session || !widgetIdNum) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgetId: widgetIdNum, visitorId: getVisitorId() }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to start chat');
        if (cancelled) return;
        setSession(json.data as StartResponse);
        if (json.data.greetingMessage) {
          setMessages([
            {
              id: -1,
              authorKind: 'system',
              authorName: null,
              body: json.data.greetingMessage,
              occurredAt: new Date().toISOString(),
            },
          ]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not connect');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, session, widgetIdNum]);

  // SSE subscription — only after session is live.
  useEffect(() => {
    if (!session) return;
    const url = `/api/public/chat/stream?conversationId=${session.conversationId}&token=${encodeURIComponent(session.ephemeralToken)}`;
    const es = new EventSource(url);
    es.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        const m = payload?.data;
        if (m && m.id) {
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m as Message]));
        }
      } catch {
        // drop
      }
    });
    es.addEventListener('hello', () => {
      // connected
    });
    es.onerror = () => {
      // EventSource auto-reconnects on transient failures.
    };
    return () => es.close();
  }, [session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = useCallback(async () => {
    if (!session || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    setDraft('');
    try {
      const res = await fetch('/api/public/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: session.conversationId,
          ephemeralToken: session.ephemeralToken,
          body,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Send failed');
      // Optimistically reflect — SSE will dedupe by id.
      setMessages((prev) => [...prev, json.data as Message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }, [draft, sending, session]);

  const primary = session?.primaryColor || '#0070f3';

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 72,
          height: 72,
          padding: 0,
          border: 'none',
          borderRadius: '50%',
          background: primary,
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        <span className="material-icons" style={{ fontSize: 32 }}>chat_bubble</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
        color: '#111',
      }}
    >
      <header
        style={{
          background: primary,
          color: 'white',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600 }}>Live chat</span>
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => {
            setOpen(false);
            postParent({ type: 'sd-chat:close' });
          }}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}
        >
          <span className="material-icons">close</span>
        </button>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#f7f8fa' }}>
        {error && (
          <div style={{ background: '#fee', color: '#900', padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
            {error}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: m.authorKind === 'visitor' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: '75%',
                padding: '8px 12px',
                borderRadius: 12,
                background: m.authorKind === 'visitor' ? primary : 'white',
                color: m.authorKind === 'visitor' ? 'white' : '#111',
                boxShadow: m.authorKind === 'visitor' ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.body}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{ display: 'flex', borderTop: '1px solid #eee', padding: 8, gap: 8, background: 'white' }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={4000}
          style={{
            flex: 1,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 14,
            outline: 'none',
          }}
          disabled={!session || sending}
        />
        <button
          type="submit"
          disabled={!session || !draft.trim() || sending}
          aria-label="Send message"
          style={{
            border: 'none',
            background: primary,
            color: 'white',
            borderRadius: 8,
            padding: '0 12px',
            cursor: !session || !draft.trim() || sending ? 'not-allowed' : 'pointer',
            opacity: !session || !draft.trim() || sending ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span className="material-icons">send</span>
        </button>
      </form>
    </div>
  );
}
