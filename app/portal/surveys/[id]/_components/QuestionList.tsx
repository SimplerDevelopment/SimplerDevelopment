'use client';

/**
 * QuestionList — survey question list/editor.
 *
 * Wraps the existing components/admin/SurveyBuilder which already implements
 * the per-question list, expand-to-edit, drag/move, and add-field flows that
 * the page used to render directly. We keep this thin file as the page's
 * canonical seam — when the SurveyBuilder is eventually decomposed into
 * QuestionList + QuestionEditor + QuestionTypePicker primitives that live
 * here, this is the file that will absorb the move with no caller changes.
 */

import SurveyBuilder, { type SurveyField } from '@/components/admin/SurveyBuilder';

interface Props {
  fields: SurveyField[];
  onChange: (fields: SurveyField[]) => void;
}

export default function QuestionList({ fields, onChange }: Props) {
  return <SurveyBuilder fields={fields} onChange={onChange} />;
}
