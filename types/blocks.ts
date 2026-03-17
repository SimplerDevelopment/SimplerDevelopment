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
  responsive?: ResponsiveSettings;
  style?: BlockStyle;
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
  width: number; // Percentage or fraction (e.g., 50 for 50%, or 1/2)
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
  | GalleryBlock;

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
