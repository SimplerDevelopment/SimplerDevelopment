# Tasks: SimplerDevelopment.com Agency Website

**Input**: Design documents from `/specs/001-agency-website/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Tests are NOT explicitly required in the spec, so test tasks are NOT included. Focus is on implementation and manual validation per user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Using Next.js 16 App Router structure at repository root:
- Pages: `app/(pages)/`
- Components: `components/`
- Utilities: `lib/`
- Types: `lib/types/`
- Public assets: `public/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [ ] T001 Install core dependencies (three, @react-three/fiber, @react-three/drei, framer-motion, lenis)
- [ ] T002 [P] Install form dependencies (react-hook-form, zod, @hookform/resolvers, resend, react-email)
- [ ] T003 [P] Install CMS dependency (@builder.io/sdk-react-nextjs)
- [ ] T004 [P] Install utility dependencies (tailwind-merge, clsx)
- [ ] T005 [P] Install dev dependencies (@types/three, @next/bundle-analyzer, r3f-perf)
- [ ] T006 Configure next.config.ts with Builder.io image domains and GLTF webpack loader
- [ ] T007 [P] Create .env.local.example with required environment variables template
- [ ] T008 [P] Create lib/utils/cn.ts utility for class name merging
- [ ] T009 [P] Create config/site.ts for site-wide configuration
- [ ] T010 [P] Create config/seo.ts for default SEO metadata

**Checkpoint**: Dependencies installed, basic configuration complete

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Create lib/types/content.ts with TypeScript interfaces for BuilderContent, SolutionData, BlogPostData
- [ ] T012 [P] Create lib/types/builder.ts for Builder.io-specific types
- [ ] T013 [P] Create lib/types/api.ts for API response types
- [ ] T014 Create lib/builder/config.ts with Builder.io API key configuration
- [ ] T015 Create lib/builder/api.ts with content fetching helpers (getSolution, getAllSolutions, getBlogPost, getAllBlogPosts)
- [ ] T016 Create app/layout.tsx with root HTML structure, metadata, and font configuration
- [ ] T017 Create app/globals.css with Tailwind imports and base styles
- [ ] T018 [P] Create components/ui/Navigation.tsx with site navigation
- [ ] T019 [P] Create components/ui/Footer.tsx with site footer
- [ ] T020 Create app/not-found.tsx for 404 handling
- [ ] T021 [P] Create app/error.tsx for error boundary
- [ ] T022 [P] Create lib/utils/seo.ts with metadata generation helpers
- [ ] T023 Update app/layout.tsx to include Navigation and Footer components
- [ ] T024 Create components/animations/MotionDiv.tsx as client component wrapper for framer-motion div
- [ ] T025 [P] Create components/animations/MotionSection.tsx as client component wrapper for framer-motion section
- [ ] T026 Create hooks/useTheme.ts for theme management (system preference detection)
- [ ] T027 Create components/ui/ThemeToggle.tsx for light/dark mode toggle
- [ ] T028 Update app/layout.tsx to include theme provider and ThemeToggle

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Discover Agency Services (Priority: P1) 🎯 MVP

**Goal**: Enable visitors to discover SimplerDevelopment's service offerings through home page and solutions pages with 3D visual elements

**Independent Test**: Navigate from home page → solutions index → individual solution page. Verify 3D elements render, scroll animations work, navigation functions, and Builder.io content displays correctly.

### Implementation for User Story 1

#### Core Pages

- [ ] T029 [P] [US1] Create app/(pages)/page.tsx for home page with metadata and layout structure
- [ ] T030 [P] [US1] Create app/(pages)/solutions/page.tsx for solutions index with fetchEntries integration
- [ ] T031 [P] [US1] Create app/(pages)/solutions/[slug]/page.tsx with generateStaticParams and generateMetadata

#### Three.js 3D Components

- [ ] T032 [P] [US1] Create components/three/Scene.tsx as client component Canvas wrapper with Suspense
- [ ] T033 [P] [US1] Create components/three/FloatingElements.tsx with animated 3D geometric shapes
- [ ] T034 [P] [US1] Create components/three/ParallaxBackground.tsx with 3D background parallax effect
- [ ] T035 [P] [US1] Create hooks/use3DScene.ts for Three.js scene management and optimization

#### Scroll Animation Components

- [ ] T036 [P] [US1] Create components/animations/FadeIn.tsx with framer-motion fade-in on scroll
- [ ] T037 [P] [US1] Create components/animations/SlideIn.tsx with framer-motion slide-in on scroll
- [ ] T038 [P] [US1] Create components/animations/ParallaxSection.tsx with useScroll and useTransform hooks
- [ ] T039 [P] [US1] Create hooks/useScrollAnimation.ts for scroll-triggered animation utilities
- [ ] T040 [P] [US1] Create lib/utils/animations.ts with animation helper functions

#### Page Sections

- [ ] T041 [US1] Create components/sections/Hero.tsx with 3D background, headline, and CTA (depends on T032)
- [ ] T042 [P] [US1] Create components/sections/ServicesGrid.tsx for solutions display grid
- [ ] T043 [P] [US1] Create components/ui/Card.tsx reusable card component for service items
- [ ] T044 [P] [US1] Create components/ui/Button.tsx reusable button component with variants

#### Integration & Polish

- [ ] T045 [US1] Integrate Hero section into home page (app/(pages)/page.tsx) with dynamic import for 3D
- [ ] T046 [US1] Integrate ServicesGrid into home page with featured solutions from Builder.io
- [ ] T047 [US1] Add scroll animations (FadeIn, SlideIn) to home page sections
- [ ] T048 [US1] Implement solutions index page content with getAllSolutions and ServicesGrid
- [ ] T049 [US1] Implement solution detail page with getSolution and rich content rendering
- [ ] T050 [US1] Add SEO metadata generation to all US1 pages using lib/utils/seo.ts
- [ ] T051 [US1] Add alt text to all images and 3D fallback content for accessibility
- [ ] T052 [US1] Test WebGL detection and fallback for browsers without 3D support
- [ ] T053 [US1] Verify ISR revalidation (export const revalidate = 60) on all pages
- [ ] T054 [US1] Test navigation between home → solutions index → solution detail

**Checkpoint**: User Story 1 complete - Home page and Solutions pages fully functional with 3D elements and scroll animations

---

## Phase 4: User Story 6 - Search Engine Discovery (Priority: P1)

**Goal**: Ensure all pages are SEO-optimized with proper metadata, semantic HTML, and performance targets

**Independent Test**: Run Lighthouse SEO audit, validate meta tags on all pages, check sitemap.xml, verify Core Web Vitals meet targets (LCP < 2.5s, FID < 100ms, CLS < 0.1)

### Implementation for User Story 6

- [ ] T055 [P] [US6] Create app/sitemap.ts to generate XML sitemap dynamically
- [ ] T056 [P] [US6] Create app/robots.txt route handler for search engine crawlers
- [ ] T057 [P] [US6] Add JSON-LD structured data to home page for Organization schema
- [ ] T058 [US6] Review all existing pages (home, solutions) and ensure semantic HTML (h1, nav, main, article, etc.)
- [ ] T059 [US6] Add Open Graph images to all Builder.io content models via ogImage field
- [ ] T060 [US6] Optimize image loading with Next.js Image component throughout all pages
- [ ] T061 [US6] Reserve space for 3D Canvas components to prevent CLS (Cumulative Layout Shift)
- [ ] T062 [US6] Add @vercel/speed-insights for Core Web Vitals monitoring
- [ ] T063 [US6] Run Lighthouse audit and address any SEO, performance, or accessibility issues
- [ ] T064 [US6] Verify all pages have unique meta titles and descriptions
- [ ] T065 [US6] Test page load performance and ensure LCP < 2.5s target met

**Checkpoint**: SEO optimization complete - Site is search engine friendly and meets performance targets

---

## Phase 5: User Story 4 - Contact the Agency (Priority: P2)

**Goal**: Enable visitors to contact the agency through a validated contact form with email delivery

**Independent Test**: Navigate to /contact, fill out form with valid/invalid data, verify validation messages, submit successfully, confirm email received via Resend

### Implementation for User Story 4

#### Form Components

- [ ] T066 [P] [US4] Create lib/validations.ts with Zod schema for contact form (contactFormSchema)
- [ ] T067 [P] [US4] Create components/ui/ContactForm.tsx client component with React Hook Form integration
- [ ] T068 [P] [US4] Add form field components (Input, Textarea) to ContactForm with validation feedback

#### API & Email

- [ ] T069 [US4] Create app/api/contact/route.ts Server Action for form submission
- [ ] T070 [US4] Integrate Zod validation in contact route (server-side validation)
- [ ] T071 [US4] Integrate Resend email sending in contact route with error handling
- [ ] T072 [P] [US4] Create email template using react-email in emails/ContactEmail.tsx

#### Page

- [ ] T073 [US4] Create app/(pages)/contact/page.tsx with ContactForm and additional contact info
- [ ] T074 [US4] Add SEO metadata to contact page
- [ ] T075 [US4] Style contact page with scroll animations (FadeIn)
- [ ] T076 [US4] Add success/error state handling to ContactForm with user feedback
- [ ] T077 [US4] Test form validation (client-side and server-side)
- [ ] T078 [US4] Test form submission with real Resend API key
- [ ] T079 [US4] Verify rate limiting and spam protection work correctly

**Checkpoint**: Contact form complete - Visitors can successfully contact the agency

---

## Phase 6: User Story 2 - Learn About the Agency (Priority: P2)

**Goal**: Provide visitors with agency background, mission, and team information through About page with visual editing via Builder.io

**Independent Test**: Navigate to /about, verify Builder.io content loads, scroll through page, verify visual effects and CTAs work

### Implementation for User Story 2

- [ ] T080 [P] [US2] Create app/(pages)/about/page.tsx with Builder.io fetchOneEntry for 'page' model
- [ ] T081 [US2] Integrate Builder.io Content component for visual editing on About page
- [ ] T082 [P] [US2] Create components/sections/TeamSection.tsx for team member display (if needed)
- [ ] T083 [US2] Add scroll animations (ParallaxSection, FadeIn) to About page sections
- [ ] T084 [US2] Add 3D visual elements to About page (integrate Scene.tsx with dynamic import)
- [ ] T085 [US2] Add SEO metadata generation to About page
- [ ] T086 [US2] Add CTAs at end of About page (view solutions, contact, read blog)
- [ ] T087 [US2] Set up Builder.io 'page' model in Builder.io dashboard for /about URL path
- [ ] T088 [US2] Add sample content to About page via Builder.io visual editor
- [ ] T089 [US2] Test About page loads correctly with Builder.io content
- [ ] T090 [US2] Verify visual effects and 3D elements work on About page

**Checkpoint**: About page complete - Visitors can learn about the agency

---

## Phase 7: User Story 7 - Content Updates (Priority: P2)

**Goal**: Enable agency staff to update content via Builder.io CMS without developer intervention

**Independent Test**: Log into Builder.io, create/edit a solution and blog post, verify changes appear on live site within ISR revalidation period

### Implementation for User Story 7

#### Builder.io Setup

- [ ] T091 [US7] Create 'solution' Data Model in Builder.io dashboard with all fields from data-model.md
- [ ] T092 [US7] Create 'blog-post' Data Model in Builder.io dashboard with all fields from data-model.md
- [ ] T093 [US7] Configure preview URLs for solution model: http://localhost:3000/solutions/[slug]
- [ ] T094 [US7] Configure preview URLs for blog-post model: http://localhost:3000/blog/[slug]
- [ ] T095 [US7] Configure preview URL for page model: http://localhost:3000/[path]

#### Content Creation

- [ ] T096 [P] [US7] Create 3 sample solutions in Builder.io with all required fields
- [ ] T097 [P] [US7] Create 3 sample blog posts in Builder.io with all required fields
- [ ] T098 [US7] Update About page content in Builder.io visual editor

#### Validation

- [ ] T099 [US7] Test creating new solution via Builder.io and verify it appears on solutions index
- [ ] T100 [US7] Test editing existing solution and verify changes appear after ISR revalidation
- [ ] T101 [US7] Test creating new blog post via Builder.io and verify it appears on blog index
- [ ] T102 [US7] Test visual editor on About page and verify changes appear
- [ ] T103 [US7] Verify SEO metadata fields work correctly in Builder.io interface

**Checkpoint**: CMS integration complete - Staff can manage content independently

---

## Phase 8: User Story 3 - Read Agency Insights (Priority: P3)

**Goal**: Provide visitors with blog content to explore agency expertise and thought leadership

**Independent Test**: Navigate to /blog, view blog index with posts, click a post, read full article with formatting, verify related posts/CTAs at end

### Implementation for User Story 3

#### Pages

- [ ] T104 [P] [US3] Create app/(pages)/blog/page.tsx for blog index with getAllBlogPosts
- [ ] T105 [P] [US3] Create app/(pages)/blog/[slug]/page.tsx with generateStaticParams and generateMetadata for blog posts

#### Components

- [ ] T106 [P] [US3] Create components/sections/BlogGrid.tsx for blog post grid display
- [ ] T107 [P] [US3] Update Card component (components/ui/Card.tsx) to support blog post variant
- [ ] T108 [US3] Add blog post card with excerpt, author, date, cover image to BlogGrid

#### Blog Post Page

- [ ] T109 [US3] Implement blog post detail page with cover image, author, content, and tags
- [ ] T110 [US3] Add rich text content rendering with proper typography styles (prose classes)
- [ ] T111 [US3] Add reading time calculation and display
- [ ] T112 [US3] Add related posts section at end of blog post (query by category/tags)
- [ ] T113 [US3] Add CTAs at end of blog post (view solutions, contact)
- [ ] T114 [US3] Add scroll animations to blog post content (subtle FadeIn effects)
- [ ] T115 [US3] Add SEO metadata and JSON-LD structured data (BlogPosting schema) to blog posts
- [ ] T116 [US3] Add social sharing meta tags (Open Graph, Twitter Card) to blog posts

#### Integration

- [ ] T117 [US3] Add featured blog posts section to home page (optional enhancement)
- [ ] T118 [US3] Test blog index pagination (if implementing limit/offset)
- [ ] T119 [US3] Test blog post navigation and verify all posts are accessible
- [ ] T120 [US3] Verify blog content displays correctly with Builder.io rich text formatting

**Checkpoint**: Blog complete - Visitors can read agency insights and expertise

---

## Phase 9: User Story 5 - Toggle Visual Theme (Priority: P3)

**Goal**: Allow visitors to toggle between light/dark mode with system preference detection

**Independent Test**: Toggle theme on any page, verify smooth transition, navigate between pages and verify persistence, check dark mode optimizations for 3D elements

### Implementation for User Story 5

- [ ] T121 [US5] Update hooks/useTheme.ts to add manual toggle functionality (currently only system preference)
- [ ] T122 [US5] Add theme state management with localStorage or sessionStorage for persistence
- [ ] T123 [US5] Update components/ui/ThemeToggle.tsx with visual toggle button (sun/moon icon)
- [ ] T124 [US5] Add theme toggle to Navigation component
- [ ] T125 [US5] Create dark mode color palette in tailwind.config.ts
- [ ] T126 [US5] Update all components to support dark mode classes (dark: variants)
- [ ] T127 [US5] Optimize 3D elements (Scene, FloatingElements) for dark mode visibility
- [ ] T128 [US5] Test theme transition smoothness (< 0.5s per spec requirement)
- [ ] T129 [US5] Test theme persistence across page navigation
- [ ] T130 [US5] Verify system preference detection works on initial page load
- [ ] T131 [US5] Test dark mode on all pages (home, solutions, about, blog, contact)

**Checkpoint**: Theme toggle complete - Visitors can switch between light/dark modes

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [ ] T132 [P] Add loading.tsx files to app routes for better loading states
- [ ] T133 [P] Add proper TypeScript types to all components (review and fix any 'any' types)
- [ ] T134 [P] Optimize 3D models and textures for faster loading (if added to public/models/)
- [ ] T135 [P] Add bundle analysis and review bundle size (run ANALYZE=true npm run build)
- [ ] T136 Code cleanup: Remove console.logs and debug code
- [ ] T137 [P] Add keyboard navigation support to all interactive elements
- [ ] T138 [P] Run accessibility audit (Lighthouse) and fix any issues to reach 90+ score
- [ ] T139 Verify all Core Web Vitals targets met (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- [ ] T140 [P] Add error boundaries around 3D components for graceful degradation
- [ ] T141 Test entire site on mobile devices (responsive design verification)
- [ ] T142 Test entire site across browsers (Chrome, Firefox, Safari, Edge)
- [ ] T143 [P] Update README.md with project overview and setup instructions
- [ ] T144 Validate quickstart.md accuracy and update if needed
- [ ] T145 Final manual testing of all user stories end-to-end

**Checkpoint**: Production ready - Site meets all quality and performance targets

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-9)**: All depend on Foundational phase completion
  - User stories can proceed in parallel if staffed
  - Or sequentially in priority order: US1 → US6 → US4 → US2 → US7 → US3 → US5
- **Polish (Phase 10)**: Depends on desired user stories being complete

### User Story Dependencies

- **US1 (Discover Services - P1)**: No dependencies on other stories ✓ Independent
- **US6 (SEO - P1)**: Enhances US1, can run in parallel ✓ Independent
- **US4 (Contact - P2)**: No dependencies on other stories ✓ Independent
- **US2 (About - P2)**: No dependencies on other stories ✓ Independent
- **US7 (CMS - P2)**: Enables content management for US1/US3, can integrate after ✓ Independent
- **US3 (Blog - P3)**: No dependencies on other stories ✓ Independent
- **US5 (Theme - P3)**: Enhances all pages, should be done after core pages exist ⚠️ Affects all pages

### Within Each User Story

- Models/types before components that use them
- Utilities before components that import them
- Components before pages that integrate them
- Pages before integration/testing tasks
- Core functionality before polish/optimization

### Parallel Opportunities

#### Phase 1 (Setup)
- All installation tasks (T001-T005) can run together
- All configuration tasks (T006-T010) can run together

#### Phase 2 (Foundational)
- Type definitions (T011-T013) can run in parallel
- Components (T018-T019, T021) can run in parallel
- Utilities (T022, T026) can run in parallel
- Animation wrappers (T024-T025) can run in parallel

#### Phase 3 (User Story 1)
- Core pages (T029-T031) can run in parallel initially
- 3D components (T032-T035) can run in parallel
- Scroll animation components (T036-T040) can run in parallel
- Page sections (T042-T044) can run in parallel after Hero

#### User Stories (Phases 3-9)
- **Once Foundational completes, these can ALL run in parallel by different developers:**
  - US1: Developer A
  - US6: Developer B (can enhance US1 pages as they're built)
  - US4: Developer C
  - US2: Developer D
  - US7: Developer E (CMS setup)
  - US3: Developer F
  - US5: Developer G (can apply to pages as they're built)

#### Phase 10 (Polish)
- Documentation (T143-T144) can run in parallel
- Audits (T137-T139) can run in parallel
- Optimizations (T132-T135) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch 3D component development in parallel:
Task T032: "Create components/three/Scene.tsx"
Task T033: "Create components/three/FloatingElements.tsx"
Task T034: "Create components/three/ParallaxBackground.tsx"
Task T035: "Create hooks/use3DScene.ts"

# Launch scroll animation development in parallel:
Task T036: "Create components/animations/FadeIn.tsx"
Task T037: "Create components/animations/SlideIn.tsx"
Task T038: "Create components/animations/ParallaxSection.tsx"
Task T039: "Create hooks/useScrollAnimation.ts"
Task T040: "Create lib/utils/animations.ts"

# Launch UI components in parallel:
Task T042: "Create components/sections/ServicesGrid.tsx"
Task T043: "Create components/ui/Card.tsx"
Task T044: "Create components/ui/Button.tsx"
```

---

## Parallel Example: Multiple User Stories

```bash
# After Phase 2 (Foundational) completes, launch all user stories:
Team Member 1: Phase 3 (User Story 1 - Services)
Team Member 2: Phase 4 (User Story 6 - SEO)
Team Member 3: Phase 5 (User Story 4 - Contact)
Team Member 4: Phase 6 (User Story 2 - About)
Team Member 5: Phase 8 (User Story 3 - Blog)

# User Story 7 (CMS) and User Story 5 (Theme) can also start,
# but coordinate with other team members as they affect multiple pages
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 6 Only)

**Fastest path to demo-able website:**

1. Complete Phase 1: Setup (T001-T010) - ~30 minutes
2. Complete Phase 2: Foundational (T011-T028) - ~2-3 hours
3. Complete Phase 3: User Story 1 (T029-T054) - ~6-8 hours
4. Complete Phase 4: User Story 6 (T055-T065) - ~2-3 hours
5. **STOP and VALIDATE**: Test home page and solutions pages independently
6. Deploy/demo if ready

**MVP Delivers:**
- ✅ Home page with 3D visuals and scroll animations
- ✅ Solutions index and detail pages
- ✅ Builder.io CMS integration
- ✅ SEO-optimized pages
- ✅ Navigation and responsive layout

**Total Estimated Time**: ~12-15 hours for solo developer

---

### Incremental Delivery (Priority Order)

**Add features incrementally after MVP:**

1. **Foundation** (Phases 1-2) → ~3-4 hours
2. **MVP** (US1 + US6 - Phases 3-4) → ~10-12 hours → Deploy ✓
3. **Contact** (US4 - Phase 5) → ~3-4 hours → Deploy ✓
4. **About** (US2 - Phase 6) → ~2-3 hours → Deploy ✓
5. **CMS Setup** (US7 - Phase 7) → ~2-3 hours → Deploy ✓
6. **Blog** (US3 - Phase 8) → ~4-5 hours → Deploy ✓
7. **Theme Toggle** (US5 - Phase 9) → ~3-4 hours → Deploy ✓
8. **Polish** (Phase 10) → ~4-6 hours → Final Deploy ✓

**Total Estimated Time**: ~35-45 hours for complete implementation

Each increment is independently deployable and adds value without breaking previous features.

---

### Parallel Team Strategy

**With 3-5 developers, dramatically reduce time:**

**Week 1: Foundation + Core Features**
- Day 1-2: Everyone completes Setup + Foundational together (~4-6 hours)
- Day 3-5: Split into parallel tracks:
  - Developer A: US1 (Services)
  - Developer B: US6 (SEO - enhances A's pages)
  - Developer C: US4 (Contact)
  - Developer D: US2 (About)
  - Developer E: US7 (CMS Setup)

**Week 2: Additional Features + Polish**
- Developer F: US3 (Blog)
- Developer G: US5 (Theme)
- Everyone: Phase 10 (Polish) together

**Timeline**: 1-2 weeks to complete everything vs 1 week solo for MVP only

---

## Task Summary

**Total Tasks**: 145

### Breakdown by Phase:
- Phase 1 (Setup): 10 tasks
- Phase 2 (Foundational): 18 tasks
- Phase 3 (US1 - Services): 26 tasks
- Phase 4 (US6 - SEO): 11 tasks
- Phase 5 (US4 - Contact): 14 tasks
- Phase 6 (US2 - About): 11 tasks
- Phase 7 (US7 - CMS): 13 tasks
- Phase 8 (US3 - Blog): 17 tasks
- Phase 9 (US5 - Theme): 11 tasks
- Phase 10 (Polish): 14 tasks

### Parallelization Opportunities:
- **Setup**: 9 tasks can run in parallel (T001-T005, T007-T010)
- **Foundational**: 15 tasks can run in parallel (most tasks marked [P])
- **User Stories**: 7 independent stories can run completely in parallel after Foundational
- **Within each story**: 40+ tasks marked [P] for parallel execution

### Independent Test Validation:
- ✅ Every user story has clear independent test criteria
- ✅ Each story can be deployed and validated separately
- ✅ MVP (US1 + US6) delivers core business value
- ✅ Incremental delivery allows continuous deployment

---

## Format Validation ✅

**Checklist Format Compliance**: All 145 tasks follow the required format:
- ✅ Checkbox (`- [ ]`)
- ✅ Task ID (T001-T145 sequential)
- ✅ [P] marker where applicable (parallel execution safe)
- ✅ [Story] label (US1-US7) for user story tasks
- ✅ Clear description with file paths

**Examples**:
- ✅ `- [ ] T001 Install core dependencies (three, @react-three/fiber, @react-three/drei, framer-motion, lenis)`
- ✅ `- [ ] T032 [P] [US1] Create components/three/Scene.tsx as client component Canvas wrapper with Suspense`
- ✅ `- [ ] T066 [P] [US4] Create lib/validations.ts with Zod schema for contact form (contactFormSchema)`

---

## Notes

- Tests NOT included as they were not explicitly requested in spec
- Focus on manual validation per user story's "Independent Test" criteria
- All user stories are independently testable and deployable
- MVP (US1 + US6) recommended for first iteration
- Builder.io setup (US7) can be done early to enable content creation in parallel
- Theme toggle (US5) best done after core pages exist
- Commit after each task or logical group for clean history
