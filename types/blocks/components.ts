import type { BaseBlock } from './base';
import type { Block } from './index';

// Component Blocks (from homepage)
export interface HeroBlock extends BaseBlock {
  type: 'hero';
  title: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  /** Optional child blocks rendered at the bottom of the hero (e.g. trust bars, logo strips) */
  blocks?: Block[];
}

export interface HeroSlideshowSlide {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
  ctaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto' | '50%' | '100%' | '150%' | '200%';
  backgroundPosition?: string; // e.g. 'center', 'top', 'bottom', '50% 30%'
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' | 'space' | 'round';
  backgroundVideo?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textAlignment?: 'left' | 'center' | 'right';
}

export interface HeroSlideshowBlock extends BaseBlock {
  type: 'hero-slideshow';
  slides: HeroSlideshowSlide[];
  autoplay?: boolean;
  interval?: number; // ms between slides, default 6000
  transition?: 'fade' | 'slide' | 'zoom';
  transitionDuration?: number; // ms, default 800
  showDots?: boolean;
  showArrows?: boolean;
  pauseOnHover?: boolean;
  height?: string; // CSS height, default '90vh'
  kenBurns?: boolean; // subtle zoom animation on background images
  // Persistent background video that plays behind all slides
  backgroundVideo?: string; // URL to video file — plays continuously across all slides
  backgroundVideoOpacity?: number; // 0-1, default 1
  // Navigation colors
  arrowColor?: string;
  arrowBackground?: string;
  arrowBorderColor?: string;
  dotColor?: string;
  dotActiveColor?: string;
  progressBarColor?: string;
  // Bottom stats bar (renders inside the hero at the bottom)
  stats?: Array<{ id: string; value: string; label: string }>;
}

export interface ServiceBullet {
  id: string;
  /** Material Icon name for a small check/arrow/feature icon */
  icon?: string;
  text: string;
}

export interface ServicesGridBlock extends BaseBlock {
  type: 'services-grid';
  overline?: string;
  title?: string;
  description?: string;
  services: Array<{
    id: string;
    title: string;
    description: string;
    icon?: string;
    link?: string;
    /** Anchor text for the CTA link. Defaults to "Learn More". */
    linkText?: string;
    image?: string;
    /** Optional list of bullet benefits displayed beneath the description */
    bullets?: ServiceBullet[];
  }>;
  columns?: 2 | 3 | 4;
  /** Accent color for icons, bullets, and link arrow */
  accentColor?: string;
}

export interface CtaBlock extends BaseBlock {
  type: 'cta';
  title: string;
  description?: string;
  primaryButtonText: string;
  primaryButtonUrl: string;
  secondaryButtonText?: string;
  secondaryButtonUrl?: string;
  backgroundStyle?: 'gradient' | 'solid' | 'none';
}

export interface TestimonialBlock extends BaseBlock {
  type: 'testimonial';
  quote: string;
  author: string;
  role?: string;
  company?: string;
  avatar?: string;
}

export interface StatsBlock extends BaseBlock {
  type: 'stats';
  title?: string;
  stats: Array<{
    id: string;
    value: string;
    label: string;
  }>;
  columns?: 2 | 3 | 4;
}

/**
 * Interactive ROI calculator. Two user sliders (units + minutes-saved-per-visit)
 * drive four live outputs (added revenue, added admissions, hours added to
 * capacity, revenue per unit) from tunable, transparent assumptions. Universal:
 * every label/assumption is configurable, so it works for any service business,
 * not just one client.
 */
export interface RoiCalculatorBlock extends BaseBlock {
  type: 'roi-calculator';
  title?: string;
  description?: string;
  accentColor?: string; // hex or brand sentinel (e.g. 'brand.accent'); defaults to brand accent
  // Primary unit slider (e.g. clinicians, reps, technicians)
  unitLabel?: string; // default 'FTE clinicians completing SOC'
  unitDefault?: number; // default 100
  unitMin?: number; // default 10
  unitMax?: number; // default 1000
  unitStep?: number; // default 10
  // Secondary slider — minutes saved per visit
  minutesLabel?: string; // default 'Minutes saved per visit'
  minutesDefault?: number; // default 45
  minutesMin?: number; // default 15
  minutesMax?: number; // default 90
  minutesStep?: number; // default 5
  // Tunable assumptions
  visitsPerUnitPerWeek?: number; // default 25
  weeksPerYear?: number; // default 46
  captureRate?: number; // default 0.06 — fraction of saved hours reinvested as new-admission capacity
  hoursPerAdmission?: number; // default 5
  revenuePerAdmission?: number; // default 2500
  // Optional CTA under the results
  ctaText?: string;
  ctaLink?: string;
  ctaNewTab?: boolean;
}

export interface FeaturedContentBlock extends BaseBlock {
  type: 'featured-content';
  title: string;
  description?: string;
  imageUrl?: string;
  imagePosition?: 'left' | 'right';
  buttonText?: string;
  buttonUrl?: string;
  stats?: Array<{
    id: string;
    value: string;
    label: string;
  }>;
}

export interface CardGridBlock extends BaseBlock {
  type: 'card-grid';
  title?: string;
  description?: string;
  cards: Array<{
    id: string;
    title: string;
    description: string;
    image?: string;
    link?: string;
    icon?: string;
  }>;
  columns?: 2 | 3 | 4;
  iconSize?: string;
}

// ============================================================================
// Generic Premium Block Types
// ============================================================================

export interface TimelineStep {
  id: string;
  title: string;
  description: string;
  number?: string; // e.g. "01", "02" — auto-generated if omitted
  icon?: string; // Material Icon name (alternative to number)
}

export interface TimelineBlock extends BaseBlock {
  type: 'timeline';
  title?: string;
  subtitle?: string;
  overline?: string;
  steps: TimelineStep[];
  /** Color of the connecting line and node borders */
  lineColor?: string;
  /** Color of the large step numbers */
  numberColor?: string;
  /** Color of the node dot fill */
  nodeColor?: string;
  /** Layout: 'alternating' zigzags left/right, 'left' keeps all steps on one side */
  layout?: 'alternating' | 'left';
}

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  credentials?: string;
  photo: string;
  bio: string;
  specialties?: string[];
}

export interface TeamShowcaseBlock extends BaseBlock {
  type: 'team-showcase';
  title?: string;
  subtitle?: string;
  overline?: string;
  members: TeamMember[];
  /** Background color for the bio panel */
  bioPanelColor?: string;
  /** Color of the decorative accent line above names */
  accentColor?: string;
  /** Photo filter: sepia(0.08) etc. */
  photoFilter?: string;
}

export interface TeamFlipMember {
  id: string;
  name: string;
  title: string;
  bio: string;
  photo: string;
  /** Question shown on the back of the card */
  question: string;
  /** Answer shown on the back of the card */
  answer: string;
  /**
   * Optional vertical offset in pixels. Applied as `transform: translateY(<n>px)`
   * on the card. Useful for staggered/offset grid layouts where one card needs
   * to drop down to balance an asymmetric row (e.g. Post Captain's team grid
   * has one member's card offset to compensate for a shorter title). Default 0
   * — backward-compatible no-op when unset.
   */
  verticalOffset?: number;
}

export interface TeamFlipGridBlock extends BaseBlock {
  type: 'team-flip-grid';
  title?: string;
  subtitle?: string;
  overline?: string;
  members: TeamFlipMember[];
  /** Number of columns (default 4) */
  columns?: 2 | 3 | 4;
  /** Background color on the back (flipped) side. Default #0A3A5C */
  backBgColor?: string;
  /** Text color on the back. Default #fff */
  backTextColor?: string;
  /** Name text color. Default #0A3A5C */
  nameColor?: string;
  /** Title text color. Default #1B6FA8 */
  titleColor?: string;
}

export interface BentoCard {
  id: string;
  title: string;
  lead?: string; // Italic lead/question text
  items: string[];
  link?: string;
  linkText?: string;
  /** 'dark' = dark bg + light text, 'light' = light bg + dark text + border */
  variant?: 'dark' | 'light';
  /** Relative width weight (7 = wider, 5 = narrower). Two cards in a row should sum to 12. */
  span?: number;
}

export interface BentoGridBlock extends BaseBlock {
  type: 'bento-grid';
  title?: string;
  subtitle?: string;
  overline?: string;
  /** Cards arranged in rows of 2. Adjacent cards' spans determine width ratio. */
  cards: BentoCard[];
  /** Background color for dark-variant cards */
  darkBg?: string;
  /** Border color for light-variant cards */
  lightBorder?: string;
  /** Accent color for the left bar on cards */
  accentColor?: string;
  /** Number of columns per row */
  columns?: number;
}

export interface LogoStripLogo {
  id: string;
  imageUrl: string;
  alt: string;
  link?: string;
}

export interface LogoStripBlock extends BaseBlock {
  type: 'logo-strip';
  /** Overline/eyebrow text shown above the logos, e.g. "TRUSTED BY 100+ COLLEGES" */
  overline?: string;
  logos: LogoStripLogo[];
  columns?: 3 | 4 | 5 | 6 | 7 | 8;
  /** Show logos in grayscale (default) that return to full color on hover */
  grayscale?: boolean;
  /** Max height for each logo, any CSS unit. Defaults to '40px'. */
  logoHeight?: string;
  /** Gap between logos */
  gap?: 'sm' | 'md' | 'lg';
  /** Alignment on rows that don't fill all columns */
  alignment?: 'left' | 'center' | 'right';
}

export interface FlipCard {
  id: string;
  /** Front face — what's visible before flip */
  frontTitle: string;
  frontSubtitle?: string;
  /** Material Icon name (e.g. "trending_up") — takes priority over image */
  frontIcon?: string;
  /** Optional image shown on the front instead of/above the icon */
  frontImage?: string;
  /** Back face — revealed on hover/click */
  backText: string;
  backLink?: string;
  backLinkText?: string;
}

export interface FlipCardGridBlock extends BaseBlock {
  type: 'flip-card-grid';
  overline?: string;
  title?: string;
  description?: string;
  cards: FlipCard[];
  columns?: 2 | 3 | 4;
  /** 'hover' (default) flips on mouseover; 'click' requires tap */
  flipTrigger?: 'hover' | 'click';
  /** Flip along Y-axis (horizontal, default) or X-axis (vertical) */
  flipAxis?: 'horizontal' | 'vertical';
  /** Height of each card in px or CSS unit, default '280px' */
  cardHeight?: string;
  /** Accent color used for the front icon tint and back link */
  accentColor?: string;
}

export interface MetricCard {
  id: string;
  /** Big display value e.g. "83%", "$965K+", "2 Days" */
  value: string;
  /** Small descriptive label beneath the value (uppercase-styled) */
  label: string;
  /** Optional institution/source line (appears small below label) */
  institution?: string;
  /** Optional institution logo/image */
  institutionLogo?: string;
  /** Optional CTA link */
  link?: string;
  /** CTA text — defaults to "Case Study" */
  linkText?: string;
}

export interface MetricCardsBlock extends BaseBlock {
  type: 'metric-cards';
  overline?: string;
  title?: string;
  description?: string;
  metrics: MetricCard[];
  columns?: 2 | 3 | 4;
  /** Accent color for the metric value + link arrow */
  accentColor?: string;
  /**
   * CSS-unit width reserved for the institution-logo region inside each
   * card. When set, the heading + label column is constrained so the
   * logo sits to the side without overlapping. Useful when paired with
   * customCss that absolute-positions the logo top-right (as in the
   * Post Captain stats section).
   *
   * Applied as `--mc-logo-col-width` on the section root + as
   * `padding-right` on the heading column. Defaults to unset (no
   * reservation; legacy below-the-fold logo placement).
   */
  logoColumnWidth?: string;
  /**
   * CSS-unit max-width for the secondary `label` text inside each card.
   * Useful to keep long labels like "IN READMIT COMPLETIONS" on one
   * line when the logo is pinned to the side. Falls back to no cap.
   *
   * Applied as `--mc-label-max-width` on the section root + as
   * `max-width` on each label element.
   */
  labelMaxWidth?: string;
}

export interface FooterLinkGroup {
  label: string;
  links: Array<{ label: string; href: string }>;
}

export interface SiteFooterBlock extends BaseBlock {
  type: 'site-footer';
  logoUrl?: string;
  logoAlt?: string;
  /**
   * Wordmark text displayed inline next to the logo image (e.g. for a
   * brand lockup like LOGO + "POST CAPTAIN / CONSULTING"). Multi-line is
   * supported via `\n` — newlines render as a `<br>`. When omitted, the
   * logo renders alone, preserving the legacy single-image behavior.
   */
  wordmark?: string;
  /**
   * Scale of the logo + wordmark lockup in the brand column.
   *
   * - `'sm'` — compact (logo h-8, wordmark 9px) for dense footers.
   * - `'md'` — default (logo h-10, wordmark 10px). Matches legacy behavior.
   * - `'lg'` — enlarged (logo h-12, wordmark 12px) for prominent brand-first
   *   footers like Post Captain's "POST CAPTAIN / CONSULTING" lockup.
   *
   * Defaults to `'md'`. `elementStyles.logo` / `elementStyles.wordmark` still
   * win when set, so this is a non-breaking convenience prop.
   */
  brandSize?: 'sm' | 'md' | 'lg';
  tagline?: string;
  /** Optional CTA shown beneath the tagline in the brand column. */
  ctaText?: string;
  /** Required when `ctaText` is set. */
  ctaUrl?: string;
  linkGroups: FooterLinkGroup[];
  contactInfo?: {
    address?: string;
    phone?: string;
    email?: string;
  };
  socialLinks?: Array<{ platform: string; url: string; label?: string }>;
  copyright?: string;
  disclaimer?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}

// ============================================================================
// Email Marketing — Block Types
// ============================================================================

export interface SocialLinksBlock extends BaseBlock {
  type: 'social-links';
  links: Array<{
    platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok';
    url: string;
  }>;
  iconSize?: number; // 24, 32, 40
  alignment?: 'left' | 'center' | 'right';
}

export interface EmailHeaderBlock extends BaseBlock {
  type: 'email-header';
  logoUrl?: string;
  logoWidth?: number;
  /** Accessible alt text for the logo. Defaults to "Logo" if absent. */
  logoAlt?: string;
  /** Fallback wordmark rendered when `logoUrl` is absent. */
  logoText?: string;
  tagline?: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface EmailFooterBlock extends BaseBlock {
  type: 'email-footer';
  companyName?: string;
  /** Short positioning line under the company name, italicized. */
  tagline?: string;
  address?: string;
  showUnsubscribe?: boolean; // default true
  showViewInBrowser?: boolean;
  socialLinks?: Array<{ platform: string; url: string }>;
}

// ============================================================================
// Popup / Exit-intent — funnel-builder closer
// ============================================================================
//
// `trigger` controls when the modal first appears; `frequency` controls how
// often we should re-show it across page visits (persisted in localStorage
// keyed by `block.id`). `ctaUrl` is just a link — the popup does not yet
// capture form submissions; pair with a /go/<slug> trigger link if you
// want click tracking + downstream automations.

export interface PopupBlock extends BaseBlock {
  type: 'popup';
  /** When the modal first becomes visible. */
  trigger: 'page-load' | 'time-delay' | 'scroll-percent' | 'exit-intent';
  /** Seconds to wait before showing when trigger is 'time-delay'. */
  delaySeconds?: number;
  /** Page-scroll percentage (0-100) when trigger is 'scroll-percent'. */
  scrollPercent?: number;
  /** How often the popup is allowed to reappear across visits. */
  frequency: 'always' | 'once-per-session' | 'once-per-week';
  /** Headline text — rendered as <h2>. */
  headline: string;
  /** Body — rich text (HTML). */
  body?: string;
  /** Primary CTA label. Hidden when ctaLabel is empty. */
  ctaLabel?: string;
  /** Primary CTA URL. Supports trigger-link slugs (`/go/...`). */
  ctaUrl?: string;
  /** Whether the user can close the modal. Default true. */
  dismissable?: boolean;
}
