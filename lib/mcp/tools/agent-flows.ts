/**
 * MCP tools — agent flows (Workflow Designer).
 *
 * Read-only on purpose. These exist so an AI client can FETCH a flow graph
 * and execute it (see the `sd-run-flow` skill) — authoring stays in the
 * portal canvas, which is the surface that can actually lay a graph out.
 * Adding write tools here would mean a second, blind authoring path with no
 * way to position nodes sensibly.
 *
 * `agentType` on every agent node is a `.claude/agents/` filename minus `.md`
 * (see PERSONA_SLUGS in lib/agent-flows/types.ts), so a client can map a node
 * straight onto a subagent without translation.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentFlows, agentFlowRuns, projects } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { json, denied, requireScope } from '../types';
import { appendRunEvent } from '@/lib/agent-flows/events';
import { MAX_RUN_DEPTH, type AgentFlowGraph } from '@/lib/agent-flows/types';

export function registerAgentFlowTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'agent_flows_list',
    {
      title: 'List agent flows',
      description:
        'List the Workflow Designer agent flows attached to a project. Returns a slim row per ' +
        'flow (no graph payload) — call agent_flows_get for the graph itself.',
      inputSchema: { projectId: z.number() },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      // Tenant gate: the project must belong to the authenticated client.
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });

      // Slim projection — node/edge counts are derived in SQL so the list
      // never ships the graph blob just to say how big it is.
      const rows = await db.select({
        id: agentFlows.id,
        name: agentFlows.name,
        description: agentFlows.description,
        status: agentFlows.status,
        updatedAt: agentFlows.updatedAt,
        nodeCount: sql<number>`jsonb_array_length(coalesce(${agentFlows.graph}->'nodes', '[]'::jsonb))`.as('nodeCount'),
        edgeCount: sql<number>`jsonb_array_length(coalesce(${agentFlows.graph}->'edges', '[]'::jsonb))`.as('edgeCount'),
      })
        .from(agentFlows)
        .where(eq(agentFlows.projectId, projectId))
        .orderBy(desc(agentFlows.updatedAt));

      return json({ flows: rows });
    }
  );

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'agent_flows_get',
    {
      title: 'Get an agent flow graph',
      description:
        'Get one Workflow Designer flow including its full node/edge graph. Node data carries ' +
        'agentType (a .claude/agents persona slug), model, prompt, entryPoint, fanOut ' +
        "('all' = run every outgoing branch, 'one' = take exactly one), and for human nodes " +
        'assigneeIds (project-member user ids who must sign off). Edge kind is handoff or dependency.',
      inputSchema: { projectId: z.number(), flowId: z.number() },
    },
    async ({ projectId, flowId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });

      // flowId is never trusted alone — it is always joined to the
      // tenant-owned project above, so a flow belonging to another project
      // (even one owned by the same client) fails closed rather than leaking.
      const [flow] = await db.select({
        id: agentFlows.id,
        projectId: agentFlows.projectId,
        name: agentFlows.name,
        description: agentFlows.description,
        status: agentFlows.status,
        graph: agentFlows.graph,
        updatedAt: agentFlows.updatedAt,
      })
        .from(agentFlows)
        .where(and(eq(agentFlows.id, flowId), eq(agentFlows.projectId, projectId)))
        .limit(1);

      if (!flow) return json({ error: 'Flow not found' });
      return json({ flow });
    }
  );

  // ── Executions ────────────────────────────────────────────────────────────
  // Writes, because the RUNNER is a Claude Code session reporting its own
  // progress — the portal is a viewer. These are the only agent-flow writes
  // over MCP: authoring still belongs in the canvas.

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'agent_flow_runs_start',
    {
      title: 'Start an agent flow run',
      description:
        'Open an execution of a Workflow Designer flow and return its runId. Snapshots the ' +
        'flow graph onto the run so the execution stays readable even if the flow is edited ' +
        'later. Report progress with agent_flow_runs_event. For a sub-flow handoff, pass the ' +
        'calling run as parentRunId and the calling node as parentNodeId.',
      inputSchema: {
        projectId: z.number(),
        flowId: z.number(),
        parentRunId: z.number().optional(),
        parentNodeId: z.string().max(64).optional(),
      },
    },
    async ({ projectId, flowId, parentRunId, parentNodeId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');

      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });

      const [flow] = await db.select({ id: agentFlows.id, graph: agentFlows.graph, name: agentFlows.name })
        .from(agentFlows)
        .where(and(eq(agentFlows.id, flowId), eq(agentFlows.projectId, projectId)))
        .limit(1);
      if (!flow) return json({ error: 'Flow not found' });

      // Sub-flow guards. A `flow` node spawns a whole RUN, so an unchecked
      // A→B→A cycle burns real tokens rather than just looping a node.
      let depth = 0;
      if (parentRunId != null) {
        const [parent] = await db.select({
          id: agentFlowRuns.id, depth: agentFlowRuns.depth, projectId: agentFlowRuns.projectId,
        }).from(agentFlowRuns)
          .where(and(eq(agentFlowRuns.id, parentRunId), eq(agentFlowRuns.projectId, projectId)))
          .limit(1);
        if (!parent) return json({ error: 'Parent run not found' });

        depth = parent.depth + 1;
        if (depth > MAX_RUN_DEPTH) {
          return json({ error: `Sub-flow nesting exceeds the maximum depth of ${MAX_RUN_DEPTH}` });
        }

        // Walk the ancestor chain and refuse to re-enter a flow already running
        // above us. Bounded by MAX_RUN_DEPTH, so this is a handful of lookups.
        let cursor: number | null = parentRunId;
        for (let i = 0; i <= MAX_RUN_DEPTH && cursor != null; i++) {
          const [anc] = await db.select({ flowId: agentFlowRuns.flowId, parentRunId: agentFlowRuns.parentRunId })
            .from(agentFlowRuns).where(eq(agentFlowRuns.id, cursor)).limit(1);
          if (!anc) break;
          if (anc.flowId === flowId) {
            return json({ error: 'Sub-flow cycle: this flow is already running further up the chain' });
          }
          cursor = anc.parentRunId;
        }
      }

      const [run] = await db.insert(agentFlowRuns).values({
        flowId,
        projectId,
        // Stamped from the loaded project, never from the request body.
        clientId,
        graph: flow.graph as AgentFlowGraph,
        parentRunId: parentRunId ?? null,
        parentNodeId: parentNodeId ?? null,
        depth,
        startedBy: ctx.userId ?? null,
      }).returning({ id: agentFlowRuns.id });

      await appendRunEvent(run.id, projectId, {
        type: 'run.started',
        summary: `Started "${flow.name}"${parentRunId ? ` (sub-flow of run ${parentRunId})` : ''}`,
      });

      // Echo compactly — the caller already knows the graph it asked to run.
      return json({ runId: run.id, flowId, depth });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'agent_flow_runs_event',
    {
      title: 'Report agent flow run progress',
      description:
        'Append a progress event to a run and push it to anyone watching the portal live. ' +
        "Types: node.status (with status started|finished|failed|skipped and a nodeId), " +
        'run.waiting (parked on a human node), note (free text), run.finished (with status ' +
        'succeeded|failed|abandoned). Include model/inputTokens/outputTokens/durationMs on a ' +
        'finished node so the canvas can show cost per step. summary is capped at 2KB.',
      inputSchema: {
        runId: z.number(),
        type: z.enum(['node.status', 'run.waiting', 'note', 'run.finished']),
        nodeId: z.string().max(64).optional(),
        status: z.string().max(16).optional(),
        summary: z.string().optional(),
        model: z.string().max(32).optional(),
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
        durationMs: z.number().int().nonnegative().optional(),
      },
    },
    async ({ runId, type, nodeId, status, summary, model, inputTokens, outputTokens, durationMs }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');

      // runId is never trusted alone — joined to a tenant-owned project.
      const [run] = await db.select({ id: agentFlowRuns.id, projectId: agentFlowRuns.projectId })
        .from(agentFlowRuns)
        .where(and(eq(agentFlowRuns.id, runId), eq(agentFlowRuns.clientId, clientId)))
        .limit(1);
      if (!run) return json({ error: 'Run not found' });

      const { eventId } = await appendRunEvent(runId, run.projectId, {
        type, nodeId, status: status as never, summary, model, inputTokens, outputTokens, durationMs,
      });

      return json({ eventId });
    }
  );
}
