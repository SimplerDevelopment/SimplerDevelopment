import type { AgenticOsRule } from './types';

/**
 * Cross-cutting rules surfaced in the Agentic OS catalog sidebar. Each rule
 * is paraphrased from `CLAUDE.md` or a specific SKILL.md. Skills reference
 * these via `appliesRules: [...]` so the UI can render "this skill enforces
 * the following invariants".
 */
export const RULES: AgenticOsRule[] = [
  {
    id: 'blocks-universal',
    title: 'Blocks are universal, never client-specific',
    body: 'A block type is JSON in posts.content with schemas in lib/blocks/registry.ts and render cases in app/sites/**. Never scaffold a tenant-scoped block. Use simplerdev-block-type so all five integration points move in lockstep.',
  },
  {
    id: 'tenancy-test',
    title: 'Run bun test:tenancy after any data-access change',
    body: 'Data is keyed by clientId / siteId. Any change to a query, mutation, or migration must run scripts/test.sh --layer=integration --tag=tenancy (alias bun test:tenancy) to catch cross-tenant leaks before merge.',
  },
  {
    id: 'no-hand-edit-drizzle',
    title: 'Never hand-edit drizzle/*.sql',
    body: 'Migrations are generated only. Edit lib/db/schema.ts and run bun run db:generate. The tracker is currently drifted in prod, so review the diff and never auto-apply via db:migrate without explicit confirmation.',
  },
  {
    id: 'material-icons-not-emojis',
    title: 'Material Icons over emojis',
    body: 'Any rendered UI — block, page, notification, badge — uses Material Symbols / Material Icons names rather than emoji glyphs. Emojis are reserved for transient agent output, never persisted into block JSON or product copy.',
  },
  {
    id: 'no-push-to-main-sd2026',
    title: 'Never push to main in sd2026',
    body: 'Push to staging or feature branches only. PRs target staging (or another feature branch when explicitly told). Main only receives commits via a reviewed PR; direct pushes are forbidden.',
  },
  {
    id: 'envelope-and-resolver',
    title: 'API routes: NextAuth + site-resolver + envelope',
    body: 'Every tenant-scoped route resolves the active site through lib/active-client.ts and the site-resolver middleware, then returns { success, data | error }. The simplerdev-feature-scaffold skill produces this lockstep — do not hand-roll.',
  },
  {
    id: 'use-bun-not-npm',
    title: 'Always use bun, never npm',
    body: 'The repo lockfile is bun.lock. Install via bun add / bun remove, run scripts via bun run <script>, and run tests via scripts/test.sh. npm install will desync the lockfile.',
  },
  {
    id: 'crosscap-email-pattern',
    title: 'Crosscap migrations: auto-derive client email from domain',
    body: 'When migrating a site under the Crosscap workflow, derive the client email as {sitename}@simplerdevelopment.com — never prompt the user, never use a generic placeholder.',
  },
  {
    id: 'huashu-not-pasteable',
    title: 'Huashu output is inspiration, not block JSON',
    body: 'huashu-design produces freeform HTML/CSS/JS. Translation into typed block JSON (lib/blocks/registry.ts) is always manual. Never lift huashu output into a block via copy-paste.',
  },
  {
    id: 'mcp-slim-payloads',
    title: 'MCP tools: slim-by-default payloads',
    body: 'List and read tools return projected fields only. Heavy columns (body, html, blocks, transcript) go behind an opt-in include flag. Write tools return a compact echo, not the full row. Audit with simplerdev-mcp-token-budget after touching any large-column tool.',
  },
  {
    id: 'one-block-per-commit',
    title: 'One block per commit during audits',
    body: 'When block-orchestrator drives a multi-block audit, each block-implementer fix lands as its own commit with scope blocks. Granularity makes the audit reversible and reviewable.',
  },
  {
    id: 'cron-auth-pattern',
    title: 'Cron routes: Authorization: Bearer $CRON_SECRET',
    body: 'Every app/api/cron/<name>/route.ts checks the Vercel cron header in production and accepts Authorization: Bearer $CRON_SECRET for manual re-runs. Routes are idempotent on their natural key so a re-run never double-applies.',
  },
];

export const RULES_BY_ID: Record<string, AgenticOsRule> =
  Object.fromEntries(RULES.map(r => [r.id, r]));
