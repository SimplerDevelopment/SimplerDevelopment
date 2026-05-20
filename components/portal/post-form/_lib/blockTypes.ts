// Block-type catalog for the visual editor's "add block" picker.
import type { BlockType } from '@/types/blocks';

export const blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
  { type: 'heading', label: 'Heading', icon: '📝', category: 'Basic', description: 'Add a title or heading' },
  { type: 'text', label: 'Text', icon: '📄', category: 'Basic', description: 'Plain paragraph text' },
  { type: 'button', label: 'Button', icon: '🔘', category: 'Basic', description: 'Add a call-to-action button' },
  { type: 'quote', label: 'Quote', icon: '💬', category: 'Basic', description: 'Add a quotation' },
  { type: 'image', label: 'Image', icon: '🖼️', category: 'Media', description: 'Insert an image' },
  { type: 'youtube', label: 'YouTube', icon: '📺', category: 'Media', description: 'Embed a YouTube video' },
  { type: 'video', label: 'Video', icon: '🎬', category: 'Media', description: 'Embed a video file' },
  { type: 'gallery', label: 'Gallery', icon: '🖼️', category: 'Media', description: 'Image gallery with lightbox' },
  { type: 'code', label: 'Code', icon: '💻', category: 'Media', description: 'Display code snippet' },
  { type: 'spacer', label: 'Spacer', icon: '↕️', category: 'Layout', description: 'Add vertical space' },
  { type: 'divider', label: 'Divider', icon: '➖', category: 'Layout', description: 'Add a horizontal line' },
  { type: 'columns', label: 'Columns', icon: '📊', category: 'Layout', description: 'Display content in columns' },
  { type: 'accordion', label: 'Accordion', icon: '📑', category: 'Layout', description: 'Collapsible content sections' },
  { type: 'tabs', label: 'Tabs', icon: '🗂️', category: 'Layout', description: 'Tabbed content sections' },
  { type: 'section', label: 'Section', icon: '📦', category: 'Layout', description: 'Container wrapper with styling' },
  { type: 'hero', label: 'Hero', icon: '🎯', category: 'Components', description: 'Hero section with CTA' },
  { type: 'hero-slideshow', label: 'Hero Slideshow', icon: '🎞️', category: 'Components', description: 'Slideshow hero with multiple slides' },
  { type: 'marquee', label: 'Marquee', icon: '📜', category: 'Components', description: 'Scrolling text, images, or logos' },
  { type: 'cta', label: 'Call to Action', icon: '📢', category: 'Components', description: 'CTA section' },
  { type: 'card-grid', label: 'Card Grid', icon: '🎴', category: 'Components', description: 'Grid of cards' },
  { type: 'stats', label: 'Stats', icon: '📈', category: 'Components', description: 'Statistics display' },
  { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'Components', description: 'Customer testimonial' },
  { type: 'featured-content', label: 'Featured Content', icon: '✨', category: 'Components', description: 'Featured content with image' },
];
