'use client';

import type { SurveyInputBlock } from '@/types/blocks';

interface Props {
  block: SurveyInputBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SurveyInputBlock>) => void;
}

export function SurveyInputBlockPreview({ block }: Props) {
  return <SurveyInputPreview fieldType={block.fieldType} placeholder={block.placeholder} options={block.options} min={block.min} max={block.max} step={block.step} />;
}

/** Shared read-only input preview used by both the visual editor block and the render registry */
export function SurveyInputPreview({
  fieldType,
  placeholder,
  options,
  min,
  max,
  step,
}: {
  fieldType: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}) {
  const inputCls = 'w-full px-4 py-3 border border-border rounded-lg text-sm bg-muted/30 text-muted-foreground pointer-events-none';

  switch (fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
    case 'number':
      return (
        <input
          type="text"
          readOnly
          tabIndex={-1}
          placeholder={placeholder || `Enter ${fieldType}...`}
          className={inputCls}
        />
      );

    case 'textarea':
      return (
        <textarea
          readOnly
          tabIndex={-1}
          rows={3}
          placeholder={placeholder || 'Enter your response...'}
          className={`${inputCls} resize-none`}
        />
      );

    case 'date':
      return (
        <div className={inputCls + ' flex items-center justify-between'}>
          <span className="opacity-50">{placeholder || 'Select a date...'}</span>
          <span className="material-icons text-base opacity-40">calendar_today</span>
        </div>
      );

    case 'select':
      return (
        <div className={inputCls + ' flex items-center justify-between'}>
          <span className="opacity-50">Select...</span>
          <span className="material-icons text-base opacity-40">arrow_drop_down</span>
        </div>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {(options && options.length > 0 ? options : ['Option 1', 'Option 2']).map((opt, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-muted/20">
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
              <span className="text-sm text-foreground">{opt}</span>
            </div>
          ))}
        </div>
      );

    case 'checkbox':
      return (
        <div className="space-y-2">
          {(options && options.length > 0 ? options : ['Option 1', 'Option 2']).map((opt, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-muted/20">
              <div className="w-4 h-4 rounded border-2 border-muted-foreground/40 shrink-0" />
              <span className="text-sm text-foreground">{opt}</span>
            </div>
          ))}
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center gap-3">
          <div className="w-12 h-7 rounded-full bg-muted-foreground/30 relative">
            <div className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow" />
          </div>
          <span className="text-sm text-muted-foreground">No</span>
        </div>
      );

    case 'rating':
      return (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(star => (
            <span key={star} className="text-3xl text-muted-foreground/25">&#9733;</span>
          ))}
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-2">
          <div className="w-full h-2 bg-muted-foreground/20 rounded-full relative">
            <div className="absolute left-0 top-0 h-full w-1/3 bg-primary/50 rounded-full" />
            <div className="absolute top-1/2 -translate-y-1/2 left-1/3 w-4 h-4 bg-primary rounded-full shadow -ml-2" />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{min ?? 0}</span>
            <span>{max ?? 100}</span>
          </div>
        </div>
      );

    case 'heading':
      return null;

    default:
      return (
        <div className={inputCls}>
          <span className="opacity-50">Input preview</span>
        </div>
      );
  }
}
