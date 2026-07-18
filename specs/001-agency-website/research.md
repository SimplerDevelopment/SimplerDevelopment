# Research: SimplerDevelopment.com Technical Decisions

**Feature**: SimplerDevelopment.com Agency Website
**Date**: 2026-01-13
**Status**: Complete

## Overview

This document contains all technical research and decisions made during Phase 0 planning for the SimplerDevelopment.com website. All NEEDS CLARIFICATION items from the Technical Context have been resolved.

---

## 1. Three.js Integration

### Decision
Use **@react-three/fiber v9.x + @react-three/drei v10.x** with Three.js

### Rationale
- React 19 and Next.js 16 App Router compatibility
- Declarative React API (40% faster development vs vanilla Three.js)
- Built-in performance optimizations (on-demand rendering, adaptive resolution)
- Excellent ecosystem with Drei helper components
- Strong TypeScript support
- Progressive enhancement patterns for SEO-first architecture

### Package Versions
```bash
npm install three @react-three/fiber@^9.0.0 @react-three/drei@^10.0.0
npm install -D @types/three
```

### Alternatives Considered
- **Vanilla Three.js**: Smaller bundle (~462KB vs 1,036KB) but imperative API doesn't mesh well with React, more boilerplate required
- **Babylon.js/PlayCanvas**: Smaller React ecosystem, less community momentum
- **CSS 3D Transforms**: Too limited for complex 3D scenes

### Implementation Notes
- All Three.js components require `"use client"` directive
- Use dynamic imports with `ssr: false` for proper hydration
- Implement progressive enhancement with WebGL detection
- Use `frameloop="demand"` for optimal performance
- Lazy load 3D scenes with React Suspense
- Reserve space for Canvas to prevent CLS

### Key Patterns
```typescript
// Dynamic import pattern
const Scene3D = dynamic(() => import('@/components/Scene3D'), {
  ssr: false,
  loading: () => <div>Loading 3D experience...</div>,
})

// Client component pattern
"use client"
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

export default function Scene3D() {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
    </Canvas>
  )
}
```

---

## 2. Scroll Animation Library

### Decision
Use **Framer Motion** (primary) with optional **Lenis** for smooth scrolling

### Rationale
- Official React 19 support
- Declarative, React-first API (best DX)
- Built-in parallax via `useScroll` + `useTransform`
- Excellent Three.js integration patterns
- MIT licensed (free commercial use)
- ~32KB bundle (acceptable for features)
- Optimized for Core Web Vitals

### Package Installation
```bash
npm install framer-motion
npm install lenis  # Optional for smooth scrolling
```

### Alternatives Considered
- **GSAP + ScrollTrigger**: Now free, powerful for complex timelines, but imperative API less idiomatic in React. Choose if pixel-perfect control needed.
- **Lenis alone**: Ultra-lightweight (~5KB) but only handles smooth scrolling, requires pairing with animation library
- **React-Spring**: Physics-based but less intuitive for scroll effects
- **Locomotive Scroll**: Unmaintained (last update 4 years ago), Next.js compatibility issues

### Implementation Notes
- Use "use client" wrapper components (MotionDiv, MotionSection)
- Animate composite-only properties (transform, opacity) for 60fps
- Use `whileInView` with `once: true` for one-time reveals
- Integrate with Three.js via `useScroll` hook
- Optional: Add Lenis for butter-smooth scrolling

### Key Patterns
```typescript
// Parallax pattern
"use client"
import { useScroll, useTransform } from 'framer-motion'
import { MotionDiv } from './MotionDiv'

export function ParallaxSection() {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], ["-20%", "20%"])

  return <MotionDiv style={{ y }}>{/* content */}</MotionDiv>
}
```

---

## 3. Form Handling & Email Delivery

### Decision
**Form Handling**: React Hook Form + Zod + Next.js Server Actions
**Email Delivery**: Resend

### Rationale - Form Handling
- React Hook Form: Excellent performance (12KB vs Formik's 44KB), actively maintained
- Zod: Type-safe validation shared between client and server
- Server Actions: Progressive enhancement, works without JavaScript, native Next.js integration
- Combined: Industry standard for Next.js 16 forms in 2026

### Rationale - Email Delivery
- Built specifically for Next.js developers
- Simple API with excellent DX
- Free tier: 3,000 emails/month (sufficient for contact form)
- React Email integration for beautiful templates
- TypeScript-first
- Good deliverability

### Package Installation
```bash
npm install react-hook-form zod @hookform/resolvers resend react-email
```

### Alternatives Considered - Form
- **Formik**: Not actively maintained (last commit 1+ year ago), larger bundle, avoid for new projects
- **Native HTML5 + Server Actions**: Viable for very simple forms, zero dependencies but more manual work
- **Server Actions alone**: Works but requires client-side validation library for immediate feedback

### Alternatives Considered - Email
- **AWS SES**: 87.5% cheaper at scale ($0.10/1000 vs Resend $20/50k), but complex setup, steeper learning curve
- **SendGrid**: Industry leader, proven scale, but expensive and cluttered interface
- **Nodemailer**: Free with Gmail SMTP, but 500/day limit, no built-in optimization

### Implementation Notes
- Client-side validation: React Hook Form + Zod
- Server-side validation: Server Actions + same Zod schema
- Use `useActionState` for server response handling
- Use `useFormStatus` for loading states
- Progressive enhancement by default with Server Actions

### Cost Analysis
- Resend free tier: 3,000 emails/month (perfect for contact form)
- AWS SES: Better for high-volume (>50k emails/month)

---

## 4. Testing Framework

### Decision
**Unit/Integration**: Vitest + React Testing Library
**E2E**: Playwright
**Three.js**: @react-three/test-renderer

### Rationale
- **Vitest**: 4x faster than Jest, ES modules out-of-box, React 19 compatible, official Next.js 16 support
- **Playwright**: Cross-browser (Chrome, Firefox, Safari/WebKit), 6x faster than Cypress with native parallelization
- **React Testing Library**: Industry standard for React component testing
- **@react-three/test-renderer**: Specialized for Three.js components

### Package Installation
```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @react-three/test-renderer jsdom @vitejs/plugin-react
```

### Alternatives Considered
- **Jest**: Traditional, mature, but slower than Vitest and more configuration needed
- **Cypress**: Lacks Safari/WebKit support (critical gap), slower than Playwright, external service for parallelization

### Test Distribution
- **70% Unit Tests**: Utility functions, components, hooks, business logic
- **20% Integration Tests**: Multi-component interactions, form flows, CMS rendering
- **10% E2E Tests**: Critical user journeys, cross-browser, real Builder.io integration

### Implementation Notes
- Use jsdom environment for React component tests
- Mock Next.js APIs (headers, cookies, params) in tests
- Test async Server Components with E2E (Playwright)
- Mock Builder.io API responses for integration tests
- Test WebGL initialization and fallbacks in E2E

---

## 5. Builder.io CMS Integration

### Decision
Use **@builder.io/sdk-react-nextjs v0.24.x** (official React Server Components SDK)

### Rationale
- Only SDK with proper Next.js App Router + RSC support
- Near-zero client-side JavaScript
- Actively maintained (updates within last week)
- Designed specifically for Next.js Server Components
- Visual editing experience for non-technical staff

### Package Installation
```bash
npm install @builder.io/sdk-react-nextjs
```

### Content Model Strategy

**Solutions**: Data Model
- Structured content with custom fields
- Control over rendering
- Fields: title, slug, description, image, content (richText), SEO metadata

**Blog Posts**: Data Model
- Structured articles with custom fields
- Fields: title, slug, excerpt, author, coverImage, content (richText), tags, SEO metadata

**About Page**: Page Model
- Full visual editing experience
- Use default "page" model

### Implementation Notes
- Set `NEXT_PUBLIC_BUILDER_API_KEY` in .env.local
- Configure Next.js Image for cdn.builder.io
- Use `fetchOneEntry` for dynamic routes
- Use `fetchEntries` for list pages
- Implement `generateStaticParams` for static generation
- Use `generateMetadata` for SEO
- Enable ISR with `export const revalidate = 60`
- Configure preview URLs in Builder.io dashboard

### TypeScript Types
Create custom types (no automatic generation available):
```typescript
interface SolutionData {
  title: string;
  slug: string;
  description?: string;
  image?: string;
  content: string;
  metaTitle?: string;
  metaDescription?: string;
}
```

### Key Patterns
```typescript
// Fetch content in Server Component
async function getSolution(slug: string) {
  return await fetchOneEntry({
    model: 'solution',
    apiKey: process.env.NEXT_PUBLIC_BUILDER_API_KEY!,
    userAttributes: { urlPath: `/solutions/${slug}` },
  });
}

// Generate metadata for SEO
export async function generateMetadata({ params }): Promise<Metadata> {
  const solution = await getSolution(params.slug);
  return {
    title: solution.data?.metaTitle || solution.data?.title,
    description: solution.data?.metaDescription,
    openGraph: { /* ... */ },
  };
}
```

---

## Additional Dependencies Identified

### Core Dependencies
```json
{
  "dependencies": {
    "three": "^0.16x",
    "@react-three/fiber": "^9.0.0",
    "@react-three/drei": "^10.0.0",
    "framer-motion": "^11.x",
    "lenis": "^1.x",
    "react-hook-form": "^7.x",
    "zod": "^3.x",
    "@hookform/resolvers": "^3.x",
    "resend": "^3.x",
    "react-email": "^2.x",
    "@builder.io/sdk-react-nextjs": "^0.24.0",
    "tailwind-merge": "^2.x",
    "clsx": "^2.x"
  },
  "devDependencies": {
    "@types/three": "^0.16x",
    "vitest": "^3.0.0",
    "@vitest/ui": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@playwright/test": "^1.48.0",
    "@react-three/test-renderer": "^9.0.0",
    "jsdom": "^25.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@next/bundle-analyzer": "^16.0.0"
  }
}
```

### Performance Monitoring
```bash
npm install @vercel/speed-insights
npm install -D r3f-perf  # Three.js performance monitoring
```

---

## Next.js Configuration Requirements

### next.config.ts Updates
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builder.io CDN images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.builder.io',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // GLTF/GLB file handling
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(glb|gltf)$/,
      use: {
        loader: 'file-loader',
      },
    })
    return config
  },
};

export default nextConfig;
```

---

## Performance Targets Validation

### Core Web Vitals
- **LCP < 2.5s**: Server-render content first, lazy load 3D
- **FID < 100ms**: Use CSS transforms (off main thread), `frameloop="demand"`
- **CLS < 0.1**: Reserve space for Canvas, avoid layout shifts

### 3D Rendering
- **30+ FPS**: Use `AdaptiveDpr`, LOD for complex models, on-demand rendering
- **Progressive Enhancement**: WebGL detection with fallbacks, Error Boundaries

### Bundle Optimization
- Dynamic imports for 3D scenes
- Code splitting by route
- Bundle analyzer for monitoring

---

## Security & Best Practices

### Environment Variables
- Use `NEXT_PUBLIC_` prefix for Builder.io API key (read-only, safe for public)
- Use private env vars for Resend API key
- Never expose write API keys

### Form Security
- Server-side validation with Zod (don't trust client)
- Rate limiting on contact form endpoint
- CSRF protection via Server Actions (built-in)

### Content Security
- Sanitize rich text from Builder.io if rendering HTML
- Use CSP headers appropriately
- Validate all user inputs

---

## Accessibility Considerations

### Target: WCAG 2.1 AA (Score 90+)

**Requirements**:
- Semantic HTML structure
- Proper heading hierarchy
- Alt text for all images (including 3D fallbacks)
- Keyboard navigation support
- Focus management
- Color contrast ratios
- Screen reader compatibility
- Skip to content links

**Testing**:
- Lighthouse accessibility audit
- axe DevTools
- Manual keyboard navigation testing
- Screen reader testing (VoiceOver/NVDA)

---

## Summary of Resolved Clarifications

| Technical Context Item | Decision |
|------------------------|----------|
| Three.js integration approach | @react-three/fiber v9 + @react-three/drei v10 |
| Scroll animation library | Framer Motion + optional Lenis |
| Form handling | React Hook Form + Zod + Server Actions |
| Email service | Resend |
| Testing framework | Vitest + React Testing Library + Playwright |
| Builder.io SDK | @builder.io/sdk-react-nextjs v0.24.x |

All NEEDS CLARIFICATION items from Technical Context have been resolved and documented with rationale, alternatives considered, and implementation guidance.

---

## Ready for Phase 1

With all technical decisions made and documented, the project is ready to proceed to Phase 1: Design & Contracts, which will include:
- Data model definitions
- API contracts for Builder.io content
- Quickstart guide
- Agent context updates
