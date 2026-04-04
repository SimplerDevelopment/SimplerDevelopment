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
  responsive?: ResponsiveSettings;
  style?: BlockStyle;
  /** Per-element styles for blocks with multiple visual elements */
  elementStyles?: Record<string, Partial<BlockStyle>>;
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
  // Navigation colors
  arrowColor?: string;
  arrowBackground?: string;
  arrowBorderColor?: string;
  dotColor?: string;
  dotActiveColor?: string;
  progressBarColor?: string;
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

export interface ServicesGridBlock extends BaseBlock {
  type: 'services-grid';
  title?: string;
  description?: string;
  services: Array<{
    id: string;
    title: string;
    description: string;
    icon?: string;
    link?: string;
    image?: string;
  }>;
  columns?: 2 | 3 | 4;
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
  layout?: 'grid' | 'carousel';
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

export interface BookingBlock extends BaseBlock {
  type: 'booking';
  slug: string;
  title?: string;
  description?: string;
  showPageTitle?: boolean;
  height?: string;
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

// Union type of all blocks
export interface SectionBlock extends BaseBlock {
  type: 'section';
  blocks: Block[];
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  maxWidth?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingRight?: string;
  color?: string;
  fontFamily?: string;
  cssClass?: string;
  htmlTag?: 'section' | 'div' | 'article' | 'aside' | 'header' | 'footer';
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
  | SurveyBlock
  | SurveyResultsBlock
  | SocialLinksBlock
  | EmailHeaderBlock
  | EmailFooterBlock;

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
