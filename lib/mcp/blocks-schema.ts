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
    "style"?: BlockStyle,   // optional CSS overrides — see "Styling" below
    "elementStyles"?: { [elementName: string]: Partial<BlockStyle> }
                            // per-element styles for multi-part blocks
                            // (hero has: title, subtitle, description, cta, secondaryCta)
  }

## Styling (style / elementStyles)

\`style\` applies to the block's outer wrapper. Supported keys (strings unless
noted; use CSS values like "24px", "700", "-0.4px"):

  color, backgroundColor, backgroundGradient, backgroundImage,
  backgroundSize, backgroundPosition, backgroundRepeat,
  fontFamily, fontSize, fontWeight, lineHeight, letterSpacing,
  textAlign, textTransform, textDecoration,
  padding, margin, borderRadius, borderWidth, borderColor, borderStyle,
  (per-side variants: borderTop*, borderLeft*, etc.),
  width, height, minWidth, minHeight, maxWidth, maxHeight,
  display, flexDirection, justifyContent, alignItems, gap,
  position, top/right/bottom/left, zIndex,
  opacity, boxShadow, overflow, cursor,
  customCSS  // raw "key: value; key2: value2" string for anything else

\`elementStyles\` targets sub-parts of a block. A hero with a large bold title
and a uppercase-tracked subtitle:

  { "id": "hero-1", "type": "hero", "order": 0,
    "title": "Momentum, made measurable.",
    "subtitle": "Q3 2025 Partner Review",
    "description": "…",
    "ctaText": "Book a call", "ctaLink": "https://calendly.com/…",
    "elementStyles": {
      "subtitle": { "letterSpacing": "3px", "textTransform": "uppercase",
                    "fontSize": "12px", "fontWeight": "700" },
      "title":    { "fontSize": "64px", "fontWeight": "800",
                    "letterSpacing": "-0.5px", "lineHeight": "1.05" },
      "description": { "fontSize": "18px", "lineHeight": "1.55",
                       "maxWidth": "620px" }
    }
  }

## Block types

### text
Inline text or HTML. HTML strings are rendered with dangerouslySetInnerHTML.
  { id, type:"text", order, content: string,
    alignment?: "left"|"center"|"right",
    size?: "sm"|"base"|"lg"|"xl" }

Legacy shape \`{ heading?, body? }\` is still accepted — \`heading\` renders
as an \`<h2>\` above the body. Prefer explicit \`heading\` + \`text\` blocks
so each has its own \`style\` / \`elementStyles\`.

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
Big top-of-page banner. Prefer this over a manual <section>. A hero slide
with only a \`title\` will look sparse and broken. **Always fill in subtitle
(short eyebrow/kicker), description (1-2 sentences), and at least one CTA**
unless the user has told you not to. Use \`elementStyles\` to scale the type
hierarchy (see "Styling" above).
  { id, type:"hero", order, title, subtitle?, description?,
    ctaText?, ctaLink?,
    secondaryCtaText?, secondaryCtaLink?,
    backgroundImage?, backgroundVideo? }

Legacy aliases still accepted by the renderer (prefer canonical fields when
authoring new content): \`headline\` → title, \`eyebrow\` → subtitle,
\`subheadline\` → description. No CTA alias exists — if you want a button,
use \`ctaText\` + \`ctaLink\` (or compose a separate \`button\` block below
the hero).

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
Big numeric callouts. Legacy alias \`type:"stat-grid"\` is accepted.
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
    cards: [{ id, title, description, subtitle?, image?, link?, icon? }],
    columns?: 2|3|4 }

\`subtitle\` renders between title and description (useful for role/label
lines like "President & CEO" or "Level up your Slate instance"). Legacy
alias \`body\` is accepted for card description. Missing card ids are
backfilled.

### timeline
Vertical process / phase list with ghost numbers and a connecting rail.
  { id, type:"timeline", order, title?, subtitle?, overline?,
    steps: [{ id, title, description, number?, icon? }],
    layout?: "alternating"|"left",
    lineColor?, numberColor?, nodeColor? }

Legacy step shape \`{ label, body }\` is accepted (→ \`{ title, description }\`).
Missing step ids are backfilled.

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

### html-render
A custom-HTML block with optional ACF-style content management. The simplest
form is just \`{ html: "<raw markup/>" }\` — the markup renders verbatim.
The richer form attaches a **field schema** to the markup so authors can
edit named values in the right panel and inline in the iframe, without
touching the HTML.

  { id, type:"html-render", order,
    html: string,                       // template — see annotations below
    width?: "full"|"contained",
    fields?: HtmlRenderField[],         // schema (right-panel form layout)
    values?: Record<string, ScalarOrObjectOrArray>, // current values
    loop?: HtmlRenderLoop }             // optional dynamic-post repeater

**Three template annotations** turn raw HTML into editable fields:

  1. \`{{name}}\` — substituted as a string anywhere (attributes, text, css).
     HTML-escaped for safety. Dotted paths (\`{{cta.url}}\`) resolve against
     group / link / post values.

  2. \`<X data-field="name">…</X>\` — the element's INNER HTML becomes an
     editable richtext region. The element keeps its tag + attributes; only
     the inner content is replaced from \`values[name]\`. Authors can edit
     these inline by clicking in the iframe.

  3. \`<X data-repeat="name">…</X>\` — the element repeats once per item in
     \`values[name]\` (an array of records). Inside: \`{{name.subfield}}\` for
     attributes, \`data-field="subfield"\` for richtext sub-fields. Renders
     nothing if the array is empty.

  4. \`<X data-group="name">…</X>\` — like data-repeat but a SINGLE nested
     object (no repetition). Inside: \`{{name.subfield}}\` + \`data-field="subfield"\`.
     Useful for bundling related fields (testimonial = quote + author + role).

  5. \`<X data-loop="posts">…</X>\` — server-side repeater that pulls posts
     from this site (configured via the \`loop\` block property). Inside:
     \`{{post.title}}\`, \`{{post.url}}\`, \`{{post.coverImage}}\`,
     \`{{post.excerpt}}\`, \`{{post.publishedAt}}\`, \`{{post.values.X}}\` (pulls
     from the target post's html-render values). Items are NOT editable
     inline — the source of truth is the target post.

**HtmlRenderField** schema entry:

  { name: string,                       // matches the {{name}} / data-field
    label?: string,                     // human label in the panel form
    type: "text" | "textarea" | "number" | "richtext" | "boolean"
        | "url" | "image" | "color" | "select" | "radio"
        | "date" | "datetime" | "link" | "post"
        | "array" | "group" | "tab",
    options?: string[],                 // for select / radio
    default?: string,                   // fallback value
    help?: string,                      // instruction text under the label
    itemFields?: HtmlRenderField[],     // for array / group — sub-field schema
    min?: number, max?: number, step?: number,  // number input constraints

    // Validation (informational; surfaces inline in the panel):
    required?: boolean,
    minLength?: number, maxLength?: number,
    pattern?: string,                   // JS-regex source string
    errorMessage?: string,              // override the per-rule default

    // Conditional visibility — hides this field in the panel when condition
    // fails. Doesn't affect template rendering; storage stays intact.
    conditional?: {
      field: string,                    // sibling field name to test
      operator: "eq" | "neq" | "in" | "notIn" | "truthy" | "falsy",
      value?: string,                   // for in/notIn: pipe-delimited "a|b|c"
    },

    postType?: string,                  // for type="post" — restrict picker
  }

**Field types — value shapes:**

  text / textarea / url / color / select / radio / date / datetime — string
  number   — string ("42")
  boolean  — string ("true" / "false")
  richtext — string of HTML
  image    — string (image URL)
  link     — { url: string, label: string, target: "_self"|"_blank" }
  post     — string (post id) — server resolves to:
             { id, title, slug, url, excerpt, coverImage, publishedAt, postType }
  array    — Array<Record<string, string>> (each item per itemFields)
  group    — Record<string, string> (one record per itemFields)
  tab      — no value (purely organizational; splits the panel into tabs)

**HtmlRenderLoop** (only when \`data-loop="posts"\` is present in the html):

  { source: "posts",                    // only "posts" today
    postType: string,                   // CPT slug (e.g. "case-study")
    limit?: number,                     // max items, default 3, max 24
    orderBy?: "recent" | "oldest" | "title",
    exclude?: number[] }                // post ids to skip (current post auto)

#### Worked example — CTA card with link + image

  {
    id: "block-cta-1", type: "html-render", order: 0,
    html: \`
      <section class="card" style="background: {{accent}}">
        <img src="{{logo}}" alt="{{brand}}" />
        <h3 data-field="title">Headline</h3>
        <p data-field="body">Body</p>
        <a href="{{cta.url}}" target="{{cta.target}}">{{cta.label}}</a>
      </section>\`,
    fields: [
      { name: "logo",   type: "image",  label: "Logo" },
      { name: "brand",  type: "text",   label: "Brand", required: true },
      { name: "accent", type: "color",  label: "Accent color", default: "#004D80" },
      { name: "title",  type: "richtext", label: "Headline", required: true },
      { name: "body",   type: "richtext", label: "Body" },
      { name: "cta",    type: "link",   label: "Call to action" },
    ],
    values: {
      logo: "/uploads/logo.png",
      brand: "Acme",
      accent: "#5BA573",
      title: "Get started",
      body: "<p>The fastest way to <strong>ship</strong>.</p>",
      cta: { url: "/contact", label: "Talk to us", target: "_self" },
    },
  }

#### Worked example — repeater (stats)

  {
    id: "block-stats-1", type: "html-render", order: 1,
    html: \`
      <h2 data-field="heading">Heading</h2>
      <ul>
        <li data-repeat="stats">
          <span class="num" data-field="number">0</span>
          <span class="lbl" data-field="label">Label</span>
        </li>
      </ul>\`,
    fields: [
      { name: "heading", type: "richtext", label: "Heading", required: true },
      { name: "stats", type: "array", label: "Stats",
        itemFields: [
          { name: "number", type: "text", required: true },
          { name: "label",  type: "text", required: true },
        ] },
    ],
    values: {
      heading: "Our impact",
      stats: [
        { number: "$965K", label: "Raised" },
        { number: "2,600+", label: "Donors" },
      ],
    },
  }

#### Worked example — dynamic post loop (related case studies)

  {
    id: "block-related-1", type: "html-render", order: 2,
    html: \`
      <h2 data-field="heading">More case studies</h2>
      <div class="grid">
        <a data-loop="posts" href="{{post.url}}" class="card">
          <img src="{{post.values.universityLogoImage}}" alt="{{post.title}}" />
          <span class="title">{{post.title}}</span>
          <span class="stat">{{post.values.body}}</span>
        </a>
      </div>\`,
    fields: [
      { name: "heading", type: "richtext", label: "Section heading" },
    ],
    values: { heading: "More customer stories" },
    loop: { source: "posts", postType: "case-study", limit: 3, orderBy: "recent" },
  }

#### Worked example — group + tabs + conditional

  {
    id: "block-hero-1", type: "html-render", order: 0,
    html: \`
      <section data-group="hero">
        <h1 data-field="title">Title</h1>
        <p data-field="subtitle">Subtitle</p>
      </section>
      <a href="{{cta.url}}">{{cta.label}}</a>\`,
    fields: [
      { name: "tab_main", type: "tab", label: "Main" },
      { name: "hero",   type: "group", label: "Hero", help: "Title + subtitle bundle",
        itemFields: [
          { name: "title",    type: "richtext", required: true },
          { name: "subtitle", type: "richtext" },
        ] },
      { name: "tab_cta", type: "tab", label: "CTA" },
      { name: "showCta", type: "boolean", label: "Show CTA?", default: "true" },
      { name: "cta",     type: "link", label: "Button",
        conditional: { field: "showCta", operator: "eq", value: "true" } },
    ],
    values: {
      hero: { title: "Welcome", subtitle: "We do things." },
      showCta: "true",
      cta: { url: "/contact", label: "Get in touch", target: "_self" },
    },
  }

**Authoring rules:**

- Use \`{{name}}\` for attributes (\`href\`, \`src\`, \`style\`); use \`data-field\`
  for editable text/HTML regions. They're not interchangeable — \`data-field\`
  on an \`<img>\` is a no-op (img is void).
- Inside \`data-repeat\` and \`data-group\`: use \`{{groupName.subfield}}\` for
  attributes and \`data-field="subfield"\` for inner-HTML regions.
- Field \`name\` keys match the regex \`^[a-zA-Z_][a-zA-Z0-9_-]*$\`.
- Don't put two top-level \`data-loop\` regions in one block — server expansion
  resolves each independently but only one loop config per block is supported.
- For long-form prose, prefer ONE \`data-field="body"\` over many siblings —
  the richtext editor supports multi-paragraph content via \`<p>\` tags.

### html-embed
Iframe-sandboxed embed of an uploaded HTML file. Used for self-contained
WordPress/Webflow exports or third-party widgets that need their own
\`<style>\`/\`<script>\` scope. For inline HTML editable in the visual editor,
use \`html-render\` instead.

  { id, type:"html-embed", order,
    url: string,                        // /api/portal/media/... URL
    filename?: string,
    mediaId?: number,
    height?: string,                    // e.g. "600px" or "100vh"
    sandbox?: "strict"|"scripts"|"scripts-forms",
    iframeTitle?: string,
    caption?: string }

## Authoring guidance

- Always prefer typed component blocks (hero, cta, stats, columns, etc.) over
  putting raw HTML inside a single \`text\` block — typed blocks are editable
  in the visual editor. A text block with HTML is a fallback only.
- Every slide / page should use \`heading\` blocks with an explicit \`level\`
  (1 for the primary title, 2 for section headers). Don't simulate a heading
  by putting big text inside a \`text\` block — headings drive semantic CSS and
  inherit the theme's \`headingFont\`.
- For headline hierarchy beyond defaults, set \`style\` on the heading directly:
  \`{ color, fontSize, fontWeight: "700-900", letterSpacing: "-0.4px",
     lineHeight: "1.1" }\`. Pair a big heading with a small uppercase eyebrow
  (\`text\` block with \`letterSpacing: "3px"\`, \`textTransform: "uppercase"\`,
  \`fontSize: "11px"\`, \`fontWeight: "700"\`).
- IDs must be stable strings. Generate slugs like "hero-1", "stats-team", etc.
- For icons in buttons/services/cards, use **Material Icon names** (e.g.
  "arrow_forward", "rocket_launch") — never emojis.
- Order is 0-indexed and applies within each parent (page root, column,
  tab, etc.).

## Pitch-deck authoring

Pitch-deck slides are block pages wrapped in the deck's theme. Each slide
accepts:

  { id, label, blocks: Block[], notes?,
    pageSettings?: { backgroundColor?, backgroundImage?, backgroundVideo?,
                     backgroundSize?, backgroundPosition?, backgroundRepeat?,
                     backgroundOpacity? },
    customCss?: string    // raw CSS injected while this slide is on-screen
  }

The deck's \`theme.customCss\` is injected once for the whole deck. Scope
per-slide CSS with the \`[data-slide-id="your-slide-id"]\` selector so it
doesn't bleed.

Design guidance for visually polished slides:

- Center a max-width content column (e.g. \`customCss: '[data-slide-id="x"]
  .block-content { max-width: 680px; margin: 0 auto; }'\`).
- Open each slide with an uppercase eyebrow \`text\` block (11-12px, letter-
  spacing 3-4px), then a large \`heading\` (level 2, 32-48px, fontWeight 700-
  800), then a body \`text\` block (14-18px, lineHeight 1.55).
- For card grids, use a \`columns\` block with \`gap: 'md'\` holding \`section\`
  or nested blocks with their own \`style\` (backgroundColor, padding,
  borderRadius, boxShadow).
- Accent lines: a \`divider\` block + \`style.borderColor\` set to the accent
  color reads as a branded rule.

## Styled pitch-deck slide example

A multi-slide proposal that exercises hero + eyebrow/heading pattern + stats
+ card-grid (with subtitle) + timeline together. Every block type shown
below is rendered by the real frontend — no speculative shapes.

  [
    // SLIDE 1 — Cover (fully populated hero)
    {
      "id": "slide-cover", "label": "Cover",
      "blocks": [
        { "id": "hero-cover", "type": "hero", "order": 0,
          "title": "A New Way Forward with Slate",
          "subtitle": "A PROPOSAL FROM POST CAPTAIN",
          "description": "Built by former Slate Captains — your guide to everything Slate can be.",
          "ctaText": "Explore the proposal", "ctaLink": "#why",
          "elementStyles": {
            "subtitle": { "letterSpacing": "3px", "textTransform": "uppercase",
                          "fontSize": "12px", "fontWeight": "700" },
            "title":    { "fontSize": "64px", "fontWeight": "800",
                          "letterSpacing": "-0.5px", "lineHeight": "1.05" }
          }
        }
      ]
    },

    // SLIDE 2 — Proof (eyebrow + heading + stats)
    {
      "id": "slide-proof", "label": "Proof points",
      "customCss": "[data-slide-id='slide-proof'] .block-content { max-width: 960px; margin: 0 auto; }",
      "blocks": [
        { "id": "p-eyebrow", "type": "text", "order": 0,
          "content": "WHAT GOOD LOOKS LIKE",
          "style": { "color": "#004D80", "fontSize": "11px", "fontWeight": "700",
                     "letterSpacing": "3px", "textTransform": "uppercase",
                     "margin": "0 0 14px" } },
        { "id": "p-heading", "type": "heading", "order": 1, "level": 2,
          "content": "Proof points from institutions just like yours",
          "style": { "fontSize": "40px", "fontWeight": "800",
                     "letterSpacing": "-0.4px", "lineHeight": "1.15",
                     "margin": "0 0 12px" } },
        { "id": "p-sub", "type": "text", "order": 2,
          "content": "Every number below came from a real engagement.",
          "style": { "color": "#5a6b69", "fontSize": "16px",
                     "lineHeight": "1.6", "margin": "0 0 32px" } },
        { "id": "p-stats", "type": "stats", "order": 3, "columns": 4,
          "stats": [
            { "id": "s1", "value": "$965K+", "label": "Raised on one Giving Day portal" },
            { "id": "s2", "value": "83%",    "label": "Lift in readmit completions" },
            { "id": "s3", "value": "200+",   "label": "Advising notes centralized" },
            { "id": "s4", "value": "100+",   "label": "Institutions served" }
          ] }
      ]
    },

    // SLIDE 3 — Team (card-grid with subtitle role line)
    {
      "id": "slide-team", "label": "The team",
      "blocks": [
        { "id": "t-eyebrow", "type": "text", "order": 0,
          "content": "WHO WE ARE",
          "style": { "color": "#004D80", "fontSize": "11px", "fontWeight": "700",
                     "letterSpacing": "3px", "textTransform": "uppercase",
                     "margin": "0 0 14px" } },
        { "id": "t-heading", "type": "heading", "order": 1, "level": 2,
          "content": "Former Slate Captains, every seat at the table",
          "style": { "fontSize": "36px", "fontWeight": "800",
                     "letterSpacing": "-0.4px", "margin": "0 0 28px" } },
        { "id": "t-cards", "type": "card-grid", "order": 2, "columns": 3,
          "cards": [
            { "id": "c1", "title": "Jake Daly",
              "subtitle": "President & CEO",
              "description": "Slate Captain, Bowdoin College. Founded Post Captain in 2018." },
            { "id": "c2", "title": "Paula Schaefer-Riley",
              "subtitle": "Director, Slate Strategy",
              "description": "Slate Captain, Allegheny College. Former Technolutions PM." },
            { "id": "c3", "title": "Danielle Buczek",
              "subtitle": "Sr. Director, Enrollment Solutions",
              "description": "Slate Captain, Tufts & Brandeis." }
          ] }
      ]
    },

    // SLIDE 4 — Audit (timeline with numbered steps)
    {
      "id": "slide-audit", "label": "A concrete first step",
      "blocks": [
        { "id": "a-eyebrow", "type": "text", "order": 0,
          "content": "HOW WE START",
          "style": { "color": "#004D80", "fontSize": "11px", "fontWeight": "700",
                     "letterSpacing": "3px", "textTransform": "uppercase",
                     "margin": "0 0 14px" } },
        { "id": "a-heading", "type": "heading", "order": 1, "level": 2,
          "content": "A 4-week Slate audit",
          "style": { "fontSize": "36px", "fontWeight": "800",
                     "letterSpacing": "-0.4px", "margin": "0 0 12px" } },
        { "id": "a-body", "type": "text", "order": 2,
          "content": "Low commitment, high clarity. The deliverable is yours either way.",
          "style": { "color": "#5a6b69", "fontSize": "16px",
                     "lineHeight": "1.6", "margin": "0 0 24px" } },
        { "id": "a-timeline", "type": "timeline", "order": 3,
          "layout": "alternating",
          "steps": [
            { "id": "w1", "title": "Week 1 — Foundation",
              "description": "Align on stakeholders, success criteria, and scope." },
            { "id": "w2", "title": "Week 2 — Investigation",
              "description": "Deep-dive current config, data, and pain points." },
            { "id": "w3", "title": "Week 3 — Evaluation",
              "description": "Surface opportunities against best practice, calibrate to reality." },
            { "id": "w4", "title": "Week 4 — Presentation",
              "description": "Ratings report, prioritized plan, next-90-day strategy." }
          ] }
      ]
    }
  ]

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

export const BLOCKS_SCHEMA_TLDR = `Pages are stored as { blocks: Block[], version: "1.0" }. Prefer structured blocks (hero, cta, stats, columns, card-grid, timeline, services-grid, featured-content, testimonial, accordion, tabs, gallery, marquee, hero-slideshow, image, heading, text) over raw HTML. Each block has { id, type, order, style?, elementStyles?, ... }. Use heading blocks (not big text blocks) for titles; pair large headings with small uppercase eyebrow text blocks for branded feel. Hero blocks must be fully populated — canonical fields are title + subtitle + description + ctaText/ctaLink (legacy aliases: headline/eyebrow/subheadline still accepted). card-grid cards accept optional subtitle between title and description. timeline steps use { title, description } (legacy: label/body). stats also accepts type "stat-grid" as a legacy alias. Pitch-deck slides also support pageSettings and per-slide customCss. Read the "blocks://schema" MCP resource for the full reference, styled multi-slide example exercising hero + heading + eyebrow + stats + card-grid + timeline, and pitch-deck authoring guide.`;
