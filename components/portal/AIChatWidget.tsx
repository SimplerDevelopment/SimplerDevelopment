'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; input: Record<string, unknown> }[] | null;
  injectedBy?: number | null;
  createdAt?: string;
}

interface Conversation {
  id: number;
  title: string;
  updatedAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  // Read tools
  get_dashboard_summary: 'Checked dashboard',
  get_my_projects: 'Looked up projects',
  get_project_board: 'Looked up board',
  get_project_cards: 'Looked up cards',
  get_sprint_progress: 'Checked sprint progress',
  get_project_files: 'Looked up files',
  get_my_invoices: 'Looked up invoices',
  get_invoice_details: 'Looked up invoice details',
  get_payment_methods: 'Checked payment methods',
  get_my_tickets: 'Looked up tickets',
  get_ticket_details: 'Looked up ticket details',
  get_services_catalog: 'Browsed services',
  get_my_services: 'Checked subscriptions',
  get_my_websites: 'Looked up websites',
  get_website_pages: 'Looked up pages',
  get_website_categories: 'Looked up categories',
  get_website_tags: 'Looked up tags',
  get_website_media: 'Looked up media',
  get_my_hosted_sites: 'Checked hosting',
  get_my_email_campaigns: 'Looked up campaigns',
  get_my_email_lists: 'Looked up email lists',
  get_my_pitch_decks: 'Looked up pitch decks',
  get_my_booking_pages: 'Looked up booking pages',
  get_bookings_for_page: 'Looked up bookings',
  get_suggested_projects: 'Browsed suggested projects',
  get_my_team: 'Looked up team',
  get_my_profile: 'Looked up profile',
  // Write tools
  create_support_ticket: 'Created ticket',
  reply_to_ticket: 'Replied to ticket',
  add_card_comment: 'Added comment',
  create_website_page: 'Created page',
  publish_page: 'Updated page',
  create_website_category: 'Created category',
  create_website_tag: 'Created tag',
  request_service: 'Requested service',
  request_suggested_project: 'Requested project',
  update_profile: 'Updated profile',
  invite_team_member: 'Invited member',
  // Navigation
  navigate_to: 'Opening page',
  pay_invoice: 'Opening invoice',
};

function ToolChips({ toolCalls }: { toolCalls: { name: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1 mb-2">
      {toolCalls.map((tc, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
          <span className="material-icons text-xs">search</span>
          {TOOL_LABELS[tc.name] ?? tc.name}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isInjected = !isUser && msg.injectedBy;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
      {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
        <ToolChips toolCalls={msg.toolCalls} />
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : isInjected
            ? 'bg-amber-50 border border-amber-200 text-foreground rounded-tl-sm dark:bg-amber-950/30 dark:border-amber-800'
            : 'bg-muted text-foreground rounded-tl-sm'
        }`}
      >
        {isInjected && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center gap-1">
            <span className="material-icons text-xs">support_agent</span>
            Simpler Development Team
          </p>
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              code: ({ children }) => <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
              a: ({ href, children }) => {
                const isInternal = href?.startsWith('/');
                if (isInternal) {
                  return (
                    <Link
                      href={href!}
                      className="underline font-medium text-primary hover:opacity-80 transition-opacity"
                    >
                      {children}
                    </Link>
                  );
                }
                return <a href={href} className="underline opacity-80 hover:opacity-100" target="_blank" rel="noopener noreferrer">{children}</a>;
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default function AIChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (open && messages.length > 0) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  useEffect(() => {
    if (open && view === 'history') loadConversations();
  }, [open, view]);

  // Poll for injected messages when chat is open
  useEffect(() => {
    if (open && conversationId) {
      pollRef.current = setInterval(() => {
        pollMessages(conversationId);
      }, 8000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, conversationId]);

  async function pollMessages(convId: number) {
    const res = await fetch(`/api/portal/ai/conversations/${convId}`);
    const data = await res.json();
    if (data.success) {
      const fresh: Message[] = data.data.messages.map((m: Message & { tool_calls?: typeof m.toolCalls }) => ({
        ...m,
        toolCalls: m.toolCalls ?? null,
      }));
      setMessages(fresh);
    }
  }

  async function loadConversations() {
    setLoadingHistory(true);
    const res = await fetch('/api/portal/ai/conversations');
    const data = await res.json();
    if (data.success) setConversations(data.data);
    setLoadingHistory(false);
  }

  async function loadConversation(convId: number) {
    const res = await fetch(`/api/portal/ai/conversations/${convId}`);
    const data = await res.json();
    if (data.success) {
      setMessages(data.data.messages);
      setConversationId(convId);
      setView('chat');
    }
  }

  function startNewConversation() {
    setMessages([]);
    setConversationId(null);
    setView('chat');
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);

    // Optimistically add user message
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    try {
      const res = await fetch('/api/portal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = await res.json();

      if (data.success) {
        if (!conversationId) setConversationId(data.data.conversationId);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.data.reply,
            toolCalls: data.data.toolCalls?.length > 0 ? data.data.toolCalls : null,
          },
        ]);

        // Handle navigation tool calls
        const navCall = data.data.toolCalls?.find(
          (tc: { name: string; input: Record<string, unknown> }) =>
            tc.name === 'navigate_to' || tc.name === 'pay_invoice'
        );
        if (navCall?.input?.path) {
          setTimeout(() => {
            router.push(navCall.input.path as string);
            // If there's a section to focus, dispatch a custom event
            if (navCall.input.section) {
              setTimeout(() => {
                const el = document.querySelector(`[data-focus-id="${navCall.input.section}"]`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all');
                  setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all'), 3000);
                }
              }, 500);
            }
          }, 300);
        }
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Something went wrong. Please try again.' },
        ]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Unable to reach the assistant. Please check your connection.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center"
        title="AI Assistant"
      >
        <span className="material-icons text-2xl">{open ? 'close' : 'smart_toy'}</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-icons text-primary text-base">smart_toy</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Assistant</p>
                <p className="text-xs text-muted-foreground">Powered by Claude</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setView(view === 'history' ? 'chat' : 'history')}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title={view === 'history' ? 'Back to chat' : 'Conversation history'}
              >
                <span className="material-icons text-base">{view === 'history' ? 'arrow_back' : 'history'}</span>
              </button>
              <button
                onClick={startNewConversation}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="New conversation"
              >
                <span className="material-icons text-base">add_comment</span>
              </button>
            </div>
          </div>

          {/* History view */}
          {view === 'history' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Recent Conversations</p>
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No conversations yet.</p>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors ${conv.id === conversationId ? 'bg-accent' : ''}`}
                  >
                    <p className="font-medium text-foreground truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="material-icons text-primary text-2xl">smart_toy</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">How can I help you?</p>
                      <p className="text-xs text-muted-foreground mt-1">I can help with anything in your portal.</p>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full mt-2">
                      {[
                        'Give me an overview of my account',
                        'Do I have any outstanding invoices?',
                        'Take me to my website editor',
                        'What can you help me with?',
                      ].map(suggestion => (
                        <button
                          key={suggestion}
                          onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                          className="text-xs text-left px-3 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-foreground"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
                )}

                {loading && (
                  <div className="flex items-start gap-2">
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                      <div className="flex gap-1 items-center h-4">
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything…"
                    rows={1}
                    disabled={loading}
                    className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 max-h-28 overflow-y-auto"
                    style={{ height: 'auto' }}
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                  >
                    <span className="material-icons text-base">send</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">Enter to send · Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
