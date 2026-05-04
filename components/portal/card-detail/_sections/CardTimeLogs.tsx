/**
 * Time tracking — total, log-time form, and log list.
 * Only rendered for staff users (the dispatcher gates this).
 */
'use client';

import { formatDate, formatMinutes } from '../_lib/format';
import type { TimeLog } from '../_lib/types';

interface Props {
  timeLogs: TimeLog[];
  totalMinutes: number;
  showTimeForm: boolean;
  setShowTimeForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  timeHours: string;
  setTimeHours: (v: string) => void;
  timeMinutesInput: string;
  setTimeMinutesInput: (v: string) => void;
  timeNote: string;
  setTimeNote: (v: string) => void;
  loggingTime: boolean;
  logTime: () => void;
  removeTimeLog: (id: number) => void;
}

export function CardTimeLogs({
  timeLogs,
  totalMinutes,
  showTimeForm,
  setShowTimeForm,
  timeHours,
  setTimeHours,
  timeMinutesInput,
  setTimeMinutesInput,
  timeNote,
  setTimeNote,
  loggingTime,
  logTime,
  removeTimeLog,
}: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Time Tracked{' '}
          {totalMinutes > 0 && (
            <span className="ml-2 normal-case font-semibold text-foreground">
              {formatMinutes(totalMinutes)}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowTimeForm(v => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          <span className="material-icons text-sm">add</span>Log time
        </button>
      </div>
      {showTimeForm && (
        <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1">Hours</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={timeHours}
                onChange={e => setTimeHours(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1">Minutes</label>
              <input
                type="number"
                min="0"
                max="59"
                value={timeMinutesInput}
                onChange={e => setTimeMinutesInput(e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <input
            type="text"
            value={timeNote}
            onChange={e => setTimeNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2">
            <button
              onClick={logTime}
              disabled={loggingTime || (!timeHours && !timeMinutesInput)}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loggingTime && <span className="material-icons text-xs animate-spin">refresh</span>}
              Log
            </button>
            <button
              onClick={() => setShowTimeForm(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {timeLogs.length > 0 ? (
        <div className="space-y-2">
          {timeLogs.map(t => (
            <div key={t.id} className="flex items-start gap-2 text-sm">
              <span className="material-icons text-sm text-muted-foreground mt-0.5">schedule</span>
              <div className="flex-1">
                <span className="font-medium text-foreground">{formatMinutes(t.minutes)}</span>
                {t.note && <span className="text-muted-foreground ml-1.5">— {t.note}</span>}
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t.userName ?? 'Unknown'} · {formatDate(t.loggedAt)}
                </div>
              </div>
              <button
                onClick={() => removeTimeLog(t.id)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <span className="material-icons text-sm">delete</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No time logged yet.</p>
      )}
    </div>
  );
}
