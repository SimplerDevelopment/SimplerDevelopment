# CRM Improvements Plan

## Phase 1: Foundation (Schema + Core Infrastructure)
**Goal:** Add the database and API infrastructure that other features depend on.

### 1A. Custom Fields
- Schema: `crm_custom_fields` table (id, clientId, entityType [contact|company|deal], fieldName, fieldType [text|number|date|select|multiselect|url|email|phone|boolean], options JSON, required, sortOrder)
- Schema: `crm_custom_field_values` table (id, customFieldId, entityId, entityType, value text)
- API: CRUD for custom field definitions (`/api/portal/crm/custom-fields`)
- API: Get/set values on contacts/companies/deals (extend existing endpoints)
- UI: Settings page section to manage custom fields
- UI: Dynamic form rendering on contact/company/deal detail pages

### 1B. Deal Ownership & Team Assignment
- Schema: Add `ownerId` (FK users) to `crmDeals`, `crmContacts`
- API: Update existing endpoints to support ownerId filter
- UI: Owner avatar/picker on deal cards, contact detail
- UI: "My Deals" / "All Deals" toggle on kanban board

### 1C. Contact Deduplication
- API: Duplicate detection endpoint (`/api/portal/crm/contacts/duplicates`) - match by email, phone, or name similarity
- API: Merge endpoint (`POST /api/portal/crm/contacts/merge`) - combine two contacts, reassign related deals/activities
- UI: Warning banner on contact create when duplicates detected
- UI: Dedicated merge UI on contact detail page

## Phase 2: Analytics & Intelligence
**Goal:** Turn CRM data into actionable insights.

### 2A. Pipeline Analytics Dashboard
- API: `/api/portal/crm/analytics` endpoint returning:
  - Win/loss rate by pipeline and time period
  - Average deal velocity (days per stage)
  - Pipeline value by stage (funnel data)
  - Monthly closed revenue trend (last 12 months)
  - Top deals by value
  - Activity metrics (calls/emails/meetings per period)
- UI: New "Analytics" page under CRM nav with charts (use recharts or similar)

### 2B. Lead Scoring
- Schema: Add `score` (integer) to `crmContacts`
- Schema: `crm_scoring_rules` table (id, clientId, eventType, points, description)
- Default rules: form submission +10, booking made +20, email opened +5, proposal viewed +15, deal created +25
- API: Score recalculation endpoint, auto-score on events via emitEvent
- UI: Score badge on contact cards/list, scoring rules config in Settings

### 2C. Saved Filters / Smart Views
- Schema: `crm_saved_views` table (id, clientId, entityType, name, filters JSON, isDefault, sortOrder)
- API: CRUD for saved views
- UI: View selector dropdown on contacts/deals/companies list pages
- UI: "Save current filter" button

## Phase 3: Communication
**Goal:** Connect email and notifications to CRM workflows.

### 3A. Email Integration
- Extend existing email module: when sending from CRM, auto-log to contact timeline
- API: `/api/portal/crm/contacts/[id]/send-email` - send email and create activity
- API: Track email opens via pixel (extend existing email tracking)
- UI: "Send Email" button on contact detail page with template picker
- UI: Email history tab on contact detail (pull from email module)

### 3B. Notification System
- Schema: `crm_notifications` table (id, clientId, userId, type, title, body, entityType, entityId, read, createdAt)
- Trigger notifications on: deal stage change, proposal viewed/signed, @mention, deal assigned to you, new contact from website
- API: `/api/portal/crm/notifications` - list, mark read, mark all read
- UI: Notification bell icon in portal header with unread count
- UI: Notification dropdown with links to relevant entities

## Phase 4: Data Operations
**Goal:** Make it easy to get data in and out.

### 4A. Bulk Import/Export
- API: `POST /api/portal/crm/contacts/import` - accept CSV, map fields, create contacts
- API: `GET /api/portal/crm/contacts/export` - CSV download with current filters
- Same for companies and deals
- UI: Import wizard (upload → field mapping → preview → confirm)
- UI: "Export" button on list pages

### 4B. Recurring Revenue Tracking
- Schema: Add `recurringValue` (integer cents), `billingCycle` (monthly|quarterly|annual) to `crmDeals`
- API: Extend deal endpoints + analytics for MRR/ARR calculation
- UI: MRR/ARR cards on dashboard
- UI: Recurring fields on deal create/edit forms

## Phase 5: AI & Automation
**Goal:** Differentiate with intelligent features.

### 5A. AI Deal Insights
- API: `/api/portal/crm/deals/[id]/insights` - use Claude API to summarize deal activity, suggest next steps
- API: `/api/portal/crm/contacts/[id]/draft-email` - generate personalized follow-up email
- UI: "AI Insights" panel on deal detail page
- UI: "Draft with AI" button on email compose

### 5B. Visual Workflow Automation Builder
- Schema: `crm_workflows` table (id, clientId, name, trigger JSON, conditions JSON, actions JSON, enabled, createdAt)
- Triggers: deal_stage_changed, deal_created, contact_created, proposal_viewed, etc.
- Actions: send_email, create_activity, update_field, create_deal, notify_user, webhook
- UI: Visual flow builder page (trigger → condition nodes → action nodes)

### 5C. Website Visitor → Contact Tracking
- When a visitor submits a form on a SimplerDevelopment site, auto-create CRM contact
- When a visitor books a meeting, enrich existing contact or create new one
- Schema: Add `websiteVisitorId` to `crmContacts` for linking
- API: Webhook/event handler that creates contacts from website/booking events
- UI: "Source: Website Form" badge on contact cards
