'use client';

import CrmCustomFieldFilters from '@/components/portal/CrmCustomFieldFilters';
import { statusFilters } from '../_lib/ui';
import type { Pipeline } from '../_lib/types';

interface DealFiltersProps {
  pipelines: Pipeline[];
  selectedPipelineId: number | null;
  onSelectPipeline: (id: number) => void;
  statusFilter: string;
  onChangeStatus: (s: string) => void;
  customFilters: Record<number, string>;
  onChangeCustomFilters: (v: Record<number, string>) => void;
  showForm: boolean;
  onToggleForm: () => void;
}

/**
 * Filter bar for the deals page: pipeline picker, Open/Won/Lost segmented
 * buttons, custom-field filters, and the right-aligned Add/Cancel toggle.
 */
export default function DealFilters({
  pipelines,
  selectedPipelineId,
  onSelectPipeline,
  statusFilter,
  onChangeStatus,
  customFilters,
  onChangeCustomFilters,
  showForm,
  onToggleForm,
}: DealFiltersProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedPipelineId ?? ''}
          onChange={(e) => onSelectPipeline(Number(e.target.value))}
          className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {statusFilters.map((s) => (
            <button
              key={s.value}
              onClick={() => onChangeStatus(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-foreground hover:bg-accent/80'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <CrmCustomFieldFilters
          entityType="deal"
          values={customFilters}
          onChange={onChangeCustomFilters}
        />
      </div>
      <button
        onClick={onToggleForm}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
      >
        <span className="material-icons text-base">{showForm ? 'close' : 'add_circle'}</span>
        {showForm ? 'Cancel' : 'Add Deal'}
      </button>
    </div>
  );
}
