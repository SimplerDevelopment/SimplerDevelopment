import {
  Type,
  FileText,
  Image,
  MousePointerClick,
  ArrowUpDown,
  Minus,
  Target,
  Grid3x3,
  Megaphone,
  LayoutGrid,
  BarChart3,
  MessageSquareQuote,
  Newspaper,
  Quote,
  Code2,
  Video,
  Youtube,
  Columns3,
  NotebookTabs,
  ChevronDown,
  Layers,
  SquareDashedBottom,
  GalleryHorizontalEnd,
  ShoppingBag,
  Star,
  Tags,
  ShoppingCart,
  BadgePercent,
  Package,
  CalendarCheck,
  ClipboardList,
  Share2,
  MailOpen,
  MailMinus,
  GalleryVerticalEnd,
  TextCursorInput,
  ArrowRight,
  CornerDownRight,
} from 'lucide-react';
import { BlockType } from '@/types/blocks';
import { LucideIcon } from 'lucide-react';

/**
 * Map of block types to their corresponding Lucide React icons
 */
export const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  // Basic blocks
  heading: Type,
  text: FileText,
  image: Image,
  button: MousePointerClick,
  spacer: ArrowUpDown,
  divider: Minus,

  // Media blocks
  quote: Quote,
  code: Code2,
  video: Video,
  youtube: Youtube,

  // Layout blocks
  columns: Columns3,
  tabs: NotebookTabs,
  accordion: ChevronDown,
  section: SquareDashedBottom,

  // Component blocks
  hero: Target,
  'hero-slideshow': GalleryVerticalEnd,
  marquee: TextCursorInput,
  'services-grid': Grid3x3,
  cta: Megaphone,
  'card-grid': LayoutGrid,
  'flip-card-grid': LayoutGrid,
  'metric-cards': BarChart3,
  'logo-strip': GalleryHorizontalEnd,
  stats: BarChart3,
  testimonial: MessageSquareQuote,
  'blog-posts': Newspaper,
  'featured-content': Layers,
  gallery: GalleryHorizontalEnd,

  // eCommerce blocks
  'product-grid': ShoppingBag,
  'featured-products': Star,
  'product-categories': Tags,
  'shopping-cart': ShoppingCart,
  'store-banner': BadgePercent,
  'product-detail': Package,

  // Interactive blocks
  booking: CalendarCheck,
  'booking-menu': CalendarCheck,
  survey: ClipboardList,
  'survey-results': BarChart3,

  // Email blocks
  'social-links': Share2,
  'email-header': MailOpen,
  'email-footer': MailMinus,

  // Palizzi custom blocks
  'palizzi-nav': Layers,
  'palizzi-hero': Target,
  'palizzi-welcome': FileText,
  'palizzi-history': FileText,
  'palizzi-menu': LayoutGrid,
  'palizzi-rules': FileText,
  'palizzi-membership': FileText,
  'palizzi-footer': Layers,

  // New blocks
  timeline: Layers,
  'team-showcase': Layers,
  'team-flip-grid': LayoutGrid,
  'bento-grid': LayoutGrid,
  'site-footer': Layers,
  'deck-next-slide': ArrowRight,
  'deck-jump-to': CornerDownRight,
  'survey-input': TextCursorInput,
  'sticky-scroll-tabs': NotebookTabs,
};

/**
 * Get icon component for a block type
 *
 * @param type - Block type
 * @returns Lucide icon component
 *
 * @example
 * ```tsx
 * const Icon = getBlockIcon('heading');
 * <Icon className="w-4 h-4" />
 * ```
 */
export function getBlockIcon(type: BlockType): LucideIcon {
  return BLOCK_ICONS[type] || FileText;
}

/**
 * Block type metadata including icon, label, and category
 */
export interface BlockTypeMetadata {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  category: 'Basic' | 'Media' | 'Layout' | 'Components' | 'eCommerce' | 'Interactive' | 'Email';
}

/**
 * Complete block type registry with metadata
 */
export const BLOCK_TYPES: BlockTypeMetadata[] = [
  // Basic
  { type: 'heading', label: 'Heading', icon: Type, category: 'Basic' },
  { type: 'text', label: 'Paragraph', icon: FileText, category: 'Basic' },
  { type: 'image', label: 'Image', icon: Image, category: 'Basic' },
  { type: 'button', label: 'Button', icon: MousePointerClick, category: 'Basic' },
  { type: 'spacer', label: 'Spacer', icon: ArrowUpDown, category: 'Basic' },
  { type: 'divider', label: 'Divider', icon: Minus, category: 'Basic' },

  // Media
  { type: 'quote', label: 'Quote', icon: Quote, category: 'Media' },
  { type: 'code', label: 'Code Block', icon: Code2, category: 'Media' },
  { type: 'video', label: 'Video', icon: Video, category: 'Media' },
  { type: 'youtube', label: 'YouTube', icon: Youtube, category: 'Media' },

  // Layout
  { type: 'columns', label: 'Columns', icon: Columns3, category: 'Layout' },
  { type: 'tabs', label: 'Tabs', icon: NotebookTabs, category: 'Layout' },
  { type: 'accordion', label: 'Accordion', icon: ChevronDown, category: 'Layout' },

  // Components
  { type: 'hero', label: 'Hero Section', icon: Target, category: 'Components' },
  { type: 'services-grid', label: 'Services Grid', icon: Grid3x3, category: 'Components' },
  { type: 'cta', label: 'Call to Action', icon: Megaphone, category: 'Components' },
  { type: 'card-grid', label: 'Card Grid', icon: LayoutGrid, category: 'Components' },
  { type: 'stats', label: 'Stats', icon: BarChart3, category: 'Components' },
  { type: 'testimonial', label: 'Testimonial', icon: MessageSquareQuote, category: 'Components' },
  { type: 'blog-posts', label: 'Blog Posts', icon: Newspaper, category: 'Components' },
  { type: 'featured-content', label: 'Featured Content', icon: Layers, category: 'Components' },
  { type: 'gallery', label: 'Gallery', icon: GalleryHorizontalEnd, category: 'Media' },

  // eCommerce
  { type: 'product-grid', label: 'Product Grid', icon: ShoppingBag, category: 'eCommerce' },
  { type: 'featured-products', label: 'Featured Products', icon: Star, category: 'eCommerce' },
  { type: 'product-categories', label: 'Product Categories', icon: Tags, category: 'eCommerce' },
  { type: 'shopping-cart', label: 'Shopping Cart', icon: ShoppingCart, category: 'eCommerce' },
  { type: 'store-banner', label: 'Store Banner', icon: BadgePercent, category: 'eCommerce' },
  { type: 'product-detail', label: 'Product Detail', icon: Package, category: 'eCommerce' },

  // Interactive
  { type: 'booking', label: 'Booking', icon: CalendarCheck, category: 'Interactive' },
  { type: 'survey', label: 'Survey', icon: ClipboardList, category: 'Interactive' },
  { type: 'survey-results', label: 'Survey Results', icon: BarChart3, category: 'Interactive' },

  // Email
  { type: 'social-links', label: 'Social Links', icon: Share2, category: 'Email' },
  { type: 'email-header', label: 'Email Header', icon: MailOpen, category: 'Email' },
  { type: 'email-footer', label: 'Email Footer', icon: MailMinus, category: 'Email' },
];

/**
 * Get block type metadata
 *
 * @param type - Block type
 * @returns Block metadata or undefined
 */
export function getBlockTypeMetadata(type: BlockType): BlockTypeMetadata | undefined {
  return BLOCK_TYPES.find(bt => bt.type === type);
}
