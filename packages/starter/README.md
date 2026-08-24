# SimplerDevelopment starter

A minimal Next.js App Router site that renders its content from a
SimplerDevelopment CMS site over the public REST v1 API.

Use it as the starting point for a **headless** SD site: one that deploys on its
own infrastructure and its own domain, while the content, navigation and
branding stay editable in the SD portal.

## Setup

```bash
cp .env.example .env.local   # fill in site id + API key from the portal
bun install
bun dev
```

| Variable | |
|---|---|
| `NEXT_PUBLIC_SITE_ID` | Numeric site id — portal → Websites |
| `SD_API_KEY` | **Secret.** Portal → Developer. No `NEXT_PUBLIC_` prefix, so it never reaches the browser |
| `SD_API_URL` | Defaults to `https://simplerdevelopment.com`; override for a dev portal |

## How it works

`lib/sd.ts` builds the SDK client from the environment and is **server-only** —
it throws if imported into a Client Component, because it holds a secret. Fetch
in Server Components and pass results down as props.

`app/layout.tsx` calls `config.get()` once for the site name, branding,
CSS variables and navigation, and injects the branding variables as real CSS
custom properties on `:root`.

`app/[...slug]/page.tsx` resolves a URL against pages first, then posts.

## The one thing that will trip you up

The SDK types a post's `content` as `string`, but SimplerDevelopment does **not**
store HTML there — it stores the block document as JSON:

```json
{ "blocks": [ { "id": "…", "type": "heading", "order": 0, "content": "Hi" } ], "version": "1.0" }
```

So it has to be parsed before it means anything. `lib/content.ts` does that, and
is deliberately forgiving: empty content, invalid JSON, an unexpected shape or a
legacy HTML post all return `[]` rather than throwing. A page that renders
nothing is a bug you can see; a page that 500s in production is an outage.

Render with `<BlockRenderer content={post.content} />`, which handles the parse
for you.

## Adding a block type

`components/blocks.tsx` holds a component per block type and a
`BLOCK_COMPONENTS` map binding them to the `type` strings the CMS emits. To add
one, write the component and register it under its type.

`GET /api/v1/sites/:siteId/blocks` is the authoritative catalog of every type the
platform can emit — check against it rather than guessing.

**Not every type is implemented here.** The starter covers the common ones (text,
heading, image, button, spacer, divider, quote, section, columns, hero, cta,
card-grid, stats, gallery, video, youtube). Anything unregistered renders a
visible placeholder in development and nothing at all in production, so an
unsupported block degrades instead of crashing the page — but it does mean a
section silently disappears in prod if you never add its component.

The supplied components are intentionally plain. They are a working starting
point wired to the branding variables, not a design system — replace them rather
than layering overrides on top.

## Testing

```bash
bun test        # vitest, scoped to this package
bun typecheck
```

## Requirement

Depends on `@simplerdevelopment/sdk` **^0.2.0**. As of writing only `0.1.0` is
published to npm — 0.2.0 exists in the monorepo but has not shipped, so
`bun install` will fail until it is published. The API surface this starter uses
(`config`, `pages`, `posts`, `blocks`) is written against 0.2.0.
