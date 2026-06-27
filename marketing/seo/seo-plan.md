# SEO Plan — SimplerDevelopment Marketing Site

> **Phase 11 — Site-Wide SEO.** Spec only; no app code changes.
> Sources: `vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md`, `docs/agents/ai-overview.md`, `lib/data/solutions.ts`, `app/sitemap.ts`, `app/robots.ts`.
> Status flags honor the inventory — no features are claimed beyond what is marked Active.
> All URLs use `example.com` as a placeholder. Replace with the real domain at implementation.

---

## 1. Page Inventory & Metadata Table

The marketing site's public route tree lives under `app/(pages)/`. The `/solutions/[slug]` dynamic route serves all feature pages; slugs are driven by `lib/data/solutions.ts`. The `invoicing` slug is hidden (`HIDDEN_SLUGS`) and must remain excluded from SEO targeting until the feature ships publicly.

### 1a. Core Pages

| Page | URL Slug | `<title>` (≤60 chars) | Meta Description (≤155 chars) | Canonical | Primary Keyword |
|---|---|---|---|---|---|
| Home | `/` | `SimplerDevelopment — Agency SaaS Platform` | `All-in-one platform for software agencies: website builder, CRM, Company Brain AI, email campaigns, bookings, and MCP automation in one portal.` | `https://example.com/` | agency SaaS platform |
| Solutions Hub | `/solutions` | `Features & Solutions — SimplerDevelopment` | `Explore every module: website builder, CRM, AI knowledge base, email, bookings, project management, and more — all in one client portal.` | `https://example.com/solutions` | agency software features |
| Pricing | `/pricing` | `Pricing — SimplerDevelopment` | `Per-module pricing for agencies and their clients. Subscribe to only the tools you need: CRM, Brain, email, storefront, bookings, and more.` | `https://example.com/pricing` | agency SaaS pricing |
| Blog | `/blog` | `Blog — SimplerDevelopment` | `Guides, product updates, and best practices for agencies running client portals with AI, CRM, and web publishing tools.` | `https://example.com/blog` | agency SaaS blog |
| Docs | `/docs` | `Developer Docs — SimplerDevelopment` | `API reference, MCP tool index, integration guides, and architecture notes for building on the SimplerDevelopment platform.` | `https://example.com/docs` | SimplerDevelopment API docs |
| About | `/about` | `About — SimplerDevelopment` | `SimplerDevelopment lets software agencies deliver white-label digital infrastructure to clients — one platform, one portal, every tool included.` | `https://example.com/about` | about SimplerDevelopment |
| Contact | `/contact` | `Contact — SimplerDevelopment` | `Get in touch with the SimplerDevelopment team. Questions about pricing, onboarding, or the platform — we answer quickly.` | `https://example.com/contact` | contact SimplerDevelopment |
| Privacy | `/privacy` | `Privacy Policy — SimplerDevelopment` | `How SimplerDevelopment collects, uses, and protects your data.` | `https://example.com/privacy` | *(noindex — legal page)* |
| Terms | `/terms` | `Terms of Service — SimplerDevelopment` | `Terms and conditions governing use of the SimplerDevelopment platform.` | `https://example.com/terms` | *(noindex — legal page)* |

> **Note:** `/privacy` and `/terms` should carry `<meta name="robots" content="noindex, follow">`. They should NOT appear in `sitemap.xml`.

---

### 1b. Feature / Solution Pages (`/solutions/[slug]`)

Cross-references: each slug maps to a feature spec in `../feature-pages/` (e.g., `../feature-pages/ai-connect.md`) and to the domain entry in `vault/03 - Domains/`.

| Slug | `<title>` (≤60 chars) | Meta Description (≤155 chars) | Canonical | Primary Keyword |
|---|---|---|---|---|
| `ai-connect` | `AI Connect — MCP Integration \| SimplerDev` | `Connect Claude, ChatGPT, and other AI clients to your portal via the Model Context Protocol. Scoped permissions, BYOK keys, approval workflow.` | `https://example.com/solutions/ai-connect` | MCP server integration |
| `websites` | `Website Builder \| SimplerDevelopment` | `Build and publish professional websites with a 48-block visual editor, built-in blog, revision history, and custom domain support.` | `https://example.com/solutions/websites` | website builder for agencies |
| `ecommerce` | `Online Store & Ecommerce \| SimplerDev` | `White-label e-commerce: product catalog with variants, Stripe payments, shipping zones, discount codes, and customer accounts.` | `https://example.com/solutions/ecommerce` | white-label ecommerce platform |
| `publishing` | `Publishing Calendar \| SimplerDevelopment` | `Run your editorial pipeline with a kanban board, month-view content calendar, campaign grouping, and per-user publishing permissions.` | `https://example.com/solutions/publishing` | content calendar tool for agencies |
| `email-marketing` | `Email Marketing \| SimplerDevelopment` | `Send branded email campaigns with a visual builder, subscriber list management, A/B subject-line testing, and open/click analytics.` | `https://example.com/solutions/email-marketing` | email marketing platform |
| `crm` | `CRM — Contacts, Deals & Pipeline \| SD` | `Full CRM: contacts, companies, deal pipeline kanban, proposals with e-signature, custom fields, saved views, and activity timelines.` | `https://example.com/solutions/crm` | CRM software for agencies |
| `contracts` | `Proposals & E-Signature \| SimplerDev` | `Build branded proposals with line items and collect legally binding e-signatures — every document tied to its CRM deal with a full audit trail.` | `https://example.com/solutions/contracts` | proposal and e-signature software |
| `booking` | `Online Booking & Scheduling \| SimplerDev` | `White-label scheduling with group and individual appointments, Stripe payment at booking, waivers, gift certificates, and Zoom integration.` | `https://example.com/solutions/booking` | online booking software |
| `surveys` | `Surveys & Forms \| SimplerDevelopment` | `Smart forms with 15+ field types, conditional branching, scoring, A/B variants, and automatic CRM routing for captured leads.` | `https://example.com/solutions/surveys` | survey and form builder |
| `experiments` | `A/B Testing & Experiments \| SimplerDev` | `Split-test website pages with stable visitor bucketing, custom traffic weights, built-in significance testing, and conversion tracking.` | `https://example.com/solutions/experiments` | A/B testing for websites |
| `project-management` | `Project Management & Kanban \| SimplerDev` | `Kanban boards, sprint planning, WIP limits, burndown analytics, and a My-Tasks inbox — all inside the same client portal.` | `https://example.com/solutions/project-management` | project management software |
| `help-desk` | `Help Desk & Support Tickets \| SimplerDev` | `Shared team inbox and structured support tickets with SLA deadlines, internal notes, priority, and assignment tracking.` | `https://example.com/solutions/help-desk` | help desk ticketing software |
| `company-brain` | `Company Brain — AI Knowledge Base \| SD` | `Per-tenant AI knowledge base: notes, decisions, playbooks, and semantic search via pgvector. AI proposes entries; humans approve.` | `https://example.com/solutions/company-brain` | AI knowledge base software |
| `ai-chatbot` | `Live Chat Widget \| SimplerDevelopment` | `Deploy a branded live-chat widget on your website and manage every conversation from a shared team inbox in real time.` | `https://example.com/solutions/ai-chatbot` | live chat widget for websites |
| `automations` | `Automations & Workflows \| SimplerDev` | `No-code rule engine wired to bookings, CRM, email, and tickets. Describe a rule in plain language; the AI parses it automatically.` | `https://example.com/solutions/automations` | workflow automation software |
| `pitch-decks` | `AI Pitch Decks \| SimplerDevelopment` | `Generate brand-aware pitch decks from a prompt. The AI extracts brand context and produces structured slides with per-slide version history.` | `https://example.com/solutions/pitch-decks` | AI pitch deck generator |
| `agency` | `White-Label Agency Platform \| SimplerDev` | `Run the entire portal under your own brand: custom domain, your logo, white-label login, and multi-client management in one login.` | `https://example.com/solutions/agency` | white-label agency platform |
| `hosting` | `Managed Hosting & DNS \| SimplerDev` | `Live environment status, DNS management, and guided domain verification — visible to clients, fully managed by admins.` | `https://example.com/solutions/hosting` | managed hosting for agencies |

> **Excluded from SEO targeting:** `invoicing` slug — hidden in `lib/data/solutions.ts` via `HIDDEN_SLUGS`. Do not target until `getSolutionBySlug('invoicing')` returns a result.

---

## 2. Open Graph & Twitter Card

### 2a. Global Defaults

Apply these defaults in the root `app/layout.tsx` via Next.js `metadata` export. Per-page metadata objects override individual keys only.

```ts
// app/layout.tsx — metadata defaults
export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: {
    default: 'SimplerDevelopment — Agency SaaS Platform',
    template: '%s | SimplerDevelopment',
  },
  description: 'All-in-one platform for software agencies: website builder, CRM, Company Brain AI, email, bookings, and MCP automation in one portal.',
  openGraph: {
    type: 'website',
    siteName: 'SimplerDevelopment',
    locale: 'en_US',
    images: [
      {
        url: '/og/default.png',   // 1200×630, ≤8MB
        width: 1200,
        height: 630,
        alt: 'SimplerDevelopment — Agency SaaS Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@SimplerDev',          // replace with real handle when live
    creator: '@SimplerDev',
    images: ['/og/default.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
};
```

**Default OG image spec (`/og/default.png`):**
- Dimensions: 1200 × 630 px
- Content: platform name, tagline, and a representative UI screenshot or abstract brand visual
- File: static asset in `public/og/`; no dynamic image generation required for the default

---

### 2b. Per-Page Overrides

| Page | OG `type` | Custom OG Image | Notes |
|---|---|---|---|
| Home | `website` | `/og/home.png` — hero visual | Override title to remove template suffix: `"SimplerDevelopment — Agency SaaS Platform"` |
| Pricing | `website` | `/og/pricing.png` — pricing grid | Add `openGraph.description` with price-range copy |
| Blog post (individual) | `article` | Dynamic via `/api/og?title=...` | Set `article.publishedTime`, `article.modifiedTime`, `article.authors` |
| Docs page | `article` | `/og/docs.png` — consistent docs brand | Set `article.section` = `"Documentation"` |
| `/solutions/[slug]` | `website` | `/og/solutions/[slug].png` — one per feature | Title should drop template suffix: `"<Feature Name> — SimplerDevelopment"` |
| About | `website` | `/og/about.png` | — |
| Contact | `website` | Default | No custom image needed |

**Dynamic OG for blog posts:** Implement `/app/api/og/route.tsx` using `@vercel/og` (ImageResponse). Accept `title`, `category`, and optional `date` query params. Keep bundle ≤200 KB (use a single variable-weight font loaded from `next/font`). Reference: Next.js App Router OG image generation docs.

---

## 3. JSON-LD Plan

### 3a. Schema Type Assignments by Page

| Page | JSON-LD Types |
|---|---|
| Home (`/`) | `Organization`, `SoftwareApplication`, `WebSite` + `SearchAction` |
| `/solutions` (hub) | `SoftwareApplication`, `BreadcrumbList` |
| `/solutions/[slug]` | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` (when FAQ section exists) |
| `/pricing` | `SoftwareApplication` (with `offers`), `BreadcrumbList`, `FAQPage` |
| `/blog` (index) | `Blog`, `BreadcrumbList` |
| `/blog/[slug]` (post) | `BlogPosting`, `BreadcrumbList` |
| `/docs/[[...slug]]` | `TechArticle`, `BreadcrumbList` |
| `/about` | `Organization`, `AboutPage`, `BreadcrumbList` |
| `/contact` | `ContactPage`, `BreadcrumbList` |

**Do not add JSON-LD to `/privacy` or `/terms`** — these pages are `noindex` and structured data adds no value.

---

### 3b. Homepage Sample JSON-LD

Replace `example.com`, `Your Agency Name`, and logo/image URLs before deploying. This is a reference template, not production-ready copy.

```html
<!-- app/(pages)/page.tsx — JSON-LD script tag via next/head or Script component -->
<script type="application/ld+json">
[
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "SimplerDevelopment",
    "url": "https://example.com",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png",
      "width": 400,
      "height": 100
    },
    "sameAs": [],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "url": "https://example.com/contact"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "SimplerDevelopment",
    "url": "https://example.com",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "Multi-tenant agency SaaS platform covering website builder, CRM, AI knowledge base, email campaigns, bookings, project management, and MCP automation.",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": "0",
      "priceSpecification": {
        "@type": "UnitPriceSpecification",
        "description": "Per-module subscriptions. See pricing page for details."
      }
    },
    "featureList": [
      "Block-based visual website editor",
      "CRM with deals, proposals, and e-signature",
      "Company Brain AI knowledge base with semantic search",
      "Email campaign builder with A/B testing",
      "Online booking and scheduling",
      "Project management with kanban and sprints",
      "Model Context Protocol (MCP) server with 450 tools",
      "White-label agency portal"
    ]
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "SimplerDevelopment",
    "url": "https://example.com",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://example.com/docs?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  }
]
</script>
```

**Implementation note:** In Next.js App Router, inject JSON-LD in a `<script>` tag inside the page component (not in `metadata`) using:

```tsx
// In the page component JSX
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

This renders in the RSC pass and is indexed correctly by crawlers without client-side execution.

---

### 3c. Solution Page JSON-LD Pattern

Each `/solutions/[slug]` page emits `SoftwareApplication` (with `featureList` drawn from `SolutionData.features`) and a `BreadcrumbList`. If the page renders an FAQ section, also emit `FAQPage`.

```ts
// Example for /solutions/crm
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "SimplerDevelopment CRM",
    "applicationCategory": "BusinessApplication",
    "featureList": solution.features,   // from SolutionData
    "isPartOf": {
      "@type": "SoftwareApplication",
      "name": "SimplerDevelopment",
      "url": "https://example.com"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://example.com" },
      { "@type": "ListItem", "position": 2, "name": "Solutions", "item": "https://example.com/solutions" },
      { "@type": "ListItem", "position": 3, "name": solution.title, "item": `https://example.com/solutions/${solution.slug}` }
    ]
  }
];
```

---

## 4. Technical SEO

### 4a. `sitemap.xml` — Strategy

The existing `app/sitemap.ts` covers home, solutions hub, about, pricing, blog, and contact. Extend it per the following spec.

**Pages to include:**

| URL pattern | `changeFrequency` | `priority` | Notes |
|---|---|---|---|
| `/` | `daily` | `1.0` | Already in sitemap |
| `/solutions` | `weekly` | `0.9` | Already in sitemap (as `/solutions`) |
| `/solutions/[slug]` × 18 | `weekly` | `0.85` | Generate from `getAllSolutions()` — already partially done |
| `/pricing` | `monthly` | `0.80` | Already in sitemap |
| `/blog` | `daily` | `0.90` | Already in sitemap |
| `/blog/[slug]` (published) | `weekly` | `0.70` | Already fetched from DB in sitemap |
| `/docs/[[...slug]]` | `weekly` | `0.75` | Add: enumerate from docs filesystem or a static list |
| `/about` | `monthly` | `0.70` | Already in sitemap |
| `/contact` | `monthly` | `0.65` | Already in sitemap |

**Pages to exclude:**

- `/privacy`, `/terms` — `noindex` legal pages
- `/unsubscribed` — transactional, not indexable
- `app/admin/**`, `app/portal/**`, `app/api/**` — gated; already disallowed in `robots.ts`
- `app/sites/[domain]/**` — tenant public sites live on separate domains; they manage their own sitemaps
- `/approve/[token]/**`, `/contract/[token]/**` — tokenized one-time URLs

**Docs enumeration:** The docs route is `app/docs/[[...slug]]`. Since docs content is file-based (see `app/docs/_components/`, `app/docs/_lib/`), generate doc slugs from the filesystem at build time and feed them into `sitemap.ts`. Limit to the publicly reachable docs subtree (not `/api/`, not internal guides).

**Tenant site sitemaps:** Each tenant public site at `app/sites/[domain]/[[...slug]]` renders on the tenant's own domain. The marketing site's `sitemap.xml` must not include any tenant URLs. Tenant sitemaps are a separate concern, managed per-domain via the CMS/publishing domain. When that feature is built, consider a `sitemap.ts` that lives in the sites render tree and is scoped to `siteConfig.url === request domain`.

---

### 4b. `robots.txt`

The existing `app/robots.ts` is correct. Verify these disallow rules are exhaustive:

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /_next/
Disallow: /portal/
Disallow: /approve/
Disallow: /contract/
Disallow: /oauth/
Disallow: /go/
Disallow: /install/
Sitemap: https://example.com/sitemap.xml
```

The existing file disallows `/api/`, `/admin/`, `/_next/`. Add `/portal/`, `/approve/`, `/contract/`, `/oauth/`, `/go/`, and `/install/` to close off non-marketing routes.

---

### 4c. Heading Structure Rules

- **One `<h1>` per page, always.** The `<h1>` must match (or be a close variant of) the page's primary keyword.
- `<h2>` sections break the page into logical feature areas. On solution pages use the `process[].title` values as `<h2>` candidates.
- `<h3>` for sub-items within a section.
- Never use heading tags for decorative text; use styled `<p>` or `<span>` instead.
- Blog posts: `<h1>` = post title, `<h2>` = major sections, `<h3>` = sub-sections.
- Do not skip heading levels (e.g., `<h1>` → `<h3>` with no `<h2>`).

**Home page `<h1>` recommendation:** Matches the brand name + value proposition, not the hero subtitle. Example: `"Agency SaaS Platform for Software Agencies"` — keeps the brand in the title tag and the keyword in the `<h1>` without redundancy.

---

### 4d. Canonical Strategy — Marketing Site vs. Tenant Sites

This is the most critical duplicate-content risk.

**Problem:** The marketing site (`example.com`) and tenant public sites (`app/sites/[domain]/`) are served from the same Next.js deployment but resolve on different domains (or subdomain paths). A tenant site could theoretically publish content that mirrors marketing pages.

**Rules:**

1. **Marketing canonical = `example.com` (the marketing domain).** Every marketing route in `app/(pages)/` must emit `<link rel="canonical" href="https://example.com/[path]">`. Next.js `alternates.canonical` in the `metadata` object handles this.

2. **Tenant site canonical = tenant's own domain.** Pages rendered via `app/sites/[domain]/[[...slug]]` must emit a canonical pointing at the tenant's custom domain (or the platform subdomain assigned to that tenant), not `example.com`. Use the `siteConfig` resolved from the domain middleware for the base URL.

3. **No cross-domain canonicals.** Marketing pages must never point canonical at a tenant domain, and vice versa.

4. **Blog and docs are marketing-only.** `app/(pages)/blog/` and `app/docs/` are not served to tenant domains. No duplication risk there.

5. **Public survey/booking/slide pages** (`/s/[slug]`, `/book/[slug]`, `/slides/[slug]`) are tenant-owned. Their canonical = tenant domain, not `example.com`. The marketing site does not surface these URLs.

6. **Preview vs. live:** `app/preview/` appears in the route tree. Confirm these pages carry `<meta name="robots" content="noindex">` — preview content must never be indexed.

---

### 4e. Alt-Text Policy

- Every `<img>` and `next/image` on a marketing page must have a non-empty `alt` attribute.
- Decorative images (dividers, background textures): use `alt=""` (empty string, not omitted) so screen readers skip them.
- Product screenshots: describe the UI visible in the image. Example: `alt="CRM deal pipeline view showing three kanban columns with drag-and-drop cards"`.
- Logo: `alt="SimplerDevelopment logo"`.
- Blog post featured images: derive `alt` from the post title; the CMS should expose an `altText` field and make it required in the post editor.
- `next/image` lints: configure `eslint-plugin-jsx-a11y` (or `@next/eslint-plugin-next`) to error on missing `alt` — this is already enforced in most Next.js setups.

---

### 4f. Internal Linking Map

**Hub pages:** `/` (home), `/solutions` (features hub), `/docs` (docs hub), `/blog` (content hub).

**Spoke pages:** each `/solutions/[slug]`.

**Rules:**

1. **Home → Solutions hub** via the primary CTA and feature grid. Each feature card links directly to its solution page.
2. **Solutions hub → each slug** via the solution cards.
3. **Each solution page → ≥2 related solution pages** via a "Related features" section at the bottom. Suggested clusters:
   - CRM cluster: `crm`, `contracts`, `email-marketing`, `surveys`
   - Content cluster: `websites`, `publishing`, `pitch-decks`, `experiments`
   - Operations cluster: `project-management`, `help-desk`, `automations`, `booking`
   - AI cluster: `company-brain`, `ai-connect`, `automations`
   - Commerce cluster: `ecommerce`, `booking`, `invoicing` *(when invoicing is un-hidden)*
4. **Blog posts → solution pages:** every post that discusses a feature links to the relevant `/solutions/[slug]` page using descriptive anchor text (not "click here").
5. **Docs → solution pages:** agent/API overview pages link to `/solutions/ai-connect` and relevant feature pages.
   - `docs/agents/ai-overview.md` cross-link targets: `/solutions/ai-connect`, `/solutions/company-brain`, `/solutions/automations`
6. **Pricing → solution pages:** each module card on `/pricing` links to its corresponding `/solutions/[slug]`.
7. **No orphan pages:** every solution page must be reachable from the home or solutions hub in ≤2 clicks.

---

## 5. Core Web Vitals Checklist (Next.js 16 / React 19)

The three CWV metrics are **LCP** (Largest Contentful Paint), **INP** (Interaction to Next Paint, replaced FID in March 2024), and **CLS** (Cumulative Layout Shift). Target: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.

### 5a. LCP

- [ ] Hero image on every marketing page uses `<Image>` from `next/image` with `priority` prop. This triggers `<link rel="preload">` in the HTML head.
- [ ] Hero image `sizes` attribute tuned to the actual rendered width at each breakpoint (avoid `100vw` on images that are narrower than the viewport).
- [ ] Font loading: use `next/font/google` with `display: 'swap'` for body fonts; consider `display: 'optional'` on decorative display fonts to avoid LCP penalty from font blocking.
- [ ] Preconnect to font origins: `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">`.
- [ ] Hero section is a React Server Component — no client-side hydration delay before the LCP element paints.
- [ ] `next/image` WebP/AVIF automatic format negotiation is enabled by default in Next.js 16; verify `next.config.ts` does not disable it.
- [ ] Keep the above-the-fold HTML payload under 14 KB compressed (one TCP window). Move heavy imports to `dynamic(() => import(...), { ssr: false })` if they are below-the-fold only.

### 5b. INP (Interaction to Next Paint)

- [ ] Marketing pages should have minimal client-side JS. Use RSC for all static content; only interactive widgets (modals, navigation drawers, video players) need `'use client'`.
- [ ] React 19 concurrent rendering: wrap any heavy re-render in `useTransition` or `startTransition` to keep the main thread responsive during interaction.
- [ ] Navigation: Next.js App Router uses the Link component for client-side transitions. Ensure nav links use `<Link>` (not `<a>`) to prefetch routes.
- [ ] Third-party scripts (analytics, chat widget): load with `<Script strategy="lazyOnload">` or `strategy="afterInteractive"` — never `strategy="beforeInteractive"` unless strictly required.
- [ ] Avoid blocking event handlers: any `onClick` that does significant work should dispatch to a `startTransition` or be deferred.

### 5c. CLS

- [ ] All `next/image` instances must have explicit `width` and `height` props (or `fill` with a sized container). No unsized images.
- [ ] Fonts loaded via `next/font` inject CSS variables before paint, preventing font-swap layout shifts. Avoid `@import` of external font CSs inside component stylesheets.
- [ ] Ad slots, banners, or embed placeholders: reserve space with fixed-height containers or skeleton states before the content loads.
- [ ] Navigation bar: fixed height; does not shift content when sticky positioning activates.
- [ ] Cookie/consent banner: position `fixed` at the bottom; does not push page content.
- [ ] Dynamic content (FAQPage accordions, testimonial carousels): the container height must not change when content expands — use CSS transitions that animate `max-height` or `height` rather than reflow.

### 5d. TTFB & Streaming

- [ ] Marketing pages are fully static or ISR where feasible. Use `export const revalidate = 3600` (or similar) on solution and home pages.
- [ ] Blog index and post pages: ISR with revalidation on publish. Avoid full SSR for public content.
- [ ] Suspense boundaries: wrap any async data fetch (e.g., blog post list from DB) in `<Suspense fallback={<Skeleton />}>` so the surrounding shell streams to the client immediately.
- [ ] Keep the number of sequential data-fetch waterfalls to zero on the initial render. Fetch in parallel using `Promise.all` within RSCs.

### 5e. Image Optimization Summary

| Scenario | Directive |
|---|---|
| Hero / above-fold | `<Image priority width={…} height={…} sizes="…">` |
| Below-fold content | `<Image loading="lazy">` (default) |
| Open Graph image | Static PNG in `public/og/`; not rendered with `next/image` |
| Blog featured image | `<Image loading="lazy" sizes="(max-width: 768px) 100vw, 720px">` |
| Logo (SVG) | Inline SVG or `<Image>` with `priority`; SVG preferred for crispness |

---

## 6. Keyword Map

Grounded in the feature set described in `FEATURE-INVENTORY-domains.md` and `docs/agents/ai-overview.md`. No invented features. The platform occupies four keyword spaces: **agency SaaS**, **AI CRM / knowledge base**, **website builder**, and **MCP / AI automation**. Terms reflect what the target buyer (a software agency or digital agency principal) actually searches.

### 6a. Core Pages

| Page | Primary Keyword | Secondary Keywords |
|---|---|---|
| Home | agency SaaS platform | white-label client portal, all-in-one agency software, agency management platform |
| Pricing | agency SaaS pricing | per-module pricing, agency software cost, client portal pricing |
| Blog | agency SaaS blog | agency software tips, MCP automation guides, client portal best practices |
| Docs | SimplerDevelopment API | MCP tool reference, agency platform docs, REST API agency |
| About | agency software platform | agency tools company, SimplerDevelopment |
| Contact | contact SimplerDevelopment | agency software support, get a demo |
| Solutions Hub | agency software features | agency platform features, client portal features |

### 6b. Feature / Solution Pages

| Slug | Primary Keyword | Secondary Keywords |
|---|---|---|
| `ai-connect` | MCP server integration | Claude MCP connector, AI automation agency, Model Context Protocol SaaS, BYOK AI portal |
| `websites` | website builder for agencies | drag-and-drop website builder, block-based website builder, white-label website builder |
| `ecommerce` | white-label ecommerce platform | agency ecommerce tool, Stripe ecommerce, product catalog software |
| `publishing` | content calendar for agencies | editorial calendar software, publishing workflow tool, content planning platform |
| `email-marketing` | email marketing platform | email campaign builder, A/B subject line testing, subscriber list management |
| `crm` | CRM software for agencies | agency CRM, client relationship management, deal pipeline software |
| `contracts` | proposal and e-signature software | online proposal builder, e-sign contracts, DropboxSign alternative |
| `booking` | online booking software | scheduling software for agencies, appointment booking, Stripe booking payment |
| `surveys` | survey and form builder | lead capture form, branching logic survey, Typeform alternative |
| `experiments` | A/B testing for websites | website split testing, conversion optimization software, statistical significance testing |
| `project-management` | project management software | kanban board for agencies, sprint planning tool, client project management |
| `help-desk` | help desk ticketing software | support ticket system, SLA tracking, shared team inbox |
| `company-brain` | AI knowledge base software | RAG knowledge base, company knowledge management, semantic search software |
| `ai-chatbot` | live chat widget for websites | website chat widget, team inbox chat, visitor live chat |
| `automations` | workflow automation software | no-code automation, NLP rule builder, Zapier alternative |
| `pitch-decks` | AI pitch deck generator | AI presentation builder, brand-aware slide deck, pitch deck software |
| `agency` | white-label agency platform | reseller agency portal, agency branding software, custom domain portal |
| `hosting` | managed hosting for agencies | DNS management for clients, client hosting dashboard |

### 6c. Long-Tail Clusters

These terms appear across multiple pages and should be threaded into blog content and FAQ sections:

- **MCP automation space:** "Model Context Protocol integration", "Claude AI CRM", "AI agent for business data", "MCP server for agencies"
- **Agency all-in-one:** "all-in-one agency software", "replace multiple SaaS tools", "agency tech stack", "white-label portal for clients"
- **AI knowledge base / RAG:** "RAG knowledge base business", "semantic search company knowledge", "AI-assisted knowledge management", "pgvector knowledge base"
- **No-code alternatives:** "Typeform alternative", "Zapier alternative for agencies", "PandaDoc alternative", "Calendly alternative white-label"

---

## 7. Implementation Priority

Ranked by SEO impact-to-effort ratio:

1. **`robots.ts` patch** — add missing disallow rules (`/portal/`, `/approve/`, `/contract/`, etc.) — 30 min effort, prevents indexation of private routes.
2. **Canonical tags on all marketing pages** — wire `alternates.canonical` in each route's `metadata` export — ½ day.
3. **JSON-LD on home, pricing, and solution pages** — highest-traffic pages; Organization + SoftwareApplication and BreadcrumbList — 1 day.
4. **`sitemap.ts` extension** — add solution slugs from `getAllSolutions()`, docs pages, and ensure `/privacy`/`/terms` are excluded — ½ day.
5. **OG image assets** — default + per-solution PNGs in `public/og/` — design task; 1–2 days.
6. **Alt-text audit** — sweep `app/(pages)/` for unsized or alt-less images — ½ day.
7. **Core Web Vitals pass** — LCP priority props and font loading — 1 day; requires Lighthouse baseline first.
8. **Dynamic OG for blog posts** — `/api/og` route with `@vercel/og` — 1 day.
9. **FAQ sections + FAQPage JSON-LD** — add FAQ content to solution pages and pricing — 2–3 days (content + code).
10. **Internal linking sweep** — add "Related features" sections to solution pages — 1 day.

---

## 8. Cross-References

- Feature page specs: `../feature-pages/` (one file per solution slug, e.g., `../feature-pages/ai-connect.md`)
- Agent AI overview (MCP surface, tool namespaces): `/docs/agents/ai-overview.md`
- Domain inventory (feature status flags): `vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md`
- Existing sitemap: `app/sitemap.ts`
- Existing robots: `app/robots.ts`
- Solutions data (slugs, titles, features): `lib/data/solutions.ts`
- Docs route: `app/docs/[[...slug]]/`
