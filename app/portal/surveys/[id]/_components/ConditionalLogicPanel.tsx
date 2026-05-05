'use client';

/**
 * ConditionalLogicPanel — page-local seam for conditional-logic UI.
 *
 * Per the portal-feature-gap audit (.planning/audits/portal-feature-gap.md),
 * the conditional-logic UI on the survey detail page is a stub. Today it
 * surfaces nothing more than a "Conditional: depends on field {id}" hint
 * inside the field-row title attribute (rendered by SurveyBuilder). We
 * preserve that behavior unchanged.
 *
 * TODO(conditional-logic-stub): expand into a real conditional editor
 * (and/or relocate components/admin/ConditionalLogicPanel here as the page
 * adopts more of its own logic UI). Until then, this component intentionally
 * does not render anything — SurveyBuilder owns the existing badge.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder';

export interface ConditionalLogicPanelProps {
  // Accepts a survey field for forward-compat; intentionally unused today.
  field: SurveyField;
}

export default function ConditionalLogicPanel(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: ConditionalLogicPanelProps,
) {
  // Intentionally renders nothing — SurveyBuilder shows the static
  // "Conditional: depends on field {id}" badge inline in the question header.
  return null;
}
