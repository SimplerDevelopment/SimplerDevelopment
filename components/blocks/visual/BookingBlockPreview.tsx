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
    <div className="py-8 px-6">
      {(block.title || isSelected) && (
        <input
          type="text"
          value={block.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="font-heading text-3xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-foreground"
          placeholder="Schedule a Meeting"
        />
      )}
      {(block.description || isSelected) && (
        <input
          type="text"
          value={block.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-lg mb-6 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-muted-foreground"
          placeholder="Pick a time that works for you"
        />
      )}

      <div className="border rounded-lg bg-card overflow-hidden">
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
                <span className="material-icons text-muted-foreground cursor-pointer">chevron_left</span>
                <span className="material-icons text-muted-foreground cursor-pointer">chevron_right</span>
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
                      : 'hover:bg-muted/50'
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
                  className="text-center text-sm py-2 border rounded-md hover:bg-primary/10 hover:border-primary cursor-pointer transition-colors"
                >
                  {time}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isSelected && !block.slug && (
        <p className="text-center text-xs text-amber-500 mt-4">
          <span className="material-icons text-xs align-middle mr-1">warning</span>
          Set the booking page slug in the settings panel to connect a booking page.
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground mt-4 italic">
        Preview: Live booking form loads from /book/{block.slug || 'your-slug'}
      </p>
    </div>
  );
}
