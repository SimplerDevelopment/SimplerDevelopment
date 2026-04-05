'use client';

import { BookingBlock } from '@/types/blocks';

interface BookingBlockPreviewProps {
  block: BookingBlock;
  isSelected: boolean;
  onChange: (updates: Partial<BookingBlock>) => void;
}

const PLACEHOLDER_TIMES = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '2:00 PM', '2:30 PM', '3:00 PM'];

export function BookingBlockPreview({ block, isSelected, onChange }: BookingBlockPreviewProps) {
  return (
    <div className="py-8 px-6 relative">
      {/* Full overlay — prevents interaction with calendar/time elements,
          lets clicks and drags pass through to SelectableBlock parent */}
      <div
        className="absolute inset-0 z-10 flex items-center justify-center"
        style={{ cursor: 'inherit' }}
      >
        {!isSelected && (
          <div className="bg-background/60 backdrop-blur-[1px] rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground border border-border shadow-sm">
            <span className="material-icons text-base">calendar_month</span>
            <span>Booking: {block.slug || 'not configured'}</span>
            <span className="material-icons text-xs">touch_app</span>
          </div>
        )}
      </div>

      {(block.title || isSelected) && (
        <div className="font-heading text-3xl font-bold mb-2 text-foreground">
          {block.title || 'Schedule a Meeting'}
        </div>
      )}
      {(block.description || isSelected) && (
        <div className="text-lg mb-6 text-muted-foreground">
          {block.description || 'Pick a time that works for you'}
        </div>
      )}

      <div className="border rounded-lg bg-card overflow-hidden opacity-60">
        <div className="flex flex-col md:flex-row">
          {/* Left: booking info */}
          <div className="p-6 border-b md:border-b-0 md:border-r md:w-1/3">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons text-primary">calendar_month</span>
              <span className="font-semibold text-lg">
                {block.slug || 'booking-page'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <span className="material-icons text-base">schedule</span>
              30 min
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="material-icons text-base">videocam</span>
              Video call
            </div>
          </div>

          {/* Right: calendar + times */}
          <div className="p-6 flex-1">
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium">April 2026</span>
              <div className="flex gap-1">
                <span className="material-icons text-muted-foreground">chevron_left</span>
                <span className="material-icons text-muted-foreground">chevron_right</span>
              </div>
            </div>
            {/* Mini calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-4">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-muted-foreground font-medium py-1">{d}</div>
              ))}
              {Array.from({ length: 30 }, (_, i) => (
                <div
                  key={i}
                  className={`py-1 rounded ${
                    i === 14
                      ? 'bg-primary text-primary-foreground font-bold'
                      : ''
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Time slots */}
            <div className="grid grid-cols-4 gap-2">
              {PLACEHOLDER_TIMES.map((time) => (
                <div
                  key={time}
                  className="text-center text-sm py-2 border rounded-md"
                >
                  {time}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!block.slug && (
        <p className="text-center text-xs text-amber-500 mt-4 relative z-0">
          <span className="material-icons text-xs align-middle mr-1">warning</span>
          Set the booking page slug in the settings panel to connect a booking page.
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground mt-4 italic relative z-0">
        Preview only — live booking form renders on the published site
      </p>
    </div>
  );
}
