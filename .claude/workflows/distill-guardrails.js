export const meta = {
  name: 'distill-guardrails',
  description: 'Fan sub-agents over captured dev feedback (learnings.md, git reverts/fixups, claude-mem) to distill recurring mistakes into proposed guardrails — a human-reviewed report, nothing auto-applied',
  whenToUse: 'Periodically (nightly/weekly) to turn "every failed build, every revert, every interruption" into durable guardrails (lints/tests/docs/reviewer-personas). Harness-engineering: never give the same review feedback twice. Proposes only — a human promotes the good ones.',
  phases: [
    { title: 'Gather', detail: 'one agent per feedback source extracts recurring signals' },
    { title: 'Distill', detail: 'cluster signals across sources into candidate guardrails (barrier: needs all sources)' },
    { title: 'Report', detail: 'write a human-review proposal report to disk' },
  ],
}

// args:
//   { sinceDays?: number, minOccurrences?: number, out?: string }
//   sinceDays      — git/mem look-back window (default 14)
//   minOccurrences — keep a candidate only if it recurs >= this many times,
//                    UNLESS it is security/data-loss (default 2). The talk's
//                    point: durable guardrails come from *recurring* signals,
//                    not one-offs.
//   out            — report path (default .claude/distill/guardrail-proposals-<date>.md)
const sinceDays = (args && args.sinceDays) || 14
const minOccurrences = (args && args.minOccurrences) || 2
const outArg = (args && args.out) || ''

const SIGNAL_SCHEMA = {
  type: 'object',
  required: ['signals'],
  properties: {
    signals: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'kind'],
        properties: {
          pattern: { type: 'string', description: 'the recurring mistake / footgun, one line' },
          kind: { type: 'string', enum: ['build-fail', 'revert', 'footgun', 'security', 'perf', 'other'] },
          evidence: { type: 'string', description: 'commit sha / file:line / log entry that shows it' },
          occurrences: { type: 'integer', description: 'how many times this signal appears in the source' },
        },
      },
    },
  },
}

const CANDIDATE_SCHEMA = {
  type: 'object',
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'proposedRung', 'occurrences'],
        properties: {
          title: { type: 'string' },
          pattern: { type: 'string', description: 'the underlying recurring mistake' },
          evidence: { type: 'array', items: { type: 'string' } },
          occurrences: { type: 'integer' },
          // The harness-engineering ladder: prefer the cheapest durable rung that holds.
          proposedRung: { type: 'string', enum: ['doc', 'lint', 'test', 'reviewer-persona'] },
          proposedArtifact: { type: 'string', description: 'the CONCRETE thing to add: the eslint rule, the test, the CLAUDE.md edit, the persona bullet' },
          rationale: { type: 'string' },
        },
      },
    },
    dropped: { type: 'array', items: { type: 'string' }, description: 'one-off signals deliberately NOT promoted (and why)' },
  },
}

// ── Gather ────────────────────────────────────────────────────────────────
// Barrier: the next phase clusters ACROSS sources to find cross-source
// recurrences, so it genuinely needs all three results together.
phase('Gather')
const sources = await parallel([
  () =>
    agent(
      `Read \`.claude/learnings.md\`. Extract recurring-mistake signals from (a) the "Mistakes Avoided" entries (each Symptom/Cause/Avoid block is a signal) and (b) the "Per-iteration QA log" block between <!-- QA-LOG-START --> and <!-- QA-LOG-END --> — count repeated FAIL reasons (e.g. the same typecheck/lint error class recurring). Return one signal per distinct pattern with its occurrence count and the evidence (the entry text or the repeated log line).`,
      { label: 'gather:learnings', phase: 'Gather', model: 'sonnet', schema: SIGNAL_SCHEMA },
    ),
  () =>
    agent(
      `Mine this repo's git history for "context was missing" signals over the last ${sinceDays} days. Run git log (e.g. \`git log --since="${sinceDays} days ago" --oneline --no-merges\`) and look for: revert commits, fixup!/squash! commits, commits whose message starts with or contains "revert", "fix typo", "fix build", "oops", "hotfix", or a fix landing <24h after the commit it repairs. For the strongest few, \`git show --stat\` to see what file/area broke. Return one signal per recurring pattern (e.g. "tenancy scoping missed in new CRM tools", "Zod v4 record arity") with the commit sha(s) as evidence and an occurrence count.`,
      { label: 'gather:git', phase: 'Gather', model: 'sonnet', schema: SIGNAL_SCHEMA },
    ),
  () =>
    agent(
      `Query claude-mem (the project's episodic memory) via its MCP search tools (search / observation_search / smart_search under the claude-mem server) for signals of recurring mistakes or missing context: bugfix observations, security notes, and "discovery" observations where the same class of problem recurs across sessions. Look back ~${sinceDays} days. If the claude-mem MCP server is unavailable in this run, return an empty signals array (do not fail). Return one signal per recurring pattern with the observation id(s) as evidence and an occurrence count.`,
      { label: 'gather:claude-mem', phase: 'Gather', model: 'sonnet', schema: SIGNAL_SCHEMA },
    ),
])

const allSignals = sources.filter(Boolean).flatMap((s) => (s && s.signals) || [])
log(`Gathered ${allSignals.length} signals across ${sources.filter(Boolean).length}/3 sources.`)

if (allSignals.length === 0) {
  log('No feedback signals found — nothing to distill. (Is HANDS_OFF QA logging on? Any reverts in the window?)')
  return { status: 'empty', signals: 0, sinceDays }
}

// ── Distill ───────────────────────────────────────────────────────────────
// Single synthesis agent (inherits session model — keep Opus on the judgment
// step per .claude/workflows/README.md). Clusters + filters one-offs.
phase('Distill')
const distilled = await agent(
  `You are distilling captured developer feedback into proposed guardrails for the SimplerDevelopment repo, in the spirit of "harness engineering" — never give the same review feedback twice; encode each recurring mistake as the cheapest DURABLE rung that holds (doc < lint < test < reviewer-persona).\n\n` +
    `Here are ${allSignals.length} raw signals gathered from learnings.md, git history, and claude-mem:\n\n${JSON.stringify(allSignals, null, 2)}\n\n` +
    `Cluster signals that are the same underlying mistake (across sources). For each cluster, propose ONE concrete guardrail: pick the lowest rung on the ladder that would actually prevent recurrence, and name the SPECIFIC artifact (the exact eslint rule + config, the exact test/assertion, the exact CLAUDE.md/nested-CLAUDE.md edit, or the exact reviewer-persona bullet). ` +
    `Ground every artifact in how THIS repo already works (existing eslint.config.mjs, scripts/test.sh gates, the nested CLAUDE.md files, vault/06 - Validation runbooks) — do not invent generic advice. ` +
    `KEEP a candidate only if occurrences >= ${minOccurrences} OR kind is security/data-loss. Everything else goes in \`dropped\` with a one-line reason (do not silently discard). Order candidates by leverage (recurrence × severity, cheapest rung first).`,
  { label: 'distill', phase: 'Distill', schema: CANDIDATE_SCHEMA },
)

const candidates = (distilled && distilled.candidates) || []
log(`Distilled ${candidates.length} candidate guardrails (${(distilled && distilled.dropped && distilled.dropped.length) || 0} one-offs dropped).`)

if (candidates.length === 0) {
  return { status: 'no-candidates', signals: allSignals.length, dropped: (distilled && distilled.dropped) || [] }
}

// ── Report ────────────────────────────────────────────────────────────────
// A writer agent stamps the date (Date.now() is unavailable in workflow
// scripts) and writes the human-review report to disk.
phase('Report')
const report = await agent(
  `Write a guardrail-proposal report to disk for human review. ${outArg ? `Write it to exactly: ${outArg}` : 'Run `date +%F` to get today\'s date, then write it to `.claude/distill/guardrail-proposals-<date>.md` (mkdir -p the dir first).'}\n\n` +
    `The report is a REVIEW ARTIFACT — nothing here is applied automatically; a human promotes the good ones. Structure it as:\n` +
    `# Guardrail proposals — <date>\n` +
    `One-paragraph intro: distilled from ${allSignals.length} signals over the last ${sinceDays} days; each is a recurring mistake worth encoding so it never recurs.\n` +
    `Then a section per candidate, ordered as given, each with: **Title**, the recurring pattern, occurrences, the proposed rung, the CONCRETE artifact to add (in a code block where it's a lint/test/config edit), evidence (commits/files/ids), and rationale. End with a "Dropped (one-offs, not promoted)" list.\n\n` +
    `Candidates JSON:\n${JSON.stringify(candidates, null, 2)}\n\nDropped JSON:\n${JSON.stringify((distilled && distilled.dropped) || [], null, 2)}\n\n` +
    `After writing, return the absolute report path and a 2-line summary (how many candidates, top one).`,
  { label: 'report', phase: 'Report' },
)

return {
  status: 'ok',
  signals: allSignals.length,
  candidates: candidates.length,
  dropped: (distilled && distilled.dropped && distilled.dropped.length) || 0,
  report,
}
