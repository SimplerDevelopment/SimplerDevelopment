import type { BaseBlock } from './base';

export interface ButtonBlock extends BaseBlock {
  type: 'button';
  text: string;
  url: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  alignment?: 'left' | 'center' | 'right';
  openInNewTab?: boolean;
  icon?: string; // Material Icon name
  iconPosition?: 'left' | 'right'; // default: 'left'
  hoverEffect?: 'none' | 'lift' | 'glow' | 'fill' | 'slide' | 'pulse';
  /** Reference to a branded button preset (BrandButtonPreset.id). Preset
   *  styles apply first; block.style overrides on top. */
  presetId?: string;
}

export interface BookingMenuBlock extends BaseBlock {
  type: 'booking-menu';
  title?: string;
  description?: string;
  columns?: 2 | 3 | 4;
}

export interface BookingBlock extends BaseBlock {
  type: 'booking';
  slug: string;
  title?: string;
  description?: string;
  showPageTitle?: boolean;
  showDescription?: boolean;
  showSteps?: boolean;
  /** Show the booking page's logo above the form. Defaults to true. */
  showLogo?: boolean;
  height?: string;
  // Style overrides — take precedence over the booking page's branding
  styleOverrides?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    formBg?: string; // card/form body background color
    inputBg?: string; // input field background color
    headingFont?: string;
    bodyFont?: string;
    buttonBg?: string;
    buttonText?: string;
    buttonBorderRadius?: string;
    borderRadius?: string;
  };
}

export interface SurveyBlock extends BaseBlock {
  type: 'survey';
  slug: string;
  title?: string;
  description?: string;
  showPageTitle?: boolean;
  showDescription?: boolean;
  /** Show the survey's logo above the form. Defaults to true. */
  showLogo?: boolean;
  height?: string;
  // Style overrides — take precedence over the survey's own styling and the
  // site branding. Anything left undefined falls back to the survey.styling
  // values, then to the branding profile, then to baked-in defaults.
  styleOverrides?: {
    // ── Colors ─────────────────────────────────────────────────────
    primaryColor?: string;
    /** Drives the card border tint when no explicit formBorderColor is set. */
    secondaryColor?: string;
    /** Drives the input border tint when no explicit inputBorderColor is set. */
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    /** Color for question labels + numbers. Falls back to textColor. */
    labelColor?: string;
    // ── Card / form chrome ────────────────────────────────────────
    formBg?: string;
    /** Explicit border color for the form card (overrides secondaryColor tint). */
    formBorderColor?: string;
    /** CSS border-width, e.g. "0" to remove the border or "1px"/"2px". */
    formBorderWidth?: string;
    /** Radius for the form card. Falls back to borderRadius. */
    formBorderRadius?: string;
    /** Inner padding for each card section, e.g. "1.5rem". */
    formPadding?: string;
    /** CSS box-shadow value; pass "none" to drop the default shadow. */
    formShadow?: string;
    /** Drop background + border + shadow on every card section. */
    hideCardChrome?: boolean;
    // ── Inputs ────────────────────────────────────────────────────
    inputBg?: string;
    inputTextColor?: string;
    /** Explicit border color for inputs (overrides accentColor tint). */
    inputBorderColor?: string;
    inputBorderWidth?: string;
    inputBorderRadius?: string;
    /** Focus-ring color for inputs. Falls back to primaryColor. */
    inputFocusRingColor?: string;
    // ── Typography ────────────────────────────────────────────────
    headingFont?: string;
    bodyFont?: string;
    // ── Buttons / global ──────────────────────────────────────────
    buttonBg?: string;
    buttonText?: string;
    buttonBorderRadius?: string;
    /** Global radius fallback — used by buttons + form card when not set per-element. */
    borderRadius?: string;
  };
}

export type SurveyResultsChartType = 'bar' | 'pie' | 'donut' | 'list' | 'number';

export interface SurveyResultsBlock extends BaseBlock {
  type: 'survey-results';
  surveySlug: string;
  title?: string;
  description?: string;
  /** Which question fields to show (empty = all answerable fields) */
  fieldIds?: string[];
  /** Default chart type for questions with options */
  chartType?: SurveyResultsChartType;
  /** Show total response count */
  showResponseCount?: boolean;
  /** Show individual text responses */
  showTextResponses?: boolean;
  /** Max text responses to display per question */
  textResponseLimit?: number;
  /** Color theme for charts */
  accentColor?: string;
  /** Layout: stack all questions or tabbed */
  layout?: 'stacked' | 'tabbed';
}

// ─── Pitch Deck Navigation Blocks ─────────────────────────────────────────────

export interface DeckNextSlideBlock extends BaseBlock {
  type: 'deck-next-slide';
  text: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  alignment?: 'left' | 'center' | 'right';
  icon?: string;
  iconPosition?: 'left' | 'right';
}

export interface DeckJumpToBlock extends BaseBlock {
  type: 'deck-jump-to';
  text: string;
  targetSlide: number; // 1-indexed slide number to jump to
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  alignment?: 'left' | 'center' | 'right';
  icon?: string;
  iconPosition?: 'left' | 'right';
}

// ─── Survey Input Preview Block (for pitch deck slide editor) ────────────────

export interface SurveyInputBlock extends BaseBlock {
  type: 'survey-input';
  fieldType: string; // text, textarea, email, phone, url, number, date, select, radio, checkbox, toggle, rating, slider, heading
  fieldLabel: string;
  placeholder?: string;
  options?: string[]; // For select, radio, checkbox
  min?: number; // For slider
  max?: number; // For slider
  step?: number; // For slider
}
