# Quickstart Guide: SimplerDevelopment.com

**Feature**: SimplerDevelopment.com Agency Website
**Date**: 2026-01-13
**For**: Developers onboarding to the project

## Overview

This guide will help you set up the SimplerDevelopment.com website development environment and understand the project structure in under 30 minutes.

---

## Prerequisites

- **Node.js**: v20+ (LTS recommended)
- **npm**: v10+ (comes with Node.js)
- **Git**: Latest version
- **Code Editor**: VS Code recommended
- **Browser**: Chrome/Firefox/Safari for testing

---

## Quick Setup (5 minutes)

### 1. Clone and Install

```bash
# Already in the repository
cd /Users/dancoyle/simplerdevelopment2026

# Install dependencies
npm install

# Install additional dependencies for this feature
npm install three @react-three/fiber@^9.0.0 @react-three/drei@^10.0.0 framer-motion lenis react-hook-form zod @hookform/resolvers resend react-email @builder.io/sdk-react-nextjs tailwind-merge clsx

# Install dev dependencies
npm install -D @types/three vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @react-three/test-renderer jsdom @vitejs/plugin-react @next/bundle-analyzer r3f-perf
```

### 2. Environment Variables

Create `.env.local` in the project root:

```bash
# Builder.io CMS
NEXT_PUBLIC_BUILDER_API_KEY=your_builder_io_public_api_key

# Resend Email API
RESEND_API_KEY=your_resend_api_key

# Optional: Analytics
NEXT_PUBLIC_GA_ID=your_google_analytics_id
```

**Get API Keys**:
- Builder.io: Sign up at https://builder.io → Get API key from Settings
- Resend: Sign up at https://resend.com → Get API key from API Keys section

### 3. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Project Structure (10 minutes)

### Key Directories

```
/Users/dancoyle/simplerdevelopment2026/
├── app/                    # Next.js App Router pages and API routes
│   ├── (pages)/            # Route group for main pages
│   │   ├── page.tsx        # Home page
│   │   ├── solutions/      # Solutions pages
│   │   ├── about/          # About page
│   │   ├── blog/           # Blog pages
│   │   └── contact/        # Contact page
│   ├── api/                # API routes (contact form)
│   ├── layout.tsx          # Root layout (navigation, theme)
│   └── globals.css         # Global styles
│
├── components/             # React components
│   ├── three/              # 3D components (Three.js)
│   ├── ui/                 # Reusable UI components
│   ├── sections/           # Page section components
│   └── animations/         # Scroll animation wrappers
│
├── lib/                    # Utilities and helpers
│   ├── builder/            # Builder.io integration
│   ├── utils/              # Utility functions
│   └── types/              # TypeScript type definitions
│
├── hooks/                  # Custom React hooks
│   ├── useTheme.ts         # Theme management
│   ├── useScrollAnimation.ts
│   └── use3DScene.ts
│
├── public/                 # Static assets
│   ├── models/             # 3D model files (.glb, .gltf)
│   ├── textures/           # Texture files
│   └── images/             # Images and icons
│
├── __tests__/              # Test files
│   ├── components/         # Component tests
│   ├── pages/              # Page tests
│   └── integration/        # Integration tests
│
├── config/                 # Configuration files
│   ├── site.ts             # Site-wide config
│   └── seo.ts              # SEO defaults
│
└── specs/                  # Feature specifications
    └── 001-agency-website/ # This feature's docs
```

### Key Files

- `next.config.ts`: Next.js configuration
- `tailwind.config.ts`: Tailwind CSS configuration
- `tsconfig.json`: TypeScript configuration
- `package.json`: Project dependencies
- `.env.local`: Environment variables (create this)

---

## Tech Stack Overview (5 minutes)

### Core Framework

- **Next.js 16.1.1**: React framework with App Router
- **React 19.2.3**: UI library
- **TypeScript 5**: Type-safe JavaScript

### Styling

- **Tailwind CSS 4**: Utility-first CSS framework
- **CSS Modules**: Component-scoped styles when needed

### 3D Graphics

- **Three.js**: 3D rendering library
- **@react-three/fiber**: React renderer for Three.js
- **@react-three/drei**: Helper components for R3F

### Animations

- **Framer Motion**: Scroll and UI animations
- **Lenis** (optional): Smooth scrolling

### Content Management

- **Builder.io**: Headless CMS for content
- **React Email**: Email templates

### Forms & Validation

- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **Resend**: Email delivery service

### Testing

- **Vitest**: Unit and integration testing
- **React Testing Library**: Component testing
- **Playwright**: End-to-end testing

---

## Common Tasks

### Create a New Page

```bash
# 1. Create page file
mkdir -p app/\(pages\)/new-page
touch app/\(pages\)/new-page/page.tsx

# 2. Add basic content
```

```typescript
// app/(pages)/new-page/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Page | SimplerDevelopment',
  description: 'Page description',
};

export default function NewPage() {
  return (
    <main className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold">New Page</h1>
    </main>
  );
}
```

### Add a New Component

```bash
# 1. Create component file
touch components/ui/NewComponent.tsx
```

```typescript
// components/ui/NewComponent.tsx
interface NewComponentProps {
  title: string;
  description?: string;
}

export function NewComponent({ title, description }: NewComponentProps) {
  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {description && <p className="text-gray-600">{description}</p>}
    </div>
  );
}
```

### Add a 3D Scene

```bash
# 1. Create scene component
touch components/three/MyScene.tsx
```

```typescript
// components/three/MyScene.tsx
"use client"

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';

function Box() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}

export function MyScene() {
  return (
    <div className="w-full h-[400px]">
      <Canvas>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <Box />
          <OrbitControls />
        </Suspense>
      </Canvas>
    </div>
  );
}
```

```typescript
// Use in a page with dynamic import
import dynamic from 'next/dynamic';

const MyScene = dynamic(() => import('@/components/three/MyScene').then(mod => ({ default: mod.MyScene })), {
  ssr: false,
  loading: () => <div className="w-full h-[400px] bg-gray-100 animate-pulse" />
});
```

### Fetch Content from Builder.io

```typescript
// lib/builder/api.ts
import { fetchOneEntry } from '@builder.io/sdk-react-nextjs';

export async function getPageContent(slug: string) {
  return await fetchOneEntry({
    model: 'solution',
    apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
    userAttributes: {
      urlPath: `/solutions/${slug}`,
    },
  });
}
```

### Run Tests

```bash
# Unit and integration tests
npm run test

# E2E tests
npx playwright test

# Watch mode (for development)
npm run test:watch

# With UI
npm run test:ui
```

### Build for Production

```bash
# Build
npm run build

# Start production server
npm run start

# Analyze bundle size
ANALYZE=true npm run build
```

---

## Development Workflow (5 minutes)

### 1. Feature Development Process

1. **Check out feature branch**: `git checkout 001-agency-website`
2. **Create component/page**: Follow structure in `app/` or `components/`
3. **Add styles**: Use Tailwind utility classes
4. **Test locally**: `npm run dev`
5. **Write tests**: Add unit tests for components
6. **Run linter**: `npm run lint`
7. **Commit changes**: Follow conventional commits

### 2. Working with Builder.io

1. **Set up models** in Builder.io dashboard (see `contracts/builder-io.md`)
2. **Add content** through Builder.io visual editor
3. **Fetch in components** using `fetchOneEntry` or `fetchEntries`
4. **Preview changes** using Builder.io preview mode

### 3. Testing 3D Scenes

1. **Use browser DevTools** to inspect WebGL performance
2. **Check FPS** with r3f-perf in development
3. **Test on different devices** (desktop, mobile, tablet)
4. **Verify fallbacks** work when WebGL is unavailable

### 4. Deployment

```bash
# Vercel (recommended)
# Connect GitHub repo to Vercel
# Automatic deployments on push

# Or deploy manually
vercel --prod
```

---

## Builder.io Setup (5 minutes)

### 1. Create Account

1. Go to https://builder.io
2. Sign up for free account
3. Create new space for "SimplerDevelopment"

### 2. Create Content Models

Follow instructions in `specs/001-agency-website/contracts/builder-io.md`:

1. Create "solution" Data Model
2. Create "blog-post" Data Model
3. Configure "page" model for About page

### 3. Add Sample Content

1. Create 2-3 sample solutions
2. Create 2-3 sample blog posts
3. Create About page

### 4. Configure Preview URLs

In Builder.io dashboard:
1. Go to each model settings
2. Set preview URL:
   - Solutions: `http://localhost:3000/solutions/[slug]`
   - Blog: `http://localhost:3000/blog/[slug]`
   - Page: `http://localhost:3000/[path]`

---

## Common Issues & Solutions

### Three.js Import Errors

**Problem**: `Module not found: Can't resolve 'three'`

**Solution**:
```bash
npm install three @react-three/fiber @react-three/drei @types/three
```

### Builder.io API Key Not Working

**Problem**: Content not loading from Builder.io

**Solution**:
1. Check `.env.local` has `NEXT_PUBLIC_BUILDER_API_KEY`
2. Restart dev server: `npm run dev`
3. Verify API key is correct in Builder.io dashboard

### Hydration Errors with Three.js

**Problem**: Hydration mismatch errors

**Solution**:
Use dynamic imports with `ssr: false`:
```typescript
const Scene3D = dynamic(() => import('@/components/Scene3D'), {
  ssr: false
});
```

### Tailwind Classes Not Working

**Problem**: Styles not applying

**Solution**:
1. Check `tailwind.config.ts` content paths
2. Restart dev server
3. Clear `.next` folder: `rm -rf .next`

---

## Next Steps

1. **Read the spec**: `specs/001-agency-website/spec.md`
2. **Review data model**: `specs/001-agency-website/data-model.md`
3. **Check API contracts**: `specs/001-agency-website/contracts/builder-io.md`
4. **Explore research**: `specs/001-agency-website/research.md`
5. **Review tasks**: `specs/001-agency-website/tasks.md` (once generated)

---

## Helpful Resources

### Documentation

- [Next.js Docs](https://nextjs.org/docs)
- [React Three Fiber Docs](https://r3f.docs.pmnd.rs)
- [Framer Motion Docs](https://motion.dev)
- [Builder.io Docs](https://builder.io/c/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

### Tools

- [Three.js Editor](https://threejs.org/editor/)
- [Builder.io Visual Editor](https://builder.io)
- [React DevTools](https://react.dev/learn/react-developer-tools)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

### Community

- [Next.js GitHub](https://github.com/vercel/next.js)
- [React Three Fiber Discord](https://discord.gg/poimandres)
- [Builder.io Forum](https://forum.builder.io)

---

## Support

For questions or issues:
1. Check this quickstart guide
2. Review feature spec and documentation in `specs/001-agency-website/`
3. Search Next.js and library documentation
4. Ask team members or create an issue

---

**Happy coding! 🚀**

Let's build something impressive for SimplerDevelopment.com.
