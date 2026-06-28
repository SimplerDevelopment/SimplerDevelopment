'use client';

// Publishing Command Center — month/week calendar view.
//
// Renders cards from /api/portal/publishing/calendar on their scheduled_for
// date. Each entry shows the channel (artifactType) as a Material Icon + the
// per-channel color, the artifact's display title, the current stage column,
// and (optionally) the campaign chip color along the left edge.
//
// Click a card → /portal/publishing/board?card=<id>, which the board's
// deep-link useEffect picks up to open the card detail drawer.
//
// This component intentionally stays smaller than ContentCalendar.tsx — the
// publishing calendar is read-only-ish (drag-to-reschedule across channels is
// out of scope for PUB-5; that flows through the per-channel artifact's own
// schedule endpoint and is tracked separately).

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishingCalendarEntry {
  id: number;
  title: string;
  date: string; // ISO
  artifactType: string | null;
  artifactTitle: string | null;
  columnName: string;
  campaign: { id: number; name: string; color: string } | null;
}

type ViewMode = 'month' | 'week';

export interface PublishingCalendarProps {
  projectId: number;
  clientId: number;
}

// ---------------------------------------------------------------------------
// Helpers (small subset of ContentCalendar's date math, intentionally local
// to keep this file self-contained)
// ---------------------------------------------------------------------------

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function startOfWeek(d: Date) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59);
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isToday(d: Date) {
  return isSameDay(d, new Date());
}
function formatMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatWeekRange(d: Date) {
  const s = startOfWeek(d);
  const e = endOfWeek(d);
  const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(s)} - ${fmt(e)}, ${e.getFullYear()}`;
}
function getDaysInMonthView(d: Date): Date[] {
  const first = startOfMonth(d);
  const last = endOfMonth(d);
  const startDay = first.getDay();
  const calStart = new Date(first);
  calStart.setDate(calStart.getDate() - startDay);
  const totalCells = Math.ceil((startDay + last.getDate()) / 7) * 7;
  return Array.from({ length: totalCells }, (_, i) => {
    const day = new Date(calStart);
    day.setDate(calStart.getDate() + i);
    return day;
  });
}
function getDaysInWeekView(d: Date): Date[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(s);
    day.setDate(s.getDate() + i);
    return day;
  });
}

// ---------------------------------------------------------------------------
// Per-channel visual mapping. The keys here match the artifact_type strings
// used by kanban_card_artifacts (see lib/db/schema/pm.ts comment).
// ---------------------------------------------------------------------------

interface ChannelStyle {
  icon: string;
  bg: string;
  text: string;
  dot: string;
  label: string;
}

const CHANNEL_STYLES: Record<string, ChannelStyle> = {
  post: {
    icon: 'article',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-300',
    dot: 'bg-green-500',
    label: 'Blog',
  },
  blog: {
    icon: 'article',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-300',
    dot: 'bg-green-500',
    label: 'Blog',
  },
  email_campaign: {
    icon: 'mail',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-800 dark:text-purple-300',
    dot: 'bg-purple-500',
    label: 'Email',
  },
  linkedin: {
    icon: 'share',
    // LinkedIn brand blue (#0a66c2) — encoded as an inline class via Tailwind
    // arbitrary value so it survives JIT without needing safelist config.
    bg: 'bg-[#0a66c2]/15 dark:bg-[#0a66c2]/25',
    text: 'text-[#0a66c2] dark:text-[#4d8ad9]',
    dot: 'bg-[#0a66c2]',
    label: 'LinkedIn',
  },
  pitch_deck: {
    icon: 'slideshow',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500',
    label: 'Deck',
  },
  deck: {
    icon: 'slideshow',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500',
    label: 'Deck',
  },
  survey: {
    icon: 'quiz',
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-800 dark:text-teal-300',
    dot: 'bg-teal-500',
    label: 'Survey',
  },
  booking: {
    icon: 'event_available',
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-800 dark:text-cyan-300',
    dot: 'bg-cyan-500',
    label: 'Booking',
  },
  proposal: {
    icon: 'description',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
    label: 'Proposal',
  },
};

const DEFAULT_CHANNEL_STYLE: ChannelStyle = {
  icon: 'event_note',
  bg: 'bg-gray-100 dark:bg-gray-800',
  text: 'text-gray-700 dark:text-gray-300',
  dot: 'bg-gray-500',
  label: 'Card',
};

function styleForArtifact(artifactType: string | null): ChannelStyle {
  if (!artifactType) return DEFAULT_CHANNEL_STYLE;
  return CHANNEL_STYLES[artifactType] ?? DEFAULT_CHANNEL_STYLE;
}

// ---------------------------------------------------------------------------
// Calendar entry card
// ---------------------------------------------------------------------------

function EntryCard({ entry, compact }: { entry: PublishingCalendarEntry; compact?: boolean }) {
  const style = styleForArtifact(entry.artifactType);
  const href = `/portal/publishing/board?card=${entry.id}`;
  const title = entry.artifactTitle ?? entry.title;
  const tooltip = `${style.label} · ${entry.columnName} · ${title}`;

  // Campaign chip — rendered as a 3px vertical bar on the left edge of the
  // entry card using the campaign's stored hex color. Falls back to nothing.
  const campaignBorderStyle = entry.campaign
    ? { borderLeftColor: entry.campaign.color, borderLeftWidth: '3px' }
    : undefined;

  if (compact) {
    return (
      <Link
        href={href}
        title={tooltip}
        style={campaignBorderStyle}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium truncate hover:ring-1 hover:ring-current ${style.bg} ${style.text}`}
      >
        <span className="material-symbols-outlined text-[14px] leading-none shrink-0">
          {style.icon}
        </span>
        <span className="truncate">{title}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      title={tooltip}
      style={campaignBorderStyle}
      className={`group flex items-start gap-2 p-2 rounded-md border border-transparent hover:border-current ${style.bg} transition-colors`}
    >
      <span className={`material-symbols-outlined text-base mt-0.5 ${style.text}`}>
        {style.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${style.text}`}>{title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {style.label} &middot; {entry.columnName}
          {entry.campaign ? ` · ${entry.campaign.name}` : ''}
        </p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PublishingCalendar(_props: PublishingCalendarProps) {
  // projectId + clientId are accepted on props for future per-tenant feature
  // affordances (e.g. campaign filter dropdown). The calendar API resolves the
  // session itself, so we don't currently send them on the request — keeping
  // them on props avoids breaking the caller's contract when we wire those
  // affordances in.
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [entries, setEntries] = useState<PublishingCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const start =
      view === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth(), -6)
        : startOfWeek(currentDate);
    const end =
      view === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 7)
        : endOfWeek(currentDate);

    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });

    try {
      const res = await fetch(`/api/portal/publishing/calendar?${params}`);
      const json = (await res.json()) as
        | { success: true; data: PublishingCalendarEntry[] }
        | { success: false; message?: string };
      if (json.success) {
        setEntries(json.data);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [currentDate, view]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const start =
        view === 'month'
          ? new Date(currentDate.getFullYear(), currentDate.getMonth(), -6)
          : startOfWeek(currentDate);
      const end =
        view === 'month'
          ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 7)
          : endOfWeek(currentDate);

      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });

      try {
        const res = await fetch(`/api/portal/publishing/calendar?${params}`);
        const json = (await res.json()) as
          | { success: true; data: PublishingCalendarEntry[] }
          | { success: false; message?: string };
        if (json.success) {
          setEntries(json.data);
        } else {
          setEntries([]);
        }
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentDate, view]);

  const navigate = (dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  // Filter entries client-side. Cheap because the API range is at most ~6
  // weeks of cards for a single client project.
  const filteredEntries = entries.filter((e) => {
    if (filterChannel !== 'all' && (e.artifactType ?? 'none') !== filterChannel) return false;
    if (filterStage !== 'all' && e.columnName !== filterStage) return false;
    return true;
  });

  const entriesForDay = (day: Date) =>
    filteredEntries.filter((e) => isSameDay(new Date(e.date), day));

  const days = view === 'month' ? getDaysInMonthView(currentDate) : getDaysInWeekView(currentDate);
  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Distinct channels + stages, derived from the loaded entries, for the
  // filter dropdowns. Always include 'all' as the first option.
  const channelOptions = Array.from(
    new Set(entries.map((e) => e.artifactType ?? 'none')),
  );
  const stageOptions = Array.from(new Set(entries.map((e) => e.columnName)));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Previous"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <h2 className="text-lg font-semibold text-foreground min-w-[200px] text-center">
            {view === 'month' ? formatMonthYear(currentDate) : formatWeekRange(currentDate)}
          </h2>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Next"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent text-foreground"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground"
            aria-label="Channel filter"
          >
            <option value="all">All Channels</option>
            {channelOptions.map((c) => (
              <option key={c} value={c}>
                {styleForArtifact(c === 'none' ? null : c).label}
              </option>
            ))}
          </select>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground"
            aria-label="Stage filter"
          >
            <option value="all">All Stages</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(['month', 'week'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize ${
                  view === v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground hover:bg-accent'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekDayNames.map((name) => (
            <div
              key={name}
              className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {name}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
            Loading calendar...
          </div>
        ) : (
          <div className={`grid grid-cols-7 ${view === 'week' ? 'min-h-[400px]' : ''}`}>
            {days.map((day, i) => {
              const dayEntries = entriesForDay(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const today = isToday(day);
              return (
                <div
                  key={i}
                  className={`border-b border-r border-border ${
                    view === 'month' ? 'min-h-[110px]' : 'min-h-[400px]'
                  } ${isCurrentMonth ? '' : 'bg-muted/30'} ${today ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-center justify-between px-2 pt-1.5">
                    <span
                      className={`text-xs font-medium ${
                        today
                          ? 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center'
                          : isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {dayEntries.length > 0 && view === 'month' && (
                      <span className="text-[10px] text-muted-foreground">{dayEntries.length}</span>
                    )}
                  </div>

                  <div className={`px-1 pb-1 space-y-0.5 ${view === 'month' ? 'mt-0.5' : 'mt-2'}`}>
                    {view === 'month' ? (
                      <>
                        {dayEntries.slice(0, 3).map((entry) => (
                          <EntryCard key={entry.id} entry={entry} compact />
                        ))}
                        {dayEntries.length > 3 && (
                          <p className="text-[10px] text-muted-foreground pl-1">
                            +{dayEntries.length - 3} more
                          </p>
                        )}
                      </>
                    ) : (
                      dayEntries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(CHANNEL_STYLES)
          // Dedupe by label since post/blog and pitch_deck/deck collapse.
          .filter(
            ([key, val], idx, arr) =>
              arr.findIndex(([, v]) => v.label === val.label) === idx && key !== 'proposal',
          )
          .map(([key, style]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
              <span>{style.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
