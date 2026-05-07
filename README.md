# SimplerDevelopment.com

A modern, interactive website for SimplerDevelopment - a Design, Dev, and Automation Agency. Built with Next.js 16, React 19, Three.js, and a custom block-based content editor.

## Features

- Interactive 3D elements using Three.js and React Three Fiber
- Smooth scroll animations with Framer Motion
- Dark/Light mode with system preference detection
- SEO optimized with sitemap, robots.txt, and structured data
- Custom block-based content editor
- Responsive design with Tailwind CSS 4
- Type-safe with TypeScript 5
- Contact form with validation (React Hook Form + Zod)

## Tech Stack

- **Framework**: Next.js 16.1.1 (App Router)
- **React**: 19.2.3
- **TypeScript**: 5
- **Styling**: Tailwind CSS 4
- **3D Graphics**: Three.js, React Three Fiber, React Three Drei
- **Animations**: Framer Motion
- **CMS**: Custom block editor (Drizzle + visual editor)
- **Form Handling**: React Hook Form + Zod
- **Email**: Resend (planned)

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd simplerdevelopment2026
```

2. Install dependencies
```bash
npm install
# or
bun install
```

3. Set up environment variables
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your configuration:
- `DATABASE_URL`: Your Postgres connection string
- `RESEND_API_KEY`: Your Resend API key (optional, for contact form)
- `NEXT_PUBLIC_SITE_URL`: Your site URL

### Development

Run the development server:

```bash
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

Build for production:

```bash
npm run build
# or
bun run build
```

### Start Production Server

```bash
npm start
# or
bun start
```

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── (pages)/           # Page routes
│   │   ├── about/         # About page
│   │   ├── blog/          # Blog index and posts
│   │   ├── contact/       # Contact page
│   │   └── solutions/     # Solutions pages
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout
│   ├── robots.ts          # Robots.txt generator
│   └── sitemap.ts         # Sitemap generator
├── components/            # React components
│   ├── animations/        # Animation components
│   ├── forms/             # Form components
│   ├── sections/          # Page sections
│   ├── seo/               # SEO components
│   ├── three/             # Three.js components
│   └── ui/                # UI components
├── config/                # Configuration files
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and helpers
│   ├── builder/           # Builder.io integration
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
└── public/                # Static assets
```

## Pages

- **Home** (`/`) - Hero, 3D showcase, services grid
- **About** (`/about`) - Company mission, values, team
- **Solutions** (`/solutions`) - Services index
- **Solution Detail** (`/solutions/[slug]`) - Individual service pages
- **Blog** (`/blog`) - Blog posts index
- **Blog Post** (`/blog/[slug]`) - Individual blog posts
- **Contact** (`/contact`) - Contact form

## SEO

The site includes comprehensive SEO optimization:

- Dynamic sitemap.xml
- Robots.txt
- Structured data (JSON-LD) for Organization, Website, Articles, and Services
- Open Graph tags
- Twitter Card tags
- Optimized metadata for all pages

## Performance

- Incremental Static Regeneration (ISR) with 60s revalidation
- WebGL detection and performance optimization
- Responsive images
- Code splitting
- Progressive enhancement for 3D features

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import your repository in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform supporting Next.js 16:
- Netlify
- Cloudflare Pages
- AWS Amplify
- Self-hosted with Node.js or Docker

## Bring Your Own Key (BYOK)

Clients can connect their own Anthropic and/or OpenAI API keys instead of
metering against bundled platform AI credits. Keys are stored AES-256-GCM
encrypted at rest (`client_api_keys.encrypted_key`, see
`lib/crypto/api-key.ts`) and resolved per call via
`lib/ai/resolve-client-key.ts` — BYOK first, platform env fallback second.

### How clients add keys

Portal → **Integrations → API Keys** (`/portal/integrations/api-keys`):

1. Click **Add key**, pick a provider, paste the key, label it (e.g. `prod`).
2. The raw key is encrypted on the server and never returned in any
   subsequent API response. The list view shows only a masked preview
   (`sk-ant-…AbC1`).
3. Remove a key to fall back to platform credits, or rotate by removing +
   re-adding.

### Supported providers

- **Anthropic** — Claude chat. Used by branding generation, pitch deck
  generation, the portal AI chat widget, the email assistant, automation
  NLP parsing, brain meeting/CRM classification.
- **OpenAI** — Chat (where applicable) AND brain RAG embeddings
  (`text-embedding-3-small`). One OpenAI key covers both buckets.

### How billing changes with BYOK

- BYOK calls bypass the internal AI credit ledger entirely — the client
  pays their provider directly. No credit deduction, no payg trigger.
- A row is appended to `usage_meter_events` per call with
  `resource='ai_tokens'` and `source='byok'` (vs. `'platform'`) so
  staff can see per-tenant usage in either column.
- Tier-aware gating (`lib/ai/plan-gate.ts`): the **Starter** tier
  requires a BYOK key for the relevant provider. Growth and Scale tiers
  work with BYOK or bundled platform credits.

### Operator config

Server requires `ENCRYPTION_KEY` (64 hex chars) for the BYOK envelope.
Generate with `openssl rand -hex 32`. This is independent of the platform
provider env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) which remain the
fallback when no BYOK row exists.

## License

All rights reserved - SimplerDevelopment

## Support

For issues or questions, please contact: contact@simplerdevelopment.com
