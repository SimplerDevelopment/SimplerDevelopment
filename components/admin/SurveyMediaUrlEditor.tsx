'use client';

/**
 * The single "Media URL" field editor for the `image`/`video` survey field
 * types. Extracted out of SurveyBuilder.tsx (PUX-028) to make room for the
 * sibling `media-carousel` field type's editor under SurveyBuilder.tsx's
 * pinned file-size budget — UI-only split, no behavior change.
 */

interface Props {
  value: string | undefined;
  onChange: (value: string) => void;
  inputCls: string;
}

export default function SurveyMediaUrlEditor({ value, onChange, inputCls }: Props) {
  return (
    <div className="sm:col-span-2">
      <label className="block text-xs font-medium text-foreground mb-1">Media URL</label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
        placeholder="https://…/image.png or …/video.mp4"
      />
    </div>
  );
}
