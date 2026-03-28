'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AutomationRule {
  id: number;
  name: string;
  description: string | null;
  trigger: { event: string; filters?: Record<string, unknown> };
  conditions: { field: string; operator: string; value?: unknown }[];
  actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
  enabled: boolean;
  source: string;
  productScope: string | null;
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
}

interface AutomationLog {
  id: number;
  ruleId: number;
  ruleName: string;
  triggerEvent: string;
  status: string;
  duration: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ParsedResult {
  name: string;
  trigger: { event: string; filters?: Record<string, unknown> };
  conditions: { field: string; operator: string; value?: unknown }[];
  actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
  productScope: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  'booking.created': 'Booking Created',
  'booking.confirmed': 'Booking Confirmed',
  'booking.cancelled': 'Booking Cancelled',
  'booking.rescheduled': 'Booking Rescheduled',
  'crm.contact.created': 'Contact Created',
  'crm.contact.updated': 'Contact Updated',
  'crm.deal.created': 'Deal Created',
  'crm.deal.updated': 'Deal Updated',
  'crm.deal.won': 'Deal Won',
  'crm.deal.lost': 'Deal Lost',
  'email.campaign.sent': 'Campaign Sent',
  'email.subscriber.added': 'Subscriber Added',
  'email.subscriber.unsubscribed': 'Subscriber Unsubscribed',
  'project.created': 'Project Created',
  'project.status.changed': 'Project Status Changed',
  'task.created': 'Task Created',
  'task.completed': 'Task Completed',
  'task.assigned': 'Task Assigned',
  'ticket.created': 'Ticket Created',
  'ticket.replied': 'Ticket Reply',
  'ticket.resolved': 'Ticket Resolved',
  'form.submitted': 'Form Submitted',
  'page.published': 'Page Published',
  'order.placed': 'Order Placed',
  'order.paid': 'Order Paid',
  'order.shipped': 'Order Shipped',
  'invoice.sent': 'Invoice Sent',
  'invoice.paid': 'Invoice Paid',
  'invoice.overdue': 'Invoice Overdue',
  'proposal.sent': 'Proposal Sent',
  'proposal.viewed': 'Proposal Viewed',
  'proposal.accepted': 'Proposal Accepted',
  'proposal.declined': 'Proposal Declined',
};

const SCOPE_COLORS: Record<string, string> = {
  booking: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  crm: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  email: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  projects: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  support: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  website: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  store: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

function getEventScope(event: string): string {
  const prefix = event.split('.')[0];
  if (prefix === 'crm') return 'crm';
  if (prefix === 'booking') return 'booking';
  if (prefix === 'email') return 'email';
  if (prefix === 'project' || prefix === 'task') return 'projects';
  if (prefix === 'ticket') return 'support';
  if (prefix === 'form' || prefix === 'page') return 'website';
  if (prefix === 'order') return 'store';
  if (prefix === 'invoice') return 'billing';
  if (prefix === 'proposal') return 'crm';
  return 'other';
}

function formatToolName(tool: string): string {
  return tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type TabType = 'rules' | 'logs' | 'create';

export default function AutomationsPage() {
  const [tab, setTab] = useState<TabType>('rules');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [nlpInput, setNlpInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/automations').then((r) => r.json()),
      fetch('/api/portal/automations/logs?limit=30').then((r) => r.json()),
    ]).then(([rulesRes, logsRes]) => {
      if (rulesRes.success) setRules(rulesRes.rules);
      if (logsRes.success) setLogs(logsRes.logs);
    }).finally(() => setLoading(false));
  }, []);

  const handleParse = async () => {
    if (!nlpInput.trim()) return;
    setParsing(true);
    setParseError('');
    setParsed(null);
    try {
      const res = await fetch('/api/portal/automations/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: nlpInput }),
      });
      const data = await res.json();
      if (data.success) {
        setParsed(data.parsed);
      } else {
        setParseError(data.error || 'Failed to parse');
      }
    } catch {
      setParseError('Network error');
    } finally {
      setParsing(false);
    }
  };

  const handleSaveRule = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const res = await fetch('/api/portal/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parsed.name,
          description: nlpInput,
          trigger: parsed.trigger,
          conditions: parsed.conditions,
          actions: parsed.actions,
          source: 'nlp',
          productScope: parsed.productScope,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRules((prev) => [data.rule, ...prev]);
        setParsed(null);
        setNlpInput('');
        setTab('rules');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ruleId: number, enabled: boolean) => {
    setTogglingId(ruleId);
    try {
      const res = await fetch(`/api/portal/automations/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r)));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm('Delete this automation rule?')) return;
    const res = await fetch(`/api/portal/automations/${ruleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automate workflows across your tools with AI-powered rules
          </p>
        </div>
        <button
          onClick={() => setTab('create')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <span className="material-icons text-lg">auto_awesome</span>
          Create Automation
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(['rules', 'logs', 'create'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'rules' && (
              <>
                <span className="material-icons text-base align-text-bottom mr-1.5">bolt</span>
                Rules ({rules.length})
              </>
            )}
            {t === 'logs' && (
              <>
                <span className="material-icons text-base align-text-bottom mr-1.5">history</span>
                Activity
              </>
            )}
            {t === 'create' && (
              <>
                <span className="material-icons text-base align-text-bottom mr-1.5">auto_awesome</span>
                Create
              </>
            )}
          </button>
        ))}
      </div>

      {/* ── Rules Tab ── */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="text-center py-16 bg-muted/30 rounded-xl border border-border">
              <span className="material-icons text-5xl text-muted-foreground">bolt</span>
              <h3 className="mt-3 font-semibold text-lg">No automations yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Describe what you want to automate in plain English and AI will create the rule for you.
              </p>
              <button
                onClick={() => setTab('create')}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                Create your first automation
              </button>
            </div>
          ) : (
            rules.map((rule) => {
              const scope = getEventScope(rule.trigger.event);
              return (
                <div
                  key={rule.id}
                  className="bg-card border border-border rounded-xl p-4 hover:border-border/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate">{rule.name}</h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${SCOPE_COLORS[scope] || 'bg-muted text-muted-foreground'}`}>
                          {scope}
                        </span>
                        {rule.source === 'nlp' && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                            AI
                          </span>
                        )}
                      </div>

                      {rule.description && (
                        <p className="text-xs text-muted-foreground mb-2 truncate">{rule.description}</p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="material-icons text-xs">sensors</span>
                          {EVENT_LABELS[rule.trigger.event] || rule.trigger.event}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-icons text-xs">arrow_forward</span>
                          {rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''}
                        </span>
                        {rule.executionCount > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="material-icons text-xs">play_circle</span>
                            {rule.executionCount} runs
                          </span>
                        )}
                        {rule.lastExecutedAt && (
                          <span>Last: {timeAgo(rule.lastExecutedAt)}</span>
                        )}
                      </div>

                      {/* Action chips */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {rule.actions.map((action, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded"
                          >
                            {formatToolName(action.tool)}
                            {action.delay ? ` (${action.delay >= 86400 ? `${Math.floor(action.delay / 86400)}d` : action.delay >= 3600 ? `${Math.floor(action.delay / 3600)}h` : `${action.delay}s`} delay)` : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(rule.id, !rule.enabled)}
                        disabled={togglingId === rule.id}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                          rule.enabled ? 'bg-green-500' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            rule.enabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <span className="material-icons text-lg">delete_outline</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Logs Tab ── */}
      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="text-center py-16 bg-muted/30 rounded-xl border border-border">
              <span className="material-icons text-5xl text-muted-foreground">history</span>
              <h3 className="mt-3 font-semibold text-lg">No activity yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Execution logs will appear here once automations start running.
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3"
              >
                <span
                  className={`material-icons text-lg ${
                    log.status === 'success'
                      ? 'text-green-500'
                      : log.status === 'partial'
                      ? 'text-amber-500'
                      : 'text-red-500'
                  }`}
                >
                  {log.status === 'success' ? 'check_circle' : log.status === 'partial' ? 'warning' : 'error'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{log.ruleName}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {EVENT_LABELS[log.triggerEvent] || log.triggerEvent}
                    </span>
                  </div>
                  {log.errorMessage && (
                    <p className="text-xs text-red-500 truncate mt-0.5">{log.errorMessage}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</span>
                  {log.duration != null && (
                    <span className="text-[10px] text-muted-foreground block">{log.duration}ms</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Create Tab (NLP) ── */}
      {tab === 'create' && (
        <div className="space-y-6">
          {/* NLP Input */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">Describe your automation</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Tell us what you want to happen in plain English. AI will parse it into a structured rule.
            </p>

            <textarea
              value={nlpInput}
              onChange={(e) => setNlpInput(e.target.value)}
              placeholder="e.g. When someone books an appointment, send them a confirmation email and create a task for my team"
              className="w-full h-28 resize-none bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/60"
            />

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                <span className="material-icons text-xs align-text-bottom mr-0.5">info</span>
                Uses AI credits to parse your description
              </p>
              <button
                onClick={handleParse}
                disabled={parsing || !nlpInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {parsing ? (
                  <>
                    <span className="material-icons text-base animate-spin">autorenew</span>
                    Parsing...
                  </>
                ) : (
                  <>
                    <span className="material-icons text-base">auto_awesome</span>
                    Parse with AI
                  </>
                )}
              </button>
            </div>

            {parseError && (
              <div className="mt-3 flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">
                <span className="material-icons text-base">error</span>
                {parseError}
              </div>
            )}
          </div>

          {/* Examples */}
          {!parsed && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-sm font-semibold mb-3">Example automations</h3>
              <div className="grid gap-2">
                {[
                  'When someone books an appointment, send them a confirmation email and create a task for my team',
                  'When a deal is won, create a new project and send a welcome email to the contact',
                  'When a support ticket is created with high priority, notify my team immediately',
                  'When a form is submitted on my website, create a CRM contact and add them to my mailing list',
                  'When a proposal is accepted, create an invoice and start a new project',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setNlpInput(example)}
                    className="text-left text-sm text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60 rounded-lg px-3 py-2 transition-colors"
                  >
                    <span className="material-icons text-xs align-text-bottom mr-1.5 text-primary">arrow_forward</span>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parsed Result Preview */}
          {parsed && (
            <div className="bg-card border border-primary/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Review Automation</h3>
                <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full font-medium">
                  AI Generated
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</label>
                  <p className="text-sm font-medium mt-0.5">{parsed.name}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trigger</label>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="material-icons text-base text-primary">sensors</span>
                    <span className="text-sm">{EVENT_LABELS[parsed.trigger.event] || parsed.trigger.event}</span>
                    {parsed.trigger.filters && Object.keys(parsed.trigger.filters).length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        (filtered: {Object.entries(parsed.trigger.filters).map(([k, v]) => `${k}=${v}`).join(', ')})
                      </span>
                    )}
                  </div>
                </div>

                {parsed.conditions.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Conditions</label>
                    <div className="space-y-1 mt-1">
                      {parsed.conditions.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="material-icons text-xs text-amber-500">filter_list</span>
                          {c.field} {c.operator} {c.value !== undefined ? String(c.value) : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</label>
                  <div className="space-y-2 mt-1">
                    {parsed.actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2">
                        <span className="material-icons text-base text-green-500 mt-0.5">
                          {i === 0 ? 'play_arrow' : 'subdirectory_arrow_right'}
                        </span>
                        <div>
                          <span className="text-sm font-medium">{formatToolName(action.tool)}</span>
                          {action.delay && action.delay > 0 && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (after {action.delay >= 86400 ? `${Math.floor(action.delay / 86400)} days` : action.delay >= 3600 ? `${Math.floor(action.delay / 3600)} hours` : `${action.delay} seconds`})
                            </span>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {Object.entries(action.params).map(([k, v]) => (
                              <span key={k} className="mr-2">
                                {k}: {typeof v === 'string' && v.includes('{{') ? (
                                  <span className="text-primary">{String(v)}</span>
                                ) : String(v)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
                <button
                  onClick={handleSaveRule}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? (
                    <span className="material-icons text-base animate-spin">autorenew</span>
                  ) : (
                    <span className="material-icons text-base">check</span>
                  )}
                  Save Automation
                </button>
                <button
                  onClick={() => setParsed(null)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
