'use client';

// Extracted verbatim from components/admin/SurveyBuilder.tsx (PUX-179) — the builder is pinned at 554 code lines.

import type { SurveyField } from '../SurveyBuilder.types';
import { TYPE_MAP, hasRequired } from '../SurveyBuilder.constants';

export type { SurveyField };

interface Props {
  field: SurveyField;
  idx: number;
  total: number;
  pageNumber?: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function FieldRow({ field, idx, total, pageNumber, isOpen, onToggleOpen, onMoveUp, onMoveDown, onDelete }: Props) {
  // Page break rendered as a visual divider
  if (field.type === 'page_break') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 border-t-2 border-dashed border-primary/30" />
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
          <span className="material-icons text-sm text-primary">insert_page_break</span>
          <span className="text-xs font-medium text-primary">Page {pageNumber}</span>
        </div>
        <div className="flex-1 border-t-2 border-dashed border-primary/30" />
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onMoveUp} disabled={idx === 0}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up">
            <span className="material-icons text-sm">arrow_upward</span>
          </button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
            className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down">
            <span className="material-icons text-sm">arrow_downward</span>
          </button>
          <button type="button" onClick={onDelete}
            className="p-1 rounded text-muted-foreground hover:text-destructive" title="Delete">
            <span className="material-icons text-sm">delete_outline</span>
          </button>
        </div>
      </div>
    );
  }

  const meta = TYPE_MAP[field.type];

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="material-icons text-base text-primary flex-shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground truncate block">{field.label || meta.label}</span>
        <span className="text-xs text-muted-foreground capitalize">{meta.label}</span>
      </div>
      {field.required && hasRequired(field.type) && (
        <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded flex-shrink-0">Required</span>
      )}
      {field.showIf && (
        <span
          className="material-icons text-xs text-primary ml-1 cursor-help flex-shrink-0"
          title={(() => {
            const showIf = field.showIf;
            if ('combinator' in showIf) {
              return `Conditional: ${showIf.rules.length} rule(s) (AND)`;
            }
            return `Conditional: depends on field ${(showIf as { fieldId: string }).fieldId}`;
          })()}
        >
          visibility
        </span>
      )}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button type="button" onClick={onMoveUp} disabled={idx === 0}
          className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move up">
          <span className="material-icons text-sm">arrow_upward</span>
        </button>
        <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
          className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move down">
          <span className="material-icons text-sm">arrow_downward</span>
        </button>
        <button type="button" onClick={onToggleOpen}
          className="p-1 rounded text-muted-foreground hover:text-primary transition-colors" title="Edit">
          <span className="material-icons text-sm">{isOpen ? 'expand_less' : 'edit'}</span>
        </button>
        <button type="button" onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" title="Delete">
          <span className="material-icons text-sm">delete_outline</span>
        </button>
      </div>
    </div>
  );
}

export default FieldRow;
