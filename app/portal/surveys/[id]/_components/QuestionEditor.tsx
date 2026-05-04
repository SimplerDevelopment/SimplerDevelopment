'use client';

/**
 * QuestionEditor — single-question edit form.
 *
 * Today the per-question edit form lives inside components/admin/SurveyBuilder
 * (alongside the question list and type picker). This page-local module is a
 * controlled seam: callers and tests can target this name, and any future
 * decomposition that pulls the inner editor out of SurveyBuilder will land
 * here without breaking the page or its integration tests.
 *
 * Export shape mirrors what a standalone editor would expose: a single field
 * plus an onChange that emits a patched field. The current implementation is
 * a controlled adapter around SurveyBuilder that ignores the list semantics
 * and surfaces only the single-field editor row.
 */

import SurveyBuilder, { type SurveyField } from '@/components/admin/SurveyBuilder';

interface Props {
  field: SurveyField;
  onChange: (field: SurveyField) => void;
}

export default function QuestionEditor({ field, onChange }: Props) {
  // Single-field adapter: hand SurveyBuilder a one-element list and forward
  // the resulting (patched) field back to the caller. This preserves all the
  // type-aware editing UI (label, placeholder, options, slider min/max,
  // conditional logic, etc.) that SurveyBuilder already provides.
  return (
    <SurveyBuilder
      fields={[field]}
      onChange={(next) => {
        if (next[0]) onChange(next[0]);
      }}
    />
  );
}
