# Review Checklists

Use only the sections relevant to the diff.

## Tenancy

- Verify every tenant-owned query filters by `clientId` and/or `siteId`.
- Do not trust request body/query params for tenant identity; use active-client/site resolver patterns.
- Check list endpoints, MCP tools, search, exports, dashboards, and background jobs for cross-tenant reads.
- Confirm writes cannot attach records to another tenant by guessing IDs.
- Require `bun test:tenancy` for data-access changes.

## Auth And Security

- Check API routes for session, role, and scope guards before side effects.
- Check MCP tools for explicit scope guards and slim response shapes.
- Treat approval URLs, API keys, OAuth state, JWTs, KMS/encryption, webhooks, uploads, and custom HTML/JS as high risk.
- Avoid leaking secrets or PII in logs, errors, test fixtures, or MCP responses.
- Confirm public routes cannot mutate state unless explicitly designed and protected.

## MCP Payload And Token Budget

- List/read tools should use slim projections by default.
- Large fields (`content`, `html`, `blocks`, transcripts, bodies, raw JSON) should be behind `include` flags.
- Create/update echoes should return IDs, changed fields, and approval URLs, not full records.
- Errors wrapped in JSON-RPC success envelopes must still be parsed for application-level errors.

## Accessibility

- Forms need labels, accessible names, focus states, and keyboard paths.
- Buttons and links must use semantic elements and clear names.
- Check color contrast for brand-derived foreground/background pairs.
- Dynamic editor overlays, modals, menus, and drag/drop affordances need keyboard and screen-reader fallback where practical.

## Performance

- Look for N+1 DB calls, repeated RAG/embedding requests, heavy server work in UI loops, and oversized JSON payloads.
- Keep server/client boundaries intentional; avoid shipping large editor/server-only utilities to the browser.
- Avoid full-table scans for tenant dashboards, CRM lists, tickets, bookings, and analytics.
- Check media/image/video workflows for file-size, streaming, and memory risks.

## Tests

- New routes/tools need at least one focused test or a clear reason they are covered by an existing test.
- Risky data-access changes need tenancy regression coverage.
- Visual editor, public site rendering, survey, booking, and auth flows usually need E2E or integration coverage beyond unit tests.
