import { ResponsiveSettings } from './responsive';

export interface BlockStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  borderWidth?: string;
  borderColor?: string;
  borderStyle?: string;
  borderRadius?: string;
  // Per-side border overrides
  borderTopWidth?: string;
  borderTopColor?: string;
  borderTopStyle?: string;
  borderRightWidth?: string;
  borderRightColor?: string;
  borderRightStyle?: string;
  borderBottomWidth?: string;
  borderBottomColor?: string;
  borderBottomStyle?: string;
  borderLeftWidth?: string;
  borderLeftColor?: string;
  borderLeftStyle?: string;
  // Per-corner border radius
  borderTopLeftRadius?: string;
  borderTopRightRadius?: string;
  borderBottomLeftRadius?: string;
  borderBottomRightRadius?: string;
  padding?: string;
  margin?: string;
  boxShadow?: string;
  opacity?: string;
  // Flex layout
  display?: 'block' | 'flex' | 'inline-flex' | 'grid' | 'inline-block' | 'none';
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap?: string;
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  // Dimensions
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
  // Overflow
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
  // Positioning
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: string;
  // Text
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  // Background
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundAttachment?: string;
  backgroundBlendMode?: string;
  backgroundGradient?: string;
  // Transitions
  transition?: string;
  // Grid layout
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridGap?: string;
  // Cursor
  cursor?: string;
  // Custom CSS (raw key:value pairs for anything not covered above)
  customCSS?: string;
}

export interface BaseBlock {
  id: string;
  type: string;
  order: number;
  label?: string;
  /** Anchor id for jump links (e.g. #about-us). Rendered as the block's DOM id. */
  anchor?: string;
  responsive?: ResponsiveSettings;
  style?: BlockStyle;
  /** Per-element styles for blocks with multiple visual elements */
  elementStyles?: Record<string, Partial<BlockStyle>>;
  /** When true, block cannot be deleted in the editor */
  required?: boolean;
}

// Basic Blocks
export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
  alignment?: 'left' | 'center' | 'right';
  size?: 'sm' | 'base' | 'lg' | 'xl';
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  content: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  alignment?: 'left' | 'center' | 'right';
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  width?: 'full' | 'large' | 'medium' | 'small';
  alignment?: 'left' | 'center' | 'right';
}

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

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: 'sm' | 'md' | 'lg' | 'xl';
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface ColumnsBlock extends BaseBlock {
  type: 'columns';
  columns: Column[];
  gap?: 'sm' | 'md' | 'lg';
  stackOnMobile?: boolean; // Default: true
  stackOnTablet?: boolean; // Default: false
  reverseOnStack?: boolean; // Default: false — reverse column order when stacked
}

export interface Column {
  id: string;
  width: number | string; // Number (50) or string ("50%")
  blocks: Block[];
  // Per-column settings
  backgroundColor?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  verticalAlign?: 'top' | 'center' | 'bottom';
  cssClass?: string;
}

export interface CodeBlock extends BaseBlock {
  type: 'code';
  code: string;
  language?: string;
}

export interface QuoteBlock extends BaseBlock {
  type: 'quote';
  content: string;
  author?: string;
  citation?: string;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  url: string;
  caption?: string;
  autoplay?: boolean;
  controls?: boolean;
}

export interface YoutubeBlock extends BaseBlock {
  type: 'youtube';
  url: string;
  caption?: string;
}

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

export interface MarqueeItem {
  id: string;
  type: 'text' | 'image' | 'icon';
  content?: string; // text content or icon name
  imageUrl?: string;
  imageAlt?: string;
  link?: string;
}

export interface MarqueeBlock extends BaseBlock {
  type: 'marquee';
  items: MarqueeItem[];
  direction?: 'left' | 'right' | 'up' | 'down';
  speed?: number; // pixels per second, default 50
  pauseOnHover?: boolean;
  pauseOnClick?: boolean;
  gradient?: boolean;
  gradientColor?: string;
  gradientWidth?: number;
  autoFill?: boolean;
  gap?: string; // space between items, e.g. '40px'
  height?: string; // for vertical mode, e.g. '300px'
  loop?: number; // 0 = infinite
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

export interface BlogPostsBlock extends BaseBlock {
  type: 'blog-posts';
  title?: string;
  description?: string;
  postType?: string;
  categorySlug?: string;
  limit?: number;
  showExcerpt?: boolean;
  columns?: 2 | 3;
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

export interface AccordionBlock extends BaseBlock {
  type: 'accordion';
  title?: string;
  items: Array<{
    id: string;
    title: string;
    content: string;
  }>;
}

export interface TabsBlock extends BaseBlock {
  type: 'tabs';
  tabs: Array<{
    id: string;
    label: string;
    blocks: Block[];
  }>;
}

/**
 * Sticky Scroll Tabs — full-viewport panels that cross-fade as the user scrolls,
 * with a sticky tab strip that highlights the active panel. Inspired by the
 * "wp-block-postcaptain-scroll-tabs" pattern. Universal — usable for any
 * multi-section "show one panel at a time, scroll-driven" UX.
 */
export interface StickyScrollTabsBlock extends BaseBlock {
  type: 'sticky-scroll-tabs';
  /** Optional eyebrow above the heading. */
  overline?: string;
  /** Optional section heading rendered above the tabs. */
  title?: string;
  /** Optional supporting paragraph rendered alongside / under the heading. */
  description?: string;
  /** Each panel gets a tab pill + a content block list. */
  panels: Array<{
    id: string;
    label: string;
    icon?: string; // Material Icon name
    blocks: Block[];
  }>;
  /** Px offset from top where the sticky tab strip pins. Default 80. */
  stickyTopOffset?: number;
  /** Visual height of each panel (CSS unit). Default '60vh'. */
  panelMinHeight?: string;
  /** Pill border radius. Default '999px'. */
  tabBorderRadius?: string;
  /** Pill colors. */
  activeTabBackground?: string;
  activeTabColor?: string;
  inactiveTabBackground?: string;
  inactiveTabColor?: string;
  /**
   * Optional mobile-specific pill colors. When set, the mobile carousel tab
   * strip uses these instead of the desktop colors. Useful when desktop and
   * mobile designs diverge (e.g. desktop uses white pills, mobile uses
   * mint-green). Each falls back to its desktop counterpart when undefined.
   */
  mobileActiveTabBackground?: string;
  mobileActiveTabColor?: string;
  mobileInactiveTabBackground?: string;
  mobileInactiveTabColor?: string;
  /**
   * Behavior of the tab strip on mobile (≤1024px).
   * - 'hide':     panels stack vertically, no tab UI rendered (legacy default).
   * - 'carousel': panels stack vertically AND a sticky horizontal-scroll tab strip
   *               renders at the top; tapping a tab scrolls to its panel. Default.
   */
  mobileTabsBehavior?: 'hide' | 'carousel';
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

export interface GalleryBlock extends BaseBlock {
  type: 'gallery';
  images: Array<{
    id: string;
    url: string;
    alt: string;
    caption?: string;
  }>;
  layout?: 'grid' | 'masonry';
  columns?: 2 | 3 | 4;
  lightbox?: boolean;
  gap?: 'sm' | 'md' | 'lg';
}

// ============================================================================
// Palizzi Social Club — Custom Block Types
// ============================================================================

export interface PalizziNavBlock extends BaseBlock {
  type: 'palizzi-nav';
  logoUrl: string;
  brandName: string;
  links: Array<{ label: string; href: string }>;
}

export interface PalizziHeroBlock extends BaseBlock {
  type: 'palizzi-hero';
  address: string;
  crestUrl: string;
  neonUrl: string;
  tagline: string;
  established: string;
  scrollTarget: string;
}

export interface PalizziWelcomeBlock extends BaseBlock {
  type: 'palizzi-welcome';
  overline: string;
  title: string;
  titleAccent: string;
  paragraphs: string[];
  bookImage: string;
  bookTitle: string;
  bookSubtitle: string;
  bookAuthors: string;
  bookLabel: string;
}

export interface PalizziHistoryBlock extends BaseBlock {
  type: 'palizzi-history';
  overline: string;
  title: string;
  titleAccent: string;
  backgroundImage: string;
  marqueeImage: string;
  paragraphs: string[];
}

export interface PalizziMenuBlock extends BaseBlock {
  type: 'palizzi-menu';
  overline: string;
  title: string;
  subtitle: string;
  foodSections: Array<{
    title: string;
    items: Array<{ name: string; desc: string }>;
  }>;
  cocktails: Array<{ name: string; desc: string }>;
}

export interface PalizziRulesBlock extends BaseBlock {
  type: 'palizzi-rules';
  overline: string;
  title: string;
  titleAccent: string;
  hoursTitle: string;
  hoursSubtitle: string;
  badges: string[];
  rules: string[];
  disclaimer: string;
}

export interface PalizziMembershipBlock extends BaseBlock {
  type: 'palizzi-membership';
  overline: string;
  title: string;
  titleAccent: string;
  paragraphs: string[];
  highlight: string;
  closingNote: string;
  signature: string;
  footnote: string;
}

export interface PalizziFooterBlock extends BaseBlock {
  type: 'palizzi-footer';
  marqueeImage: string;
  columns: Array<{
    label: string;
    content?: string;
    links?: Array<{ label: string; href: string }>;
  }>;
  bottomText: string;
}

// ============================================================================
// eCommerce — CMS Block Types
// ============================================================================

export interface ProductGridBlock extends BaseBlock {
  type: 'product-grid';
  title?: string;
  description?: string;
  categorySlug?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'featured';
  limit?: number;
  columns?: 2 | 3 | 4;
  showPrice?: boolean;
  showDescription?: boolean;
  showCategory?: boolean;
  buttonText?: string;
}

export interface FeaturedProductsBlock extends BaseBlock {
  type: 'featured-products';
  title?: string;
  description?: string;
  limit?: number;
  columns?: 2 | 3 | 4;
  showPrice?: boolean;
  showBadge?: boolean;
  badgeText?: string;
  buttonText?: string;
}

export interface ProductCategoriesBlock extends BaseBlock {
  type: 'product-categories';
  title?: string;
  description?: string;
  columns?: 2 | 3 | 4;
  showProductCount?: boolean;
  showImage?: boolean;
  layout?: 'grid' | 'list';
}

export interface ShoppingCartBlock extends BaseBlock {
  type: 'shopping-cart';
  variant?: 'full' | 'mini' | 'icon-only';
  showSubtotal?: boolean;
  checkoutButtonText?: string;
  emptyCartMessage?: string;
}

export interface ProductDetailBlock extends BaseBlock {
  type: 'product-detail';
  productSlug?: string;
  layout?: 'standard' | 'compact' | 'wide';
  showGallery?: boolean;
  showDescription?: boolean;
  showVariants?: boolean;
  showAddToCart?: boolean;
  showBulkPricing?: boolean;
  showBreadcrumb?: boolean;
  showTags?: boolean;
}

export interface StoreBannerBlock extends BaseBlock {
  type: 'store-banner';
  title: string;
  subtitle?: string;
  discountCode?: string;
  buttonText?: string;
  buttonUrl?: string;
  backgroundImage?: string;
  backgroundStyle?: 'gradient' | 'solid' | 'image';
  accentColor?: string;
  countdownDate?: string;
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
  height?: string;
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
  tagline?: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface EmailFooterBlock extends BaseBlock {
  type: 'email-footer';
  companyName?: string;
  address?: string;
  showUnsubscribe?: boolean; // default true
  showViewInBrowser?: boolean;
  socialLinks?: Array<{ platform: string; url: string }>;
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

// Union type of all blocks
export interface SectionBlock extends BaseBlock {
  type: 'section';
  blocks: Block[];
  /**
   * @deprecated Use `block.style.backgroundColor` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   * The renderer treats `block.style.*` as the winning value.
   */
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  maxWidth?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingTop?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingBottom?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingLeft?: string;
  /**
   * @deprecated Use `block.style.padding` (or per-side variants) in `block.style` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  paddingRight?: string;
  /**
   * @deprecated Use `block.style.color` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  color?: string;
  /**
   * @deprecated Use `block.style.fontFamily` instead.
   * Kept for backwards compatibility — existing pages on disk may still use this field.
   */
  fontFamily?: string;
  cssClass?: string;
  htmlTag?: 'section' | 'div' | 'article' | 'aside' | 'header' | 'footer';
  /** Diagonal split: a second color rendered with a clip-path on the right side */
  splitColor?: string;
  /** Clip-path polygon for the split overlay, e.g. "polygon(55% 0, 100% 0, 100% 100%, 45% 100%)" */
  splitClipPath?: string;
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

export type Block =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | ButtonBlock
  | SpacerBlock
  | DividerBlock
  | ColumnsBlock
  | CodeBlock
  | QuoteBlock
  | VideoBlock
  | YoutubeBlock
  | HeroBlock
  | HeroSlideshowBlock
  | MarqueeBlock
  | ServicesGridBlock
  | CtaBlock
  | TestimonialBlock
  | StatsBlock
  | BlogPostsBlock
  | FeaturedContentBlock
  | AccordionBlock
  | TabsBlock
  | StickyScrollTabsBlock
  | CardGridBlock
  | SectionBlock
  | GalleryBlock
  | PalizziNavBlock
  | PalizziHeroBlock
  | PalizziWelcomeBlock
  | PalizziHistoryBlock
  | PalizziMenuBlock
  | PalizziRulesBlock
  | PalizziMembershipBlock
  | PalizziFooterBlock
  | ProductGridBlock
  | FeaturedProductsBlock
  | ProductCategoriesBlock
  | ShoppingCartBlock
  | StoreBannerBlock
  | ProductDetailBlock
  | BookingBlock
  | BookingMenuBlock
  | SurveyBlock
  | SurveyResultsBlock
  | SocialLinksBlock
  | EmailHeaderBlock
  | EmailFooterBlock
  | TimelineBlock
  | TeamShowcaseBlock
  | TeamFlipGridBlock
  | BentoGridBlock
  | FlipCardGridBlock
  | MetricCardsBlock
  | LogoStripBlock
  | SiteFooterBlock
  | DeckNextSlideBlock
  | DeckJumpToBlock
  | SurveyInputBlock;

export type BlockType = Block['type'];

export interface PageSettings {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  maxWidth?: string; // e.g., '1200px', '100%', '960px'
  paddingTop?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingRight?: string;
  fontFamily?: string;
  color?: string;
  cssClass?: string;
  backgroundVideo?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  backgroundOpacity?: number; // 0 to 1
}

export interface BlockEditorData {
  blocks: Block[];
  pageSettings?: PageSettings;
  version: string;
}

// ============================================================================
// Block Editor UX Improvements - New Types
// ============================================================================

// History Management
export interface HistoryAction {
  type: 'add' | 'delete' | 'modify' | 'reorder' | 'duplicate';
  description: string; // Human-readable (e.g., "Added heading block")
}

export interface HistoryEntry {
  blocks: Block[]; // Complete block state at this point
  pageSettings?: PageSettings; // Page settings at this point
  timestamp: number; // Unix timestamp (ms)
  action: HistoryAction; // Type of action that created this entry
  affectedBlockIds?: string[]; // IDs of blocks changed (for optimization)
}

// Editor State
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ContentStats {
  // Overall document
  totalWords: number;
  totalCharacters: number;
  totalCharactersNoSpaces: number;
  totalSentences: number;
  readingTimeMinutes: number; // Based on 200 WPM average

  // Per-block (for selected block)
  selectedBlockWords: number;
  selectedBlockCharacters: number;

  // Block type breakdown
  blockCounts: Record<string, number>; // { heading: 5, text: 12, image: 3 }
}

export interface EditorState {
  // Content
  blocks: Block[];

  // Selection & Focus
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  focusedBlockId: string | null; // For keyboard navigation

  // UI State
  showBlockPicker: boolean;
  showKeyboardReference: boolean; // Keyboard shortcuts modal
  insertPosition: number | null; // Where to insert new block
  previewMode: boolean; // Toggle between edit and preview

  // Drag-and-Drop
  isDragging: boolean;
  draggedBlockId: string | null;
  dropTargetIndex: number | null;

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Content Analysis
  stats: ContentStats;

  // Save State
  saveStatus: SaveStatus;
  lastSavedAt: number | null; // Unix timestamp
  hasUnsavedChanges: boolean;
}

// Drag-and-Drop State
export interface DragState {
  active: {
    id: string; // Block ID being dragged
    index: number; // Original position
  } | null;

  over: {
    id: string; // Drop target block ID
    index: number; // Drop position
  } | null;
}

// Keyboard Shortcuts
export type ShortcutCategory = 'editing' | 'navigation' | 'blocks' | 'system';

export interface KeyboardShortcut {
  keys: string; // Mousetrap format (e.g., "mod+z")
  description: string; // Human-readable (e.g., "Undo last action")
  category: ShortcutCategory;
  handler: () => void;
}

// Rich Paste
export type PasteWarningType =
  | 'unsupported_element'
  | 'image_failed'
  | 'formatting_lost';

export interface PasteWarning {
  type: PasteWarningType;
  element: string; // HTML element name (e.g., "table")
  message: string; // User-friendly explanation
}

export interface PasteResult {
  blocks: Block[]; // Converted blocks
  warnings: PasteWarning[]; // Elements that couldn't convert
  success: boolean; // Overall success status
}
