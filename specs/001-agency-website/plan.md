# Implementation Plan: SimplerDevelopment.com Agency Website

**Branch**: `001-agency-website` | **Date**: 2026-01-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-agency-website/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build an impressive, interactive Next.js website for SimplerDevelopment.com (Design, Dev, and Automation Agency) featuring 3D visual elements via Three.js, scroll-triggered animations, SEO optimization, Builder.io content management, and comprehensive light/dark mode theming. The site includes Home, Solutions (index + detail), About, Blog (index + single), and Contact pages, all optimized for performance and accessibility.

## Technical Context

**Language/Version**: TypeScript 5.x with Next.js 16.1.1 (App Router)
**Primary Dependencies**:
- React 19.2.3 / React DOM 19.2.3
- Three.js (NEEDS CLARIFICATION: version and React integration approach - @react-three/fiber vs vanilla)
- Tailwind CSS 4.x for styling
- Builder.io SDK for content management
- NEEDS CLARIFICATION: Scroll animation library (Framer Motion, GSAP, or Lenis)
- NEEDS CLARIFICATION: Form handling (React Hook Form, native, or form library)
- NEEDS CLARIFICATION: Email service integration for contact form

**Storage**: Builder.io headless CMS (external), no database required for MVP
**Testing**: NEEDS CLARIFICATION: Testing framework (Vitest, Jest, or Playwright for E2E)
**Target Platform**: Web (server-side rendered, static generation where possible)
**Project Type**: Web application (Next.js App Router structure)
**Performance Goals**:
- LCP < 2.5s, FID < 100ms, CLS < 0.1 (Core Web Vitals)
- 3D rendering at 30+ FPS on modern GPUs
- Initial page load < 2.5s on broadband

**Constraints**:
- SEO-first (server-side rendering required)
- Progressive enhancement (3D not required for core functionality)
- Accessibility score 90+ (WCAG 2.1 AA)
- Mobile-first responsive design

**Scale/Scope**:
- 7 page templates (Home, Solutions Index, Solutions Detail, About, Blog Index, Blog Single, Contact)
- ~10-20 initial solutions/services
- Blog content grows over time
- Moderate traffic (agency website, not high-volume app)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: N/A - Project constitution not yet established. No architectural constraints to validate at this time.

**Note**: Once a project constitution is established via `/speckit.constitution`, this section will validate compliance with defined architectural principles and constraints.

## Project Structure

### Documentation (this feature)

```text
specs/001-agency-website/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── builder-io.md    # Builder.io content schemas
├── checklists/
│   └── requirements.md  # Already created
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Next.js App Router Structure** (following Next.js 16 conventions):

```text
app/
├── (pages)/                    # Route group for main pages
│   ├── page.tsx                # Home page (/)
│   ├── solutions/
│   │   ├── page.tsx            # Solutions index (/solutions)
│   │   └── [slug]/
│   │       └── page.tsx        # Solution detail (/solutions/[slug])
│   ├── about/
│   │   └── page.tsx            # About page (/about)
│   ├── blog/
│   │   ├── page.tsx            # Blog index (/blog)
│   │   └── [slug]/
│   │       └── page.tsx        # Blog single (/blog/[slug])
│   └── contact/
│       └── page.tsx            # Contact page (/contact)
├── api/                        # API routes
│   └── contact/
│       └── route.ts            # Contact form submission endpoint
├── layout.tsx                  # Root layout (navigation, theme provider)
├── globals.css                 # Global styles, Tailwind imports
├── not-found.tsx               # 404 page
└── error.tsx                   # Error boundary

components/
├── three/                      # 3D components
│   ├── Scene.tsx               # Three.js scene wrapper
│   ├── FloatingElements.tsx    # Animated 3D elements
│   └── ParallaxBackground.tsx  # 3D parallax effects
├── ui/                         # Reusable UI components
│   ├── Navigation.tsx
│   ├── Footer.tsx
│   ├── ThemeToggle.tsx
│   ├── Button.tsx
│   ├── Card.tsx
│   └── ContactForm.tsx
├── sections/                   # Page section components
│   ├── Hero.tsx
│   ├── ServicesGrid.tsx
│   ├── TeamSection.tsx
│   └── BlogGrid.tsx
└── animations/                 # Scroll animation wrappers
    ├── FadeIn.tsx
    ├── SlideIn.tsx
    └── ParallaxSection.tsx

lib/
├── builder/                    # Builder.io integration
│   ├── config.ts               # Builder.io configuration
│   ├── api.ts                  # API helpers for fetching content
│   └── components.tsx          # Builder-registered components
├── utils/
│   ├── cn.ts                   # Class name merger (tailwind-merge)
│   ├── seo.ts                  # SEO metadata helpers
│   └── animations.ts           # Animation utilities
└── types/
    ├── builder.ts              # Builder.io content types
    ├── content.ts              # Content models (Solution, BlogPost, etc.)
    └── api.ts                  # API response types

hooks/
├── useTheme.ts                 # Theme management hook
├── useScrollAnimation.ts       # Scroll-triggered animations
└── use3DScene.ts               # Three.js scene management

public/
├── models/                     # 3D model files (.glb, .gltf)
├── textures/                   # Texture files for 3D
└── images/                     # Static images, icons

__tests__/                      # Test files
├── components/
├── pages/
└── integration/

config/
├── site.ts                     # Site-wide configuration
└── seo.ts                      # SEO defaults
```

**Structure Decision**: Using Next.js 16 App Router with route groups for clean organization. Components are organized by purpose (three, ui, sections, animations) for maintainability. Builder.io integration isolated in `lib/builder/` for clean separation of concerns. TypeScript types centralized in `lib/types/` for reusability.

## Complexity Tracking

N/A - No constitution violations to track.

---

## Phase 0: Research & Outline (COMPLETE)

### Status: ✅ Complete

All technical unknowns from Technical Context have been resolved through comprehensive research.

### Deliverables

**File**: `research.md` (9,000+ words)

**Decisions Made**:

1. **Three.js Integration**: @react-three/fiber v9 + @react-three/drei v10
   - Rationale: Best React 19/Next.js 16 compatibility, declarative API, performance optimizations
   - Rejected: Vanilla Three.js (too imperative), Babylon.js (smaller ecosystem)

2. **Scroll Animation**: Framer Motion + optional Lenis
   - Rationale: React-first, excellent DX, MIT licensed, ~32KB bundle
   - Rejected: GSAP (imperative), Locomotive Scroll (unmaintained)

3. **Form Handling**: React Hook Form + Zod + Server Actions
   - Rationale: Modern Next.js 16 best practice, progressive enhancement
   - Rejected: Formik (unmaintained), native only (missing features)

4. **Email Delivery**: Resend
   - Rationale: Built for Next.js, excellent DX, free tier sufficient
   - Rejected: AWS SES (complex setup), SendGrid (expensive), Nodemailer (manual work)

5. **Testing Framework**: Vitest + React Testing Library + Playwright
   - Rationale: 4x faster than Jest, cross-browser E2E with Playwright
   - Rejected: Jest (slower), Cypress (no Safari support)

6. **Builder.io Integration**: @builder.io/sdk-react-nextjs v0.24.x
   - Rationale: Only SDK with proper RSC support, near-zero client JS
   - Content Strategy: Data Models for Solutions/Blog, Page Model for About

### Research Coverage

- Three.js integration patterns for Next.js 16 App Router
- Scroll animation library comparison (5 options evaluated)
- Form handling approaches (4 options evaluated)
- Email delivery services (4 options evaluated)
- Testing frameworks (4 options evaluated)
- Builder.io setup and best practices for Next.js 16

All decisions documented with rationale, alternatives considered, implementation notes, and code examples.

---

## Phase 1: Design & Contracts (COMPLETE)

### Status: ✅ Complete

All design artifacts generated and agent context updated.

### Deliverables

1. **Data Model** (`data-model.md` - 5,000+ words)
   - Solution model (12 fields, validation rules, TypeScript types)
   - Blog Post model (14 fields, tag structure, TypeScript types)
   - Page model (About page, visual editing)
   - Contact Inquiry model (API contract, Zod schema)
   - Common patterns: SEO metadata, slug generation, image optimization
   - Data access layer with helper functions
   - Builder.io setup checklist

2. **API Contracts** (`contracts/builder-io.md` - 4,500+ words)
   - Builder.io model schemas with field definitions
   - API endpoints for fetching content
   - Request/response formats for all models
   - Contact form API contract with validation
   - Image optimization API patterns
   - Rate limits and caching strategies
   - Error handling patterns
   - Mock data for testing

3. **Quickstart Guide** (`quickstart.md` - 3,000+ words)
   - 30-minute onboarding guide
   - Quick setup (5 min): Dependencies, env vars, dev server
   - Project structure walkthrough (10 min)
   - Tech stack overview (5 min)
   - Common tasks: Create page, add component, add 3D scene
   - Builder.io setup instructions (5 min)
   - Troubleshooting common issues
   - Next steps and helpful resources

4. **Agent Context Update**
   - Executed `update-agent-context.sh claude`
   - Added TypeScript + Next.js 16 language context
   - Added Builder.io CMS database context
   - Created `<repo-root>/CLAUDE.md`

### Content Models Defined

**Solution** (Data Model):
- Fields: title, slug, description, image, content, benefits, featured, order, SEO metadata
- For: `/solutions/[slug]` pages
- Type: Structured content with rich text

**Blog Post** (Data Model):
- Fields: title, slug, excerpt, author, coverImage, content, category, tags, SEO metadata
- For: `/blog/[slug]` pages
- Type: Articles with metadata

**Page** (Page Model):
- For: About page with full visual editing
- Type: Visual builder experience

**Contact Inquiry** (API Model):
- Fields: name, email, message, subject
- Validation: Zod schema with detailed rules
- Processing: Server Action → Resend email

### TypeScript Types Created

All models have complete TypeScript interfaces with proper typing for Builder.io content structure, ensuring type safety throughout the application.

---

## Phase 2: Tasks Generation (PENDING)

### Status: ⏳ Pending

This phase will be executed via `/speckit.tasks` command (separate from `/speckit.plan`).

### Will Generate

- `tasks.md`: Dependency-ordered implementation tasks
- Task breakdown by priority and complexity
- Acceptance criteria for each task
- Dependencies between tasks

**Note**: Per the spec, `/speckit.plan` command ends after Phase 1. Task generation is a separate workflow.

---

## Planning Complete

### Summary

**Branch**: `001-agency-website`
**Spec File**: `specs/001-agency-website/spec.md`
**Planning Status**: Phase 0 ✅ | Phase 1 ✅ | Phase 2 ⏳

### Artifacts Generated

- [x] `plan.md` - This file (implementation plan)
- [x] `research.md` - Technical research and decisions
- [x] `data-model.md` - Content model definitions
- [x] `contracts/builder-io.md` - API contracts
- [x] `quickstart.md` - Developer onboarding guide
- [x] Agent context updated (`CLAUDE.md`)
- [ ] `tasks.md` - Generated by `/speckit.tasks` (next step)

### Ready For

1. **Task Generation**: Run `/speckit.tasks` to create dependency-ordered tasks
2. **Implementation**: Begin development once tasks are generated
3. **Content Setup**: Configure Builder.io models and add sample content

### Key Technical Decisions

| Area | Decision | Package |
|------|----------|---------|
| 3D Graphics | React Three Fiber | @react-three/fiber@^9.0.0 |
| Animations | Framer Motion | framer-motion |
| Forms | React Hook Form + Zod | react-hook-form, zod |
| Email | Resend | resend |
| CMS | Builder.io | @builder.io/sdk-react-nextjs@^0.24.0 |
| Testing | Vitest + Playwright | vitest, @playwright/test |

### Performance Targets

- **LCP**: < 2.5s (Server-render content first, lazy load 3D)
- **FID**: < 100ms (CSS transforms, on-demand rendering)
- **CLS**: < 0.1 (Reserve space for Canvas, avoid shifts)
- **3D**: 30+ FPS (AdaptiveDpr, LOD, frameloop="demand")
- **Accessibility**: 90+ score (WCAG 2.1 AA compliant)

### Next Command

```bash
/speckit.tasks
```

This will generate the implementation task list with dependencies and priorities.
