/**
 * Canonical list of user-pickable block types.
 *
 * Previously a private `const` in `VisualEditorShell.tsx`. Extracted here so
 * `NestedBlockInserter` (and any future picker) can source the full 47-block
 * roster without importing from a UI component.
 *
 * `VisualEditorShell.tsx` imports from here — no functional change there.
 */

import type { BlockType } from '@/types/blocks';

export interface BlockRegistryEntry {
  type: BlockType;
  label: string;
  /** Material Icon name */
  icon: string;
  category: string;
  description: string;
}

export const BUILT_IN_BLOCK_TYPES: BlockRegistryEntry[] = [
  { type: 'heading', label: 'Heading', icon: 'title', category: 'Basic', description: 'Add a title or heading' },
  { type: 'text', label: 'Paragraph', icon: 'notes', category: 'Basic', description: 'Start with plain text' },
  { type: 'button', label: 'Button', icon: 'smart_button', category: 'Basic', description: 'Call-to-action button' },
  { type: 'quote', label: 'Quote', icon: 'format_quote', category: 'Basic', description: 'Add a quotation' },
  { type: 'image', label: 'Image', icon: 'image', category: 'Media', description: 'Insert an image' },
  { type: 'youtube', label: 'YouTube', icon: 'play_circle', category: 'Media', description: 'Embed YouTube video' },
  { type: 'video', label: 'Video', icon: 'videocam', category: 'Media', description: 'Embed a video file' },
  { type: 'gallery', label: 'Gallery', icon: 'photo_library', category: 'Media', description: 'Image gallery' },
  { type: 'code', label: 'Code', icon: 'code', category: 'Media', description: 'Code snippet' },
  { type: 'spacer', label: 'Spacer', icon: 'height', category: 'Layout', description: 'Add vertical space' },
  { type: 'divider', label: 'Divider', icon: 'horizontal_rule', category: 'Layout', description: 'Horizontal line' },
  { type: 'columns', label: 'Columns', icon: 'view_column', category: 'Layout', description: 'Multi-column layout' },
  { type: 'section', label: 'Section', icon: 'crop_free', category: 'Layout', description: 'Container wrapper' },
  { type: 'tabs', label: 'Tabs', icon: 'tab', category: 'Layout', description: 'Tabbed sections' },
  { type: 'accordion', label: 'Accordion', icon: 'expand_more', category: 'Layout', description: 'Collapsible sections' },
  { type: 'hero', label: 'Hero', icon: 'view_carousel', category: 'Components', description: 'Hero section with CTA' },
  { type: 'hero-slideshow', label: 'Hero Slideshow', icon: 'slideshow', category: 'Components', description: 'Slideshow hero with multiple slides' },
  { type: 'marquee', label: 'Marquee', icon: 'text_rotation_none', category: 'Components', description: 'Scrolling text, images, or logos' },
  { type: 'cta', label: 'Call to Action', icon: 'campaign', category: 'Components', description: 'CTA section' },
  { type: 'card-grid', label: 'Card Grid', icon: 'grid_view', category: 'Components', description: 'Grid of cards' },
  { type: 'flip-card-grid', label: 'Flip Cards', icon: 'flip', category: 'Components', description: 'Interactive 3D flip cards' },
  { type: 'metric-cards', label: 'Metric Cards', icon: 'insights', category: 'Components', description: 'Case-study metric cards' },
  { type: 'logo-strip', label: 'Logo Strip', icon: 'view_column', category: 'Components', description: 'Row of client/partner logos' },
  { type: 'stats', label: 'Statistics', icon: 'bar_chart', category: 'Components', description: 'Stats display' },
  { type: 'testimonial', label: 'Testimonial', icon: 'rate_review', category: 'Components', description: 'Customer quote' },
  { type: 'featured-content', label: 'Featured', icon: 'star', category: 'Components', description: 'Featured content' },
  { type: 'services-grid', label: 'Services', icon: 'apps', category: 'Components', description: 'Services grid' },
  { type: 'blog-posts', label: 'Blog Posts', icon: 'article', category: 'Components', description: 'Grid of recent blog posts' },
  { type: 'timeline', label: 'Timeline', icon: 'timeline', category: 'Components', description: 'Process or chronology with steps' },
  { type: 'team-showcase', label: 'Team Showcase', icon: 'groups', category: 'Components', description: 'Team members with bios' },
  { type: 'team-flip-grid', label: 'Team Flip Grid', icon: 'flip', category: 'Components', description: 'Team members with flip-to-reveal Q&A cards' },
  { type: 'bento-grid', label: 'Bento Grid', icon: 'view_quilt', category: 'Components', description: 'Asymmetric two-column card layout' },
  { type: 'site-footer', label: 'Site Footer', icon: 'border_bottom', category: 'Components', description: 'Multi-column site footer with links' },
  { type: 'social-links', label: 'Social Links', icon: 'share', category: 'Components', description: 'Row of social media icons' },
  { type: 'product-grid', label: 'Product Grid', icon: 'storefront', category: 'eCommerce', description: 'Product listing grid' },
  { type: 'featured-products', label: 'Featured Products', icon: 'loyalty', category: 'eCommerce', description: 'Featured product showcase' },
  { type: 'product-categories', label: 'Categories', icon: 'category', category: 'eCommerce', description: 'Product category listing' },
  { type: 'shopping-cart', label: 'Shopping Cart', icon: 'shopping_cart', category: 'eCommerce', description: 'Cart widget' },
  { type: 'store-banner', label: 'Store Banner', icon: 'sell', category: 'eCommerce', description: 'Promotional banner' },
  { type: 'product-detail', label: 'Product Detail', icon: 'inventory_2', category: 'eCommerce', description: 'Single product page' },
  { type: 'booking', label: 'Booking', icon: 'calendar_month', category: 'Interactive', description: 'Embed a booking page' },
  { type: 'booking-menu', label: 'Booking Menu', icon: 'event_available', category: 'Interactive', description: 'Grid of bookable services' },
  { type: 'survey', label: 'Survey', icon: 'assignment', category: 'Interactive', description: 'Embed a survey form' },
  { type: 'survey-results', label: 'Survey Results', icon: 'analytics', category: 'Interactive', description: 'Charts of survey responses' },
];
