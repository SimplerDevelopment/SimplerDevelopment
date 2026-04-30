/**
 * Canonical default-block factory.
 *
 * Single source of truth for all `createDefaultBlock` logic — previously
 * duplicated across BlockEditor, VisualBlockEditor, VisualBlockEditorEnhanced,
 * PortalPostForm, SectionBlockPreview, ColumnsBlockPreview, and TabsBlockPreview.
 *
 * Rules for choosing defaults:
 *  - Pick the richest sensible default seen across all existing factories.
 *  - For layout containers (columns, tabs, accordion) pre-populate with starter
 *    child entries so the block isn't visually empty on drop.
 *  - For complex component blocks (flip-card-grid, metric-cards, etc.) use
 *    PortalPostForm's rich defaults — they were the most complete.
 *  - Types not covered by any existing factory fall back to minimal { id, type }.
 */

import { Block, BlockType } from '@/types/blocks';

export interface CreateDefaultBlockOptions {
  /** Pre-set id. Omit to auto-generate via Date.now + random. */
  id?: string;
  /** Block order (position in parent list). Defaults to 0. */
  order?: number;
}

export function createDefaultBlock(
  type: BlockType,
  opts: CreateDefaultBlockOptions = {}
): Block {
  const id = opts.id ?? `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const order = opts.order ?? 0;
  const base = { id, order };

  switch (type) {
    // ── Basic ─────────────────────────────────────────────────────────────────
    case 'text':
      return { ...base, type: 'text', content: 'Start writing or type / to insert a block...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Write your heading...', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click me', url: '', variant: 'primary', size: 'md', alignment: 'left' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Add a memorable quote...', author: '', citation: '' };
    case 'code':
      return { ...base, type: 'code', code: '// Enter your code here...', language: 'javascript' };
    case 'html-render':
      return { ...base, type: 'html-render', html: '<div>Paste raw HTML here.</div>', width: 'full' };
    case 'spacer':
      return { ...base, type: 'spacer', height: 'md' };
    case 'divider':
      return { ...base, type: 'divider', lineStyle: 'solid' };

    // ── Media ─────────────────────────────────────────────────────────────────
    case 'video':
      return { ...base, type: 'video', url: '', caption: '', autoplay: false, controls: true };
    case 'youtube':
      return { ...base, type: 'youtube', url: '', caption: '' };
    case 'gallery':
      return { ...base, type: 'gallery', images: [], layout: 'grid', columns: 3, lightbox: true, gap: 'md' };

    // ── Layout ────────────────────────────────────────────────────────────────
    case 'columns':
      return {
        ...base, type: 'columns',
        columns: [
          { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
          { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
        ],
        gap: 'md',
      };
    case 'section':
      return { ...base, type: 'section', blocks: [] };
    case 'accordion':
      return {
        ...base, type: 'accordion',
        title: 'Frequently Asked Questions',
        items: [
          { id: `item-${Date.now()}-1`, title: 'First question?', content: 'Answer to the first question.' },
          { id: `item-${Date.now()}-2`, title: 'Second question?', content: 'Answer to the second question.' },
        ],
      };
    case 'tabs':
      return {
        ...base, type: 'tabs',
        tabs: [
          { id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] },
          { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] },
        ],
      };

    // ── Components ────────────────────────────────────────────────────────────
    case 'hero':
      return {
        ...base, type: 'hero',
        title: 'Your Headline Here',
        subtitle: 'A short, compelling line that builds on the headline.',
        description: 'Describe the value you offer in one or two sentences. This is placeholder copy — replace it with your own words.',
        ctaText: 'Get Started',
        ctaLink: '/contact',
      };
    case 'hero-slideshow':
      return {
        ...base, type: 'hero-slideshow',
        slides: [
          { id: `slide-${Date.now()}-1`, title: 'First Slide', subtitle: '', description: '', ctaText: 'Learn More', ctaLink: '#' },
          { id: `slide-${Date.now()}-2`, title: 'Second Slide', subtitle: '', description: '', ctaText: 'Learn More', ctaLink: '#' },
        ],
        autoplay: true, interval: 6000, transition: 'fade', showDots: true, showArrows: true, kenBurns: true,
      };
    case 'marquee':
      return {
        ...base, type: 'marquee',
        items: [
          { id: `mi-${Date.now()}-1`, type: 'text', content: 'Scrolling text item' },
          { id: `mi-${Date.now()}-2`, type: 'text', content: 'Another item' },
        ],
        autoFill: true, speed: 50, direction: 'left', pauseOnHover: true,
      };
    case 'cta':
      return { ...base, type: 'cta', title: 'Ready to get started?', description: 'Join thousands of satisfied customers', primaryButtonText: 'Get Started', primaryButtonUrl: '/contact', backgroundStyle: 'gradient' };
    case 'card-grid':
      return {
        ...base, type: 'card-grid',
        title: 'Features',
        cards: [
          { id: `card-${Date.now()}-1`, title: 'Card 1', description: 'Description' },
          { id: `card-${Date.now()}-2`, title: 'Card 2', description: 'Description' },
        ],
        columns: 3,
      };
    case 'flip-card-grid':
      return {
        ...base, type: 'flip-card-grid',
        cards: [
          { id: `flip-${Date.now()}-1`, frontTitle: 'Front Title', frontIcon: 'rocket_launch', backText: 'Hover or tap to reveal more details about this service.', backLinkText: 'Learn More' },
          { id: `flip-${Date.now()}-2`, frontTitle: 'Second Card', frontIcon: 'insights', backText: 'Add your own description here — this text is revealed on flip.', backLinkText: 'Learn More' },
          { id: `flip-${Date.now()}-3`, frontTitle: 'Third Card', frontIcon: 'workspace_premium', backText: 'Flip cards are great for condensing info behind an interactive reveal.', backLinkText: 'Learn More' },
        ],
        columns: 3, flipTrigger: 'hover', flipAxis: 'horizontal', cardHeight: '280px', accentColor: '#004D80',
      };
    case 'metric-cards':
      return {
        ...base, type: 'metric-cards',
        metrics: [
          { id: `m-${Date.now()}-1`, value: '83%', label: 'Increase in Completions', institution: 'Example University', linkText: 'Case Study' },
          { id: `m-${Date.now()}-2`, value: '$965K+', label: 'Raised from 2,600+ Donors', institution: 'Loyola University', linkText: 'Case Study' },
          { id: `m-${Date.now()}-3`, value: '2 Days', label: 'Staff Time Saved', institution: 'VCU', linkText: 'Case Study' },
          { id: `m-${Date.now()}-4`, value: '5 Years', label: 'Historical Data Integrated', institution: 'Landmark College', linkText: 'Case Study' },
        ],
        columns: 4, accentColor: '#004D80',
      };
    case 'logo-strip':
      return {
        ...base, type: 'logo-strip',
        overline: 'TRUSTED BY LEADING COMPANIES',
        logos: [
          { id: `l-${Date.now()}-1`, imageUrl: '', alt: 'Logo 1' },
          { id: `l-${Date.now()}-2`, imageUrl: '', alt: 'Logo 2' },
          { id: `l-${Date.now()}-3`, imageUrl: '', alt: 'Logo 3' },
          { id: `l-${Date.now()}-4`, imageUrl: '', alt: 'Logo 4' },
          { id: `l-${Date.now()}-5`, imageUrl: '', alt: 'Logo 5' },
          { id: `l-${Date.now()}-6`, imageUrl: '', alt: 'Logo 6' },
        ],
        columns: 6, grayscale: true, logoHeight: '40px', gap: 'lg', alignment: 'center',
      };
    case 'stats':
      return {
        ...base, type: 'stats',
        title: 'By the numbers',
        stats: [
          { id: `stat-${Date.now()}-1`, value: '100+', label: 'Clients' },
          { id: `stat-${Date.now()}-2`, value: '50', label: 'Projects' },
        ],
        columns: 3,
      };
    case 'testimonial':
      return { ...base, type: 'testimonial', quote: 'This is an amazing product!', author: 'John Doe', role: 'CEO', company: 'Company Inc' };
    case 'featured-content':
      return { ...base, type: 'featured-content', title: 'Featured Content', description: 'Description of the featured content', imagePosition: 'right', buttonText: 'Learn More', buttonUrl: '/learn-more' };
    case 'services-grid':
      return { ...base, type: 'services-grid', title: 'Our Services', services: [], columns: 3 };
    case 'blog-posts':
      return { ...base, type: 'blog-posts', title: 'Latest Posts', limit: 3, columns: 3, showExcerpt: true };
    case 'timeline':
      return {
        ...base, type: 'timeline',
        steps: [
          { id: `step-${Date.now()}-1`, title: 'Step One', description: 'Description of the first step.' },
          { id: `step-${Date.now()}-2`, title: 'Step Two', description: 'Description of the second step.' },
        ],
      };
    case 'team-showcase':
      return {
        ...base, type: 'team-showcase',
        members: [
          { id: `tm-${Date.now()}-1`, name: 'Team Member', title: 'Role', photo: '', bio: 'Short bio here.' },
        ],
      };
    case 'team-flip-grid':
      return {
        ...base, type: 'team-flip-grid',
        members: [
          { id: `tfm-${Date.now()}-1`, name: 'Team Member', title: 'Role', bio: '', photo: '', question: 'What drives you?', answer: 'A passion for building great things.' },
        ],
        columns: 3,
      };
    case 'bento-grid':
      return {
        ...base, type: 'bento-grid',
        cards: [
          { id: `bc-${Date.now()}-1`, title: 'Feature One', items: [] },
          { id: `bc-${Date.now()}-2`, title: 'Feature Two', items: [] },
          { id: `bc-${Date.now()}-3`, title: 'Feature Three', items: [] },
        ],
      };
    case 'site-footer':
      return { ...base, type: 'site-footer', linkGroups: [], socialLinks: [] };
    case 'sticky-scroll-tabs':
      return {
        ...base,
        type: 'sticky-scroll-tabs',
        panels: [
          { id: 'panel-1', label: 'Tab 1', blocks: [] },
          { id: 'panel-2', label: 'Tab 2', blocks: [] },
        ],
      };
    case 'social-links':
      return { ...base, type: 'social-links', links: [], alignment: 'center' };

    // ── eCommerce ─────────────────────────────────────────────────────────────
    case 'product-grid':
      return { ...base, type: 'product-grid' };
    case 'featured-products':
      return { ...base, type: 'featured-products' };
    case 'product-categories':
      return { ...base, type: 'product-categories' };
    case 'shopping-cart':
      return { ...base, type: 'shopping-cart' };
    case 'store-banner':
      return { ...base, type: 'store-banner', title: 'Special Offer' };
    case 'product-detail':
      return { ...base, type: 'product-detail' };

    // ── Forms / Interactive ───────────────────────────────────────────────────
    case 'booking':
      return { ...base, type: 'booking', slug: '', title: 'Schedule a Meeting', description: 'Pick a time that works for you', showPageTitle: true, height: '700px' };
    case 'booking-menu':
      return { ...base, type: 'booking-menu', title: 'Book a Service', description: 'Select a service to get started' };
    case 'survey':
      return { ...base, type: 'survey', slug: '', title: 'Take Our Survey', description: "We'd love to hear your feedback", showPageTitle: true, height: '700px' };
    case 'survey-results':
      return { ...base, type: 'survey-results', surveySlug: '', title: 'Survey Results', description: 'See what our customers are saying', chartType: 'bar', showResponseCount: true, showTextResponses: true, textResponseLimit: 5, layout: 'stacked' };

    // ── Email-only ────────────────────────────────────────────────────────────
    case 'email-header':
      return { ...base, type: 'email-header', alignment: 'center' };
    case 'email-footer':
      return { ...base, type: 'email-footer', showUnsubscribe: true };

    // ── Pitch-deck / site-specific ────────────────────────────────────────────
    // These are rarely inserted manually; minimal defaults are fine.
    case 'survey-input':
      return { ...base, type: 'survey-input', fieldType: 'text', fieldLabel: 'Your answer' };
    case 'deck-next-slide':
      return { ...base, type: 'deck-next-slide', text: 'Next' };
    case 'deck-jump-to':
      return { ...base, type: 'deck-jump-to', text: 'Go', targetSlide: 1 };
    case 'palizzi-nav':
      return { ...base, type: 'palizzi-nav', logoUrl: '', brandName: '', links: [] };
    case 'palizzi-hero':
      return { ...base, type: 'palizzi-hero', address: '', crestUrl: '', neonUrl: '', tagline: '', established: '', scrollTarget: '' };
    case 'palizzi-welcome':
      return { ...base, type: 'palizzi-welcome', overline: '', title: '', titleAccent: '', paragraphs: [], bookImage: '', bookTitle: '', bookSubtitle: '', bookAuthors: '', bookLabel: '' };
    case 'palizzi-history':
      return { ...base, type: 'palizzi-history', overline: '', title: '', titleAccent: '', backgroundImage: '', marqueeImage: '', paragraphs: [] };
    case 'palizzi-menu':
      return { ...base, type: 'palizzi-menu', overline: '', title: '', subtitle: '', foodSections: [], cocktails: [] };
    case 'palizzi-rules':
      return { ...base, type: 'palizzi-rules', overline: '', title: '', titleAccent: '', hoursTitle: '', hoursSubtitle: '', badges: [], rules: [], disclaimer: '' };
    case 'palizzi-membership':
      return { ...base, type: 'palizzi-membership', overline: '', title: '', titleAccent: '', paragraphs: [], highlight: '', closingNote: '', signature: '', footnote: '' };
    case 'palizzi-footer':
      return { ...base, type: 'palizzi-footer', marqueeImage: '', columns: [], bottomText: '' };

    // ── HTML embed ────────────────────────────────────────────────────────────
    case 'html-embed':
      return {
        ...base, type: 'html-embed',
        url: '',
        height: '600px',
        width: 'full',
        sandbox: 'scripts',
        iframeTitle: 'Embedded HTML content',
      };

    default: {
      // TypeScript exhaustiveness guard — should never reach here for known types.
      const _exhaustive: never = type;
      void _exhaustive;
      return { ...base, type: 'text', content: '', alignment: 'left', size: 'base' } as unknown as Block;
    }
  }
}
