export const meta = {
  name: 'tenant-leak-review',
  description: 'Adversarial-verification review of changed data-access code for clientId/siteId tenant-scoping leaks',
  whenToUse: 'Before merging any change that touches data access (lib/db, route handlers, MCP tool handlers). Three independent skeptics try to find a tenant-scoping gap in each changed file; pairs with `bun test:tenancy`.',
  phases: [
    { title: 'Scope', detail: 'find changed data-access files' },
    { title: 'Review', detail: '3 skeptics per file hunt for a clientId/siteId leak' },
    { title: 'Report', detail: 'collect confirmed leaks with file:line' },
  ],
}

// args (all optional):
//   { base?: string, files?: string[] }
//   base  — git ref to diff against (default: let the scope agent pick origin/main or the merge-base)
//   files — explicit file list to review, skipping the scope step

const FILES_SCHEMA = {
  type: 'object',
  required: ['files'],
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'reason'],
        properties: {
          path: { type: 'string' },
          reason: { type: 'string', description: 'why this file touches tenant-scoped data access' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['leakFound', 'findings'],
  properties: {
    leakFound: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['line', 'description', 'severity'],
        properties: {
          line: { type: 'string', description: 'file:line of the suspected gap' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

phase('Scope')
let files = (args && Array.isArray(args.files))
  ? args.files.map((p) => ({ path: p, reason: 'caller-supplied' }))
  : null

if (!files) {
  const base = (args && args.base) || 'origin/main'
  const scope = await agent(
    `You are scoping a tenant-leak review for this repo (multi-tenant SaaS; data is keyed by clientId/siteId).\n` +
      `Run git to list files changed versus \`${base}\` (fall back to \`git merge-base HEAD ${base}\`, then to \`git diff --name-only HEAD~1\` if the ref is missing). ` +
      `From the changed set, return ONLY files that touch tenant-scoped data access: anything under lib/db/, Drizzle queries, API route handlers under app/**/route.ts, MCP tool handlers under lib/mcp/, or lib/active-client.ts consumers. ` +
      `Exclude pure UI, tests, docs, and generated drizzle/*.sql. For each, give the path and a one-line reason.`,
    { label: 'scope:changed-files', phase: 'Scope', schema: FILES_SCHEMA },
  )
  files = scope ? scope.files : []
}

if (!files.length) {
  log('No tenant-scoped data-access files changed — nothing to review.')
  return { reviewed: 0, confirmed: [] }
}
log(`Reviewing ${files.length} data-access file(s) with 3 skeptics each.`)

phase('Review')
const LENSES = [
  'MISSING SCOPE: a query/mutation that reads or writes rows without filtering by the active clientId/siteId',
  'WRONG SCOPE: a query scoped to the wrong tenant key, a clientId/siteId taken from user input instead of the resolved session/site, or an IDOR where one tenant can address another tenant row by id',
  'BYPASS: a code path (admin shortcut, raw SQL, cache, bulk op, join) that skips the site-resolver / active-client guard entirely',
]

const perFile = await parallel(
  files.map((f) => () =>
    parallel(
      LENSES.map((lens) => () =>
        agent(
          `Adversarially review \`${f.path}\` for a multi-tenant data leak. Your job is to REFUTE the claim that it is correctly tenant-scoped.\n` +
            `Focus lens: ${lens}.\n` +
            `Tenancy invariant: every data access must be constrained to the active clientId/siteId, resolved server-side via lib/active-client.ts + the site-resolver — never from request body/query params. ` +
            `Read the file and the functions it calls. Report only concrete, code-grounded gaps with a file:line. If you cannot find a real gap, return leakFound=false.`,
          { label: `review:${f.path}`, phase: 'Review', schema: VERDICT_SCHEMA },
        ),
      ),
    ).then((verdicts) => {
      const real = verdicts.filter(Boolean).filter((v) => v.leakFound)
      return { path: f.path, votes: real.length, findings: real.flatMap((v) => v.findings) }
    }),
  ),
)

phase('Report')
// A leak is confirmed when >=2 of the 3 skeptics independently flag the same file.
const confirmed = perFile.filter(Boolean).filter((r) => r.votes >= 2)
log(`${confirmed.length} file(s) with a confirmed (>=2 skeptic) tenant-scoping concern.`)
return {
  reviewed: files.length,
  confirmed,
  note: 'Confirmed = flagged by >=2 of 3 skeptics. Run `bun test:tenancy` to back these findings with the regression suite.',
}
