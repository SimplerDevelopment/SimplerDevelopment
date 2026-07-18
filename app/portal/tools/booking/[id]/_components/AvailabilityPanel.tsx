/**
 * Availability tab — weekly recurring availability slots, one per day.
 *
 * The data shape is `AvailabilitySlot[]` keyed by `day` (0-6, Sun-Sat).
 * The tab orders Mon-Fri then Sat then Sun for ergonomics — see DAY_ORDER.
 */
'use client';

import { DAY_NAMES } from '../_lib/constants';
import type { AvailabilitySlot } from '../_lib/types';

interface AvailabilityPanelProps {
  availability: AvailabilitySlot[];
  setAvailability: React.Dispatch<React.SetStateAction<AvailabilitySlot[]>>;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function AvailabilityPanel({ availability, setAvailability }: AvailabilityPanelProps) {
  function updateSlot(day: number, field: keyof AvailabilitySlot, value: unknown) {
    setAvailability((prev) =>
      prev.map((s) => (s.day === day ? { ...s, [field]: value } : s)),
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-icons text-primary">schedule</span>
        <h2 className="text-sm font-medium text-foreground">Weekly Availability</h2>
      </div>
      <div className="space-y-3">
        {DAY_ORDER.map((day) => {
          const slot = availability.find((s) => s.day === day);
          if (!slot) return null;
          return (
            <div
              key={day}
              className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                slot.enabled
                  ? 'border-border bg-background'
                  : 'border-transparent bg-muted/50'
              }`}
            >
              <button
                type="button"
                onClick={() => updateSlot(day, 'enabled', !slot.enabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  slot.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    slot.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span
                className={`text-sm font-medium w-24 ${
                  slot.enabled ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {DAY_NAMES[day]}
              </span>
              {slot.enabled ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateSlot(day, 'startTime', e.target.value)}
                    className="px-2 py-1 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(day, 'endTime', e.target.value)}
                    className="px-2 py-1 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unavailable</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
