export const meta = {
  name: 'flaky-test-hunt',
  description: 'Loop-until-done hunt for a flaky test: keep reproducing and forming/refuting root-cause theories until one is confirmed',
  whenToUse: 'A test that fails intermittently (e.g. 1 in N runs) and you cannot spot the cause. Each round runs the test repeatedly to repro, then adversarially tests a theory; loops until a root cause is confirmed or the round cap is hit.',
  phases: [
    { title: 'Repro', detail: 'run the test repeatedly until it fails' },
    { title: 'Theorize', detail: 'form + adversarially refute a root-cause theory' },
  ],
}

// args:
//   { test: string, runs?: number, maxRounds?: number }
//   test     — REQUIRED: test name or path (e.g. "tests/foo.test.ts" or a -t pattern)
//   runs     — repetitions per repro attempt (default 50)
//   maxRounds — safety cap on theory rounds (default 6); each round isolates in its own worktree

const target = args && args.test
if (!target) {
  log('flaky-test-hunt requires args.test (a test name or path). Aborting.')
  return { error: 'missing args.test' }
}
const runs = (args && args.runs) || 50
const maxRounds = (args && args.maxRounds) || 6

const REPRO_SCHEMA = {
  type: 'object',
  required: ['reproduced'],
  properties: {
    reproduced: { type: 'boolean' },
    failuresOutOf: { type: 'string', description: 'e.g. "3/50"' },
    failureOutput: { type: 'string', description: 'the assertion/stack from a failing run, trimmed' },
  },
}

const THEORY_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'theory'],
  properties: {
    confirmed: { type: 'boolean', description: 'true only if the theory survived an adversarial attempt to refute it' },
    theory: { type: 'string', description: 'the suspected root cause' },
    evidence: { type: 'string', description: 'code/line + observation that supports it' },
    fix: { type: 'string', description: 'the minimal fix that would make it deterministic' },
  },
}

const tried = []
let round = 0

while (round < maxRounds) {
  round += 1
  phase('Repro')
  const repro = await agent(
    `Reproduce a suspected flaky test in this repo. Run \`${target}\` ${runs} times in a row (use the repo's test runner — see scripts/test.sh / the test commands in CLAUDE.md; pick the right --layer for this test). ` +
      `Report whether it failed at least once, the failure ratio, and the trimmed failure output. Do not fix anything yet.`,
    { label: `repro:round-${round}`, phase: 'Repro', isolation: 'worktree', schema: REPRO_SCHEMA },
  )

  if (!repro || !repro.reproduced) {
    log(`Round ${round}: could not reproduce in ${runs} runs.`)
    if (round >= maxRounds) break
    continue
  }
  log(`Round ${round}: reproduced (${repro.failuresOutOf || 'flaky'}). Forming a theory.`)

  phase('Theorize')
  const avoid = tried.length ? `\nAlready-refuted theories (do NOT repeat): ${tried.join('; ')}.` : ''
  const theory = await agent(
    `A flaky test \`${target}\` just reproduced. Failure output:\n${repro.failureOutput || '(see prior round)'}\n\n` +
      `Form ONE concrete root-cause theory (common culprits: shared/leaked state between tests, order dependence, real clock/Date or timers, network/DB race, unawaited promise, nondeterministic ordering, test-pollution via globals). ` +
      `Then ADVERSARIALLY test it: in your own worktree, make a minimal change that should make it deterministic IF the theory is right, and re-run \`${target}\` ${runs} times. ` +
      `Set confirmed=true ONLY if the failures vanish under your change and reappear without it. Otherwise confirmed=false. Give evidence + the minimal fix.${avoid}`,
    { label: `theory:round-${round}`, phase: 'Theorize', isolation: 'worktree', schema: THEORY_SCHEMA },
  )

  if (theory && theory.confirmed) {
    log(`Round ${round}: root cause CONFIRMED.`)
    return { status: 'confirmed', rounds: round, rootCause: theory }
  }
  if (theory && theory.theory) {
    tried.push(theory.theory)
    log(`Round ${round}: theory refuted — "${theory.theory}". Looping.`)
  }
}

log(`Hit round cap (${maxRounds}) without a confirmed root cause.`)
return {
  status: 'inconclusive',
  rounds: round,
  refutedTheories: tried,
  note: `Raise maxRounds/runs and re-run, or hand the refuted-theory list to a human. The test reproduced but no single theory survived adversarial testing in ${maxRounds} rounds.`,
}
