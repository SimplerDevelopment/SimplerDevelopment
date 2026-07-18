'use client';

/**
 * Inline "create a booking page" form for the onboarding quick-setup step —
 * the same essentials as /portal/tools/booking/new (title + duration → POST
 * /api/portal/tools/booking), embedded so the user configures the module
 * right in the wizard instead of being bounced to another tab. Optional and
 * skippable — one of the walk-tier modules with an inline action (OBQA-028
 * re-triage; see BrainNoteSetupForm for the other, OBQA-004); calendar-connect
 * is deliberately deferred.
 */

import { useState } from 'react';
import { obPrimaryBtn } from '../ob-styles';

interface Props {
  /** Called with the new booking page id after a successful create. */
  onCreated: (bookingPageId: number) => void;
}

export function BookingsSetupForm({ onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!title.trim()) {
      setError('Give your booking page a title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/portal/tools/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), duration }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to create the booking page — try again.');
        return;
      }
      onCreated(data.data.id);
    } catch {
      setError('Something went wrong — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[13px] border border-primary/30 bg-primary/[0.04] px-[15px] py-[13px] space-y-3">
      <div>
        <p className="text-[14px] font-semibold leading-snug">Create a booking page</p>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          Optional — you can skip this and set it up later.
        </p>
      </div>

      <div className="space-y-2.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim() && !saving) void handleCreate();
          }}
          placeholder="Booking page title — e.g. Discovery call"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="ob-setup-booking-title"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Duration"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="text-[12.5px] text-destructive flex items-center gap-1.5" role="alert">
          <span className="material-icons text-[15px]">error_outline</span>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={saving || !title.trim()}
        className={`w-full ${obPrimaryBtn}`}
        data-testid="ob-setup-booking-create"
      >
        {saving ? (
          <span className="material-icons text-[18px] animate-spin">refresh</span>
        ) : (
          <span className="material-icons text-[18px]">add_circle</span>
        )}
        {saving ? 'Creating…' : 'Create booking page'}
      </button>
    </div>
  );
}
