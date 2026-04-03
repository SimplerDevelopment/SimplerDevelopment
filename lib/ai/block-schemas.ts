/**
 * Block Schema Registry
 *
 * Provides machine-readable JSON schemas for every block type so the AI
 * prompt can be assembled dynamically. When a new block type is added,
 * add its schema here and the AI will automatically know how to use it.
 */

import type { ComponentManifestEntry } from '@/types/visual-editor';

export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'color' | 'url' | 'richtext' | 'image' | 'array' | 'object';
  required?: boolean;
  description?: string;
  enumValues?: string[];
  default?: unknown;
  items?: PropertySchema | Record<string, PropertySchema>;
}

export interface BlockSchema {
  type: string;
  label: string;
  category: string;
  description: string;
  properties: Record<string, PropertySchema>;
  /** Element names that support per-element styling via elementStyles */
  styledElements?: string[];
}

// ---------------------------------------------------------------------------
// Built-in block schemas
// ---------------------------------------------------------------------------

const BUILT_IN_SCHEMAS: BlockSchema[] = [
  // ── Basic ─────────────────────────────────────────────────────────────────
  {
    type: 'heading',
    label: 'Heading',
    category: 'Basic',
    description: 'Section title or heading (h1-h6)',
    properties: {
      content: { type: 'string', required: true, description: 'Heading text' },
      level: { type: 'enum', required: true, enumValues: ['1', '2', '3', '4', '5', '6'], description: 'Heading level (1=largest)' },
      alignment: { type: 'enum', enumValues: ['left', 'center', 'right'], default: 'left' },
    },
  },
  {
    type: 'text',
    label: 'Paragraph',
    category: 'Basic',
    description: 'Body text paragraph. Content can be plain text or HTML.',
    properties: {
      content: { type: 'string', required: true, description: 'Text content (plain or HTML)' },
      alignment: { type: 'enum', enumValues: ['left', 'center', 'right'], default: 'left' },
      size: { type: 'enum', enumValues: ['sm', 'base', 'lg', 'xl'], default: 'base' },
    },
  },
  {
    type: 'image',
    label: 'Image',
    category: 'Basic',
    description: 'Display an image with optional caption',
    properties: {
      url: { type: 'url', required: true, description: 'Image URL' },
      alt: { type: 'string', required: true, description: 'Alt text for accessibility' },
      caption: { type: 'string', description: 'Optional caption below image' },
      width: { type: 'enum', enumValues: ['full', 'large', 'medium', 'small'], default: 'full' },
      alignment: { type: 'enum', enumValues: ['left', 'center', 'right'], default: 'center' },
    },
  },
  {
    type: 'button',
    label: 'Button',
    category: 'Basic',
    description: 'Call-to-action button',
    properties: {
      text: { type: 'string', required: true, description: 'Button label' },
      url: { type: 'url', required: true, description: 'Link URL' },
      variant: { type: 'enum', enumValues: ['primary', 'secondary', 'outline'], default: 'primary' },
      size: { type: 'enum', enumValues: ['sm', 'md', 'lg'], default: 'md' },
      alignment: { type: 'enum', enumValues: ['left', 'center', 'right'], default: 'left' },
      openInNewTab: { type: 'boolean', default: false },
    },
  },
  {
    type: 'spacer',
    label: 'Spacer',
    category: 'Basic',
    description: 'Vertical whitespace between blocks',
    properties: {
      height: { type: 'enum', required: true, enumValues: ['sm', 'md', 'lg', 'xl'] },
    },
  },
  {
    type: 'divider',
    label: 'Divider',
    category: 'Basic',
    description: 'Horizontal line separator',
    properties: {
      lineStyle: { type: 'enum', enumValues: ['solid', 'dashed', 'dotted'], default: 'solid' },
    },
  },
  {
    type: 'quote',
    label: 'Quote',
    category: 'Basic',
    description: 'Block quotation with optional attribution',
    properties: {
      content: { type: 'string', required: true, description: 'Quote text' },
      author: { type: 'string', description: 'Attribution name' },
      citation: { type: 'string', description: 'Source or citation' },
    },
  },
  {
    type: 'code',
    label: 'Code',
    category: 'Basic',
    description: 'Code snippet with syntax highlighting',
    properties: {
      code: { type: 'string', required: true },
      language: { type: 'string', description: 'Programming language (e.g. javascript, python)' },
    },
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  {
    type: 'video',
    label: 'Video',
    category: 'Media',
    description: 'Embed a video file',
    properties: {
      url: { type: 'url', required: true },
      caption: { type: 'string' },
      autoplay: { type: 'boolean', default: false },
      controls: { type: 'boolean', default: true },
    },
  },
  {
    type: 'youtube',
    label: 'YouTube',
    category: 'Media',
    description: 'Embed a YouTube video',
    properties: {
      url: { type: 'url', required: true, description: 'YouTube video URL' },
      caption: { type: 'string' },
    },
  },
  {
    type: 'gallery',
    label: 'Gallery',
    category: 'Media',
    description: 'Image gallery grid or masonry layout',
    properties: {
      images: {
        type: 'array',
        required: true,
        description: 'Array of { id, url, alt, caption? }',
        items: {
          id: { type: 'string', required: true },
          url: { type: 'url', required: true },
          alt: { type: 'string', required: true },
          caption: { type: 'string' },
        },
      },
      layout: { type: 'enum', enumValues: ['grid', 'masonry'], default: 'grid' },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
      lightbox: { type: 'boolean', default: true },
      gap: { type: 'enum', enumValues: ['sm', 'md', 'lg'], default: 'md' },
    },
  },

  // ── Layout ────────────────────────────────────────────────────────────────
  {
    type: 'columns',
    label: 'Columns',
    category: 'Layout',
    description: 'Multi-column layout. Each column contains nested blocks.',
    properties: {
      columns: {
        type: 'array',
        required: true,
        description: 'Array of column objects: { id, width (percentage), blocks[], backgroundColor?, padding?, verticalAlign? }',
        items: {
          id: { type: 'string', required: true },
          width: { type: 'number', required: true, description: 'Column width as percentage (e.g. 50)' },
          blocks: { type: 'array', required: true, description: 'Nested blocks inside this column' },
          backgroundColor: { type: 'color' },
          padding: { type: 'enum', enumValues: ['none', 'sm', 'md', 'lg'] },
          verticalAlign: { type: 'enum', enumValues: ['top', 'center', 'bottom'] },
        },
      },
      gap: { type: 'enum', enumValues: ['sm', 'md', 'lg'], default: 'md' },
      stackOnMobile: { type: 'boolean', default: true },
      stackOnTablet: { type: 'boolean', default: false },
      reverseOnStack: { type: 'boolean', default: false },
    },
  },
  {
    type: 'section',
    label: 'Section',
    category: 'Layout',
    description: 'Container wrapper with background/padding. Contains nested blocks.',
    properties: {
      blocks: { type: 'array', required: true, description: 'Nested blocks inside section' },
      backgroundColor: { type: 'color' },
      backgroundImage: { type: 'url' },
      backgroundSize: { type: 'enum', enumValues: ['cover', 'contain', 'auto'] },
      backgroundPosition: { type: 'string' },
      maxWidth: { type: 'string', description: 'e.g. "1200px", "100%"' },
      paddingTop: { type: 'string' },
      paddingBottom: { type: 'string' },
      paddingLeft: { type: 'string' },
      paddingRight: { type: 'string' },
      color: { type: 'color' },
      fontFamily: { type: 'string' },
      htmlTag: { type: 'enum', enumValues: ['section', 'div', 'article', 'aside', 'header', 'footer'], default: 'section' },
    },
  },
  {
    type: 'tabs',
    label: 'Tabs',
    category: 'Layout',
    description: 'Tabbed content sections, each tab contains nested blocks',
    properties: {
      tabs: {
        type: 'array',
        required: true,
        description: 'Array of { id, label, blocks[] }',
        items: {
          id: { type: 'string', required: true },
          label: { type: 'string', required: true },
          blocks: { type: 'array', required: true },
        },
      },
    },
  },
  {
    type: 'accordion',
    label: 'Accordion',
    category: 'Layout',
    description: 'Collapsible FAQ-style sections',
    properties: {
      title: { type: 'string', description: 'Optional heading above accordion' },
      items: {
        type: 'array',
        required: true,
        description: 'Array of { id, title, content }',
        items: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          content: { type: 'string', required: true },
        },
      },
    },
  },

  // ── Components ────────────────────────────────────────────────────────────
  {
    type: 'hero',
    label: 'Hero',
    category: 'Components',
    description: 'Full-width hero banner with title, description, and CTAs',
    properties: {
      title: { type: 'string', required: true },
      subtitle: { type: 'string' },
      description: { type: 'string' },
      ctaText: { type: 'string', description: 'Primary button text' },
      ctaLink: { type: 'url', description: 'Primary button link' },
      secondaryCtaText: { type: 'string' },
      secondaryCtaLink: { type: 'url' },
      backgroundImage: { type: 'url' },
      backgroundVideo: { type: 'url' },
    },
    styledElements: ['title', 'subtitle', 'description', 'cta', 'secondaryCta'],
  },
  {
    type: 'cta',
    label: 'Call to Action',
    category: 'Components',
    description: 'CTA section with buttons and optional background',
    properties: {
      title: { type: 'string', required: true },
      description: { type: 'string' },
      primaryButtonText: { type: 'string', required: true },
      primaryButtonUrl: { type: 'url', required: true },
      secondaryButtonText: { type: 'string' },
      secondaryButtonUrl: { type: 'url' },
      backgroundStyle: { type: 'enum', enumValues: ['gradient', 'solid', 'none'], default: 'gradient' },
    },
    styledElements: ['title', 'description', 'primaryButton', 'secondaryButton'],
  },
  {
    type: 'stats',
    label: 'Statistics',
    category: 'Components',
    description: 'Numeric statistics/metrics display',
    properties: {
      title: { type: 'string' },
      stats: {
        type: 'array',
        required: true,
        description: 'Array of { id, value, label }',
        items: {
          id: { type: 'string', required: true },
          value: { type: 'string', required: true, description: 'Display value (e.g. "100+", "$5M")' },
          label: { type: 'string', required: true },
        },
      },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
    },
    styledElements: ['title', 'value', 'label'],
  },
  {
    type: 'card-grid',
    label: 'Card Grid',
    category: 'Components',
    description: 'Grid of content cards with title, description, and optional icon/image',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      cards: {
        type: 'array',
        required: true,
        description: 'Array of { id, title, description, image?, link?, icon? }',
        items: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          description: { type: 'string', required: true },
          image: { type: 'url' },
          link: { type: 'url' },
          icon: { type: 'string', description: 'Material icon name' },
        },
      },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
      iconSize: { type: 'string' },
    },
    styledElements: ['title', 'description', 'card', 'cardTitle', 'cardDescription'],
  },
  {
    type: 'testimonial',
    label: 'Testimonial',
    category: 'Components',
    description: 'Customer quote/testimonial',
    properties: {
      quote: { type: 'string', required: true },
      author: { type: 'string', required: true },
      role: { type: 'string' },
      company: { type: 'string' },
      avatar: { type: 'url' },
    },
    styledElements: ['quote', 'author', 'role'],
  },
  {
    type: 'services-grid',
    label: 'Services Grid',
    category: 'Components',
    description: 'Grid of services/features with icons',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      services: {
        type: 'array',
        required: true,
        description: 'Array of { id, title, description, icon?, link?, image? }',
        items: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          description: { type: 'string', required: true },
          icon: { type: 'string', description: 'Material icon name' },
          link: { type: 'url' },
          image: { type: 'url' },
        },
      },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
    },
  },
  {
    type: 'featured-content',
    label: 'Featured Content',
    category: 'Components',
    description: 'Split layout with text and image side by side',
    properties: {
      title: { type: 'string', required: true },
      description: { type: 'string' },
      imageUrl: { type: 'url' },
      imagePosition: { type: 'enum', enumValues: ['left', 'right'], default: 'right' },
      buttonText: { type: 'string' },
      buttonUrl: { type: 'url' },
      stats: {
        type: 'array',
        description: 'Optional inline stats: Array of { id, value, label }',
        items: {
          id: { type: 'string', required: true },
          value: { type: 'string', required: true },
          label: { type: 'string', required: true },
        },
      },
    },
  },
  {
    type: 'blog-posts',
    label: 'Blog Posts',
    category: 'Components',
    description: 'Dynamic blog post listing (fetches from CMS)',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      postType: { type: 'string' },
      categorySlug: { type: 'string' },
      limit: { type: 'number', default: 3 },
      showExcerpt: { type: 'boolean', default: true },
      columns: { type: 'enum', enumValues: ['2', '3'], default: '3' },
    },
  },

  // ── eCommerce ─────────────────────────────────────────────────────────────
  {
    type: 'product-grid',
    label: 'Product Grid',
    category: 'eCommerce',
    description: 'Product listing grid (fetches from store)',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      categorySlug: { type: 'string' },
      sort: { type: 'enum', enumValues: ['newest', 'price_asc', 'price_desc', 'featured'], default: 'newest' },
      limit: { type: 'number' },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
      showPrice: { type: 'boolean', default: true },
      showDescription: { type: 'boolean', default: true },
      showCategory: { type: 'boolean', default: false },
      buttonText: { type: 'string' },
    },
  },
  {
    type: 'featured-products',
    label: 'Featured Products',
    category: 'eCommerce',
    description: 'Showcase featured products',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      limit: { type: 'number' },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
      layout: { type: 'enum', enumValues: ['grid', 'carousel'], default: 'grid' },
      showPrice: { type: 'boolean', default: true },
      showBadge: { type: 'boolean', default: true },
      badgeText: { type: 'string' },
      buttonText: { type: 'string' },
    },
  },
  {
    type: 'product-categories',
    label: 'Product Categories',
    category: 'eCommerce',
    description: 'Product category listing',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      columns: { type: 'enum', enumValues: ['2', '3', '4'], default: '3' },
      showProductCount: { type: 'boolean', default: true },
      showImage: { type: 'boolean', default: true },
      layout: { type: 'enum', enumValues: ['grid', 'list'], default: 'grid' },
    },
  },
  {
    type: 'shopping-cart',
    label: 'Shopping Cart',
    category: 'eCommerce',
    description: 'Shopping cart widget',
    properties: {
      variant: { type: 'enum', enumValues: ['full', 'mini', 'icon-only'], default: 'full' },
      showSubtotal: { type: 'boolean', default: true },
      checkoutButtonText: { type: 'string' },
      emptyCartMessage: { type: 'string' },
    },
  },
  {
    type: 'store-banner',
    label: 'Store Banner',
    category: 'eCommerce',
    description: 'Promotional banner with optional countdown',
    properties: {
      title: { type: 'string', required: true },
      subtitle: { type: 'string' },
      discountCode: { type: 'string' },
      buttonText: { type: 'string' },
      buttonUrl: { type: 'url' },
      backgroundImage: { type: 'url' },
      backgroundStyle: { type: 'enum', enumValues: ['gradient', 'solid', 'image'], default: 'gradient' },
      accentColor: { type: 'color' },
      countdownDate: { type: 'string', description: 'ISO date string for countdown timer' },
    },
  },
  {
    type: 'product-detail',
    label: 'Product Detail',
    category: 'eCommerce',
    description: 'Single product display page',
    properties: {
      productSlug: { type: 'string' },
      layout: { type: 'enum', enumValues: ['standard', 'compact', 'wide'], default: 'standard' },
      showGallery: { type: 'boolean', default: true },
      showDescription: { type: 'boolean', default: true },
      showVariants: { type: 'boolean', default: true },
      showAddToCart: { type: 'boolean', default: true },
      showBulkPricing: { type: 'boolean', default: true },
      showBreadcrumb: { type: 'boolean', default: true },
      showTags: { type: 'boolean', default: true },
    },
  },

  // ── Interactive ────────────────────────────────────────────────────────────
  {
    type: 'booking',
    label: 'Booking',
    category: 'Interactive',
    description: 'Embed a booking page so visitors can schedule appointments',
    properties: {
      slug: { type: 'string', required: true, description: 'Booking page slug' },
      title: { type: 'string', description: 'Optional heading above the booking form' },
      description: { type: 'string', description: 'Optional description text' },
      showPageTitle: { type: 'boolean', default: true, description: 'Show the booking page title inside the embed' },
      height: { type: 'string', default: '700px', description: 'Iframe height (e.g. 700px)' },
    },
    styledElements: ['title', 'description'],
  },
  {
    type: 'survey',
    label: 'Survey',
    category: 'Interactive',
    description: 'Embed a survey so visitors can submit responses',
    properties: {
      slug: { type: 'string', required: true, description: 'Survey slug' },
      title: { type: 'string', description: 'Optional heading above the survey' },
      description: { type: 'string', description: 'Optional description text' },
      showPageTitle: { type: 'boolean', default: true, description: 'Show the survey title inside the embed' },
      height: { type: 'string', default: '700px', description: 'Iframe height (e.g. 700px)' },
    },
    styledElements: ['title', 'description'],
  },

  // ── Email ──────────────────────────────────────────────────────────────────
  {
    type: 'social-links',
    label: 'Social Links',
    category: 'Email',
    description: 'Row of social media profile links',
    properties: {
      links: { type: 'array', required: true, description: 'Array of { platform, url } objects', items: { platform: { type: 'enum', enumValues: ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'] }, url: { type: 'url' } } },
      iconSize: { type: 'number', default: 32, description: 'Icon size in px (24, 32, or 40)' },
      alignment: { type: 'enum', enumValues: ['left', 'center', 'right'], default: 'center' },
    },
  },
  {
    type: 'email-header',
    label: 'Email Header',
    category: 'Email',
    description: 'Email header with logo and optional tagline',
    properties: {
      logoUrl: { type: 'image', description: 'Logo image URL' },
      logoWidth: { type: 'number', default: 150, description: 'Logo display width in px' },
      tagline: { type: 'string', description: 'Optional tagline text below logo' },
      alignment: { type: 'enum', enumValues: ['left', 'center', 'right'], default: 'center' },
    },
  },
  {
    type: 'email-footer',
    label: 'Email Footer',
    category: 'Email',
    description: 'Email footer with company info and unsubscribe link',
    properties: {
      companyName: { type: 'string', description: 'Company or brand name' },
      address: { type: 'string', description: 'Physical mailing address' },
      showUnsubscribe: { type: 'boolean', default: true, description: 'Show unsubscribe link' },
      showViewInBrowser: { type: 'boolean', default: false, description: 'Show view-in-browser link' },
      socialLinks: { type: 'array', description: 'Social links in footer', items: { platform: { type: 'string' }, url: { type: 'url' } } },
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get schemas for all built-in block types */
export function getBuiltInBlockSchemas(): BlockSchema[] {
  return BUILT_IN_SCHEMAS;
}

/** Convert a ComponentManifestEntry (from custom/plugin blocks) into a BlockSchema */
export function manifestToBlockSchema(manifest: ComponentManifestEntry): BlockSchema {
  const properties: Record<string, PropertySchema> = {};
  for (const input of manifest.inputs) {
    properties[input.name] = {
      type: (input.type === 'list' ? 'array' : input.type) as PropertySchema['type'],
      required: input.required,
      description: input.label,
      enumValues: input.enumOptions?.map((o) => o.value),
      default: input.defaultValue,
    };
  }
  return {
    type: manifest.type,
    label: manifest.label,
    category: manifest.category,
    description: manifest.description,
    properties,
  };
}

/** Get all block schemas: built-in + custom manifests */
export function getAllBlockSchemas(customManifests?: ComponentManifestEntry[]): BlockSchema[] {
  const schemas = [...BUILT_IN_SCHEMAS];
  if (customManifests) {
    for (const m of customManifests) {
      // Don't duplicate if a built-in already covers it
      if (!schemas.find((s) => s.type === m.type)) {
        schemas.push(manifestToBlockSchema(m));
      }
    }
  }
  return schemas;
}
