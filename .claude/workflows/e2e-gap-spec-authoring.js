export const meta = {
  name: 'e2e-gap-spec-authoring',
  description: 'Author + verify E2E specs for the testable Gaps-Found backlog against the already-running shared local server',
  phases: [
    { title: 'Author & Verify', detail: 'one Sonnet agent per domain unit; author a new spec file + run it green against :3000' },
    { title: 'Synthesize', detail: 'collect per-gap status' },
  ],
}

// Each unit = one NEW spec file authored by one agent (no two agents share a file).
// gaps[] are the testable Gaps-Found cards. Agents must VERIFY the route exists and
// the test genuinely passes; if a route is missing or needs an unavailable external
// service, mark that gap BLOCKED rather than fake a passing test.
const UNITS = [
  {
    key: 'auth', file: 'gap-auth-coverage.spec.ts',
    gaps: [
      'OAuth 2.1 consent screen GET /oauth/authorize — consent flow renders/redirects (unauth → login; missing client_id → 4xx)',
      'Self-serve signup + email verification funnel: POST /api/auth/signup, /api/auth/verify-email, /api/auth/resend-verification (happy + validation paths; no real email send)',
      'Admin impersonation: GET /api/portal/impersonate/status and POST /api/portal/impersonate/stop',
    ],
  },
  {
    key: 'agency', file: 'gap-agency-coverage.spec.ts',
    gaps: [
      'POST /agency/custom-domain/verify — 422 on DNS miss + success path (find exact route under app/api)',
      'MCP branding READ tools (branding_list_profiles, branding_get_profile, branding_get_messaging, branding_audit, branding_check_contrast) — model on tests/e2e/mcp-coverage-fills.spec.ts',
      'Agency chrome GET with whiteLabelEnabled=true (populated payload, not just the disabled/empty state)',
    ],
  },
  {
    key: 'automations', file: 'gap-automations-coverage.spec.ts',
    gaps: [
      'Visual workflow builder API: list / create / patch / delete / test-run / runs / templates routes',
      'Scope-gated action denial: a rule lacking the required scope produces a scope_denied log entry, not action execution',
    ],
  },
  {
    key: 'brain', file: 'gap-brain-coverage.spec.ts',
    gaps: [
      'Brain review-items approve + reject mutation through the human review queue',
      'Brain meetings detail lifecycle: create a real meeting then update + delete via the [id] routes',
      'Brain note custom fields: /knowledge/[id]/fields CRUD',
    ],
  },
  {
    key: 'billing', file: 'gap-billing-coverage.spec.ts',
    gaps: [
      'Stripe platform webhook POST (checkout.session.completed): signature-validation paths are testable without real Stripe — assert 400/401 on missing/bad signature; assert the route exists and rejects unsigned. Do NOT attempt a real Stripe call.',
    ],
  },
  {
    key: 'bookings', file: 'gap-bookings-coverage.spec.ts',
    gaps: [
      'Waiver PDF: GET /waivers/[waiverId]/pdf (find exact route; assert 200 application/pdf for a seeded waiver, or 404 for unknown)',
      'Public quote view + pay: GET /api/public/booking/quote/[slug] and the /pay path (validation/404 paths if no real payment provider)',
    ],
  },
  {
    key: 'esign', file: 'gap-esign-coverage.spec.ts',
    gaps: [
      'Public /api/approve/[token] route — exercise BOTH link types (entity and pending_change): valid token approves; invalid/expired token 4xx',
      'Cross-tenant token isolation: a token minted for client A returns 403/404 when used from a client-B session/context',
    ],
  },
  {
    key: 'pitch', file: 'gap-pitch-coverage.spec.ts',
    gaps: [
      '/designs/[id]/ai-image + /designs/[id]/ai-text — exercise auth/validation paths (if real AI provider is required for success, assert the validation/guard path and BLOCK the success path with a note)',
      '/designs/generate-thumbnail — thumbnail generation route (validation/success or guarded path)',
      'Claim anonymous design: POST /designs/claim after customer login (cookie-to-customer handoff)',
    ],
  },
  {
    key: 'cms-nav', file: 'gap-cms-nav-coverage.spec.ts',
    gaps: [
      'MCP nav_publish + nav_publish_all tools (exist in lib/mcp/tools/cms.ts; only flat CRUD tested today) — model on mcp-coverage-fills.spec.ts',
      'CRM contacts/[id]/send-email — CHECK first: crm-coverage.spec.ts may already cover validation paths. If fully covered, mark this gap BLOCKED(already-covered). Otherwise add only the missing assertions.',
    ],
  },
  {
    key: 'storefront', file: 'gap-storefront-coverage.spec.ts',
    gaps: [
      'Portal product review moderation: list pending reviews → approve → reject (store_product_reviews). Find the portal REST route OR the MCP tool path; if only an MCP tool exists, test via the MCP pattern; if neither exists, BLOCK(no-impl).',
      'Portal customer messages: list → staff reply → status transitions to replied (store_customer_messages). Same find-or-block rule.',
    ],
  },
  {
    key: 'surveys-plugins', file: 'gap-surveys-plugins-coverage.spec.ts',
    gaps: [
      'Surveys webhook dispatcher fire-and-forget path (current inline-retry path) — assert dispatch is enqueued/attempted on submission with a webhook configured (no real external endpoint; assert the attempt/log, not delivery)',
      'Survey-level branding override (SurveyStyling jsonb) using a FIXTURE survey (not a hardcoded prod slug)',
      'Plugins signing-key rotation: retiring → revoked lifecycle (verify-only mode for retiring keys)',
    ],
  },
]

const UNIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['unit', 'file', 'gaps', 'passed', 'failed'],
  properties: {
    unit: { type: 'string' },
    file: { type: 'string', description: 'spec file path written, relative to repo root' },
    passed: { type: 'integer', description: 'number of test() cases that passed in the final run' },
    failed: { type: 'integer', description: 'number that still fail' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['card', 'status', 'detail'],
        properties: {
          card: { type: 'string' },
          status: { type: 'string', enum: ['green', 'partial', 'blocked'] },
          testCount: { type: 'integer' },
          detail: { type: 'string', description: 'route tested + key assertions, OR the concrete blocker reason (route missing / needs external service / already covered)' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const SHARED = `
You are authoring + verifying Playwright E2E specs in the SimplerDevelopment2026 repo (working dir = repo root).

ENVIRONMENT (already set up — do NOT change it):
- A shared PROD-mode server is ALREADY RUNNING on http://localhost:3000 (playwright.config has reuseExistingServer:true).
- DO NOT start a server. DO NOT run scripts/test.sh (it rebuilds + restarts the server and will break the shared run).
- The local test DB is postgresql://$USER@localhost:5432/simplerdev_test (already provisioned + seeded with an all-access E2E tenant; admin client = client@example.com).

HOW TO RUN YOUR SPEC (and ONLY your spec):
  DATABASE_URL="postgresql://$USER@localhost:5432/simplerdev_test" BASE_URL=http://localhost:3000 npx playwright test tests/e2e/<YOUR_FILE> --workers=1 --reporter=line

SPEC CONVENTIONS (match the existing coverage specs exactly):
- Import: import { test, expect } from './setup/fixtures';
- Helpers: import { runCleanups, createTestX } from './setup/helpers';  (read tests/e2e/setup/helpers.ts for what exists)
- Fixtures available on the test callback: { clientApi, adminApi, unauthApi } — each is an ApiClient with .get/.post/.put/.patch/.delete(path, body?) returning { status, data } where data is the { success, data|error } envelope.
- Read tests/e2e/crm-coverage.spec.ts (and tests/e2e/mcp-coverage-fills.spec.ts for MCP-tool gaps) as templates BEFORE writing.
- Tag each describe with @gap and a domain tag, e.g. test.describe('Auth gaps @gap @auth', ...).
- Use idempotent fixtures + runCleanups for anything you create. Do NOT hardcode prod slugs/ids.

METHOD:
1. For EACH assigned gap: first locate the real route/handler (grep app/api and app/ for the path) and read it to learn the exact path, method, request shape, and response envelope/status codes.
2. If the route/feature genuinely does NOT exist, or success REQUIRES an external service unavailable in test (real Stripe charge, real Google/Gmail, real S3 upload, real outbound email/SMS, real AI image gen) — DO NOT fake a passing test. Instead author whatever IS testable (auth guard / validation / 4xx / signature-rejection paths) and mark that gap status='blocked' or 'partial' with the concrete reason. Never write expect(true) or assertion-free tests.
3. Author your spec file at tests/e2e/<YOUR_FILE>. Each test must hit the real route and assert a meaningful status + response shape.
4. Run it with the command above. Iterate until your tests pass (green) or you hit a genuine blocker. Re-run after each edit.
5. Only create/edit YOUR OWN new spec file. Never edit other spec files or anything under tests/e2e/setup/ or lib/ or app/.

Return the structured result: per-gap status (green = a real test passes; partial = some paths tested, success path blocked; blocked = nothing testable, with reason), the final passed/failed counts from your last run, and the file path.

If you cannot run playwright at all (server not reachable on :3000), STOP and return summary starting with "ESCALATE:" describing the failure — do not mark gaps green without a passing run.
`

phase('Author & Verify')
const results = await parallel(
  UNITS.map((u) => () =>
    agent(
      `${SHARED}\n\n=== YOUR UNIT: ${u.key} ===\nWrite your spec to: tests/e2e/${u.file}\n\nGaps to cover:\n${u.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}`,
      { label: `author:${u.key}`, phase: 'Author & Verify', schema: UNIT_SCHEMA, model: 'sonnet' },
    ),
  ),
)

phase('Synthesize')
const units = results.filter(Boolean)
const allGaps = units.flatMap((u) => (u.gaps || []).map((g) => ({ unit: u.unit, ...g })))
const tally = {
  green: allGaps.filter((g) => g.status === 'green').length,
  partial: allGaps.filter((g) => g.status === 'partial').length,
  blocked: allGaps.filter((g) => g.status === 'blocked').length,
}
const totalPassed = units.reduce((n, u) => n + (u.passed || 0), 0)
const totalFailed = units.reduce((n, u) => n + (u.failed || 0), 0)
log(`Authored ${units.length} files; gaps green=${tally.green} partial=${tally.partial} blocked=${tally.blocked}; tests ${totalPassed} passed / ${totalFailed} failed`)

return { units, allGaps, tally, totalPassed, totalFailed }
