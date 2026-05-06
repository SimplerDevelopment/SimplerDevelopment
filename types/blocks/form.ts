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
  // Style overrides — take precedence over the survey's own styling and the site branding.
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
