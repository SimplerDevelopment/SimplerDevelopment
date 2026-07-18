/**
 * CLI runner for the Company Brain workflow.
 *
 *   bun run src/run-brain.ts "who knows about Stripe billing?"
 *
 * Runs classify → plan → tool-loop (via the SD MCP) → groundedness check and
 * prints the result. Needs SD_MCP_API_KEY + ANTHROPIC_API_KEY in .env and the
 * parent Next app running (see BRAIN_AGENT_README.md).
 */
// Bun auto-loads .env; no dotenv needed.
import { mastra } from './mastra/index';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: bun run src/run-brain.ts "<your question>"');
  process.exit(1);
}

const run = await mastra.getWorkflow('brainWorkflow').createRun();
const result = await run.start({ inputData: { query } });

if (result.status === 'success') {
  const { answer, intent, plan, groundedness } = result.result;
  console.log('\n=== ANSWER ===\n' + answer);
  console.log('\n=== META ===');
  console.log('intent     :', `${intent.intent} (${intent.complexity})`);
  if (plan.length) console.log('plan       :', plan.join(' · '));
  console.log('confidence :', groundedness.confidence, groundedness.grounded ? '(grounded)' : '(ungrounded)');
  if (groundedness.uncertain) console.log('⚠️  flagged uncertain');
  if (groundedness.sources.length) console.log('sources    :', groundedness.sources.join(', '));
} else {
  console.error('\nWorkflow did not succeed:', result.status);
  if (result.status === 'failed') console.error(result.error);
}

process.exit(0);
