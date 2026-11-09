'use client';
// Extracted verbatim from ../page.tsx for PUX-187 — the Status History
// timeline.

import { pCard, pSectionTitle } from '@/components/portal/portal-ui';
import { statusColors, type StatusEvent } from './types';

interface StatusTimelineProps {
  statusHistory: StatusEvent[];
}

export default function StatusTimeline({ statusHistory }: StatusTimelineProps) {
  return (
    <div className={`${pCard} p-6 space-y-4`}>
      <h2 className={`${pSectionTitle} flex items-center gap-2`}>
        <span className="material-icons text-lg text-muted-foreground">history</span>
        Status History
      </h2>
      {statusHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No status changes recorded.</p>
      ) : (
        <div className="relative pl-6 space-y-4">
          <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-border" />
          {statusHistory.map((event) => (
            <div key={event.id} className="relative">
              <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      statusColors[event.status] || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {event.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                {event.note && <p className="text-sm text-muted-foreground mt-1">{event.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
