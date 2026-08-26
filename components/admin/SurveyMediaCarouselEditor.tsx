'use client';

/**
 * PUX-028: the "Slides" list editor for a `media-carousel` survey field.
 * Extracted out of SurveyBuilder.tsx to keep that file under its pinned
 * file-size budget (see `.file-budget.baseline.json`) — this is a UI-only
 * split, no behavior change from what used to be inline there.
 *
 * Reuses the existing admin `MediaPicker` per slide (no second upload path,
 * per PUX-028's brief) — each slide's `kind` is derived once, at pick time,
 * from the picked row's mimeType (see `deriveMediaKind`) rather than
 * re-derived from the URL at render time.
 */

import MediaPicker from './MediaPicker';
import type { SurveyMediaCarouselItem } from './SurveyBuilder.types';
import { deriveMediaKind, genId } from './SurveyBuilder.constants';

interface Props {
  items: SurveyMediaCarouselItem[];
  onChange: (items: SurveyMediaCarouselItem[]) => void;
  inputCls: string;
}

export default function SurveyMediaCarouselEditor({ items, onChange, inputCls }: Props) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  const updateItem = (id: string, patch: Partial<SurveyMediaCarouselItem>) => {
    onChange(items.map(m => (m.id === id ? { ...m, ...patch } : m)));
  };

  return (
    <div className="sm:col-span-2 space-y-2">
      <label className="block text-xs font-medium text-foreground mb-1">
        Slides <span className="text-muted-foreground">({items.length})</span>
      </label>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.id} className="border border-border rounded-lg p-3 bg-background space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Slide {i + 1} · {item.kind === 'video' ? 'Video' : 'Image'}
              </span>
              <div className="flex items-center gap-0.5">
                <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                  <span className="material-icons text-sm">arrow_upward</span>
                </button>
                <button type="button" title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                  <span className="material-icons text-sm">arrow_downward</span>
                </button>
                <button type="button" title="Remove slide" onClick={() => onChange(items.filter(m => m.id !== item.id))}
                  className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <span className="material-icons text-sm">delete_outline</span>
                </button>
              </div>
            </div>
            <MediaPicker
              value={item.mediaUrl}
              mimeTypeFilter="all"
              label={`Slide ${i + 1} media`}
              onChange={(url, media) => updateItem(item.id, {
                mediaUrl: url,
                ...(media ? { kind: deriveMediaKind(media.mimeType) } : {}),
              })}
            />
            <input
              type="text"
              value={item.caption || ''}
              onChange={e => updateItem(item.id, { caption: e.target.value })}
              className={inputCls}
              placeholder="Caption (optional)"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, { id: genId(), mediaUrl: '', kind: 'image', caption: '' }])}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      >
        <span className="material-icons text-sm">add_photo_alternate</span>
        Add Slide
      </button>
    </div>
  );
}
