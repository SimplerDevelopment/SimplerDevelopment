You are working inside the existing /simplerdevelopment2026 application.

Build a reusable feature module called Company Brain.

This is a workspace-level feature, not a standalone app and not a note-taking/wiki system.

Product goal:
Create a structured business intelligence and operating layer for client workspaces. The feature should help a company capture meetings, relationships, tasks, decisions, documents, and institutional context into a secure, AI-queryable command center.

Architecture principles:
- PostgreSQL is the source of truth.
- The system is structured, relational, and workflow-driven.
- Do not build a markdown-first notes app.
- Do not build a generic CRM clone.
- Build a reusable module that can be configured per workspace/client.
- AI generates drafts and suggestions; humans approve before critical data is written.
- All records must be scoped by workspace_id for multi-tenant isolation.
- Add audit logs for sensitive actions and AI-generated outputs.

Assume stack:
- Next.js App Router
- TypeScript
- Tailwind
- shadcn/ui
- Supabase Postgres
- Drizzle ORM
- pgvector if already configured, otherwise add TODOs/stubs
- Existing auth/workspace patterns if present

First inspect the existing project structure, auth patterns, database patterns, routing conventions, and UI components before implementing.

Core feature routes:
- /workspaces/[workspaceId]/brain
- /workspaces/[workspaceId]/brain/ask
- /workspaces/[workspaceId]/brain/relationships
- /workspaces/[workspaceId]/brain/relationships/[relationshipId]
- /workspaces/[workspaceId]/brain/people
- /workspaces/[workspaceId]/brain/meetings
- /workspaces/[workspaceId]/brain/meetings/new
- /workspaces/[workspaceId]/brain/meetings/[meetingId]/review
- /workspaces/[workspaceId]/brain/tasks
- /workspaces/[workspaceId]/brain/prospects
- /workspaces/[workspaceId]/brain/knowledge
- /workspaces/[workspaceId]/brain/settings

Core database entities:
1. brain_profiles
- id
- workspace_id
- name
- industry
- description
- enabled
- default_confidentiality_level
- ai_provider
- embedding_provider
- created_at
- updated_at

2. relationships
- id
- workspace_id
- name
- type
- status
- owner_id
- secondary_owner_id
- priority
- service_lines
- summary
- current_priorities
- open_loops
- last_touch_at
- next_review_at
- confidentiality_level
- compliance_flags
- source_system
- external_url
- created_at
- updated_at

3. people
- id
- workspace_id
- name
- email
- phone
- role
- communication_preferences
- notes
- created_at
- updated_at

4. relationship_people
- id
- workspace_id
- relationship_id
- person_id
- role_in_relationship
- created_at

5. meetings
- id
- workspace_id
- relationship_id
- title
- meeting_date
- transcript
- ai_summary
- human_summary
- status: draft | needs_review | approved
- reviewed_by
- reviewed_at
- confidentiality_level
- created_at
- updated_at

6. tasks
- id
- workspace_id
- relationship_id
- meeting_id
- title
- description
- owner_id
- status
- priority
- due_date
- blocked_reason
- source
- created_by_ai
- needs_review
- compliance_flag
- created_at
- updated_at

7. prospects
- id
- workspace_id
- name
- company
- source
- stage
- owner_id
- service_lines
- fit_notes
- objections
- estimated_value
- last_touch_at
- next_step
- stale_after_days
- created_at
- updated_at

8. brain_notes
- id
- workspace_id
- title
- body
- type
- tags
- relationship_id
- confidentiality_level
- created_at
- updated_at

9. brain_documents
- id
- workspace_id
- title
- file_url
- source
- extracted_text
- summary
- relationship_id
- confidentiality_level
- created_at
- updated_at

10. brain_embeddings
- id
- workspace_id
- source_type
- source_id
- content
- embedding
- metadata
- created_at

11. ai_jobs
- id
- workspace_id
- job_type
- status
- input
- output
- error
- created_by
- created_at
- completed_at

12. ai_review_items
- id
- workspace_id
- source_type
- source_id
- proposed_type
- proposed_payload
- status: pending | approved | rejected | edited
- reviewed_by
- reviewed_at
- created_at

13. brain_audit_logs
- id
- workspace_id
- actor_id
- action
- entity_type
- entity_id
- metadata
- created_at

Feature behavior:
1. Brain dashboard
Create a workspace command center showing:
- Today’s priorities
- Overdue tasks
- Decisions needed
- Meetings needing review
- Prospects going stale
- Client/relationship follow-ups
- Blocked work
- Recently updated relationships
- Ask Brain CTA

2. Relationships
Create list/detail pages.
Relationship detail should show:
- snapshot
- linked people
- open tasks
- recent meetings
- notes
- documents
- external links
- current priorities
- next review date

3. Meeting ingestion
Create a new meeting form where users can:
- select relationship
- add participants
- paste transcript
- save as draft
- run AI processing

4. AI meeting processor
Add an AI service abstraction with stub providers if credentials are missing.
When processing a meeting transcript, produce structured JSON:
- summary
- decisions
- commitments
- tasks
- suggested owners
- suggested due dates
- missing context
- relationship update suggestions
- compliance-sensitive warnings

Do not automatically create tasks or update relationship records.
Instead create ai_review_items that the user can approve/edit/reject.

5. Meeting review page
Show AI output in editable cards:
- summary
- decisions
- suggested tasks
- relationship updates
- warnings
Allow user to approve items.
Approved task suggestions should create task records.
Approved relationship updates should update relationship fields.
Log approvals in brain_audit_logs.

6. Tasks
Create task views:
- My Tasks
- All Tasks
- Overdue
- Blocked
- Needs Review
- By Relationship

7. Prospects
Create prospect board/list.
Flag stale prospects based on last_touch_at and stale_after_days.
Show stale prospects on dashboard.

8. Ask Brain
Create a simple chat/search page.
For MVP, implement keyword search across relationships, meetings, tasks, prospects, notes, and documents.
If pgvector exists, use semantic search. If not, leave clear TODOs for embedding generation.
Answers must cite source records by title/type/id.

9. Settings
Allow workspace admin to configure:
- brain name
- industry template
- default confidentiality level
- AI provider
- embedding provider
- enabled modules

Industry templates:
Add at least one template: wealth_advisory.
It should include:
- relationship types: Household, Divorce Case, Family Business, Plan Sponsor, Prospect, Referral Partner
- service lines: Investments & Planning, Divorce, Family Business, Cryptocurrency Education, Retirement Plans
- default views: Founder Today, EA Queue, Ops Review, Advisor Review, Compliance Review
- compliance defaults: no SSN/account fields, human review required, audit AI changes

UI requirements:
- Use existing design system/components.
- Use shadcn cards, tables, badges, tabs, dialogs, and forms if available.
- Make the dashboard feel like a business command center, not a database admin panel.
- Include empty states and loading states.
- Keep labels business-friendly.

Deliverables:
- Database schema/migrations
- Server actions or route handlers following existing project conventions
- Service layer under lib/brain
- AI abstraction under lib/ai
- Brain routes/pages
- Seed/demo data if the project already has seed patterns
- README or implementation notes explaining how to enable Company Brain for a workspace

Build order:
1. Inspect existing project structure.
2. Add schema.
3. Add service layer.
4. Add routes and UI.
5. Add AI stubs and meeting processor.
6. Add review workflow.
7. Add basic search.
8. Add demo/seed data.
9. Document TODOs for integrations.