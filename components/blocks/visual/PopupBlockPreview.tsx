'use client';

// PopupBlockPreview — editor-time preview of the PopupBlock.
//
// We can't actually trigger the modal in the editor (the iframe doesn't run
// scroll/exit-intent handlers in a meaningful way), so the preview shows the
// modal contents inline as a static card. Authors edit the headline/body
// in-place; trigger / frequency settings live in the right-hand panel.

import type { PopupBlock } from '@/types/blocks';
import { RichTextEditable } from './RichTextEditable';

interface Props {
  block: PopupBlock;
  isSelected: boolean;
  onChange: (updates: Partial<PopupBlock>) => void;
}

const TRIGGER_LABELS: Record<PopupBlock['trigger'], string> = {
  'page-load': 'on page load',
  'time-delay': 'after delay',
  'scroll-percent': 'on scroll',
  'exit-intent': 'on exit intent',
};

export function PopupBlockPreview({ block, isSelected, onChange }: Props) {
  const trigger = block.trigger ?? 'time-delay';
  const frequency = block.frequency ?? 'once-per-session';

  return (
    <div className="my-6 px-4">
      <div className="border-2 border-dashed border-primary/40 rounded-lg p-3 bg-primary/5">
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          <span className="material-icons text-base text-primary">notifications_active</span>
          <span>Popup — fires <strong>{TRIGGER_LABELS[trigger]}</strong></span>
          <span className="text-muted-foreground/60">·</span>
          <span>shows {frequency.replace(/-/g, ' ')}</span>
        </div>
        <div className="bg-background border border-border rounded-md shadow-sm p-5 max-w-md mx-auto">
          <RichTextEditable
            html={block.headline || ''}
            onChange={(html) => onChange({ headline: html })}
            singleLine
            placeholder="Modal headline"
            className="text-xl font-semibold text-foreground mb-3"
          />
          {(block.body || isSelected) && (
            <RichTextEditable
              html={block.body || ''}
              onChange={(html) => onChange({ body: html })}
              placeholder="Body — supports rich text"
              className="text-sm text-muted-foreground mb-4 min-h-[40px]"
            />
          )}
          {block.ctaLabel && (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
              {block.ctaLabel}
              <span className="material-icons text-base">arrow_forward</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
