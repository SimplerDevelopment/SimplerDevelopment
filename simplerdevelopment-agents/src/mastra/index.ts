
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { toolGroundingScorer, groundednessScorer } from './scorers/brain-scorer';
// SimplerDevelopment Company Brain example (talks to the portal MCP server).
import { brainAgent } from './agents/brain-agent';
import { classifierAgent, plannerAgent, grounderAgent } from './agents/brain-stages';
import { brainWorkflow } from './workflows/brain-workflow';
import { portalAssistant } from './agents/portal-assistant';
import { portalClassifier } from './agents/portal-intent';
import { sdMcp, sdMcpConfigured } from './mcp/sd-mcp';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, brainWorkflow },
  agents: {
    weatherAgent,
    brainAgent,
    classifierAgent,
    plannerAgent,
    grounderAgent,
    portalAssistant,
    portalClassifier,
  },
  // Surface the connected SimplerDevelopment MCP server in Mastra Studio so its
  // tools are browsable alongside native ones. Only registered when a key is set.
  ...(sdMcpConfigured ? { mcpServers: sdMcp.toMCPServerProxies() } : {}),
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
    toolGroundingScorer,
    groundednessScorer,
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
