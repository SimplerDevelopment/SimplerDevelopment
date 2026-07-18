/**
 * CLI runner for the Portal AI Assistant (dynamic agent).
 *
 *   bun run src/run-portal.ts "what invoices are overdue and who owns the CRM deal for Acme?"
 *
 * Classifies the request (complexity + domains), stuffs them into a RequestContext,
 * and lets the assistant self-configure its model + tool set per request.
 * Needs SD_MCP_API_KEY + ANTHROPIC_API_KEY and the parent app running.
 */
// Bun auto-loads .env; no dotenv needed.
import { RequestContext } from '@mastra/core/request-context';
import { mastra } from './mastra/index';
import { classifyPortalIntent } from './mastra/agents/portal-intent';

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Usage: bun run src/run-portal.ts "<your request>"');
  process.exit(1);
}

const intent = await classifyPortalIntent(message);
console.log(`[routing] complexity=${intent.complexity} domains=[${intent.domains.join(', ')}]`);

const requestContext = new RequestContext();
requestContext.set('complexity', intent.complexity);
requestContext.set('domains', intent.domains);

// Via the Mastra instance so the agent's Memory picks up configured storage.
const res = await mastra.getAgent('portalAssistant').generate(message, { requestContext, maxSteps: 8 });

console.log('\n=== ANSWER ===\n' + res.text);
const tools = res.toolCalls?.map((c) => c.payload.toolName) ?? [];
if (tools.length) console.log('\n[tools used] ' + tools.join(', '));

process.exit(0);
