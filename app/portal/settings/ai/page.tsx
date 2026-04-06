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

interface CreditBalance {
  balance: number;
  monthlyGrant: number;
  payAsYouGo: boolean;
}

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
  get_project_board: 'Viewed project board',
  create_project_card: 'Created task',
  move_project_card: 'Moved task',
  update_project_card: 'Updated task',
  get_my_surveys: 'Looked up surveys',
  create_survey: 'Created survey',
  create_automation: 'Created automation',
  get_dashboard_summary: 'Checked dashboard',
  get_my_invoices: 'Checked invoices',
  create_support_ticket: 'Created ticket',
  reply_to_ticket: 'Replied to ticket',
  get_my_websites: 'Looked up websites',
  create_email_campaign: 'Created campaign',
  add_email_subscriber: 'Added subscriber',
  navigate_to: 'Navigated',
};

export default function AISettingsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'all' | 'email' | 'chat'>('all');
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [emailPrefix, setEmailPrefix] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [convRes, creditRes, profileRes] = await Promise.all([
      fetch('/api/portal/ai/conversations').then(r => r.json()),
      fetch('/api/portal/credits').then(r => r.json()).catch(() => null),
      fetch('/api/portal/settings/profile').then(r => r.json()).catch(() => null),
    ]);
    setConversations(convRes.data ?? []);
    if (creditRes?.success) setCredits(creditRes.data ?? null);
    if (profileRes?.success) setEmailPrefix(profileRes.data?.emailPrefix ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function openConversation(conv: Conversation) {
    setSelectedConv(conv);
    setMessagesLoading(true);
    const res = await fetch(`/api/portal/ai/conversations/${conv.id}`);
    const d = await res.json();
    setMessages(d.data?.messages ?? []);
    setMessagesLoading(false);
  }

  const filtered = conversations.filter(c => {
    if (source === 'all') return true;
    return getChannel(c.title) === source;
  });

  const emailCount = conversations.filter(c => getChannel(c.title) === 'email').length;
  const chatCount = conversations.filter(c => getChannel(c.title) === 'chat').length;
  const totalTokens = conversations.reduce((s, c) => s + c.totalInputTokens + c.totalOutputTokens, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><span className="material-icons animate-spin text-primary text-2xl">refresh</span></div>;
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="material-icons text-lg text-blue-500">mail</span>
          <p className="mt-2 text-xl font-bold text-foreground">{emailCount}</p>
          <p className="text-xs text-muted-foreground">Email Requests</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="material-icons text-lg text-purple-500">chat</span>
          <p className="mt-2 text-xl font-bold text-foreground">{chatCount}</p>
          <p className="text-xs text-muted-foreground">Chat Conversations</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="material-icons text-lg text-green-500">token</span>
          <p className="mt-2 text-xl font-bold text-foreground">{credits ? credits.balance.toLocaleString() : '---'}</p>
          <p className="text-xs text-muted-foreground">Credits Remaining</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <span className="material-icons text-lg text-orange-500">analytics</span>
          <p className="mt-2 text-xl font-bold text-foreground">{Math.round(totalTokens / 1000).toLocaleString()}k</p>
          <p className="text-xs text-muted-foreground">Total Tokens Used</p>
        </div>
      </div>

      {/* Email Configuration */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-icons text-base text-primary">mail</span>
          <h2 className="text-sm font-semibold text-foreground">AI Email Address</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Send requests to this email address and the AI assistant will process them automatically. Only registered team members can use this address.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <input
              value={emailPrefix}
              onChange={e => { setEmailPrefix(e.target.value); setEmailMessage(''); }}
              placeholder="your-company"
              className="w-40 px-3 py-2 rounded-l-lg border border-r-0 border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="px-3 py-2 bg-muted border border-border rounded-r-lg text-sm text-muted-foreground whitespace-nowrap">
              @simplerdevelopment.com
            </span>
          </div>
          <button
            onClick={async () => {
              setSavingEmail(true); setEmailMessage('');
              const res = await fetch('/api/portal/settings/profile', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailPrefix }),
              });
              const d = await res.json();
              setEmailMessage(d.success ? 'Saved' : d.message || 'Failed');
              setSavingEmail(false);
            }}
            disabled={savingEmail}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingEmail ? <span className="material-icons animate-spin text-sm">refresh</span> : <span className="material-icons text-sm">save</span>}
            Save
          </button>
          {emailMessage && <span className="text-xs text-green-600">{emailMessage}</span>}
        </div>
        {emailPrefix && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="material-icons text-sm text-green-500">check_circle</span>
            Active: <span className="font-mono text-foreground">{emailPrefix.toLowerCase().replace(/[^a-z0-9-]/g, '')}@simplerdevelopment.com</span>
          </div>
        )}
      </div>

      {/* Request Log */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Request Log</h2>
          <div className="flex items-center gap-1 bg-accent rounded-lg p-0.5">
            {([
              { value: 'all' as const, label: 'All' },
              { value: 'email' as const, label: 'Email' },
              { value: 'chat' as const, label: 'Chat' },
            ]).map(f => (
              <button
                key={f.value}
                onClick={() => { setSource(f.value); setSelectedConv(null); }}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${source === f.value ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-5" style={{ minHeight: 400 }}>
          {/* List */}
          <div className="lg:col-span-2 border-r border-border overflow-y-auto" style={{ maxHeight: 500 }}>
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-icons text-2xl text-muted-foreground mb-2 block">
                  {source === 'email' ? 'mail' : source === 'chat' ? 'chat' : 'smart_toy'}
                </span>
                <p className="text-xs text-muted-foreground">
                  {source === 'email' ? 'No email requests yet. Send an email to your AI address to get started.' :
                   source === 'chat' ? 'No chat conversations yet. Use the chat widget to talk to the AI.' :
                   'No AI activity yet.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(conv => {
                  const channel = getChannel(conv.title);
                  const isSelected = selectedConv?.id === conv.id;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv)}
                      className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`material-icons text-sm mt-0.5 ${channel === 'email' ? 'text-blue-500' : 'text-purple-500'}`}>
                          {channel === 'email' ? 'mail' : 'chat'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{cleanTitle(conv.title)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
                            {(conv.totalInputTokens + conv.totalOutputTokens) > 0 && (
                              <span className="text-[10px] text-muted-foreground">{((conv.totalInputTokens + conv.totalOutputTokens) / 1000).toFixed(1)}k tokens</span>
                            )}
                            {conv.flagged && <span className="material-icons text-[10px] text-orange-500">flag</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-3 overflow-y-auto" style={{ maxHeight: 500 }}>
            {!selectedConv ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <span className="material-icons text-3xl text-muted-foreground mb-2">forum</span>
                <p className="text-xs text-muted-foreground">Select a request to view the conversation</p>
              </div>
            ) : messagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-icons animate-spin text-primary text-xl">refresh</span>
              </div>
            ) : (
              <div>
                {/* Header */}
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className={`material-icons text-sm ${getChannel(selectedConv.title) === 'email' ? 'text-blue-500' : 'text-purple-500'}`}>
                      {getChannel(selectedConv.title) === 'email' ? 'mail' : 'chat'}
                    </span>
                    <span className="text-sm font-medium text-foreground">{cleanTitle(selectedConv.title)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">
                    {new Date(selectedConv.createdAt).toLocaleString()} - {(selectedConv.totalInputTokens + selectedConv.totalOutputTokens).toLocaleString()} tokens
                  </p>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-4">
                  {messages.map(msg => (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.role === 'user' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                        <span className={`material-icons text-xs ${msg.role === 'user' ? 'text-blue-600' : 'text-purple-600'}`}>
                          {msg.role === 'user' ? 'person' : 'smart_toy'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">{msg.role === 'user' ? 'Request' : 'AI Response'}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                          {(msg.inputTokens > 0 || msg.outputTokens > 0) && (
                            <span className="text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                              {msg.inputTokens.toLocaleString()} in / {msg.outputTokens.toLocaleString()} out
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap mt-0.5 leading-relaxed">{msg.content}</div>
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {msg.toolCalls.map((tc, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-accent rounded text-muted-foreground">
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

                {/* Token Receipt */}
                {messages.length > 0 && (
                  <div className="px-4 py-3 border-t border-border bg-muted/30">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium">Token Receipt</span>
                      <div className="flex items-center gap-3">
                        <span>Input: {selectedConv.totalInputTokens.toLocaleString()}</span>
                        <span>Output: {selectedConv.totalOutputTokens.toLocaleString()}</span>
                        <span className="font-medium text-foreground">Total: {(selectedConv.totalInputTokens + selectedConv.totalOutputTokens).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
