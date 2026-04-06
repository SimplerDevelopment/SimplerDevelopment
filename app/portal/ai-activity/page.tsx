'use client';

import { useState, useEffect, useCallback } from 'react';

interface Conversation {
  id: number;
  title: string;
  flagged: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: number;
  role: string;
  content: string;
  toolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

const channelIcon: Record<string, string> = {
  email: 'mail',
  chat: 'chat',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getChannel(title: string): 'email' | 'chat' {
  return title.startsWith('[Email]') ? 'email' : 'chat';
}

function cleanTitle(title: string): string {
  return title.replace(/^\[Email\]\s*/, '');
}

const toolLabels: Record<string, string> = {
  get_crm_contacts: 'Looked up contacts',
  get_crm_deals: 'Looked up deals',
  get_crm_pipelines: 'Looked up pipelines',
  get_crm_contact_detail: 'Viewed contact',
  create_crm_contact: 'Created contact',
  update_crm_contact: 'Updated contact',
  create_crm_deal: 'Created deal',
  update_crm_deal: 'Updated deal',
  log_crm_activity: 'Logged activity',
  create_crm_proposal: 'Created proposal',
  send_crm_proposal: 'Sent proposal',
  get_crm_proposals: 'Looked up proposals',
  get_my_projects: 'Looked up projects',
  create_project_card: 'Created task',
  move_project_card: 'Moved task',
  update_project_card: 'Updated task',
  get_my_surveys: 'Looked up surveys',
  create_survey: 'Created survey',
  create_automation: 'Created automation',
  get_dashboard_summary: 'Checked dashboard',
  get_my_invoices: 'Checked invoices',
  create_support_ticket: 'Created ticket',
  navigate_to: 'Navigated',
};

export default function AIActivityPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'email' | 'chat'>('all');
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/portal/ai/conversations');
    const d = await res.json();
    setConversations(d.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  async function openConversation(conv: Conversation) {
    setSelectedConv(conv);
    setMessagesLoading(true);
    const res = await fetch(`/api/portal/ai/conversations/${conv.id}`);
    const d = await res.json();
    setMessages(d.data?.messages ?? []);
    setMessagesLoading(false);
  }

  const filtered = conversations.filter(c => {
    if (filter === 'all') return true;
    return getChannel(c.title) === filter;
  });

  const emailCount = conversations.filter(c => getChannel(c.title) === 'email').length;
  const chatCount = conversations.filter(c => getChannel(c.title) === 'chat').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review all AI conversations from chat and email</p>
        </div>
        <div className="flex items-center gap-1 bg-accent rounded-lg p-1">
          {[
            { value: 'all' as const, label: `All (${conversations.length})` },
            { value: 'email' as const, label: `Email (${emailCount})` },
            { value: 'chat' as const, label: `Chat (${chatCount})` },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${filter === f.value ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Conversation List */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">smart_toy</span>
              <p className="text-sm text-muted-foreground">No AI conversations yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Send an email or use the chat widget to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {filtered.map(conv => {
                const channel = getChannel(conv.title);
                const isSelected = selectedConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`material-icons text-base mt-0.5 shrink-0 ${channel === 'email' ? 'text-blue-500' : 'text-purple-500'}`}>
                        {channelIcon[channel]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{cleanTitle(conv.title)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
                          {(conv.totalInputTokens + conv.totalOutputTokens) > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {Math.round((conv.totalInputTokens + conv.totalOutputTokens) / 1000)}k tokens
                            </span>
                          )}
                          {conv.flagged && (
                            <span className="material-icons text-xs text-orange-500">flag</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Conversation Detail */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
          {!selectedConv ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="material-icons text-4xl text-muted-foreground mb-3">forum</span>
              <p className="text-sm text-muted-foreground">Select a conversation to view details</p>
            </div>
          ) : messagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
            </div>
          ) : (
            <div className="flex flex-col h-full max-h-[70vh]">
              {/* Detail Header */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`material-icons text-base ${getChannel(selectedConv.title) === 'email' ? 'text-blue-500' : 'text-purple-500'}`}>
                    {channelIcon[getChannel(selectedConv.title)]}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{cleanTitle(selectedConv.title)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(selectedConv.createdAt).toLocaleString()} - {getChannel(selectedConv.title) === 'email' ? 'Email request' : 'Chat conversation'}
                    </p>
                  </div>
                </div>
                {(selectedConv.totalInputTokens + selectedConv.totalOutputTokens) > 0 && (
                  <span className="text-xs text-muted-foreground bg-accent px-2 py-1 rounded">
                    {(selectedConv.totalInputTokens + selectedConv.totalOutputTokens).toLocaleString()} tokens
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? '' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                      <span className={`material-icons text-sm ${msg.role === 'user' ? 'text-blue-600' : 'text-purple-600'}`}>
                        {msg.role === 'user' ? 'person' : 'smart_toy'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{msg.role === 'user' ? 'Client' : 'AI Assistant'}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(msg.createdAt)}</span>
                      </div>
                      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                      {/* Tool calls */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {msg.toolCalls.map((tc, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-accent rounded-full text-muted-foreground"
                              title={`${tc.name}(${JSON.stringify(tc.input).slice(0, 100)})`}
                            >
                              <span className="material-icons text-[10px]">build</span>
                              {toolLabels[tc.name] || tc.name.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
