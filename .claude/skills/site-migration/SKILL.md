---
name: site-migration
description: "Migrate an existing external website into the SimplerDevelopment platform. Use this skill whenever the user wants to import, migrate, clone, recreate, or rebuild an existing site into SimplerDevelopment. Trigger on phrases like 'migrate site', 'import website', 'bring over their site', 'rebuild this site', 'clone this website', 'onboard a new client site', 'move site to our platform', or when given a URL and asked to create a SimplerDevelopment version of it. Also use when the user says 'new client site from [url]' or 'pull content from [domain]'."
---

# Site Migration Skill

Migrate an existing public website into the SimplerDevelopment platform with full content extraction, frontend redesign using the block editor, and portal client setup.

## HARD RULE: Blocks are universal, never client-specific

**Do not create client-prefixed blocks** (no `postcaptain-hero`, `cystrategies-stats`, etc.). Blocks ship to every client's editor — a client-specific block bloats the picker and creates technical debt. This is already present in the codebase (8 `palizzi-*` blocks) and must not be extended.

When mapping source-site sections to blocks, apply this decision tree:

1. **First pass: fit into existing blocks** by tuning `style`, `elementStyles`, `backgroundImage`, copy, and children. 80%+ of source sections should land here.
2. **Second pass: if the pattern is genuinely novel AND reusable across clients** (e.g. "bento grid with centered stat", "timeline with embedded quotes"), invoke the `simplerdev-block-type` skill to scaffold it universally. Name the block generically.
3. **Third pass: if the pattern is client-specific** (bespoke interactive widget, proprietary animation, one-off data visualization), **do NOT create a block.** Drop a placeholder `text` block with a TODO warning and bring it to the user's attention:

```json
{
  "id": "placeholder-<shortname>",
  "type": "text",
  "order": <N>,
  "content": "⚠ TODO: Client-specific component needed — '<description from source>'. Flagged for human review; do not ship without resolving.",
  "style": {
    "backgroundColor": "#FFF4E5",
    "color": "#7A4A00",
    "padding": "24px",
    "borderRadius": "8px",
    "borderWidth": "1px",
    "borderColor": "#F5C38B",
    "borderStyle": "solid"
  }
}
```

Options to present to the user: (a) extract a generalizable pattern and scaffold a universal block, (b) hand-code a custom React component imported directly into a specific page route (outside the block registry), (c) drop the section entirely.

See the `simplerdev-block-type` skill for the full decision tree and scaffolding procedure.

## Overview

This is a phased migration workflow:

1. **Discovery** — Crawl the sitemap, catalog all pages, identify content types
2. **Client Setup** — Create portal client + website record (or use existing)
3. **Content Extraction** — Pull page content and assets
4. **Color Map (MANDATORY)** — Section-by-section color/background analysis before building blocks
5. **Phase 1: Home Page** — Extract and rebuild the home page with blocks
6. **Phase 2: Marketing Pages** — Top-level pages (about, services, contact, etc.)
7. **Phase 3: Content Items** — Blog posts, products, portfolio items, etc.
8. **Branding** — Extract or generate a branding profile from the source site
9. **Automated QA: Lighthouse + Visual Review (MANDATORY)** — Score and screenshot every migrated page vs the source; emit reports the operator reviews before sign-off
10. **Visual QA (MANDATORY)** — Deep screenshot comparison of original vs migrated (interactive pass)

## Related skills

- **`simplerdev-block-type`** — invoke whenever a migration needs a new block type. Enforces the universal-block rule and integration-points checklist.
- **`simplerdev-visual-editor`** — use if the editor itself has issues while you're migrating (selection glitches, autosave scroll, drag bugs). Don't work around editor bugs in migration output.

## Step 1: Discovery

Before writing any code, crawl and catalog the source site.

### Fetch the Sitemap

```bash
curl -sL "https://example.com/sitemap.xml" | head -200
```

If no sitemap exists, try `/sitemap_index.xml`, `/sitemap.xml.gz`, or `/robots.txt` to find sitemap references. As a last resort, crawl the home page and extract internal links from the navigation.

Parse the sitemap to build a page inventory. Categorize each URL:

- **home** — the root `/` page
- **marketing** — top-level pages like `/about`, `/services`, `/contact`, `/pricing`, `/team`
- **blog** — posts under `/blog/*`, `/news/*`, `/articles/*`
- **product** — items under `/shop/*`, `/products/*`, `/store/*`
- **other** — portfolio, case studies, legal pages, etc.

Present the inventory to the user and confirm the migration scope before proceeding.

## Step 2: Client & Website Setup

### Determine Client Context

Ask the user:
- Is this for a **new client** or an **existing client**?
- If existing: which client? (search by company name or ID)

### Auto-Generated Email Convention

For new clients, always derive the email from the site domain:
- Strip the domain extension (e.g., `.co`, `.com`, `.io`) from the site name
- Use `{sitename}@simplerdevelopment.com` as the contact email
- Example: `cystrategies.co` → `cystrategies@simplerdevelopment.com`
- Example: `acmecorp.com` → `acmecorp@simplerdevelopment.com`

Do NOT ask the user for contact email — always use this convention.

### Create New Client (if needed)

Use the database directly via a tsx script. Read `scripts/seed-portal-client.ts` as the reference pattern:

```typescript
// Pattern: create user + client + clientMembers
import { db } from './lib/db';
import { users, clients, clientMembers } from './lib/db/schema';
import { hash } from 'bcryptjs';

const hashedPassword = await hash(tempPassword, 10);
const [user] = await db.insert(users).values({
  name, email, password: hashedPassword, role: 'client', active: true,
}).returning();
const [client] = await db.insert(clients).values({
  userId: user.id, company, phone, website: sourceUrl,
}).returning();
await db.insert(clientMembers).values({
  clientId: client.id, userId: user.id, role: 'owner',
});
```

### Create Website Record

Use the CMS websites API pattern. Read `app/api/portal/cms/websites/route.ts` and `lib/subdomain.ts`:

```typescript
import { clientWebsites } from './lib/db/schema';
import { generateUniqueSubdomain } from './lib/subdomain';

const subdomain = await generateUniqueSubdomain(companyName, siteName);
const [website] = await db.insert(clientWebsites).values({
  clientId: client.id,
  name: siteName,
  domain: null, // set later when domain is configured
  subdomain,
  vercelDomain: `${subdomain}.simplerdevelopment.com`,
  deploymentStatus: 'active',
  active: true,
}).returning();
```

## Step 3: Content & Asset Extraction

Build reusable extraction scripts under `scripts/migrations/` for the specific site. These scripts should be idempotent (safe to re-run).

### Asset Pulling

When extracting content, also pull all visual assets from the source site. This is critical for design fidelity.

**What to extract:**
- Hero/background images (CSS `background-image` URLs, `<img>` tags in hero sections)
- Logo files (SVG, PNG)
- Featured images on blog posts
- Team/staff headshots
- Product images
- Icons (SVG sprites, custom icon assets)
- Background patterns/textures
- Video backgrounds (`<video>` sources, poster images)

**How to find assets:**
- Use WebFetch to analyze the page and list ALL image/video URLs
- Check CDN URLs (e.g., `cdn.builder.io`, `wp-content/uploads`, Cloudinary, imgix)
- Check CSS for `background-image` URLs
- Check `<source>` tags inside `<video>` elements
- Check `<picture>` / `<source>` for responsive image sets

**Asset usage in blocks:**
- For hero backgrounds: use `backgroundImage` property on `hero` blocks
- For section backgrounds: use `backgroundImage` on `section` blocks  
- For inline images: use `image` blocks with the direct source URL
- For card images: use the `image` property on card items in `card-grid`
- For testimonial avatars: use the `avatar` property

**For the initial migration, reference external URLs directly** — the source CDN will continue serving them. For a full asset migration later, download each file and re-upload via the media API (`POST /api/portal/cms/websites/[siteId]/media/upload`).

### Page Content Extractor

For each page URL, fetch the HTML and extract structured content:

```typescript
// scripts/migrations/<site-slug>/extract-page.ts
// Fetches a URL, strips nav/footer/scripts, extracts:
// - Page title (from <title> or <h1>)
// - Meta description
// - OG image
// - Main content sections (headings, paragraphs, images, lists)
// - Call-to-action buttons
// - ALL image URLs (hero, inline, background)
// - ALL video URLs
// Output: JSON with structured content + asset URLs ready for block conversion
```

Key extraction approach:
- Use `fetch()` to get the HTML
- Parse with a lightweight approach (regex for structure, or use `cheerio` if available)
- Strip `<nav>`, `<footer>`, `<script>`, `<style>`, cookie banners, chat widgets
- Extract content from `<main>`, `<article>`, or the primary content container
- Preserve heading hierarchy (h1, h2, h3) as block boundaries
- Extract images with their alt text and src URLs — resolve relative URLs to absolute
- Extract CSS background-image URLs from inline styles
- Identify stat/metric sections, testimonials, card grids, CTAs

### Blog/Content Extractor

For blog posts and content items:

```typescript
// scripts/migrations/<site-slug>/extract-posts.ts
// For each blog URL from the sitemap:
// - Extract title, date, author, categories/tags
// - Extract featured image
// - Extract body content
// - Extract meta description for SEO
// Output: Array of post objects ready for CMS import
```

## Step 3.5: Section-by-Section Color Map (MANDATORY)

Before building ANY blocks, you MUST create a color map of the source home page. This is the single most important step for visual fidelity.

### How to Build the Color Map

**IMPORTANT: WebFetch CSS analysis is unreliable for determining actual rendered colors.**
Sites often define dark CSS variables but only apply them to 1-2 sections. WebFetch may report
the site as "95% dark" when it's actually 80% white. Always verify with computed styles.

#### Step 1: WebFetch initial analysis

Use WebFetch to get a first pass, but treat the result as UNVERIFIED:

```
Analyze the VISUAL APPEARANCE of each section on this page from top to bottom.
For EACH section, tell me:
1. Section name/purpose (hero, features, stats, testimonials, CTA, footer, etc.)
2. Is the background LIGHT or DARK?
3. What creates the background — a solid color, an image, a gradient, or a pattern?
4. If there's a background image, what does it look like? (dark photo, light texture, etc.)
5. What color is the main heading text in this section?
6. What color are the body/description texts?
7. What color are the CTA buttons in this section?
8. Are there any accent colors visible (borders, icons, decorative elements)?

CRITICAL: Do NOT assume sections are dark just because they have a dark CSS variable defined.
Many sites define dark colors in CSS but use them sparingly. Look at what is ACTUALLY RENDERED.
Most corporate/healthcare/SaaS sites are predominantly LIGHT (80%+ white/off-white sections).
```

#### Step 2: MANDATORY — Verify with computed styles (browser automation)

Navigate to the site in a browser (chrome-devtools or playwright) and run this script to get
the ACTUAL rendered background colors. This overrides whatever WebFetch reported:

```javascript
// Run via evaluate_script / browser_eval after navigating to the site
() => {
  const body = document.body;
  const allEls = body.querySelectorAll('*');
  const results = [];
  const seen = new Set();
  allEls.forEach(el => {
    const bg = getComputedStyle(el).backgroundColor;
    const rect = el.getBoundingClientRect();
    if (rect.height > 100 && rect.width > 400 && bg !== 'rgba(0, 0, 0, 0)' && !seen.has(Math.round(rect.top))) {
      seen.add(Math.round(rect.top));
      results.push({ tag: el.tagName, id: el.id, bg, top: Math.round(rect.top), height: Math.round(rect.height) });
    }
  });
  return results.sort((a,b) => a.top - b.top).slice(0, 20);
}
```

If this script returns only 1-2 elements with non-transparent backgrounds, the site is
**predominantly white/light with CSS-applied body background**. If it returns many elements
with `rgb(26, 22, 41)` etc., it's genuinely dark. **Trust the computed styles, not WebFetch.**

### Build a Written Color Map

Before writing any block code, write out a section map like this:

```
Section Map:
1. Hero: LIGHT bg (#ffffff), bg-image: light_hero.png, dark text (#14111f)
2. Client logos: WHITE bg, muted text
3. Features: DARK bg, bg-image: dark-features.jpg, white text, teal accents
4. Stats: LIGHT bg (#f6f6fc), dark text, purple stat values
5. Testimonials: LIGHT bg, bg-image: light_testi.png, dark text
6. CTA: DARK bg (#14111f), white text, teal accent button
```

### Common Pitfalls to Avoid

- **Over-darkening**: Don't make sections dark unless the original clearly is. When in doubt, use light.
- **Purple gradient CTAs**: Do NOT default to `linear-gradient(135deg, #primary, #lighter)` for CTA sections. Most sites use solid dark or solid primary backgrounds for CTAs. Match the original.
- **Wrong hero background**: Heroes are often white/light with a subtle background image, NOT dark. Check the actual rendered appearance.
- **Background images define the color feel**: A section with `backgroundColor: #14111f` but `backgroundImage: teal-pattern.jpg` will look TEAL, not navy. The image overrides the perceived color.

## Step 4: Phase 1 — Home Page

The home page gets the most attention. This is a full redesign using the block editor. Design quality is paramount — these must look like professionally designed pages, not generic templates.

### Design Quality Standards

These migrations should produce websites that look **expensive, refined, and distinctive** — not generic templates. The goal is a site that looks like a $30K+ custom build.

### The `customCSS` Escape Hatch

Every block supports a `customCSS` property in both `style` and `elementStyles` — a raw CSS string that gets parsed into inline styles. This is the key to premium design. Use it for:

```
text-shadow: 0 2px 20px rgba(0,0,0,0.4)           // Depth on hero text
box-shadow: 0 20px 60px rgba(23,33,54,0.12)        // Elegant image shadows  
backdrop-filter: blur(4px)                          // Glass morphism on buttons
background-blend-mode: overlay                      // Photo+color blending
text-transform: uppercase                           // Refined labels
transition: all 0.3s ease                           // Micro-interactions
background-image: radial-gradient(...)              // Subtle glows behind stats
filter: drop-shadow(0 0 30px rgba(43,212,161,0.2)) // Ambient glow on accents
```

### Design Principles

1. **Brand fidelity** — Extract their actual colors, fonts, and visual language. Use WebFetch to study the live site deeply. Get the EXACT hex codes from CSS, not approximations.

2. **Overline + Title + Subtitle pattern** — Premium sites use a 3-tier heading hierarchy:
   - Small uppercase overline (accent color, 0.6875rem, letter-spacing: 0.3em)
   - Large display title (serif font, 2.5-2.75rem)
   - Body description (muted color, 1.0625rem, generous line-height)

3. **Decorative dividers** — Use gradient-fade dividers between sections: `<div style="width:60px;height:2px;background:linear-gradient(to right,transparent,#color,transparent);margin:0 auto"></div>` via text blocks with HTML.

4. **Depth through shadows** — Use `customCSS: 'box-shadow: 0 20px 60px rgba(0,0,0,0.12)'` on images and cards. Subtle shadows create perceived quality.

5. **Ambient glows** — On dark sections, add radial gradient glows behind accent elements: `background-image: radial-gradient(ellipse at 50% 0%, rgba(color,0.08) 0%, transparent 60%)` on sections.

6. **Glass morphism buttons** — Secondary buttons: `backdrop-filter: blur(4px); background: rgba(255,255,255,0.08)` for a frosted glass look.

7. **Color opacity layers** — Don't use flat colors. Layer with opacity:
   - Primary text: full color
   - Secondary text: 0.7 opacity
   - Tertiary text: 0.5 opacity
   - Decorative elements: 0.1-0.2 opacity of accent colors

8. **Icon containers** — Instead of raw icons, put them in styled containers: `<span style="display:inline-flex;width:48px;height:48px;border-radius:12px;background:rgba(color,0.1);align-items:center;justify-content:center">` via text blocks.

9. **Generous spacing** — 90-120px section padding, 56px between heading groups and content, 36px between cards. White space signals quality.

10. **Pill buttons** — Use 28px border-radius, 15px 40px padding, uppercase text, letter-spacing, and box-shadow for CTAs that feel high-end.

### Block Composition Patterns

**Hero (premium):**
- `hero` block with `backgroundImage` from the source site
- `elementStyles.subtitle`: accent color, 0.35em letter-spacing, uppercase, text-shadow
- `elementStyles.title`: display font, 4.25rem, -0.015em letter-spacing, text-shadow
- `elementStyles.cta`: pill shape, box-shadow glow, uppercase
- `elementStyles.secondaryCta`: glass morphism (backdrop-filter + semi-transparent bg)
- Set `minHeight: '92vh'` via `style` for full viewport impact

**Section containers:**
- Wrap block groups in `section` → controls full-bleed background + maxWidth for content
- Use overline text → heading → subtitle → content pattern inside sections where the original uses it
- **Match the original site's section background sequence exactly** — refer to the Section Color Map. Do NOT impose a generic alternating pattern. If the original has 5 light sections and 1 dark section, do the same.

**Split layouts:**
- `section` → `columns` → left (text content + button) + right (image with box-shadow)
- Use `verticalAlign: 'center'` on both columns
- Add a decorative divider between title and body text

**Stats on dark:**
- Use `section` with dark bg + `columns` with individual stat blocks (heading for value + text for label)
- Add radial gradient glow via section's `style.customCSS`
- Stat values: display font, accent color, text-shadow glow

**Testimonial:**
- Nest in `section` with distinct background (mint or dark)
- Add gradient-fade divider lines above and below
- Quote in italic display font, author in bold with accent color

**Card grids:**
- Set card background, 20px border-radius, 36px padding, subtle border + shadow
- Title in display font, icon in accent with opacity container
- Add `transition: all 0.3s ease` via cardStyle customCSS

### Block Renderer Constraints (CRITICAL)

These are hard constraints of the rendering system. Violating them produces broken output.

#### 1. Card images render as full-width photos — use Material Icons for service icons

The `Card.tsx` component renders `image` with `w-full h-48 object-cover` (Tailwind classes).
This means card images are ALWAYS displayed as full-width, 192px-tall photo cards.
The `imageStyle` elementStyle IS applied as inline style, but Tailwind's `h-48` still forces
192px height, creating tall thin strips when the source image is a small icon.

**Rule:** For service/feature cards with icon-like images, use the `icon` property with
Material Icon names instead of `image`. Only use `image` for actual photo cards (team, portfolio, etc.).

Material Icon mapping examples:
- Audits/Assessment → `fact_check`, `search`, `analytics`
- Strategy/Planning → `route`, `architecture`, `map`
- Funnel/Conversion → `filter_alt`, `trending_up`
- Campaigns/Marketing → `campaign`, `ads_click`
- Brand/Design → `palette`, `loyalty`, `branding_watermark`
- Technology/Tools → `settings_suggest`, `build`, `integration_instructions`
- Support/Help → `support_agent`, `help_center`
- Security → `security`, `shield`, `lock`

#### 2. `block.style` wraps the block — it does NOT style the block's inner elements

`BlockStyleWrapper` applies `block.style` to a WRAPPER `<div>` around the block component.
This means:
- `block.style.padding` adds padding to the wrapper, not the button/card/etc.
- `block.style.borderRadius` rounds the wrapper div, not the inner element
- `block.style.fontFamily` sets font on the wrapper (may not cascade into all children)

**Rule:** For buttons, do NOT put visual styling (borderRadius, padding, fontFamily) in
`block.style`. Instead, rely on the branding-level button styles set in `siteBranding.buttonStyle`.
Use `block.style` only for layout concerns (margin for spacing).

For cards, use `elementStyles` (card, cardTitle, cardDescription, cardIcon, cardImage) which
ARE applied directly to the inner elements via the `Card` component.

#### 3. Button appearance comes from branding, not block.style

`ButtonBlockRender` applies styles from `useBranding().buttonStyle`:
- `primaryBg`, `primaryText`, `primaryHoverBg` for variant='primary'
- `secondaryBg`, `secondaryText` for variant='secondary'
- `borderRadius` from buttonStyle or global branding

**Rule:** Set button appearance via `siteBranding.buttonStyle` during branding import.
On individual button blocks, set `variant`, `size`, `alignment`, `openInNewTab`, plus:

- `icon` — Material Icon name (e.g., `'arrow_forward'`, `'calendar_today'`, `'open_in_new'`)
- `iconPosition` — `'left'` (default) or `'right'`
- `hoverEffect` — one of: `'none'`, `'lift'`, `'glow'`, `'fill'`, `'slide'`, `'pulse'`

Use `block.style.margin` for spacing between buttons and surrounding content.

**Button icon + hover effect patterns for migrations:**

| CTA Type | Icon | Position | Hover | Example |
|----------|------|----------|-------|---------|
| Primary CTA | `arrow_forward` | right | `lift` | "Schedule time to chat" |
| Secondary CTA | `check_circle` | left | `lift` | "Let's get started" |
| External link | `open_in_new` | right | `fill` | "Connect on LinkedIn" |
| Calendar/booking | `calendar_today` | left | `slide` | "Schedule a call" |
| Dark section CTA | `arrow_forward` | right | `glow` | "Take the leap" |
| Download | `download` | left | `pulse` | "Get the guide" |

#### 4. Section container model — understand padding/maxWidth stacking

The rendering pipeline for sections is:

```
<section style="backgroundColor; padding: pT pR pB pL">     ← full-width, colored bg
  <div style="maxWidth; margin: 0 auto">                    ← constrains content width
    <div>                                                    ← per-block wrapper
      <BlockStyleWrapper>                                    ← applies block.style
        <ActualBlockRenderer />
      </BlockStyleWrapper>
    </div>
  </div>
</section>
```

Key rules:
- `paddingLeft`/`paddingRight` on the section go on the OUTER full-width element (prevents
  content touching edges on mobile). **Always set these to at least `'24px'`**.
- `maxWidth` on the section constrains the INNER content div. Use `'1080px'` for standard
  content width (matches site nav `max-w-6xl`), `'680px'` for narrow text sections.
- Non-section blocks get auto-wrapped in `max-w-7xl mx-auto px-4` by BlockRenderer —
  but section blocks do NOT. You must handle padding yourself.
- `CardGridBlockRender` adds its own `py-16` (64px vertical padding). Account for this
  by reducing the parent section's `paddingBottom` to avoid double-spacing.

**Standard section template:**
```json
{
  "type": "section",
  "backgroundColor": "#FFFFFF",
  "paddingTop": "64px",
  "paddingBottom": "64px",
  "paddingLeft": "24px",
  "paddingRight": "24px",
  "maxWidth": "1080px"
}
```

### Process

1. Use WebFetch to extract the source home page — get sections, copy, stats, testimonials, CTAs, colors, fonts
2. **Build the Section Color Map** (Step 3.5) — determine each section's actual background before writing any blocks
3. Map each section to blocks using the composition patterns above, **matching the original section backgrounds exactly**
4. Apply the brand's actual colors and fonts throughout via `style` and `elementStyles`
5. **For CTA sections**: match the original CTA style — do NOT default to purple/primary gradient unless the original actually uses one
6. Build as a post with `postType: 'page'`, `slug: 'home'`
7. The `content` field stores `{ blocks, version: '1.0' }` (BlockEditorData format)
8. **Run Visual QA** (Step 10) — screenshot original vs migrated, fix discrepancies before marketing pages

### Creating the Page

```typescript
import { posts } from './lib/db/schema';

const [page] = await db.insert(posts).values({
  title: 'Home',
  slug: 'home',
  postType: 'page',
  content: JSON.stringify({ blocks, version: '1.0' }), // BlockEditorData format
  published: false, // Start as draft for review
  websiteId: website.id,
  seoTitle: extractedSeoTitle,
  seoDescription: extractedMetaDesc,
  ogImage: extractedOgImage,
}).returning();
```

### Block Structure Reference

Every block needs: `id` (unique string), `type`, `order` (sequential integer).

Common block patterns for home pages — read `types/blocks.ts` for the full type definitions:

```json
[
  { "id": "hero-1", "type": "hero", "order": 1, "title": "...", "subtitle": "...", "ctaText": "...", "ctaLink": "..." },
  { "id": "features-1", "type": "card-grid", "order": 2, "title": "Our Services", "columns": 3, "cards": [...] },
  { "id": "stats-1", "type": "stats", "order": 3, "stats": [{ "id": "s1", "value": "500+", "label": "Clients" }] },
  { "id": "testimonial-1", "type": "testimonial", "order": 4, "quote": "...", "author": "...", "company": "..." },
  { "id": "cta-1", "type": "cta", "order": 5, "title": "Ready to get started?", "primaryButtonText": "Contact Us" }
]
```

## Step 5: Phase 2 — Marketing Pages

Process each marketing page (about, services, contact, pricing, team, etc.):

1. Extract content from each URL
2. Map to appropriate blocks
3. Create as posts with `postType: 'page'` and the appropriate slug
4. Use AI to enhance and rewrite the content if requested

### Navigation Setup

After creating marketing pages, set up the site navigation. The `siteNavigation` table lives in the appropriate domain module under `lib/db/schema/` — grep for it there:

```typescript
import { siteNavigation } from './lib/db/schema';

// Create nav items for each marketing page
for (const page of marketingPages) {
  await db.insert(siteNavigation).values({
    websiteId: website.id,
    label: page.navLabel,
    url: `/${page.slug}`,
    sortOrder: page.order,
    visible: true,
  });
}
```

## Step 6: Phase 3 — Content Items

### Blog Posts

For each blog post URL:
1. Extract title, body, date, author, featured image, categories, tags
2. Create categories and tags first (deduplicated)
3. Create posts with `postType: 'blog'`
4. Link to categories and tags via `postCategories` and `postTags` tables

```typescript
import { posts, categories, tags, postCategories, postTags } from './lib/db/schema';

// Create categories (deduplicated)
for (const catName of uniqueCategories) {
  await db.insert(categories).values({
    name: catName,
    slug: slugify(catName),
    websiteId: website.id,
  }).onConflictDoNothing();
}

// Create each blog post
for (const post of extractedPosts) {
  const [created] = await db.insert(posts).values({
    title: post.title,
    slug: post.slug,
    postType: 'blog',
    content: post.content, // Can be HTML/markdown or block JSON
    excerpt: post.excerpt,
    coverImage: post.featuredImage,
    published: false,
    websiteId: website.id,
    seoTitle: post.seoTitle,
    seoDescription: post.metaDescription,
  }).returning();
  // Link categories and tags...
}
```

### Products (if e-commerce site)

For product pages, use the products table. Read the schema for `products`, `productImages`, `productCategories`, `productVariants`.

### Custom Content Types

If the source site has content types beyond blog/product (portfolio, team members, case studies), create custom `postTypes` first:

```typescript
import { postTypes } from './lib/db/schema';

await db.insert(postTypes).values({
  name: 'Case Study',
  slug: 'case-study',
  description: 'Client case studies and success stories',
  icon: 'work',
  websiteId: website.id,
});
```

## Step 7: Branding Extraction

Extract visual branding from the source site and create a branding profile with logos. This step is critical — get the colors, fonts, AND logos right.

### Logo Discovery

Find logos using these techniques (check all of them, in order of reliability):

1. **og:image meta tag** — often IS the logo:
   ```bash
   curl -sL "https://example.com" | grep -oi 'og:image[^>]*content="[^"]*"'
   ```

2. **Favicon and apple-touch-icon** — gives you the square/icon variant:
   ```bash
   curl -sL "https://example.com" | grep -oi '<link[^>]*rel="[^"]*icon[^"]*"[^>]*>'
   ```

3. **Image tags with "logo" in src, alt, class, or id**:
   ```bash
   curl -sL "https://example.com" | grep -oi 'src="[^"]*logo[^"]*"'
   ```

4. **Company name in image filenames** (e.g., `CAQ_final_logos.png`):
   ```bash
   curl -sL "https://example.com" | grep -oi 'src="[^"]*COMPANYNAME[^"]*\.\(png\|svg\|jpg\)"'
   ```

5. **WordPress uploads** — check for logos in `/wp-content/uploads/`:
   ```bash
   curl -sL "https://example.com" | grep -o 'https://[^"]*wp-content/uploads[^"]*logo[^"]*'
   ```

### Populate ALL logo fields in the branding profile:

```typescript
const [profile] = await db.insert(brandingProfiles).values({
  clientId: client.id,
  name: `${companyName} Brand`,
  isDefault: true,
  // Colors
  primaryColor: extractedPrimary,
  secondaryColor: extractedSecondary,
  accentColor: extractedAccent,
  backgroundColor: extractedBg,       // Usually #FFFFFF for light sites
  textColor: extractedText,
  // Fonts
  headingFont: extractedHeadingFont,   // From Google Fonts link or CSS
  bodyFont: extractedBodyFont,
  // Logos — fill ALL of these
  logoUrl: ogImageUrl || mainLogoUrl,           // Primary logo (rect)
  logoRectUrl: mainLogoUrl,                     // Horizontal/rectangular logo
  logoSquareUrl: faviconUrl || appleTouchIcon,  // Square icon version
  logoIconUrl: faviconUrl,                      // Small icon version
  logoAlt: companyName,
  logoText: shortName,                          // Text fallback (e.g., "CAQ")
  faviconUrl: faviconUrl,
  ogImageUrl: ogImageUrl,
  // Style
  borderRadius: extractedBorderRadius,  // Check button styles on the site
  // Buttons
  buttonStyle: { ... },
}).returning();
```

### Color Extraction

Use WebFetch to analyze the page and extract actual CSS colors. Key things to look for:
- **Is the site light or dark?** Most sites are light (white/off-white background). Don't default to dark navy.
- Check the `background-color` on `body`, `main`, and major sections
- Check `color` on `h1`, `p`, and `a` tags
- Check button colors for the primary brand color
- Check accent/highlight colors used on badges, links, hover states
- Look for CSS custom properties (`--primary-color`, etc.)

**CRITICAL COLOR RULES:**
1. **CSS variables lie about rendered appearance.** A site may define `--color-main: #14111f` but only use it on 2 sections. The Section Color Map (Step 3.5) tells you what's ACTUALLY rendered.
2. **Background images override perceived color.** A section with `bg: #000` + `bg-image: teal-pattern.jpg` looks TEAL, not black. Always note the background images.
3. **The accent color is often more prominent than the primary.** If a site's CSS says primary is purple but the visual design is dominated by teal icons and borders, the accent IS the dominant brand color for design purposes.
4. **CTA sections rarely use gradients.** Most professional sites use solid dark or solid primary backgrounds for CTAs. Only use a gradient if the original site actually has one.

### Create messaging

Also create messaging from the extracted content — company name, tagline, value proposition, etc. Use the `brandingMessaging` table.

```typescript
await db.insert(brandingMessaging).values({
  clientId: client.id,
  brandingProfileId: profile.id,
  companyName: extractedName,
  tagline: extractedTagline,
  // ... other messaging fields
});
```

## Migration Script Organization

Place all migration scripts under:
```
scripts/migrations/<site-slug>/
├── discover.ts          — Fetch sitemap, catalog pages
├── extract-pages.ts     — Extract content from all pages
├── extract-posts.ts     — Extract blog posts
├── extract-products.ts  — Extract products (if applicable)
├── setup-client.ts      — Create client + website
├── import-home.ts       — Build and import home page
├── import-marketing.ts  — Import marketing pages + nav
├── import-content.ts    — Import blog posts, products, etc.
├── import-branding.ts   — Extract and create branding profile
└── run-all.ts           — Orchestrate full migration
```

Each script should:
- Be runnable independently with `npx tsx scripts/migrations/<site-slug>/<script>.ts`
- Output progress to console
- Be idempotent (check for existing records before inserting)
- Save extracted data to JSON files for debugging/re-use

## Key Files to Read

Before implementing, read these files for the exact patterns and types:

| What | Path |
|------|------|
| DB schema (all tables) | `lib/db/schema/` (per-domain modules; barrel: `lib/db/schema/index.ts`) |
| Block type definitions | `types/blocks.ts` |
| Website creation API | `app/api/portal/cms/websites/route.ts` |
| Post creation API | `app/api/portal/cms/websites/[siteId]/posts/route.ts` |
| Subdomain generation | `lib/subdomain.ts` |
| Branding helpers | `lib/branding.ts` |
| Seed client example | `scripts/seed-portal-client.ts` |
| Site rendering | `app/sites/[domain]/[[...slug]]/page.tsx` |
| Block renderer | `components/blocks/render/SiteBlockRenderer` |
| AI theme generator | `app/api/portal/branding/generate-theme/route.ts` |
| AI messaging generator | `app/api/portal/branding/generate-messaging/route.ts` |

## Step 8: Review & Validation

After importing pages, run a review pass to catch and fix issues. This is a critical quality step.

### Editor Compatibility Checks

1. **Editor/preview parity for sections** — The visual editor now renders section blocks with their
   full section-specific props (`backgroundColor`, `paddingTop/Bottom/Left/Right`, `maxWidth`,
   `backgroundImage`, `color`). This was fixed in `EditableBlockRenderer.tsx` — previously the
   editor only applied `block.style` via `BlockStyleWrapper`, ignoring section-level props entirely.
   If the editor and preview ever look different, check that the editor's `ContainerBlockRenderer`
   applies the same props as `SectionBlockRender`.

2. **No raw HTML in text blocks** — The editor uses ContentEditable for text blocks. Raw HTML (like `<span style="...">`) renders in production but becomes uneditable in the editor. Instead of HTML icon containers in text blocks, use proper block types:
   - For icons: use `card-grid` with single card + icon, or use a `heading` block with the icon name
   - For decorative dividers: use the `divider` block type, not HTML `<div>` hacks
   - For styled labels: use a `text` block with `style` and `elementStyles`, not inline HTML

2. **Verify block labels in Layers panel** — Each block should have a recognizable label. The Layers panel shows:
   - text blocks: first 30 chars of content (HTML stripped)
   - heading blocks: the content text
   - section blocks: "Section (N)" with child count
   - columns: "Columns (N)"
   Set meaningful `label` property on blocks when the auto-label would be unclear.

3. **Test in the editor** — After importing, open each key page in the editor and verify:
   - All blocks appear in the Layers panel
   - Blocks can be selected and their properties edited in the sidebar
   - Nested blocks inside sections and columns are accessible
   - Text content is editable (not locked behind HTML)

### Color & Dark/Light Mode Rules

The block editor does NOT apply the BrandingProvider (CSS variables like `--brand-primary`), so:

1. **Always use hardcoded hex colors, never CSS variables** — `var(--brand-primary)` won't work in the editor preview. Use `#296CFA` directly.

2. **Every text element inside a dark section needs explicit color** — Don't rely on inheritance or theme. If a section has `backgroundColor: '#0F1A2E'`, every heading, text, stat, and button inside it must have an explicit light `color` set via `style` or `elementStyles`.

3. **Test contrast in both contexts:**
   - Blocks with dark backgrounds + light text work everywhere
   - Blocks with NO background color inherit from the page — these must use colors that work on both light AND dark page backgrounds
   - When in doubt, set an explicit `backgroundColor` on every section

4. **Button accessibility** — CTA buttons with `customCSS: 'box-shadow: ...'` look great but verify the text contrast ratio meets WCAG AA (4.5:1 minimum). Blue (#296CFA) on white is fine; white on light blue is not.

5. **Image fallbacks** — If external image URLs fail (CDN down, domain change), the page shouldn't break. Use blocks that degrade gracefully — `hero` blocks fall back to gradient backgrounds when `backgroundImage` fails.

### Content Quality Review

After the automated import, review each page for:

1. **Extracted text fidelity** — Did the HTML-to-text extraction preserve meaning? Check for:
   - Missing paragraphs (extraction might miss some content containers)
   - Garbled special characters (HTML entities not decoded)
   - Truncated content (extraction limits)

2. **Block type appropriateness** — Is a `text` block the right choice, or should it be a `card-grid`, `stats`, or `featured-content`? Remap blocks that would render better as structured types.

3. **Image quality** — Are extracted image URLs high-resolution? Replace low-res thumbnails with full-size originals.

4. **SEO completeness** — Verify every page has `seoTitle`, `seoDescription`, and `ogImage` populated.

### Automated Validation Script

After importing, run a validation pass:

```typescript
// Validate all migrated pages
const pages = await db.select().from(posts).where(eq(posts.websiteId, WEBSITE_ID));
for (const page of pages) {
  const data = JSON.parse(page.content);
  if (!data.blocks || !data.version) {
    console.warn(`[INVALID FORMAT] ${page.slug} — missing blocks/version`);
  }
  for (const block of data.blocks || []) {
    // Check for raw HTML in text blocks
    if (block.type === 'text' && block.content?.includes('<span') || block.content?.includes('<div')) {
      console.warn(`[HTML IN TEXT] ${page.slug} → ${block.id} — may not be editable`);
    }
    // Check dark sections have explicit text colors on children
    if (block.type === 'section' && block.backgroundColor) {
      const isDark = isDarkColor(block.backgroundColor);
      if (isDark) {
        for (const child of block.blocks || []) {
          if (!child.style?.color && child.type !== 'divider' && child.type !== 'spacer') {
            console.warn(`[MISSING COLOR] ${page.slug} → ${block.id}/${child.id} — dark section child without explicit text color`);
          }
        }
      }
    }
    // Check images have alt text
    if (block.type === 'image' && !block.alt) {
      console.warn(`[MISSING ALT] ${page.slug} → ${block.id}`);
    }
  }
}
```

## Step 9: Automated QA — Lighthouse + Visual Review (MANDATORY)

Run this step after ALL pages are created and published (with `publicAccess: true`) but before final sign-off. It produces two operator-reviewed reports: a Lighthouse score comparison and a full-page screenshot comparison.

### Why this step exists

Migrated pages can silently regress on performance (unoptimized images from the source CDN, extra render-blocking scripts) or accessibility (missing alt text, low contrast). Catching this before the client sees the site avoids rework. The visual comparison catches layout and color divergence that code review misses.

### 9A: Lighthouse Score Tests

**Script:** `scripts/migrations/site-migration/scripts/lighthouse-compare.ts`  
**Dependency:** `lighthouse` — invoked on-demand via `bunx`; no `bun add` required.

#### Pre-flight

Make sure the migrated pages are reachable:

```typescript
// Enable public access + publish all pages for QA
await db.update(clientWebsites).set({ publicAccess: true }).where(eq(clientWebsites.id, WEBSITE_ID));
await db.update(posts).set({ published: true }).where(eq(posts.websiteId, WEBSITE_ID));
```

If testing against `localhost`, use `http://localhost:3000/sites/<subdomain>.simplerdevelopment.com` as the migrated base URL.

#### Command

```bash
bunx tsx .claude/skills/site-migration/scripts/lighthouse-compare.ts \
  --source   https://original-site.com \
  --migrated https://<subdomain>.simplerdevelopment.com \
  --paths    /,/about,/services,/contact \
  --out      scripts/migrations/<site-slug>/reports/lighthouse
```

For a large site, run only the top-level pages (home + all marketing pages). Skip deep blog/product URLs unless the client has flagged them specifically.

#### Pass/fail thresholds

| Category | Floor (migrated must reach) | Max regression vs source |
|---|---|---|
| Performance | 50 | 15 points |
| Accessibility | 80 | 15 points |
| Best Practices | 80 | 15 points |
| SEO | 80 | 15 points |

Override any threshold via env var before the command:

```bash
FLOOR_PERFORMANCE=60 MAX_REGRESSION=10 bunx tsx .claude/skills/site-migration/scripts/lighthouse-compare.ts ...
```

#### Where reports land

```
scripts/migrations/<site-slug>/reports/lighthouse/
  lighthouse-report-<timestamp>.json   ← raw scores, deltas, pass/fail per page
  lighthouse-report-<timestamp>.md     ← human-readable markdown table
```

The script exits non-zero if any page fails. Review the `.md` file — fix the failures before proceeding to sign-off. Common quick wins:

| Failure | Fix |
|---------|-----|
| Performance < 50 | Add `loading="lazy"` to below-fold image blocks; compress hero image |
| SEO < 80 | Verify every page has `seoTitle` + `seoDescription` + `ogImage` set |
| Accessibility < 80 | Add missing `alt` text on `image` blocks; fix contrast via `elementStyles.color` |
| Best Practices < 80 | Usually caused by mixed-content (HTTP assets on HTTPS page) or outdated JS from source CDN |

### 9B: Automated Visual Review

**Script:** `scripts/migrations/site-migration/scripts/visual-compare-pages.ts`  
**Dependency:** `playwright` + Chromium — already in the project's `devDependencies`. If the Chromium binary is missing locally, run `bunx playwright install chromium` once.

#### Command

```bash
bunx tsx .claude/skills/site-migration/scripts/visual-compare-pages.ts \
  --source   https://original-site.com \
  --migrated https://<subdomain>.simplerdevelopment.com \
  --paths    /,/about,/services,/contact \
  --out      scripts/migrations/<site-slug>/reports/visual \
  --viewport 1440x900
```

#### What it produces

```
scripts/migrations/<site-slug>/reports/visual/
  screenshots/
    home-source.png
    home-migrated.png
    about-source.png
    about-migrated.png
    ...
  visual-report-<timestamp>.html   ← open this in a browser for side-by-side review
  visual-report-<timestamp>.json   ← manifest with file paths + any capture errors
```

Open `visual-report-<timestamp>.html` in a browser. Each page appears as a scrollable two-column layout: source on the left, migrated on the right. Scroll through and flag pages that differ meaningfully.

#### Pass/fail criteria for the visual review

The script captures and reports; it does not auto-score pixel diff (that requires `pixelmatch`, which is not installed). The human operator reviews the HTML report and uses this rubric:

| Dimension | Pass | Fail — fix before sign-off |
|---|---|---|
| Overall light/dark balance | Matches source | More than 1 section has wrong background tone |
| Section background colors | Each section's bg matches the source within one shade | Any section obviously wrong color |
| CTA section style | Solid/gradient matches original | CTA is wrong color or is generic purple gradient |
| Typography hierarchy | Heading sizes roughly match | Headings missing or wrong size tier |
| Image layout | Key images present and roughly correct size | Hero image missing, card images are tall strips |
| Navigation | Nav links + logo visible | Nav broken or missing items |
| Footer | Footer present with correct content | Footer missing |

For any flagged page, use the **`visual-compare` skill** (`~/.claude/skills/visual-compare/SKILL.md`) for an interactive section-by-section deep-dive with a per-section diff table.

### 9C: After QA — restore access

```typescript
// Revert to draft / private after QA
await db.update(clientWebsites).set({ publicAccess: false }).where(eq(clientWebsites.id, WEBSITE_ID));
await db.update(posts).set({ published: false }).where(eq(posts.websiteId, WEBSITE_ID));
```

### QA Gate checklist

Before moving to sign-off, all of the following must be true:

- [ ] `lighthouse-compare` exits 0 (all pages pass floors + no regression > 15 pts)
- [ ] Visual report reviewed — no pages flagged as failing the visual rubric above
- [ ] Any Lighthouse failures fixed and script re-run to confirm
- [ ] Any visual failures fixed and `visual-compare-pages` re-run on the affected pages

---

## Step 10: Visual QA Comparison (MANDATORY)

After importing the home page, you MUST do a visual comparison before continuing to marketing pages. This catches color/layout issues early.

### Process

1. **Enable publicAccess + publish** — sites are gated by default. Create a helper script:
   ```typescript
   await db.update(clientWebsites).set({ publicAccess: true }).where(eq(clientWebsites.id, WEBSITE_ID));
   await db.update(posts).set({ published: true }).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')));
   ```
2. **Screenshot the original** site (full page) using browser automation (chrome-devtools or playwright)
3. **Screenshot the migrated** site at `http://localhost:3000/sites/<subdomain>.simplerdevelopment.com/home`
4. **Compare visually** and check:
   - Is the overall light/dark balance correct? (most sites are 80%+ light)
   - Does each section's background match the original?
   - Are the CTA sections using the right color (solid dark? gradient? the original's style?)
   - Are card images rendering at the right size? (icons should use `icon` prop, not `image`)
   - Are buttons normal-sized? (not stretched full-width by wrapper styling)
   - Are the hero, nav, and footer backgrounds correct?
5. **Fix any discrepancies** before proceeding to marketing pages
6. **Disable publicAccess + unpublish** after QA:
   ```typescript
   await db.update(clientWebsites).set({ publicAccess: false }).where(eq(clientWebsites.id, WEBSITE_ID));
   await db.update(posts).set({ published: false }).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')));
   ```

### Common Issues to Fix

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Too many dark sections | Trusted WebFetch CSS analysis over actual rendering | Run computed styles script in browser — only trust `getComputedStyle` |
| Card icons are tall thin strips | Used `image` prop for small icons; Card renders images at `w-full h-48` | Use `icon` prop with Material Icons instead |
| Buttons are full-width/bloated | Put padding/borderRadius in `block.style` (applies to wrapper div) | Set button appearance via `siteBranding.buttonStyle`; only use `variant`/`size` on blocks |
| CTA is purple gradient but original is solid dark | Default CTA pattern in skill | Match original CTA style exactly |
| Hero is gray but original is white | Used #f6f6fc instead of #ffffff | Use pure white or the original's exact bg |
| Page shows "not yet available" | `publicAccess` is false by default | Must enable `publicAccess` on `clientWebsites` AND `published` on the post for QA |
| Section feels different color even with same hex | Background IMAGE overrides perceived color | Ensure backgroundImage URLs are correct |

## Important Notes

- All pages are created as **drafts** (`published: false`) so the user can review before going live
- Use `websiteId` on all content (posts, categories, tags, media) to scope to the correct site
- The block editor `content` field stores `{ blocks: Block[], version: '1.0' }` (BlockEditorData format)
- Slugs must be unique per website — check before inserting
- Run migrations from the project root: `npx tsx scripts/migrations/<slug>/run-all.ts`
- Images can be referenced by external URL initially; media upload can happen in a later pass
- **Never use CSS variables** (`var(--brand-*)`) in block styles — they don't work in the editor
- **Always set explicit colors** on text inside dark sections — don't rely on inheritance
