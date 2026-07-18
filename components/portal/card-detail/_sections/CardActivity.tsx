/**
 * Card activity history — collapsible list of audited actions.
 */
'use client';

import { formatActivity } from '../_lib/format';
import type { Activity } from '../_lib/types';

interface Props {
  activities: Activity[];
  showActivity: boolean;
  setShowActivity: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export function CardActivity({ activities, showActivity, setShowActivity }: Props) {
  return (
    <div>
      <button
        onClick={() => setShowActivity(v => !v)}
        className="flex items-center justify-between w-full mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
      >
        <span>Activity {activities.length > 0 && `(${activities.length})`}</span>
        <span
          className={`material-icons text-sm transition-transform ${showActivity ? 'rotate-90' : ''}`}
        >
          chevron_right
        </span>
      </button>
      {showActivity &&
        (activities.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {activities.map(a => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <span className="material-icons text-sm text-muted-foreground mt-0.5">history</span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground">{formatActivity(a)}</p>
                  <p className="text-muted-foreground">{new Date(a.createdAt).toLocaleString('en-US')}</p>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
