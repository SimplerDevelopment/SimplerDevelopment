# SimplerDevelopment.com

A modern, interactive website for SimplerDevelopment - a Design, Dev, and Automation Agency. Built with Next.js 16, React 19, Three.js, and powered by Builder.io CMS.

## Features

- Interactive 3D elements using Three.js and React Three Fiber
- Smooth scroll animations with Framer Motion
- Dark/Light mode with system preference detection
- SEO optimized with sitemap, robots.txt, and structured data
- Content management with Builder.io
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
- **CMS**: Builder.io
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
- `NEXT_PUBLIC_BUILDER_API_KEY`: Your Builder.io API key
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

## Builder.io Setup

1. Create a Builder.io account at https://builder.io
2. Create the following models in your Builder.io space:
   - `solution` - For service pages
   - `blog-post` - For blog posts
3. Add your API key to `.env.local`

### Solution Model Fields

- title (Text)
- slug (Text)
- description (Text)
- image (File)
- content (Rich Text)
- benefits (List of Text)
- featured (Boolean)
- metaTitle (Text)
- metaDescription (Text)
- ogImage (File)

### Blog Post Model Fields

- title (Text)
- slug (Text)
- excerpt (Text)
- author (Text)
- authorImage (File)
- coverImage (File)
- content (Rich Text)
- category (Text)
- tags (List of Objects with 'tag' field)
- readTime (Number)
- featured (Boolean)
- publishedAt (Date)
- metaTitle (Text)
- metaDescription (Text)
- ogImage (File)

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

## License

All rights reserved - SimplerDevelopment

## Support

For issues or questions, please contact: contact@simplerdevelopment.com
