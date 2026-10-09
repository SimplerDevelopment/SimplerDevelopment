'use client';

import { useEffect, useState } from 'react';
import { pCard } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { GhostCard } from '@/components/portal/EmptyState';
import { groupByRoom } from '@/lib/notifications/rooms';

type Delivery = 'instant' | 'digest_daily' | 'off';

interface PrefRow {
  notificationType: string;
  delivery: Delivery;
}

// Human-friendly copy for each notification type. Keep in sync with the
// NOTIFICATION_TYPES tuple in lib/db/schema/crm.ts.
const TYPE_META: Record<string, { label: string; hint: string; icon: string }> = {
  mention: {
    label: '@-mentions',
    hint: 'When a teammate mentions you in a deal comment.',
    icon: 'alternate_email',
  },
  deal_stage_changed: {
    label: 'Deal stage changed',
    hint: 'A deal in your pipeline moved to a new stage.',
    icon: 'swap_horiz',
  },
  deal_assigned: {
    label: 'Deal assigned',
    hint: 'A deal was assigned to you.',
    icon: 'assignment_ind',
  },
  deal_stale: {
    label: 'Stale deal nudge',
    hint: 'An open deal hasn’t been touched in a while.',
    icon: 'hourglass_top',
  },
  contact_created: {
    label: 'New contact',
    hint: 'A new contact was added to the CRM.',
    icon: 'person_add',
  },
  proposal_viewed: {
    label: 'Proposal viewed',
    hint: 'A client opened a proposal you sent.',
    icon: 'visibility',
  },
  document_comment_mention: {
    label: 'Document comment mention',
    hint: 'You were mentioned in a document comment thread.',
    icon: 'comment',
  },
  task_assigned: {
    label: 'Task assigned',
    hint: 'A task was assigned to you.',
    icon: 'task_alt',
  },
  task_due_soon: {
    label: 'Task due soon',
    hint: 'A task you own is approaching its due date.',
    icon: 'schedule',
  },
  ticket_assigned: {
    label: 'Ticket assigned',
    hint: 'A support ticket was assigned to you.',
    icon: 'support_agent',
  },
  ticket_status_changed: {
    label: 'Ticket status changed',
    hint: 'A ticket you’re watching changed status.',
    icon: 'sync',
  },
  automation_failing: {
    label: 'Automation failing',
    hint: 'An automation rule has failed repeatedly.',
    icon: 'error',
  },
  survey_zero_responses: {
    label: 'Survey with zero responses',
    hint: 'A live survey has received no responses.',
    icon: 'poll',
  },
  booking_hold_stuck: {
    label: 'Booking hold stuck',
    hint: 'A booking hold has gone stale without checkout.',
    icon: 'event_busy',
  },
  // PUX-201: the two SLA types existed in NOTIFICATION_TYPES but had no label here.
  ticket_sla_first_response_breach: { label: 'Ticket first-response SLA breached', hint: 'A ticket waited past its first-response target.', icon: 'timer_off' },
  ticket_sla_resolution_breach: { label: 'Ticket resolution SLA breached', hint: 'A ticket passed its resolution target without closing.', icon: 'timer_off' },
};

const DELIVERY_OPTIONS: Array<{ value: Delivery; label: string; icon: string }> = [
  { value: 'instant', label: 'Instant', icon: 'bolt' },
  { value: 'digest_daily', label: 'Daily digest', icon: 'mail' },
  { value: 'off', label: 'Off', icon: 'notifications_off' },
];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const studio = useFeatureFlag('portal-redesign'); // PUX-201: rows grouped by room

  useEffect(() => {
    fetch('/api/portal/notifications/preferences')
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data?.items)) {
          setPrefs(res.data.items as PrefRow[]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const updateDelivery = async (notificationType: string, delivery: Delivery) => {
    setSavingType(notificationType);
    setMessage(null);
    // Optimistic update
    setPrefs((prev) =>
      prev.map((p) => (p.notificationType === notificationType ? { ...p, delivery } : p)),
    );
    try {
      const res = await fetch('/api/portal/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationType, delivery }),
      });
      const data = await res.json();
      if (!data.success) {
        setMessage({ type: 'error', text: data.message || 'Could not save.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  // PUX-201: one row renderer for the flat legacy list and the studio room groups.
  const renderRow = (pref: PrefRow) => {
            const meta = TYPE_META[pref.notificationType] ?? {
              label: pref.notificationType,
              hint: '',
              icon: 'notifications',
            };
            const isSaving = savingType === pref.notificationType;
            return (
              <div
                key={pref.notificationType}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between bg-background"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="material-icons text-muted-foreground text-base mt-0.5 shrink-0">
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{meta.label}</div>
                    {meta.hint && (
                      <div className="text-xs text-muted-foreground mt-0.5">{meta.hint}</div>
                    )}
                  </div>
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Delivery for ${meta.label}`}
                  className="flex gap-1 shrink-0 self-start sm:self-auto"
                >
                  {DELIVERY_OPTIONS.map((opt) => {
                    const isActive = pref.delivery === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        disabled={isSaving}
                        onClick={() => updateDelivery(pref.notificationType, opt.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ${
                          isActive
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-accent'
                        }`}
                      >
                        <span className="material-icons text-sm">{opt.icon}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
  };

  return (
    <div className="space-y-6">
      <div className={`${pCard} p-6 space-y-4`}>
        <div>
          <h2 className="text-base font-display font-extrabold tracking-[-0.01em] text-foreground">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose how each kind of notification is delivered. <strong>Instant</strong> shows
            it in your panel right away. <strong>Daily digest</strong> batches it for one
            email per day. <strong>Off</strong> silences it completely.
          </p>
        </div>

        {studio ? (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">One delivery per notification: the preference stores a single Instant / Daily digest / Off choice per row, not a per-channel matrix — that shape is where this page is headed, not what ships behind it yet.</p>
            {groupByRoom(prefs).map(([room, rows]) => (
              <section key={room} aria-label={room} className="space-y-2">
                <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{room}</h2>
                <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">{rows.map(renderRow)}</div>
              </section>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <GhostCard icon="phone_iphone" title="Push notifications" body="Not a delivery channel yet — nothing stores a push subscription. It lands here when it does." />
              <GhostCard icon="bedtime" title="Quiet hours" body="Hold instant alerts overnight. Not in the schema yet; drawn so you know where it will live." />
            </div>
          </div>
        ) : (
        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
          {prefs.map(renderRow)}
        </div>
        )}
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}
        >
          <span className="material-icons text-base">
            {message.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {message.text}
        </div>
      )}
    </div>
  );
}
