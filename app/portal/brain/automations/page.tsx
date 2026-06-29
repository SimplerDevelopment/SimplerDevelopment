'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import { PRODUCT_PRESET_GROUPS } from '@/lib/automation/product-presets';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pBtnSoft, pInput, pSelect, pCard, pCardPad, pSectionTitle } from '@/components/portal/portal-ui';

// Plugin-script item returned by /api/portal/plugins/scripts — one entry
// per (plugin, script) pair the active client is entitled to run. The
// schedule-rule template picker merges these in alongside the hard-coded
// TEMPLATES so any registered script can be scheduled like a built-in.
interface PluginScriptArgField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  required?: boolean;
  description?: string;
}

interface PluginScriptItem {
  pluginSlug: string;
  pluginName: string;
  pluginIcon: string;
  script: {
    id: string;
    name: string;
    description: string;
    icon?: string;
    argsSchema?: PluginScriptArgField[];
  };
}

// Build the synthetic templateId for a plugin script. We pack the plugin
// slug + script id into a single string so the existing
// `setSchedTemplateId(string)` flow keeps working. Format intentionally
// distinct so the save handler can branch cleanly.
function pluginTemplateId(slug: string, scriptId: string): string {
  return `plugin:${slug}:${scriptId}`;
}
function parsePluginTemplateId(
  id: string,
): { pluginSlug: string; scriptId: string } | null {
  if (!id.startsWith('plugin:')) return null;
  const rest = id.slice('plugin:'.length);
  const idx = rest.indexOf(':');
  if (idx < 0) return null;
  return { pluginSlug: rest.slice(0, idx), scriptId: rest.slice(idx + 1) };
}

interface AutomationSchedule {
  cadence: 'daily' | 'weekly' | 'monthly' | 'cron';
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  cronExpression?: string;
}

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
  schedule: AutomationSchedule | null;
  nextRunAt: string | null;
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function describeScheduleClient(s: AutomationSchedule): string {
  switch (s.cadence) {
    case 'daily':
      return `Daily at ${s.time ?? '??:??'} UTC`;
    case 'weekly': {
      const day = s.dayOfWeek != null ? `${DAYS_OF_WEEK[s.dayOfWeek]?.label}s` : 'Unknown day';
      return `${day} at ${s.time ?? '??:??'} UTC`;
    }
    case 'monthly': {
      const n = s.dayOfMonth;
      const suffix = n == null ? '' : ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));
      return `${n ?? '?'}${suffix} of each month at ${s.time ?? '??:??'} UTC`;
    }
    case 'cron':
      return `Custom: ${s.cronExpression ?? '?'}`;
    default:
      return 'Unknown schedule';
  }
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

interface AutomationTemplate {
  id: string;
  icon: string;
  title: string;
  description: string;
  scope: string;
  rule: {
    name: string;
    description: string;
    trigger: { event: string; filters?: Record<string, unknown> };
    actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
    productScope: string | null;
  };
}

const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'booking-to-deal',
    icon: 'event_available',
    title: 'New booking → CRM deal',
    description: 'When a guest books a slot, create a deal in your default pipeline using the booking total.',
    scope: 'crm',
    rule: {
      name: 'Booking → CRM Deal',
      description: 'Auto-create a CRM deal when a guest books a slot.',
      trigger: { event: 'booking.guest_booked' },
      actions: [{
        tool: 'create_crm_deal',
        params: {
          title: '{{event.guestName}} — {{event.pageTitle}}',
          value: '{{event.total}}',
          notes: 'Booking #{{event.bookingId}}\nEmail: {{event.guestEmail}}\nPhone: {{event.guestPhone}}\nStart: {{event.startTime}}',
        },
      }],
      productScope: 'crm',
    },
  },
  {
    id: 'survey-to-deal',
    icon: 'poll',
    title: 'Survey response → CRM deal',
    description: 'When a survey response comes in, create a deal in your default pipeline.',
    scope: 'crm',
    rule: {
      name: 'Survey → CRM Deal',
      description: 'Auto-create a CRM deal when a survey response is submitted.',
      trigger: { event: 'survey.response_submitted' },
      actions: [{
        tool: 'create_crm_deal',
        params: {
          title: '{{event.respondentName}} — {{event.surveyTitle}}',
          notes: 'Survey response #{{event.responseId}}\nEmail: {{event.respondentEmail}}\nSource: {{event.source}}',
        },
      }],
      productScope: 'crm',
    },
  },
  {
    id: 'booking-to-contact',
    icon: 'person_add',
    title: 'New booking → CRM contact',
    description: 'Lighter alternative to a deal — just capture the lead in CRM contacts.',
    scope: 'crm',
    rule: {
      name: 'Booking → CRM Contact',
      description: 'Auto-create a CRM contact when a guest books a slot.',
      trigger: { event: 'booking.guest_booked' },
      actions: [{
        tool: 'create_crm_contact',
        params: {
          first_name: '{{event.guestName}}',
          email: '{{event.guestEmail}}',
          phone: '{{event.guestPhone}}',
          source: 'web',
          status: 'lead',
          notes: 'Booked {{event.pageTitle}} at {{event.startTime}}',
        },
      }],
      productScope: 'crm',
    },
  },
  {
    id: 'survey-to-contact',
    icon: 'how_to_reg',
    title: 'Survey response → CRM contact',
    description: 'Capture survey respondents as CRM contacts (lighter than creating a deal).',
    scope: 'crm',
    rule: {
      name: 'Survey → CRM Contact',
      description: 'Auto-create a CRM contact when a survey response is submitted.',
      trigger: { event: 'survey.response_submitted' },
      actions: [{
        tool: 'create_crm_contact',
        params: {
          first_name: '{{event.respondentName}}',
          email: '{{event.respondentEmail}}',
          source: 'web',
          status: 'lead',
          notes: 'Survey: {{event.surveyTitle}}',
        },
      }],
      productScope: 'crm',
    },
  },
];

const EVENT_LABELS: Record<string, string> = {
  'booking.created': 'Booking Page Created',
  'booking.guest_booked': 'Guest Booked a Slot',
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

function getEventScope(event: string | null | undefined): string {
  // Some automations (e.g. workflow/condition rules) carry no trigger event;
  // guard so the whole page doesn't crash on `undefined.split`.
  const prefix = (event ?? '').split('.')[0];
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

type TabType = 'rules' | 'presets' | 'logs' | 'create';

function readInitialTab(): TabType {
  if (typeof window === 'undefined') return 'rules';
  const t = new URLSearchParams(window.location.search).get('tab');
  if (t === 'presets' || t === 'logs' || t === 'create' || t === 'rules') return t;
  return 'rules';
}

export default function BrainAutomationsPage() {
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
  const [installingTemplateId, setInstallingTemplateId] = useState<string | null>(null);
  const [installedTemplateIds, setInstalledTemplateIds] = useState<Set<string>>(new Set());

  // Trigger-type radio in the AI-parsed preview: 'event' (default — use the
  // AI-inferred event trigger) or 'schedule' (override with a time-based
  // trigger configured below).
  const [triggerMode, setTriggerMode] = useState<'event' | 'schedule'>('event');

  // Standalone "Schedule a rule" form state (lives in the Create tab below
  // the NLP input). Lets the user spin up a scheduled rule without going
  // through NLP. The rule's actions still come from a chosen template.
  const [schedName, setSchedName] = useState('');
  const [schedTemplateId, setSchedTemplateId] = useState<string>('');
  const [schedCadence, setSchedCadence] = useState<'daily' | 'weekly' | 'monthly' | 'cron'>('daily');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDayOfWeek, setSchedDayOfWeek] = useState<number>(1);
  const [schedDayOfMonth, setSchedDayOfMonth] = useState<number>(1);
  const [schedCronExpr, setSchedCronExpr] = useState('*/15 * * * *');
  const [schedPreview, setSchedPreview] = useState<{ description: string; nextRunAt: string | null } | null>(null);
  const [schedPreviewError, setSchedPreviewError] = useState<string>('');
  const [schedSaving, setSchedSaving] = useState(false);
  // Per-arg input values for the selected plugin script's `argsSchema`. We
  // hold everything as strings while editing (a single source of truth for
  // form controls) and coerce to the declared type on save. Cleared /
  // re-seeded whenever the user picks a different template.
  const [schedPluginArgs, setSchedPluginArgs] = useState<Record<string, string>>({});
  // Plugin scripts available to the active client. Populated from
  // /api/portal/plugins/scripts on mount; merged into the template picker
  // dropdown under a dedicated optgroup. When the user picks one and
  // saves, the schedule rule's `actions` is built with the
  // `run_plugin_script` action shape — see handleSaveScheduledRule.
  const [pluginScripts, setPluginScripts] = useState<PluginScriptItem[]>([]);

  const buildScheduleFromForm = (): AutomationSchedule => {
    if (schedCadence === 'daily') return { cadence: 'daily', time: schedTime };
    if (schedCadence === 'weekly') return { cadence: 'weekly', time: schedTime, dayOfWeek: schedDayOfWeek };
    if (schedCadence === 'monthly') return { cadence: 'monthly', time: schedTime, dayOfMonth: schedDayOfMonth };
    return { cadence: 'cron', cronExpression: schedCronExpr };
  };

  useEffect(() => {
    setTab(readInitialTab());
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/automations').then((r) => r.json()),
      fetch('/api/portal/automations/logs?limit=30').then((r) => r.json()),
    ]).then(([rulesRes, logsRes]) => {
      if (rulesRes.success) setRules(rulesRes.rules);
      if (logsRes.success) setLogs(logsRes.logs);
    }).finally(() => setLoading(false));
  }, []);

  // Pull plugin scripts in parallel — they show up in the schedule-rule
  // template picker. Failure is non-fatal: if the endpoint 5xxs the
  // dropdown just falls back to the built-in TEMPLATES list.
  useEffect(() => {
    fetch('/api/portal/plugins/scripts')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.items)) {
          setPluginScripts(res.items);
        }
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  // When the user picks a different template, re-seed the plugin-args form
  // from the script's declared `argsSchema` defaults (or clear it for a
  // built-in template). Storing as strings — the save handler coerces back
  // to the declared type. Keeps the input fields in sync with whichever
  // script the user just selected.
  useEffect(() => {
    const pluginRef = parsePluginTemplateId(schedTemplateId);
    if (!pluginRef) {
      setSchedPluginArgs({});
      return;
    }
    const item = pluginScripts.find(
      (p) => p.pluginSlug === pluginRef.pluginSlug && p.script.id === pluginRef.scriptId,
    );
    const next: Record<string, string> = {};
    for (const arg of item?.script.argsSchema ?? []) {
      next[arg.name] = arg.default !== undefined ? String(arg.default) : '';
    }
    setSchedPluginArgs(next);
  }, [schedTemplateId, pluginScripts]);

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
      // When the user picked "On a schedule", the AI-inferred trigger is
      // replaced with the sentinel `automation.scheduled` and the chosen
      // schedule is attached. The scheduler cron will fire the rule
      // independently of the event bus.
      const useSchedule = triggerMode === 'schedule';
      const triggerPayload = useSchedule ? { event: 'automation.scheduled' } : parsed.trigger;
      const schedulePayload = useSchedule ? buildScheduleFromForm() : undefined;

      const res = await fetch('/api/portal/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parsed.name,
          description: nlpInput,
          trigger: triggerPayload,
          conditions: parsed.conditions,
          actions: parsed.actions,
          source: 'nlp',
          productScope: parsed.productScope,
          ...(schedulePayload ? { schedule: schedulePayload } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRules((prev) => [data.rule, ...prev]);
        setParsed(null);
        setNlpInput('');
        setTriggerMode('event');
        setTab('rules');
      }
    } finally {
      setSaving(false);
    }
  };

  // Live preview the next firing time for the standalone "Schedule a rule"
  // form. Debounced via a useEffect on the schedule inputs. State updates
  // happen inside the deferred fetch callback (not synchronously in the
  // effect body) to avoid the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    let cancelled = false;
    const schedule = buildScheduleFromForm();
    const handle = setTimeout(() => {
      fetch('/api/portal/automations/preview-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.success) {
            setSchedPreviewError('');
            setSchedPreview({ description: data.description, nextRunAt: data.nextRunAt });
          } else {
            setSchedPreview(null);
            setSchedPreviewError(data.error || 'Invalid schedule');
          }
        })
        .catch(() => {
          if (cancelled) return;
          setSchedPreview(null);
          setSchedPreviewError('Network error');
        });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
    // buildScheduleFromForm is derived from the deps below; intentionally
    // not listed to keep the effect cycle bounded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedCadence, schedTime, schedDayOfWeek, schedDayOfMonth, schedCronExpr]);

  const handleSaveScheduledRule = async () => {
    if (!schedName.trim() || !schedTemplateId) return;

    // Two flavours of schedTemplateId:
    //   - a hard-coded TEMPLATES entry id ('booking-to-deal' etc.)
    //   - a synthetic 'plugin:<slug>:<scriptId>' built from a plugin script
    let actions: { tool: string; params: Record<string, unknown>; delay?: number }[];
    let productScope: string | null;

    const pluginRef = parsePluginTemplateId(schedTemplateId);
    if (pluginRef) {
      const item = pluginScripts.find(
        (p) => p.pluginSlug === pluginRef.pluginSlug && p.script.id === pluginRef.scriptId,
      );
      if (!item) return;
      // Pull each declared schema field from the form state, coerce to the
      // declared type, and fall back to the declared default if the field
      // is empty. Users can later edit the rule to template against event
      // payloads ({{event.field}}).
      const seededArgs: Record<string, unknown> = {};
      for (const arg of item.script.argsSchema ?? []) {
        const raw = (schedPluginArgs[arg.name] ?? '').trim();
        const fallback = arg.default;
        if (raw === '') {
          if (fallback !== undefined) seededArgs[arg.name] = fallback;
          continue;
        }
        if (arg.type === 'number') {
          const n = Number(raw);
          seededArgs[arg.name] = Number.isFinite(n) ? n : fallback;
        } else if (arg.type === 'boolean') {
          seededArgs[arg.name] = raw === 'true';
        } else {
          seededArgs[arg.name] = raw;
        }
      }
      actions = [{
        tool: 'run_plugin_script',
        params: {
          pluginSlug: pluginRef.pluginSlug,
          scriptId: pluginRef.scriptId,
          args: seededArgs,
        },
      }];
      productScope = null;
    } else {
      const template = TEMPLATES.find((t) => t.id === schedTemplateId);
      if (!template) return;
      actions = template.rule.actions;
      productScope = template.rule.productScope ?? null;
    }

    setSchedSaving(true);
    try {
      const res = await fetch('/api/portal/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schedName,
          description: `Scheduled — ${schedName}`,
          trigger: { event: 'automation.scheduled' },
          conditions: [],
          actions,
          source: 'manual',
          productScope,
          schedule: buildScheduleFromForm(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRules((prev) => [data.rule, ...prev]);
        setSchedName('');
        setSchedTemplateId('');
        setTab('rules');
      } else {
        setSchedPreviewError(data.error || 'Failed to save');
      }
    } finally {
      setSchedSaving(false);
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

  const handleInstallTemplate = async (template: AutomationTemplate) => {
    setInstallingTemplateId(template.id);
    try {
      const res = await fetch('/api/portal/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.rule.name,
          description: template.rule.description,
          trigger: template.rule.trigger,
          conditions: [],
          actions: template.rule.actions,
          source: 'template',
          productScope: template.rule.productScope,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRules((prev) => [data.rule, ...prev]);
        setInstalledTemplateIds((prev) => new Set(prev).add(template.id));
      }
    } finally {
      setInstallingTemplateId(null);
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
    <div className="max-w-5xl mx-auto py-8">
      <PortalPageHeader
        eyebrow="Company Brain"
        title="Brain Automations"
        subtitle="Cross-product rules that fire when something happens — booking, survey, deal, task — and act on your behalf."
        actions={
          <>
            <Link
              href="/portal/brain"
              className={pBtnGhost}
            >
              <span className="material-icons text-base">arrow_back</span>
              Brain
            </Link>
            <button
              onClick={() => setTab('create')}
              className={pBtnPrimary}
            >
              <span className="material-icons text-lg">auto_awesome</span>
              Create Automation
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 mt-6 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {(['rules', 'presets', 'logs', 'create'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t
                ? 'bg-foreground text-background rounded-lg'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg'
            }`}
          >
            {t === 'rules' && (
              <>
                <span className="material-icons text-base align-text-bottom mr-1.5">bolt</span>
                Rules ({rules.length})
              </>
            )}
            {t === 'presets' && (
              <>
                <span className="material-icons text-base align-text-bottom mr-1.5">tune</span>
                Product Presets
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
                Install a one-click template, or describe your own automation in plain English.
              </p>
              <button
                onClick={() => setTab('create')}
                className={`mt-4 ${pBtnPrimary}`}
              >
                Browse templates
              </button>
            </div>
          ) : (
            rules.map((rule) => {
              const scope = getEventScope(rule.trigger.event);
              return (
                <div
                  key={rule.id}
                  className={`${pCard} p-4 hover:border-border/80 transition-colors`}
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

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="material-icons text-xs">
                            {rule.schedule ? 'schedule' : 'sensors'}
                          </span>
                          {rule.schedule
                            ? describeScheduleClient(rule.schedule)
                            : (EVENT_LABELS[rule.trigger.event] || rule.trigger.event)}
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
                          <span>Last fired: {timeAgo(rule.lastExecutedAt)}</span>
                        )}
                      </div>
                      {rule.schedule && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            <span className="material-icons text-[12px]">schedule</span>
                            Schedule: {describeScheduleClient(rule.schedule)}
                          </span>
                        </div>
                      )}

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

      {/* ── Presets Tab ── */}
      {tab === 'presets' && (
        <div className="space-y-8">
          <div className="bg-muted/30 border border-border rounded-xl p-4 text-sm text-muted-foreground">
            <span className="material-icons text-base align-text-bottom mr-1 text-primary">info</span>
            Product presets are one-toggle rules grouped by the product they belong to (Email Marketing, etc).
            Toggling one creates an automation rule with the matching <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">productScope</code> — visible in the Rules tab and the runtime engine.
          </div>

          {PRODUCT_PRESET_GROUPS.map((group) => (
            <section key={group.productScope} className={`${pCard} p-6`}>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-icons text-lg">{group.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className={pSectionTitle}>{group.label}</h2>
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <ProductAutomationSettings
                  productScope={group.productScope}
                  presets={group.presets}
                />
              </div>
            </section>
          ))}
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
                className={`flex items-center gap-3 ${pCard} px-4 py-3`}
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
          {/* Quick Start Templates */}
          <div className={`${pCard} p-6`}>
            <div className="flex items-center justify-between mb-1">
              <h2 className={pSectionTitle}>Quick start templates</h2>
              <span className="text-xs text-muted-foreground">One-click install</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Pre-built rules for common workflows. They use your default CRM pipeline — no setup required.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {TEMPLATES.map((tpl) => {
                const installed = installedTemplateIds.has(tpl.id);
                const installing = installingTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${SCOPE_COLORS[tpl.scope] || 'bg-muted text-muted-foreground'}`}>
                        <span className="material-icons text-lg">{tpl.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{tpl.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="material-icons text-xs">sensors</span>
                        <span>{EVENT_LABELS[tpl.rule.trigger.event] || tpl.rule.trigger.event}</span>
                        <span className="material-icons text-xs">arrow_forward</span>
                        <span className="font-mono">{formatToolName(tpl.rule.actions[0].tool)}</span>
                      </div>
                      <button
                        onClick={() => handleInstallTemplate(tpl)}
                        disabled={installing || installed}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          installed
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 cursor-default'
                            : installing
                            ? 'bg-muted text-muted-foreground cursor-wait'
                            : pBtnSoft
                        }`}
                      >
                        {installed ? (
                          <>
                            <span className="material-icons text-sm">check</span>
                            Installed
                          </>
                        ) : installing ? (
                          <>
                            <span className="material-icons text-sm animate-spin">autorenew</span>
                            Installing...
                          </>
                        ) : (
                          <>
                            <span className="material-icons text-sm">add</span>
                            Install
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NLP Input */}
          <div className={`${pCard} p-6`}>
            <h2 className={`${pSectionTitle} mb-1`}>Describe your automation</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Tell us what you want to happen in plain English. AI will parse it into a structured rule.
            </p>

            <textarea
              value={nlpInput}
              onChange={(e) => setNlpInput(e.target.value)}
              placeholder="e.g. When someone books an appointment, send them a confirmation email and create a task for my team"
              className={`${pInput} h-28 resize-none`}
            />

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                <span className="material-icons text-xs align-text-bottom mr-0.5">info</span>
                Uses AI credits to parse your description
              </p>
              <button
                onClick={handleParse}
                disabled={parsing || !nlpInput.trim()}
                className={pBtnPrimary}
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
            <div className={`${pCard} p-6`}>
              <h3 className={`${pSectionTitle} mb-3`}>Example automations</h3>
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
            <div className="rounded-2xl border border-primary/30 bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={pSectionTitle}>Review Automation</h3>
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
                  {/* Trigger-type radio: AI default is event-driven; user can
                      flip to a time-based schedule which overrides the
                      event match with a sentinel trigger. */}
                  <div className="flex items-center gap-3 mt-1.5">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="triggerMode"
                        value="event"
                        checked={triggerMode === 'event'}
                        onChange={() => setTriggerMode('event')}
                      />
                      <span className="material-icons text-base text-primary">sensors</span>
                      When event happens
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="triggerMode"
                        value="schedule"
                        checked={triggerMode === 'schedule'}
                        onChange={() => setTriggerMode('schedule')}
                      />
                      <span className="material-icons text-base text-sky-500">schedule</span>
                      On a schedule
                    </label>
                  </div>
                  {triggerMode === 'event' && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="material-icons text-base text-primary">sensors</span>
                      <span className="text-sm">{EVENT_LABELS[parsed.trigger.event] || parsed.trigger.event}</span>
                      {parsed.trigger.filters && Object.keys(parsed.trigger.filters).length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (filtered: {Object.entries(parsed.trigger.filters).map(([k, v]) => `${k}=${v}`).join(', ')})
                        </span>
                      )}
                    </div>
                  )}
                  {triggerMode === 'schedule' && (
                    <ScheduleEditor
                      cadence={schedCadence}
                      time={schedTime}
                      dayOfWeek={schedDayOfWeek}
                      dayOfMonth={schedDayOfMonth}
                      cronExpression={schedCronExpr}
                      preview={schedPreview}
                      previewError={schedPreviewError}
                      onCadence={setSchedCadence}
                      onTime={setSchedTime}
                      onDayOfWeek={setSchedDayOfWeek}
                      onDayOfMonth={setSchedDayOfMonth}
                      onCronExpression={setSchedCronExpr}
                    />
                  )}
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
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
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

          {/* Standalone "Schedule a rule" creator — lets the user spin up a
              time-based rule without going through NLP. Pairs a chosen
              template's actions with a cadence picker. */}
          {!parsed && (
            <div className={`${pCard} p-6`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-icons text-sky-500">schedule</span>
                <h2 className={pSectionTitle}>Schedule a rule</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Run an action on a fixed cadence — daily, weekly, monthly, or a custom cron expression. All times are UTC.
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rule name</span>
                  <input
                    type="text"
                    value={schedName}
                    onChange={(e) => setSchedName(e.target.value)}
                    placeholder="Weekly digest"
                    className={pInput}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Action template</span>
                  <select
                    value={schedTemplateId}
                    onChange={(e) => setSchedTemplateId(e.target.value)}
                    className={pSelect}
                  >
                    <option value="">— pick one —</option>
                    <optgroup label="Built-in templates">
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </optgroup>
                    {pluginScripts.length > 0 && (
                      <optgroup label="Plugin scripts">
                        {pluginScripts.map((p) => (
                          <option
                            key={pluginTemplateId(p.pluginSlug, p.script.id)}
                            value={pluginTemplateId(p.pluginSlug, p.script.id)}
                          >
                            {p.pluginName} — {p.script.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>

              <PluginScriptArgsEditor
                templateId={schedTemplateId}
                pluginScripts={pluginScripts}
                values={schedPluginArgs}
                onChange={setSchedPluginArgs}
              />

              <div className="mt-4">
                <ScheduleEditor
                  cadence={schedCadence}
                  time={schedTime}
                  dayOfWeek={schedDayOfWeek}
                  dayOfMonth={schedDayOfMonth}
                  cronExpression={schedCronExpr}
                  preview={schedPreview}
                  previewError={schedPreviewError}
                  onCadence={setSchedCadence}
                  onTime={setSchedTime}
                  onDayOfWeek={setSchedDayOfWeek}
                  onDayOfMonth={setSchedDayOfMonth}
                  onCronExpression={setSchedCronExpr}
                />
              </div>

              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                <button
                  onClick={handleSaveScheduledRule}
                  disabled={schedSaving || !schedName.trim() || !schedTemplateId}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {schedSaving ? (
                    <span className="material-icons text-base animate-spin">autorenew</span>
                  ) : (
                    <span className="material-icons text-base">check</span>
                  )}
                  Save scheduled rule
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Per-arg input form for a selected plugin script. Renders one row per
// declared `argsSchema` field; values flow up through `onChange` so the
// outer page handles seeding/coercion at save time. No-op when the
// current template isn't a plugin script (or its argsSchema is empty),
// so callers can mount it unconditionally below the picker.
interface PluginScriptArgsEditorProps {
  templateId: string;
  pluginScripts: PluginScriptItem[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

function PluginScriptArgsEditor(props: PluginScriptArgsEditorProps) {
  const pluginRef = parsePluginTemplateId(props.templateId);
  if (!pluginRef) return null;
  const item = props.pluginScripts.find(
    (p) => p.pluginSlug === pluginRef.pluginSlug && p.script.id === pluginRef.scriptId,
  );
  const fields = item?.script.argsSchema ?? [];
  if (fields.length === 0) return null;

  const setField = (name: string, value: string) => {
    props.onChange({ ...props.values, [name]: value });
  };

  return (
    <div className="mt-4 p-4 bg-muted/30 border border-border rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-icons text-base text-muted-foreground">tune</span>
        <h3 className="text-sm font-medium">Script inputs</h3>
        <span className="text-xs text-muted-foreground">— {item?.script.name}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map((arg) => {
          const value = props.values[arg.name] ?? '';
          const placeholder = arg.default !== undefined ? `default: ${String(arg.default)}` : '';
          return (
            <label key={arg.name} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {arg.name}
                {arg.required && <span className="text-rose-500 ml-1">*</span>}
                <span className="ml-2 normal-case font-normal text-[10px] text-muted-foreground/70">
                  {arg.type}
                </span>
              </span>
              {arg.type === 'boolean' ? (
                <select
                  value={value || (arg.default !== undefined ? String(arg.default) : 'false')}
                  onChange={(e) => setField(arg.name, e.target.value)}
                  className={pSelect}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={arg.type === 'number' ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => setField(arg.name, e.target.value)}
                  placeholder={placeholder}
                  className={pInput}
                />
              )}
              {arg.description && (
                <span className="text-xs text-muted-foreground">{arg.description}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface ScheduleEditorProps {
  cadence: 'daily' | 'weekly' | 'monthly' | 'cron';
  time: string;
  dayOfWeek: number;
  dayOfMonth: number;
  cronExpression: string;
  preview: { description: string; nextRunAt: string | null } | null;
  previewError: string;
  onCadence: (c: 'daily' | 'weekly' | 'monthly' | 'cron') => void;
  onTime: (v: string) => void;
  onDayOfWeek: (v: number) => void;
  onDayOfMonth: (v: number) => void;
  onCronExpression: (v: string) => void;
}

function ScheduleEditor(props: ScheduleEditorProps) {
  const { cadence, time, dayOfWeek, dayOfMonth, cronExpression, preview, previewError } = props;
  return (
    <div className="space-y-3 mt-2 p-4 bg-muted/30 border border-border rounded-xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cadence</span>
          <select
            value={cadence}
            onChange={(e) => props.onCadence(e.target.value as ScheduleEditorProps['cadence'])}
            className={pSelect}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="cron">Custom cron</option>
          </select>
        </label>

        {(cadence === 'daily' || cadence === 'weekly' || cadence === 'monthly') && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Time (UTC)</span>
            <input
              type="time"
              value={time}
              onChange={(e) => props.onTime(e.target.value)}
              className={pInput}
            />
          </label>
        )}

        {cadence === 'weekly' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Day of week</span>
            <select
              value={dayOfWeek}
              onChange={(e) => props.onDayOfWeek(Number(e.target.value))}
              className={pSelect}
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>
        )}

        {cadence === 'monthly' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Day of month</span>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => props.onDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className={pInput}
            />
            <span className="text-[11px] text-muted-foreground">If the month has fewer days, fires on the last day.</span>
          </label>
        )}

        {cadence === 'cron' && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cron expression</span>
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => props.onCronExpression(e.target.value)}
              placeholder="*/15 * * * *"
              className={`${pInput} font-mono`}
            />
            <span className="text-[11px] text-muted-foreground">Five-field UTC cron (minute hour day-of-month month day-of-week).</span>
          </label>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs">
        {previewError ? (
          <>
            <span className="material-icons text-sm text-red-500 mt-0.5">error</span>
            <span className="text-red-500">{previewError}</span>
          </>
        ) : preview ? (
          <>
            <span className="material-icons text-sm text-sky-500 mt-0.5">event</span>
            <span>
              <strong>{preview.description}</strong>
              {preview.nextRunAt && (
                <span className="text-muted-foreground"> · Next runs at: {new Date(preview.nextRunAt).toUTCString()}</span>
              )}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Computing next run…</span>
        )}
      </div>
    </div>
  );
}
