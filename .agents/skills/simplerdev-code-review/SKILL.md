---
name: simplerdev-code-review
description: Review SimplerDevelopment code changes for repo-specific bugs, regressions, tenancy leaks, auth/security risks, MCP payload problems, accessibility issues, performance risks, and missing tests. Use for PR reviews, pre-commit self-review, "review this diff", "audit this change", "check for tenant leaks", "security review", "accessibility review", "performance review", or when changes touch auth, billing, database access, MCP tools, public/portal routes, visual editor, blocks, email, bookings, surveys, or Company Brain.
---

# SimplerDev Code Review

Use this as the repo-aware review router. Start in code-review stance: findings first, ordered by severity, with file and line references. Summaries come after findings.

## Review Workflow

1. Inspect scope with `git status -sb`, `git diff --stat`, and the relevant diff. If reviewing a PR, include the PR diff and unresolved review context when available.
2. Read the nearest `CLAUDE.md` for touched areas before judging patterns. Key areas: `app/portal`, `app/admin`, `lib/db`, `lib/mcp`, `lib/ai`, `lib/blocks`, `components/portal/visual-editor`, and `tests`.
3. Classify touched domains and load only the relevant checklist sections from `references/review-checklists.md`.
4. Prioritize defects over style. Look for concrete failure modes: data leaks, auth bypasses, broken approval flow, invalid Drizzle usage, stale MCP envelopes, missing tenant filters, broken accessibility, or untested behavior.
5. Recommend validation gates, but defer detailed command selection to `simplerdev-test-gate-picker` when the answer needs a full test plan.

## Risk Router

- **Tenancy/data access**: any query, route, MCP tool, schema relation, or server action touching `clientId`, `siteId`, `userId`, public site routes, portal routes, CRM, bookings, surveys, email, store, projects, or Brain.
- **Auth/security**: NextAuth, API keys, OAuth, tokens, KMS/encryption, billing, approvals, public routes, webhook handlers, upload/media, custom HTML/JS, MCP scopes.
- **MCP/token budget**: `lib/mcp/**`, `app/api/mcp/**`, tools returning content, HTML, blocks, bodies, transcripts, lists, or full records.
- **Accessibility/UI**: rendered pages, components, forms, visual editor, blocks, email templates, decks, booking/survey public routes.
- **Performance**: repeated DB calls, N+1 fetches, large JSON blobs, RAG/embedding flows, image/video processing, Next.js server/client boundaries, heavy client bundles.
- **Migration/schema**: hand off to `simplerdev-db-migration` for Drizzle generation and DB target safety.

## Output Format

When you find issues:

```markdown
Findings
- [severity] [file:line] Problem and why it can fail.
  Suggested fix: concrete action.

Open Questions
- ...

Validation
- ...
```

If no issues are found, say so clearly and list residual risks or tests not run.

## References

Read `references/review-checklists.md` only for the relevant risk areas. Do not load every section by default.
