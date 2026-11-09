'use client';

// Extracted verbatim from app/portal/crm/contacts/[id]/page.tsx (PUX-170) — the page is pinned at 636 code lines.

import { useState } from 'react';
import { pBtnPrimary, pCard, pInput, pSectionTitle } from '@/components/portal/portal-ui';

export interface Activity {
  id: number;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
}

const activityTypes = [
  { value: 'call', label: 'Call', icon: 'phone' },
  { value: 'email', label: 'Email', icon: 'mail' },
  { value: 'meeting', label: 'Meeting', icon: 'groups' },
  { value: 'note', label: 'Note', icon: 'sticky_note_2' },
  { value: 'task', label: 'Task', icon: 'task_alt' },
];

export const activityIcons: Record<string, string> = {
  call: 'phone',
  email: 'mail',
  meeting: 'groups',
  note: 'sticky_note_2',
  task: 'task_alt',
  deal_created: 'add_circle',
  deal_won: 'emoji_events',
  deal_lost: 'cancel',
  contact_created: 'person_add',
  stage_change: 'swap_horiz',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ContactActivityPanel({ contactId, activities, onLogged }: {
  contactId: string;
  activities: Activity[];
  onLogged: () => void;
}) {
  const [activityForm, setActivityForm] = useState({ type: 'call', title: '', description: '' });
  const [activitySaving, setActivitySaving] = useState(false);

  async function logActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityForm.title.trim()) return;
    setActivitySaving(true);
    const res = await fetch('/api/portal/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...activityForm, contactId: Number(contactId) }),
    });
    const d = await res.json();
    setActivitySaving(false);
    if (d.success) {
      setActivityForm({ type: 'call', title: '', description: '' });
      onLogged();
    }
  }

  return (
    <div className="space-y-6">
      {/* Log Activity Form */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={pSectionTitle}>Log Activity</h2>
        <form onSubmit={logActivity} className="space-y-3">
          <div className="flex gap-2">
            {activityTypes.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setActivityForm(f => ({ ...f, type: t.value }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activityForm.type === t.value
                    ? 'bg-foreground text-background'
                    : 'bg-accent text-foreground hover:bg-accent/80'
                }`}
              >
                <span className="material-icons text-sm">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <input
            required
            value={activityForm.title}
            onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Activity title..."
            className={pInput}
          />
          <textarea
            value={activityForm.description}
            onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)..."
            rows={2}
            className={`${pInput} resize-none`}
          />
          <button
            type="submit"
            disabled={activitySaving || !activityForm.title.trim()}
            className={pBtnPrimary}
          >
            {activitySaving && <span className="material-icons animate-spin text-sm">refresh</span>}
            Log Activity
          </button>
        </form>
      </div>

      {/* Activity Timeline */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={pSectionTitle}>Activity Timeline</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No activities logged yet.</p>
        ) : (
          <div className="space-y-1">
            {activities.map((a, i) => (
              <div key={a.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                    <span className="material-icons text-sm text-foreground">
                      {activityIcons[a.type] ?? 'circle'}
                    </span>
                  </div>
                  {i < activities.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-1" />
                  )}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  {a.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{relativeTime(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
