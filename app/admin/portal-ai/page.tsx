'use client';

import { useState, useEffect } from 'react';

interface ConversationRow {
  id: number;
  title: string;
  flagged: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
  clientId: number;
  clientCompany: string | null;
  clientUserName: string | null;
  clientUserEmail: string | null;
}

interface Message {
  id: number;
  role: string;
  content: string;
  toolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] | null;
  injectedBy: number | null;
  injectedByName: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_my_projects: 'projects',
  get_project_board: 'board',
  get_sprint_progress: 'sprint',
  get_my_invoices: 'invoices',
  get_my_tickets: 'tickets',
  get_project_files: 'files',
  create_support_ticket: 'ticket created',
};

export default function AdminAIConversationsPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [search, setSearch] = useState('');
  const [injectMessage, setInjectMessage] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [showInjectModal, setShowInjectModal] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/api/admin/ai/conversations')
      .then(r => r.json())
      .then(data => {
        if (data.success) setConversations(data.data);
        setLoading(false);
      });
  }, []);

  async function openConversation(id: number) {
    setSelectedId(id);
    setLoadingMessages(true);
    const res = await fetch(`/api/admin/ai/conversations/${id}`);
    const data = await res.json();
    if (data.success) setSelectedMessages(data.data.messages);
    setLoadingMessages(false);
  }

  async function toggleFlag(id: number, currentFlagged: boolean) {
    const res = await fetch(`/api/admin/ai/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagged: !currentFlagged }),
    });
    const data = await res.json();
    if (data.success) {
      setConversations(prev => prev.map(c => c.id === id ? { ...c, flagged: !currentFlagged } : c));
    }
  }

  async function injectReply() {
    if (!selectedId || !injectMessage.trim()) return;
    setInjecting(true);
    const res = await fetch(`/api/admin/ai/conversations/${selectedId}/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: injectMessage.trim() }),
    });
    const data = await res.json();
    setInjecting(false);
    if (data.success) {
      setSelectedMessages(prev => [...prev, data.data]);
      setInjectMessage('');
      setShowInjectModal(false);
    }
  }

  const selectedConv = conversations.find(c => c.id === selectedId);

  const filtered = conversations.filter(c => {
    if (filterFlagged && !c.flagged) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        (c.clientCompany ?? '').toLowerCase().includes(q) ||
        (c.clientUserName ?? '').toLowerCase().includes(q) ||
        (c.clientUserEmail ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">AI Conversations</h1>
        <p className="text-muted-foreground mt-1">Monitor client AI chat sessions, flag for review, and inject responses.</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Left: conversation list */}
        <div className="w-80 shrink-0 flex flex-col gap-3">
          {/* Filters */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => setFilterFlagged(!filterFlagged)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1 ${filterFlagged ? 'bg-red-100 border-red-300 text-red-700' : 'border-border text-muted-foreground hover:bg-accent'}`}
            >
              <span className="material-icons text-base">flag</span>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No conversations.</p>
            ) : (
              filtered.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedId === conv.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                    {conv.flagged && <span className="material-icons text-red-500 text-base shrink-0">flag</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {conv.clientCompany ?? conv.clientUserName ?? conv.clientUserEmail ?? 'Unknown client'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {conv.totalInputTokens + conv.totalOutputTokens} tokens
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: conversation detail */}
        <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <span className="material-icons text-5xl text-muted-foreground">smart_toy</span>
                <p className="mt-3 text-muted-foreground text-sm">Select a conversation to review</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{selectedConv?.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedConv?.clientCompany ?? selectedConv?.clientUserName} · {selectedConv?.clientUserEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleFlag(selectedId, selectedConv?.flagged ?? false)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${selectedConv?.flagged ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-50' : 'border-border text-muted-foreground hover:bg-accent'}`}
                  >
                    <span className="material-icons text-base">{selectedConv?.flagged ? 'flag' : 'outlined_flag'}</span>
                    {selectedConv?.flagged ? 'Flagged' : 'Flag'}
                  </button>
                  <button
                    onClick={() => setShowInjectModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <span className="material-icons text-base">reply</span>
                    Inject Reply
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {loadingMessages ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading messages…</p>
                ) : (
                  selectedMessages.map((msg, i) => (
                    <div key={msg.id ?? i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${msg.role === 'user' ? 'text-primary' : msg.injectedBy ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {msg.role === 'user' ? 'Client' : msg.injectedBy ? `Staff (${msg.injectedByName ?? 'Admin'})` : 'AI'}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                        {msg.outputTokens > 0 && (
                          <span className="text-xs text-muted-foreground">{msg.inputTokens + msg.outputTokens} tokens</span>
                        )}
                      </div>

                      {/* Tool calls trace */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="w-full max-w-lg">
                          <button
                            onClick={() => setExpandedTools(prev => {
                              const next = new Set(prev);
                              if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                              return next;
                            })}
                            className="text-xs text-primary flex items-center gap-1 mb-1"
                          >
                            <span className="material-icons text-xs">search</span>
                            Tools used: {msg.toolCalls.map(tc => TOOL_LABELS[tc.name] ?? tc.name).join(', ')}
                            <span className="material-icons text-xs">{expandedTools.has(msg.id) ? 'expand_less' : 'expand_more'}</span>
                          </button>
                          {expandedTools.has(msg.id) && (
                            <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-w-lg">
                              {JSON.stringify(msg.toolCalls, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}

                      <div className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : msg.injectedBy
                          ? 'bg-amber-50 border border-amber-200 text-foreground rounded-tl-sm dark:bg-amber-950/30 dark:border-amber-800'
                          : 'bg-muted text-foreground rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inject modal */}
      {showInjectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Inject Reply</h2>
              <button onClick={() => setShowInjectModal(false)} className="text-muted-foreground hover:text-foreground">
                <span className="material-icons">close</span>
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              This message will appear in the client's chat as a reply from the Simpler Development team.
            </p>
            <textarea
              autoFocus
              rows={5}
              value={injectMessage}
              onChange={e => setInjectMessage(e.target.value)}
              placeholder="Type your reply…"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowInjectModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={injectReply}
                disabled={injecting || !injectMessage.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {injecting ? <><span className="material-icons text-base animate-spin">refresh</span>Sending…</> : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
