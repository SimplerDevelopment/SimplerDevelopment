'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface AgendaItem {
  kind: 'event' | 'task_due' | 'meeting' | 'relationship_review';
  key: string;
  id: number;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  subtitle?: string;
  href: string;
}

interface BrainCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
  source: 'manual' | 'google';
}

const KIND_STYLE: Record<AgendaItem['kind'], { dot: string; pill: string; icon: string; label: string }> = {
  event: {
    dot: 'bg-primary',
    pill: 'bg-primary/10 text-primary',
    icon: 'event',
    label: 'Event',
  },
  task_due: {
    dot: 'bg-amber-500',
    pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: 'checklist',
    label: 'Task due',
  },
  meeting: {
    dot: 'bg-blue-500',
    pill: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    icon: 'forum',
    label: 'Communication',
  },
  relationship_review: {
    dot: 'bg-cyan-500',
    pill: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    icon: 'flag',
    label: 'Relationship review',
  },
};

/** Local-date YYYY-MM-DD key for grouping. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function startOfCalendarGrid(monthStart: Date): Date {
  // Calendar grid begins on Sunday of the week containing day 1.
  const d = new Date(monthStart);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function safeParse(text: string): { success?: boolean; data?: unknown; message?: string } | null {
  try { return JSON.parse(text); } catch { return null; }
}

export default function BrainCalendarPage() {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<{ date: Date } | null>(null);
  const [eventDetail, setEventDetail] = useState<BrainCalendarEvent | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);
  const gridStart = useMemo(() => startOfCalendarGrid(monthStart), [monthStart]);
  const gridDays = useMemo(() => {
    // 6 rows × 7 days = 42 cells (covers any month layout).
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [gridStart]);

  const load = useCallback(async () => {
    const from = gridStart.toISOString();
    const to = addDays(gridStart, 42).toISOString();
    try {
      const res = await fetch(`/api/portal/brain/calendar/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const text = await res.text();
      const json = text ? safeParse(text) : null;
      if (!res.ok || !json?.success) {
        const msg = json?.message
          || (text && !json ? `Server error (HTTP ${res.status}).` : null)
          || (res.status === 401 ? 'Not signed in.' : `Failed to load agenda (HTTP ${res.status}).`);
        setError(msg);
        setItems([]);
        return;
      }
      setError(null);
      setItems(json.data as AgendaItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [gridStart]);

  useEffect(() => { load(); }, [load]);

  // Auto-open event detail when ?event=N appears in the URL (e.g. coming from
  // an agenda link or the dashboard widget).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const eventId = new URLSearchParams(window.location.search).get('event');
    if (eventId) loadEventDetail(parseInt(eventId, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadEventDetail(id: number) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/portal/brain/calendar/events/${id}`);
      const json = await res.json();
      if (json.success) setEventDetail(json.data);
    } finally {
      setLoadingDetail(false);
    }
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const it of items ?? []) {
      const k = dayKey(it.startAt);
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }, [items]);

  const today = new Date();

  const handleCellClick = (date: Date, hasItems: boolean) => {
    if (hasItems) return; // populated cells use item-level actions
    setShowCreate({ date });
  };

  const handleCreateSave = async (payload: NewEventPayload) => {
    const startAt = combineDateAndTime(payload.date, payload.startTime, payload.allDay);
    const endAt = payload.allDay
      ? combineDateAndTime(payload.date, '23:59', true)
      : combineDateAndTime(payload.date, payload.endTime, false);
    const res = await fetch('/api/portal/brain/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        description: payload.description || null,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay: payload.allDay,
        location: payload.location || null,
        link: payload.link || null,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setError(json.message || 'Failed to create event.');
      return;
    }
    setShowCreate(null);
    await load();
  };

  const handleEventDelete = async () => {
    if (!eventDetail) return;
    if (!confirm(`Delete "${eventDetail.title}"?`)) return;
    const res = await fetch(`/api/portal/brain/calendar/events/${eventDetail.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setEventDetail(null);
      await load();
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="material-icons text-primary">calendar_month</span>
            Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tasks, communications, relationship reviews, and scheduled events — all in one view. Click an empty day to schedule something.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/brain"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">arrow_back</span>
            Brain
          </Link>
          <button
            onClick={() => setShowCreate({ date: today })}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New event
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">chevron_left</span>
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="px-3 py-1 text-sm rounded-md border border-border hover:bg-accent"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">chevron_right</span>
          </button>
          <h2 className="ml-3 font-semibold">
            {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
          {(['event', 'task_due', 'meeting', 'relationship_review'] as const).map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${KIND_STYLE[k].dot}`} />
              {KIND_STYLE[k].label}
            </span>
          ))}
        </div>
      </div>

      {/* Month grid */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {gridDays.map((d) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = isSameDay(d, today);
            const k = dayKey(d.toISOString());
            const dayItems = itemsByDay.get(k) ?? [];
            return (
              <button
                key={k}
                onClick={() => handleCellClick(d, false)}
                className={`relative text-left min-h-[110px] p-1.5 border-b border-r border-border last:border-r-0 transition-colors group ${
                  inMonth ? 'bg-card hover:bg-accent/40' : 'bg-muted/20 text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${
                    isToday ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground' : ''
                  }`}>
                    {d.getDate()}
                  </span>
                  {dayItems.length === 0 && inMonth && (
                    <span className="material-icons text-xs text-muted-foreground opacity-0 group-hover:opacity-100">add</span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {dayItems.slice(0, 4).map((it) => (
                    <li key={it.key}>
                      <CalendarItemBadge
                        item={it}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (it.kind === 'event') {
                            loadEventDetail(it.id);
                          } else {
                            window.location.href = it.href;
                          }
                        }}
                      />
                    </li>
                  ))}
                  {dayItems.length > 4 && (
                    <li className="text-[10px] text-muted-foreground pl-1">+ {dayItems.length - 4} more</li>
                  )}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {/* Coming-soon hint about Phase B/C */}
      <div className="bg-muted/30 border border-border rounded-md p-3 text-xs text-muted-foreground">
        <span className="material-icons text-sm align-text-bottom mr-1">info</span>
        Week and day views, drag-to-reschedule, and Google Calendar sync are coming in follow-up phases.
      </div>

      {showCreate && (
        <NewEventModal
          initialDate={showCreate.date}
          onCancel={() => setShowCreate(null)}
          onSave={handleCreateSave}
        />
      )}

      {(eventDetail || loadingDetail) && (
        <EventDetailModal
          event={eventDetail}
          loading={loadingDetail}
          onClose={() => setEventDetail(null)}
          onDelete={handleEventDelete}
          onChanged={async () => {
            await load();
            if (eventDetail) loadEventDetail(eventDetail.id);
          }}
        />
      )}
    </div>
  );
}

function CalendarItemBadge({ item, onClick }: { item: AgendaItem; onClick: (e: React.MouseEvent) => void }) {
  const style = KIND_STYLE[item.kind];
  const time = item.allDay ? null : new Date(item.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <a
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded ${style.pill} truncate hover:brightness-95`}
      title={`${style.label}: ${item.title}${item.subtitle ? ` · ${item.subtitle}` : ''}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
      {time && <span className="font-mono shrink-0">{time}</span>}
      <span className="truncate">{item.title}</span>
    </a>
  );
}

interface NewEventPayload {
  title: string;
  description: string;
  date: Date;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  link: string;
}

function combineDateAndTime(date: Date, time: string, allDay: boolean): Date {
  if (allDay) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const [h, m] = time.split(':').map((s) => parseInt(s, 10));
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function NewEventModal({
  initialDate,
  onCancel,
  onSave,
}: {
  initialDate: Date;
  onCancel: () => void;
  onSave: (v: NewEventPayload) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description, date, allDay, startTime, endTime, location, link });
    } finally {
      setSaving(false);
    }
  };

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-card border border-border rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="material-icons text-primary">event</span>
            New event
          </h3>
          <button type="button" onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map((s) => parseInt(s, 10));
                if (y && m && d) setDate(new Date(y, m - 1, d));
              }}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="sm:col-span-2 flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-1.5">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
              All-day
            </label>
            {!allDay && (
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Link</label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
          >
            {saving
              ? <><span className="material-icons text-base animate-spin">progress_activity</span>Creating…</>
              : <><span className="material-icons text-base">check</span>Create event</>
            }
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EventDetailModal({
  event,
  loading,
  onClose,
  onDelete,
  onChanged,
}: {
  event: BrainCalendarEvent | null;
  loading: boolean;
  onClose: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="material-icons text-primary">event</span>
            Event
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        {loading || !event ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <span className="material-icons animate-spin mr-2">progress_activity</span>
            Loading…
          </div>
        ) : (
          <>
            <h4 className="text-lg font-semibold">{event.title}</h4>
            <p className="text-sm text-muted-foreground">
              {event.allDay
                ? `${new Date(event.startAt).toLocaleDateString()} — All day`
                : `${new Date(event.startAt).toLocaleString()} – ${new Date(event.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
            </p>
            {event.description && (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{event.description}</p>
            )}
            {event.location && (
              <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                <span className="material-icons text-sm">place</span>{event.location}
              </p>
            )}
            {event.link && (
              <p className="text-sm">
                <a href={event.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  <span className="material-icons text-sm">open_in_new</span>{event.link}
                </a>
              </p>
            )}
            {event.source === 'google' && (
              <p className="text-xs text-muted-foreground italic">Synced from Google Calendar.</p>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                onClick={onDelete}
                className="text-destructive text-sm inline-flex items-center gap-1 hover:underline"
              >
                <span className="material-icons text-base">delete</span>
                Delete
              </button>
              <button
                onClick={onChanged}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Refresh
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
