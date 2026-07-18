/**
 * Company Brain Agent — programmatic eval runner.
 *
 * Runs each EvalFixture through the same Anthropic tool-use loop as the
 * production route (lib/ai/brain-tools/index.ts + the API route pattern)
 * but WITHOUT any Next.js server components, DB persistence, credits, or
 * SSE streaming.  Designed to be executed as a standalone Bun script:
 *
 *   bun run lib/ai/brain-tools/eval/runner.ts \
 *     --clientId=1 --userId=1 --key=sk-ant-...
 *
 * Or programmatically:
 *   import { runEval } from '@/lib/ai/brain-tools/eval/runner'
 *   const summary = await runEval({ clientId: 1, userId: 1, anthropicApiKey: '...' })
 */

import Anthropic from '@anthropic-ai/sdk'
import { BRAIN_TOOLS, executeBrainTool } from '@/lib/ai/brain-tools'
import { EVAL_FIXTURES } from './fixtures'
import type { EvalFixture } from './fixtures'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EvalResult {
  fixtureId: string
  question: string
  intent: string
  passed: boolean
  /** At least one expectedTool was called */
  toolsCalledCorrectly: boolean
  /** None of the forbiddenTools were called */
  noForbiddenTools: boolean
  /** Answer does not contain answerMustNotContain items */
  answerGrounded: boolean
  /** Answer contains all answerMustContain keywords */
  answerContainsRequired: boolean
  /** Actual tools called during the run */
  toolsCalled: string[]
  /** Final text answer from the agent */
  answer: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  failureReason?: string
}

export interface EvalSummary {
  total: number
  passed: number
  failed: number
  /** 0.0–1.0 */
  passRate: number
  avgDurationMs: number
  totalTokens: number
  byIntent: Record<string, { passed: number; total: number }>
  results: EvalResult[]
}

export interface RunEvalOpts {
  /** Subset of fixtures to run; defaults to all EVAL_FIXTURES */
  fixtures?: EvalFixture[]
  /** Tenant ID to pass to executeBrainTool */
  clientId: number
  /** User ID to pass to executeBrainTool */
  userId: number
  /** Anthropic API key */
  anthropicApiKey: string
  /** Log each fixture result to console as it completes */
  verbose?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024
/** Tighter than production to keep eval cost low */
const MAX_LOOPS = 5
const MAX_TOOL_CALLS = 10

const SYSTEM_PROMPT = `You are the Company Brain Agent. Always use the appropriate tool before answering — never guess or fabricate data. Be concise and direct.`

// ─── Single-fixture runner ────────────────────────────────────────────────────

async function runFixture(
  fixture: EvalFixture,
  clientId: number,
  userId: number,
  anthropic: Anthropic,
): Promise<EvalResult> {
  const start = Date.now()
  const toolsCalled: string[] = []
  let finalText = ''
  let inputTokens = 0
  let outputTokens = 0

  try {
    let currentMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: fixture.question },
    ]

    let loopCount = 0
    let toolCallCount = 0

    while (loopCount < MAX_LOOPS) {
      loopCount++

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: BRAIN_TOOLS,
        messages: currentMessages,
      })

      inputTokens += response.usage.input_tokens
      outputTokens += response.usage.output_tokens

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        )

        toolCallCount += toolUseBlocks.length
        if (toolCallCount > MAX_TOOL_CALLS) {
          finalText = '[eval: tool call limit exceeded]'
          break
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of toolUseBlocks) {
          toolsCalled.push(block.name)
          const result = await executeBrainTool(
            block.name,
            block.input as Record<string, unknown>,
            clientId,
            userId,
          )
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          })
        }

        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ]
        continue
      }

      // end_turn — collect text
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      break
    }
  } catch (err) {
    finalText = `[eval error: ${err instanceof Error ? err.message : String(err)}]`
  }

  const durationMs = Date.now() - start

  // ── Scoring ──────────────────────────────────────────────────────────────

  // 1. Did the agent call at least one expected tool?
  const toolsCalledCorrectly =
    fixture.expectedTools.length === 0 ||
    fixture.expectedTools.some((t) => toolsCalled.includes(t))

  // 2. Did the agent avoid all forbidden tools?
  const noForbiddenTools =
    !fixture.forbiddenTools ||
    fixture.forbiddenTools.every((t) => !toolsCalled.includes(t))

  // 3. Does the answer avoid hallucination markers?
  const lowerAnswer = finalText.toLowerCase()
  const answerGrounded =
    !fixture.answerMustNotContain ||
    fixture.answerMustNotContain.every(
      (marker) => !lowerAnswer.includes(marker.toLowerCase()),
    )

  // 4. Does the answer contain all required keywords?
  const answerContainsRequired =
    !fixture.answerMustContain ||
    fixture.answerMustContain.every((kw) =>
      lowerAnswer.includes(kw.toLowerCase()),
    )

  const passed =
    toolsCalledCorrectly &&
    noForbiddenTools &&
    answerGrounded &&
    answerContainsRequired

  const failures: string[] = []
  if (!toolsCalledCorrectly) {
    failures.push(
      `expected one of [${fixture.expectedTools.join(', ')}] but got [${toolsCalled.join(', ')}]`,
    )
  }
  if (!noForbiddenTools) {
    const bad = (fixture.forbiddenTools ?? []).filter((t) => toolsCalled.includes(t))
    failures.push(`forbidden tools called: [${bad.join(', ')}]`)
  }
  if (!answerGrounded) {
    const bad = (fixture.answerMustNotContain ?? []).filter((m) =>
      lowerAnswer.includes(m.toLowerCase()),
    )
    failures.push(`hallucination markers found: [${bad.join(', ')}]`)
  }
  if (!answerContainsRequired) {
    const missing = (fixture.answerMustContain ?? []).filter(
      (kw) => !lowerAnswer.includes(kw.toLowerCase()),
    )
    failures.push(`answer missing required keywords: [${missing.join(', ')}]`)
  }

  return {
    fixtureId: fixture.id,
    question: fixture.question,
    intent: fixture.intent,
    passed,
    toolsCalledCorrectly,
    noForbiddenTools,
    answerGrounded,
    answerContainsRequired,
    toolsCalled,
    answer: finalText,
    durationMs,
    inputTokens,
    outputTokens,
    failureReason: failures.length > 0 ? failures.join('; ') : undefined,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runEval(opts: RunEvalOpts): Promise<EvalSummary> {
  const fixtures = opts.fixtures ?? EVAL_FIXTURES
  const anthropic = new Anthropic({ apiKey: opts.anthropicApiKey })

  const results: EvalResult[] = []
  let totalDurationMs = 0
  let totalTokens = 0
  const byIntent: Record<string, { passed: number; total: number }> = {}

  for (const fixture of fixtures) {
    if (opts.verbose) {
      process.stdout.write(`  running ${fixture.id} ... `)
    }

    const result = await runFixture(fixture, opts.clientId, opts.userId, anthropic)
    results.push(result)

    totalDurationMs += result.durationMs
    totalTokens += result.inputTokens + result.outputTokens

    const intentBucket = byIntent[result.intent] ?? { passed: 0, total: 0 }
    intentBucket.total++
    if (result.passed) intentBucket.passed++
    byIntent[result.intent] = intentBucket

    if (opts.verbose) {
      const status = result.passed ? 'PASS' : 'FAIL'
      const tokenInfo = `${result.inputTokens + result.outputTokens} tok`
      const timeInfo = `${result.durationMs}ms`
      process.stdout.write(`${status}  (${tokenInfo}, ${timeInfo})\n`)
      if (!result.passed && result.failureReason) {
        process.stdout.write(`    reason: ${result.failureReason}\n`)
      }
    }
  }

  const passed = results.filter((r) => r.passed).length

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length > 0 ? passed / results.length : 0,
    avgDurationMs: results.length > 0 ? Math.round(totalDurationMs / results.length) : 0,
    totalTokens,
    byIntent,
    results,
  }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

// `import.meta.main` is Bun-specific; cast to avoid a tsc error under Next.js tsconfig.
if ((import.meta as unknown as Record<string, unknown>).main) {
  // Parse --key=, --clientId=, --userId= from argv, falling back to env vars.
  function parseArg(name: string): string | undefined {
    const flag = `--${name}=`
    const arg = process.argv.find((a) => a.startsWith(flag))
    return arg ? arg.slice(flag.length) : undefined
  }

  const apiKey =
    parseArg('key') ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.BRAIN_EVAL_API_KEY

  const clientId = parseInt(parseArg('clientId') ?? process.env.BRAIN_EVAL_CLIENT_ID ?? '0', 10)
  const userId = parseInt(parseArg('userId') ?? process.env.BRAIN_EVAL_USER_ID ?? '0', 10)
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')

  if (!apiKey) {
    console.error(
      'Error: Anthropic API key required. Pass --key=<key> or set ANTHROPIC_API_KEY env var.',
    )
    process.exit(1)
  }
  if (!clientId || !userId) {
    console.error(
      'Error: --clientId and --userId are required (must be non-zero integers).',
    )
    process.exit(1)
  }

  console.log(`\nCompany Brain Agent — Eval Runner`)
  console.log(`  model    : ${MODEL}`)
  console.log(`  fixtures : ${EVAL_FIXTURES.length}`)
  console.log(`  clientId : ${clientId}`)
  console.log(`  userId   : ${userId}`)
  console.log()

  const summary = await runEval({ clientId, userId, anthropicApiKey: apiKey, verbose })

  // ── Print summary table ────────────────────────────────────────────────

  console.log('\n── Results ─────────────────────────────────────────────────────')
  const colWidths = { id: 40, intent: 12, pass: 6, tools: 6, grnd: 6, req: 6, tokens: 8, ms: 8 }
  const header = [
    'fixture id'.padEnd(colWidths.id),
    'intent'.padEnd(colWidths.intent),
    'pass?'.padEnd(colWidths.pass),
    'tools?'.padEnd(colWidths.tools),
    'grnd?'.padEnd(colWidths.grnd),
    'kw?'.padEnd(colWidths.req),
    'tokens'.padStart(colWidths.tokens),
    'ms'.padStart(colWidths.ms),
  ].join('  ')
  console.log(header)
  console.log('─'.repeat(header.length))

  for (const r of summary.results) {
    const row = [
      r.fixtureId.slice(0, colWidths.id).padEnd(colWidths.id),
      r.intent.padEnd(colWidths.intent),
      (r.passed ? 'PASS' : 'FAIL').padEnd(colWidths.pass),
      (r.toolsCalledCorrectly ? 'yes' : 'NO').padEnd(colWidths.tools),
      (r.answerGrounded ? 'yes' : 'NO').padEnd(colWidths.grnd),
      (r.answerContainsRequired ? 'yes' : 'NO').padEnd(colWidths.req),
      String(r.inputTokens + r.outputTokens).padStart(colWidths.tokens),
      String(r.durationMs).padStart(colWidths.ms),
    ].join('  ')
    console.log(row)
    if (!r.passed && r.failureReason) {
      console.log(`  ${''.padEnd(colWidths.id)}  reason: ${r.failureReason}`)
    }
  }

  console.log('\n── By intent ───────────────────────────────────────────────────')
  for (const [intent, counts] of Object.entries(summary.byIntent)) {
    const pct = Math.round((counts.passed / counts.total) * 100)
    console.log(`  ${intent.padEnd(12)}  ${counts.passed}/${counts.total}  (${pct}%)`)
  }

  console.log('\n── Overall ─────────────────────────────────────────────────────')
  console.log(`  total    : ${summary.total}`)
  console.log(`  passed   : ${summary.passed}`)
  console.log(`  failed   : ${summary.failed}`)
  console.log(`  pass rate: ${Math.round(summary.passRate * 100)}%`)
  console.log(`  avg time : ${summary.avgDurationMs}ms`)
  console.log(`  tokens   : ${summary.totalTokens}`)
  console.log()
}
