import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';

// Block catalog — describes all available block types for rendering
const blocks = [
  { type: 'text', name: 'Paragraph', category: 'basic', inputs: ['content', 'alignment', 'size'] },
  { type: 'heading', name: 'Heading', category: 'basic', inputs: ['content', 'level', 'alignment'] },
  { type: 'image', name: 'Image', category: 'basic', inputs: ['src', 'alt', 'caption', 'width'] },
  { type: 'button', name: 'Button', category: 'basic', inputs: ['label', 'url', 'variant', 'size'] },
  { type: 'spacer', name: 'Spacer', category: 'basic', inputs: ['height'] },
  { type: 'divider', name: 'Divider', category: 'basic', inputs: ['style', 'color'] },
  { type: 'quote', name: 'Quote', category: 'basic', inputs: ['content', 'author', 'role'] },
  { type: 'columns', name: 'Columns', category: 'layout', inputs: ['columns', 'gap'] },
  { type: 'section', name: 'Section', category: 'layout', inputs: ['background', 'padding', 'children'] },
  { type: 'tabs', name: 'Tabs', category: 'layout', inputs: ['tabs'] },
  { type: 'accordion', name: 'Accordion', category: 'layout', inputs: ['items'] },
  { type: 'hero', name: 'Hero', category: 'component', inputs: ['title', 'subtitle', 'backgroundImage', 'ctaLabel', 'ctaUrl'] },
  { type: 'cta', name: 'Call to Action', category: 'component', inputs: ['title', 'description', 'buttonLabel', 'buttonUrl'] },
  { type: 'services-grid', name: 'Services Grid', category: 'component', inputs: ['services'] },
  { type: 'card-grid', name: 'Card Grid', category: 'component', inputs: ['cards', 'columns'] },
  { type: 'stats', name: 'Stats', category: 'component', inputs: ['stats'] },
  { type: 'testimonial', name: 'Testimonials', category: 'component', inputs: ['testimonials'] },
  { type: 'gallery', name: 'Gallery', category: 'component', inputs: ['images', 'columns'] },
  { type: 'featured-content', name: 'Featured Content', category: 'component', inputs: ['title', 'content', 'image'] },
  { type: 'blog-posts', name: 'Blog Posts', category: 'component', inputs: ['count', 'category'] },
  { type: 'video', name: 'Video', category: 'media', inputs: ['src', 'poster'] },
  { type: 'youtube', name: 'YouTube', category: 'media', inputs: ['videoId'] },
  { type: 'product-grid', name: 'Product Grid', category: 'ecommerce', inputs: ['category', 'limit', 'columns'] },
  { type: 'featured-products', name: 'Featured Products', category: 'ecommerce', inputs: ['limit'] },
  { type: 'product-categories', name: 'Product Categories', category: 'ecommerce', inputs: [] },
  { type: 'product-detail', name: 'Product Detail', category: 'ecommerce', inputs: ['slug'] },
  { type: 'store-banner', name: 'Store Banner', category: 'ecommerce', inputs: ['title', 'subtitle', 'image'] },
];

export const GET = withApiKeyAndCors(async () => {
  return NextResponse.json({ success: true, data: blocks });
});
