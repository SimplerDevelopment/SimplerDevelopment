/**
 * Shared types for SurveyFormInline and its extracted helpers/field renderer.
 * Split out of SurveyFormInline.tsx — no behavior, just declarations.
 */

import type { SurveyRecommendationConfig } from '@/lib/db/schema';

/**
 * Display-only field types: no answer collected, never required, and
 * excluded from progress/question-numbering, validation, export, and
 * aggregation logic.
 */
export const DISPLAY_ONLY_TYPES = new Set(['heading', 'image', 'video']);

/**
 * Field types whose visible `<label>` wraps a single, directly-associable
 * form control (input/select/textarea) — these get `htmlFor`/`id` wiring so
 * assistive tech and Lighthouse's `label`/`select-name` audits can resolve
 * the control's accessible name (a11y fix, 2026-08-18). Group-style controls
 * (radio/checkbox/toggle/rating/nps/slider/file) render their own per-option
 * `<label>` wrapping each input and don't need this — the outer field label
 * there acts more like a fieldset legend than a control label.
 */
export const LABELABLE_FIELD_TYPES = new Set([
  'text', 'email', 'phone', 'url', 'textarea', 'number', 'date', 'select',
]);

export interface FileFieldState {
  /** Upload in flight — Submit / Next stays disabled until cleared. */
  uploading: boolean;
  /** Filename displayed in the "uploaded" badge once the URL is stored. */
  filename?: string;
  /** Last error message — clears on next selection. */
  error?: string;
}

// Field options live on disk in two shapes:
//   • Legacy: plain strings — `['shared', 'per-captain']`. Older surveys
//     still carry this.
//   • Current: `{id, label, value}` objects — what the editor writes today.
// The renderer must handle both; `normalizeOption` collapses them to a
// `{value, label}` pair, otherwise React throws "Objects are not valid as a
// React child" and the entire form blows up to the global error boundary.
export type SurveyFieldOption = string | { id?: string; label?: string; value?: string };

export interface SurveyField {
  id: string;
  type: string;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  options: SurveyFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  showIf?: { fieldId: string; values: string[] };
  goToPage?: Record<string, number>;
  order: number;
  page?: number;
  mediaUrl?: string;
  /** Pre-filled value applied when the form first loads and no answer is
   *  recorded yet for this field (e.g. a partial-resume value takes
   *  precedence). Currently only honored for `select`. */
  default?: string;
}

export interface BrandingInfo {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string;
  borderRadius?: string;
  buttonStyle?: {
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    borderRadius?: string;
  };
}

export interface SurveyStyling {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  buttonBorderRadius?: string;
  formBg?: string;
  inputBg?: string;
  inputTextColor?: string;
  inputOptionTextColor?: string;
  hideTitle?: boolean;
  hideLogo?: boolean;
}

export interface SurveyData {
  id: number;
  title: string;
  description: string | null;
  fields: SurveyField[];
  color: string;
  requireEmail: boolean;
  /** PDF-01: when true, the thank-you screen offers a branded PDF certificate. */
  certificateEnabled?: boolean;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl: string | null;
  branding?: BrandingInfo | null;
  styling?: SurveyStyling | null;
  cssVars?: Record<string, string>;
  recommendation?: SurveyRecommendationConfig | null;
  /**
   * A/B variant id picked for this visitor. When non-null, `fields` already
   * reflects the variant's field set (the route swapped it in server-side).
   * The id is echoed back on submit so responses can be attributed to the
   * variant they were collected under.
   */
  variantId?: number | null;
  variantName?: string | null;
}

export interface FileFieldRenderOptions {
  fileFieldState?: FileFieldState;
  onFileSelect: (file: File) => void;
}

export interface SurveyFormInlineProps {
  slug: string;
  showPageTitle?: boolean;
  showDescription?: boolean;
  /** Show the survey's logo above the form. Defaults to true. */
  showLogo?: boolean;
  /** Block-level overrides — take precedence over survey.styling and branding.
   *  See `types/blocks/form.ts` SurveyBlock.styleOverrides for the source of truth.
   */
  styleOverrides?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    labelColor?: string;
    /** Omit the hard-coded "1." / "2." question-number prefix on each label. Default false. */
    hideQuestionNumbers?: boolean;
    formBg?: string;
    /** Renders a small decorative bar (156×12) top-left inside the form card, above the first field. Unset = no bar. */
    formAccentBarColor?: string;
    formBorderColor?: string;
    formBorderWidth?: string;
    formBorderRadius?: string;
    formPadding?: string;
    formShadow?: string;
    hideCardChrome?: boolean;
    inputBg?: string;
    inputTextColor?: string;
    inputBorderColor?: string;
    inputBorderWidth?: string;
    inputBorderRadius?: string;
    inputFocusRingColor?: string;
    headingFont?: string;
    bodyFont?: string;
    buttonBg?: string;
    buttonText?: string;
    buttonBorderRadius?: string;
    /** Text on the final-page submit button. Defaults to "Submit". */
    submitLabel?: string;
    borderRadius?: string;
  };
  /** Optional source tracking */
  source?: string;
  sourceId?: string;
}
