# SimplerDevelopment Survey System Enhancement

## What This Is

A comprehensive survey platform within SimplerDevelopment that enables clients to create, distribute, and analyze surveys with branding, multi-page support, skip logic, and integrations with CRM, booking, and email campaigns. Used for NPS, CSAT, lead qualification, event feedback, and service intake forms.

## Core Value

Clients can collect structured feedback and data from their audiences through branded, multi-channel surveys with actionable analytics.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Survey CRUD with draft/active/closed workflow
- 15 field types (text, textarea, number, email, phone, url, select, radio, checkbox, rating, slider, toggle, date, heading, page_break)
- Multi-page surveys with progress bar and back/next navigation
- Skip logic (goToPage) for select/radio fields
- Response collection with source tracking (link, email, embed, crm, booking)
- CSV export of responses
- Per-survey branding (colors, logos, fonts, button styles via branding profiles)
- Custom thank-you page and redirect URL
- 6 built-in templates (NPS, CSAT, Customer Feedback, Event, Lead Qualification, Post-Meeting)
- Public survey URLs (/s/[slug])
- Iframe embedding with embed code generation
- Analytics dashboard (ratings, distributions, text samples)
- CRM deal, email campaign, booking page, and website integrations
- Service gate (subscription required)
- Notification options (per-response, daily/weekly digest)
- Response limits (closesAt, maxResponses)
- Respondent tracking (email, name, IP, user-agent)
- Atomic response submission (transaction-wrapped INSERT + UPDATE) — Validated in Phase 01
- Shared condition evaluator (isFieldVisible/getConditionalOptions) — Validated in Phase 01
- Immutable field IDs (updateField guard) — Validated in Phase 01
- Schema tables for partial responses, webhooks, email sequences, A/B variants, AI summaries — Validated in Phase 01

### Active

<!-- Current scope. Building toward these. -->

- [ ] Conditional visibility UI in SurveyBuilder for showIf/conditionalOptions
- [ ] Response filtering, search, and date range tools
- [ ] File/image upload field type with S3 integration
- [ ] Partial/incomplete response capture (per-page saves)
- [ ] Per-survey webhook URLs for external integrations
- [ ] Logic branching visualization (flow diagram)
- [ ] Response scoring and calculation fields with auto-routing
- [ ] Email follow-up sequences post-submission
- [ ] A/B testing (field variants with completion rate comparison)
- [ ] Native mobile survey screens (React Native)
- [ ] Real-time response dashboard (WebSocket-powered)
- [ ] AI-powered response summarization and sentiment analysis
- [ ] Survey piping / answer references in later questions
- [ ] Public results page with live charts
- [ ] Completion certificates / PDF generation

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Payment collection within surveys -- use dedicated booking/payment flows instead
- Survey marketplace/template sharing between tenants -- too complex, low demand
- Offline survey mode -- web-first platform, connectivity assumed

## Context

- Next.js 15 app with Drizzle ORM and PostgreSQL
- Survey schema: surveys table (JSON fields/pages) + survey_responses table (JSON answers)
- showIf and conditionalOptions already in TypeScript types but no UI builder
- Existing branding profiles system supports full theme customization
- WebSocket server exists for real-time features
- React Native mobile app exists but has no survey screens
- Automation engine supports survey events (created, updated, deleted, response_submitted)
- S3 integration exists for image uploads elsewhere in the platform

## Constraints

- **Tech stack**: Next.js, Drizzle ORM, PostgreSQL, React Native -- no new frameworks
- **Schema**: JSON field storage pattern must be maintained for survey fields/answers
- **Service gate**: All new features must respect existing subscription checks
- **Branding**: New features must integrate with existing branding profile system

## Current Milestone: v1.0 Survey System Enhancement

**Goal:** Transform the survey system from a basic data collection tool into a full-featured survey platform with conditional logic UI, advanced analytics, real-time collaboration, AI insights, mobile support, and external integrations.

**Target features:**
- Conditional visibility UI and logic branching visualization
- Response management improvements (filtering, partial saves, webhooks)
- New field capabilities (file upload, scoring, piping, A/B testing)
- Distribution enhancements (email follow-ups, public results, PDF certificates)
- Platform integrations (mobile app, real-time dashboard, AI summarization)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep JSON field storage | Flexibility for varied field types, already established pattern | -- Pending |
| Build conditional UI on existing showIf schema | Schema already supports it, just needs builder UI | -- Pending |

---
*Last updated: 2026-04-06 after Phase 01 (foundation-and-schema) completion*
