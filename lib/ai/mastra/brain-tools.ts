import { createTool } from '@mastra/core/tools';
import { BRAIN_TOOLS, executeBrainTool } from '@/lib/ai/brain-tools';
import { jsonSchemaToZod } from './json-schema-to-zod';

/**
 * Wrap the app's in-process brain tools as Mastra tools, bound to one tenant.
 *
 * Each tool's execute() calls the SAME `executeBrainTool` dispatcher the
 * streaming route uses — so the sanitizer and the lib/brain/* implementations
 * are reused verbatim. No MCP, no HTTP: clientId/userId are closed over per
 * request. This is the in-app counterpart to simplerdevelopment-agents' MCP-based tools.
 */
export function buildBrainMastraTools(clientId: number, userId: number) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  for (const tool of BRAIN_TOOLS) {
    tools[tool.name] = createTool({
      id: tool.name,
      description: tool.description ?? tool.name,
      inputSchema: jsonSchemaToZod(tool.input_schema as never),
      execute: async (input: Record<string, unknown>) => {
        // Returns a sanitized JSON string; the model consumes it as the tool result.
        return executeBrainTool(tool.name, input ?? {}, clientId, userId);
      },
    });
  }
  return tools;
}
