// Compact reference describing the visual editor's Block schema, exposed via
// the MCP server as a resource and embedded in tool descriptions so that AI
// clients can author valid `blocks` arrays for posts_create / posts_update.

export const BLOCKS_SCHEMA_REFERENCE = `# SimplerDevelopment Visual Editor — Block Schema

Pages are stored as a JSON-serialized \`BlockEditorData\`:

  { "blocks": Block[], "version": "1.0" }

Pass a \`blocks\` array directly to posts_create / posts_update and it will be
serialized correctly. Each Block has these common fields:

  {
    "id": string,           // unique within the page (e.g. "hero-1")
    "type": string,         // see types below
    "order": number,        // 0-based position within parent
    "label"?: string,
    "anchor"?: string,      // becomes a DOM id for jump links
    "style"?: BlockStyle    // optional CSS overrides
  }

## Block types

### text
Inline text or HTML. HTML strings are rendered with dangerouslySetInnerHTML.
  { id, type:"text", order, content: string,
    alignment?: "left"|"center"|"right",
    size?: "sm"|"base"|"lg"|"xl" }

### heading
  { id, type:"heading", order, content: string,
    level: 1|2|3|4|5|6,
    alignment?: "left"|"center"|"right" }

### image
  { id, type:"image", order, url, alt,
    caption?, width?: "full"|"large"|"medium"|"small",
    alignment?: "left"|"center"|"right" }

### button
  { id, type:"button", order, text, url,
    variant?: "primary"|"secondary"|"outline",
    size?: "sm"|"md"|"lg",
    icon?: string,            // Material Icon name (NOT emoji)
    iconPosition?: "left"|"right",
    openInNewTab?: boolean }

### spacer
  { id, type:"spacer", order, height: "sm"|"md"|"lg"|"xl" }

### divider
  { id, type:"divider", order, lineStyle?: "solid"|"dashed"|"dotted" }

### quote
  { id, type:"quote", order, content, author?, citation? }

### hero
Big top-of-page banner. Prefer this over a manual <section>.
  { id, type:"hero", order, title, subtitle?, description?,
    ctaText?, ctaLink?,
    secondaryCtaText?, secondaryCtaLink?,
    backgroundImage?, backgroundVideo? }

### hero-slideshow
  { id, type:"hero-slideshow", order,
    slides: [{ id, title, subtitle?, description?, ctaText?, ctaLink?,
               backgroundImage?, overlayColor?, overlayOpacity? }],
    autoplay?, interval?, transition?: "fade"|"slide"|"zoom",
    showDots?, showArrows?, height?: string,
    stats?: [{ id, value, label }] }

### cta
  { id, type:"cta", order, title, description?,
    primaryButtonText, primaryButtonUrl,
    secondaryButtonText?, secondaryButtonUrl?,
    backgroundStyle?: "gradient"|"solid"|"none" }

### stats
  { id, type:"stats", order, title?,
    stats: [{ id, value, label }],
    columns?: 2|3|4 }

### testimonial
  { id, type:"testimonial", order, quote, author,
    role?, company?, avatar? }

### services-grid
  { id, type:"services-grid", order, title?, description?,
    services: [{ id, title, description, icon?, link?, image? }],
    columns?: 2|3|4 }

### card-grid
  { id, type:"card-grid", order, title?, description?,
    cards: [{ id, title, description, image?, link?, icon? }],
    columns?: 2|3|4 }

### featured-content
Two-column section with image/text + optional stats.
  { id, type:"featured-content", order, title, description?,
    imageUrl?, imagePosition?: "left"|"right",
    buttonText?, buttonUrl?,
    stats?: [{ id, value, label }] }

### accordion
  { id, type:"accordion", order, title?,
    items: [{ id, title, content }] }

### tabs
  { id, type:"tabs", order,
    tabs: [{ id, label, blocks: Block[] }] }

### gallery
  { id, type:"gallery", order,
    images: [{ id, url, alt, caption? }],
    layout?: "grid"|"masonry", columns?: 2|3|4,
    lightbox?, gap?: "sm"|"md"|"lg" }

### marquee
  { id, type:"marquee", order,
    items: [{ id, type: "text"|"image"|"icon",
              content?, imageUrl?, imageAlt?, link? }],
    direction?: "left"|"right"|"up"|"down",
    speed?, pauseOnHover?, gap?, height? }

### columns
Layout primitive. Each column holds its own \`blocks\` array.
  { id, type:"columns", order,
    columns: [{ id, width: number,    // 50 means 50%
                blocks: Block[],
                backgroundColor?, padding?: "none"|"sm"|"md"|"lg",
                verticalAlign?: "top"|"center"|"bottom" }],
    gap?: "sm"|"md"|"lg",
    stackOnMobile?: boolean,
    reverseOnStack?: boolean }

### blog-posts
Auto-feed of posts.
  { id, type:"blog-posts", order, title?, description?,
    postType?, categorySlug?, limit?, showExcerpt?,
    columns?: 2|3 }

### video / youtube
  { id, type:"video", order, url, caption?, autoplay?, controls? }
  { id, type:"youtube", order, url, caption? }

### code
  { id, type:"code", order, code: string, language?: string }

## Authoring guidance

- Always prefer typed component blocks (hero, cta, stats, columns, etc.) over
  putting raw HTML inside a single \`text\` block — typed blocks are editable
  in the visual editor. A text block with HTML is a fallback only.
- IDs must be stable strings. Generate slugs like "hero-1", "stats-team", etc.
- For icons in buttons/services/cards, use **Material Icon names** (e.g.
  "arrow_forward", "rocket_launch") — never emojis.
- Order is 0-indexed and applies within each parent (page root, column,
  tab, etc.).

## Minimal example

A simple About page:

  [
    { "id": "hero-1", "type": "hero", "order": 0,
      "title": "About Us",
      "description": "We help brands grow.",
      "ctaText": "Get in touch", "ctaLink": "/contact" },
    { "id": "stats-1", "type": "stats", "order": 1,
      "title": "Our impact", "columns": 3,
      "stats": [
        { "id": "s1", "value": "12+", "label": "Years" },
        { "id": "s2", "value": "80+", "label": "Brands" },
        { "id": "s3", "value": "100%", "label": "Focus" }
      ] },
    { "id": "cta-1", "type": "cta", "order": 2,
      "title": "Ready to start?",
      "primaryButtonText": "Contact us",
      "primaryButtonUrl": "/contact",
      "backgroundStyle": "gradient" }
  ]
`;

export const BLOCKS_SCHEMA_TLDR = `Pages are stored as { blocks: Block[], version: "1.0" }. Prefer structured blocks (hero, cta, stats, columns, card-grid, services-grid, featured-content, testimonial, accordion, tabs, gallery, marquee, hero-slideshow, image, heading, text) over raw HTML. Each block has { id, type, order, ... }. Read the "blocks://schema" MCP resource for the full reference and a working example.`;
