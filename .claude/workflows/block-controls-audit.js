export const meta = {
  name: 'block-controls-audit',
  description: 'Fan-out audit of every block type: does the editor controls panel cover all fields in the block schema?',
  whenToUse: 'Periodic coverage audit of lib/blocks. One agent per block type cross-references the TS interface in the registry against the editor controls, then a synthesize step merges into a coverage report (cf. .planning/audits/blocks-controls-coverage.json).',
  phases: [
    { title: 'Enumerate', detail: 'list all block types from the registry' },
    { title: 'Audit', detail: 'one agent per block type checks schema↔controls coverage' },
    { title: 'Synthesize', detail: 'merge into a single coverage report' },
  ],
}

// args (optional): { types?: string[] } — restrict the audit to specific block types instead of all.

const TYPES_SCHEMA = {
  type: 'object',
  required: ['types'],
  properties: {
    types: {
      type: 'array',
      items: { type: 'string', description: 'block type key as registered in lib/blocks/registry.ts' },
    },
  },
}

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['type', 'totalFields', 'coveredFields', 'gaps'],
  properties: {
    type: { type: 'string' },
    totalFields: { type: 'number' },
    coveredFields: { type: 'number' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field', 'issue'],
        properties: {
          field: { type: 'string' },
          issue: {
            type: 'string',
            description: 'e.g. "no control for this field", "control exists but never written back", "type mismatch"',
          },
        },
      },
    },
  },
}

phase('Enumerate')
let types = args && Array.isArray(args.types) ? args.types : null
if (!types) {
  const enumerated = await agent(
    `Read lib/blocks/registry.ts and return the complete list of block type keys registered there. ` +
      `If a canonical list already exists at .planning/audits/blocks-controls-coverage.json, reconcile against it but trust the registry as source of truth. Return just the type keys.`,
    { label: 'enumerate:block-types', phase: 'Enumerate', schema: TYPES_SCHEMA },
  )
  types = enumerated ? enumerated.types : []
}

if (!types.length) {
  log('No block types found — aborting.')
  return { audited: 0, report: [] }
}
log(`Auditing controls coverage for ${types.length} block type(s).`)

phase('Audit')
const audits = await parallel(
  types.map((t) => () =>
    agent(
      `Audit controls coverage for the block type \`${t}\` in this repo.\n` +
        `1. Find its TS interface / schema in lib/blocks/registry.ts — enumerate every editable field.\n` +
        `2. Find its editor controls panel (the inspector/controls component that edits this block in the visual editor).\n` +
        `3. For each schema field, decide whether the controls panel exposes a control that reads AND writes it back. ` +
        `Report every field with no control, a read-only control, or a type mismatch as a gap. ` +
        `Be precise and code-grounded; do not invent fields.`,
      { label: `audit:${t}`, phase: 'Audit', schema: AUDIT_SCHEMA },
    ),
  ),
)

phase('Synthesize')
const report = audits.filter(Boolean).sort((a, b) => a.gaps.length - b.gaps.length)
const totalGaps = report.reduce((n, r) => n + r.gaps.length, 0)
const fullyCovered = report.filter((r) => r.gaps.length === 0).map((r) => r.type)
log(`${report.length} blocks audited · ${fullyCovered.length} fully covered · ${totalGaps} total gaps.`)
return {
  audited: report.length,
  fullyCovered,
  totalGaps,
  blocksWithGaps: report.filter((r) => r.gaps.length > 0),
  note: 'Sorted by gap count. Feed blocksWithGaps to `block-orchestrator` (or one-off `block-implementer`) to close coverage one block per commit.',
}
