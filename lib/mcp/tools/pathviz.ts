/**
 * MCP tools — Path Visualizations ("Dev Paths"): charts + graph tools.
 *
 * Phase 2 of the Path Visualizations feature — see
 * `vault/05 - Feature Specs/Path Visualizations.md` for the full contract
 * (data model, tool table, v2 "Dev Paths" claims/conflict model). Coding
 * agents use this surface to declare and update a project's live path graph
 * (screens/components/apis/schema/services/tests/jobs/infra) as they build,
 * and to coordinate with other agents working the same project via file/node
 * claims.
 *
 * Registrar pattern mirrors lib/mcp/tools/projects.ts exactly: register-time
 * `hasScope` + in-handler `requireScope`, Zod input schemas, an
 * `authorizeChart`/`authorizeProjectForClient`-style ownership check, slim
 * `json()` echoes. Scopes reuse projects:read / projects:write — charts are
 * project sub-resources, the same choice kanban made for its tables.
 *
 * Every write tool:
 *   1. verifies the chart's project belongs to ctx.client
 *   2. performs the mutation
 *   3. appends the corresponding path_chart_events row(s) via
 *      appendPathChartEvents (lib/pathviz/events.ts) — which also bumps
 *      path_charts.updated_at and fires pg_notify for the Phase 3 SSE feed
 *   4. revalidateForWrite('portal')
 *
 * Agent identity: every write tool accepts an optional `agentLabel` input (a
 * self-declared session name, e.g. "claude/wallet-ui") that overrides the
 * ctx-derived default. See resolveAgentLabel()'s doc comment for why the
 * fallback is user+client identity rather than a richer connection/token
 * display name — PortalMcpContext doesn't carry one today.
 *
 * File split (2026-07-18, file-size budget — scripts/check-file-budget.ts
 * caps NEW files at 800 lines; this module had grown to 920): the original
 * single pathviz.ts is now three files —
 *   - pathviz-shared.ts        shared enums, pure helpers, and the
 *                              authorizeProjectForClient/authorizeChart
 *                              ownership checks (now plain functions taking
 *                              `clientId` explicitly rather than registrar
 *                              closures)
 *   - pathviz.ts (this file)   registerPathvizTools — the 8 chart/graph tools
 *   - pathviz-coordination.ts  registerPathvizCoordinationTools — the 5
 *                              presence/claims/notes tools
 * Tool names, schemas, logic, and response shapes are unchanged by the split.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  pathCharts,
  pathChartNodes,
  pathChartEdges,
  pathChartEvents,
  pathChartClaims,
} from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { json, denied, requireScope, revalidateForWrite } from '../types';
import { appendPathChartEvents, type PathChartEventInput } from '@/lib/pathviz/events';
import {
  NODE_KIND,
  NODE_STATUS,
  EDGE_KIND,
  CHART_STATUS,
  AGENT_LABEL_INPUT,
  resolveAgentLabel,
  omitNulls,
  orderNodesForUpsert,
  activeClaimCondition,
  authorizeProjectForClient,
  authorizeChart,
} from './pathviz-shared';

export function registerPathvizTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── CHARTS ────────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'pathviz_list_charts',
    {
      title: 'List path-visualization charts',
      description: 'List path-visualization ("Dev Paths") charts for a project — id, title, status, app label, node/edge counts, and the last event time.',
      inputSchema: { projectId: z.number() },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authorizeProjectForClient(projectId, clientId))) return json({ error: 'Project not found' });

      const charts = await db.select().from(pathCharts)
        .where(eq(pathCharts.projectId, projectId))
        .orderBy(desc(pathCharts.updatedAt));
      if (charts.length === 0) return json([]);

      const chartIds = charts.map((c) => c.id);
      const nodeCounts = await db.select({ chartId: pathChartNodes.chartId, count: sql<number>`count(*)::int` })
        .from(pathChartNodes).where(inArray(pathChartNodes.chartId, chartIds)).groupBy(pathChartNodes.chartId);
      const edgeCounts = await db.select({ chartId: pathChartEdges.chartId, count: sql<number>`count(*)::int` })
        .from(pathChartEdges).where(inArray(pathChartEdges.chartId, chartIds)).groupBy(pathChartEdges.chartId);
      const nodeMap = new Map(nodeCounts.map((r) => [r.chartId, r.count]));
      const edgeMap = new Map(edgeCounts.map((r) => [r.chartId, r.count]));

      return json(charts.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        appLabel: c.appLabel,
        nodeCount: nodeMap.get(c.id) ?? 0,
        edgeCount: edgeMap.get(c.id) ?? 0,
        lastEventAt: c.updatedAt,
      })));
    }
  );

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'pathviz_get_chart',
    {
      title: 'Get full path-visualization chart',
      description: 'Load a chart\'s full graph: chart metadata, every node and edge, active claims, and the last 20 notes. The "load my map" call an agent makes at the start of a task.',
      inputSchema: { chartId: z.number() },
    },
    async ({ chartId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const [chartRow] = await db.select().from(pathCharts).where(eq(pathCharts.id, chartId)).limit(1);
      const nodes = await db.select().from(pathChartNodes).where(eq(pathChartNodes.chartId, chartId));
      const edges = await db.select().from(pathChartEdges).where(eq(pathChartEdges.chartId, chartId));
      const claims = await db.select({
        nodeId: pathChartClaims.nodeId,
        agentLabel: pathChartClaims.agentLabel,
        intent: pathChartClaims.intent,
        files: pathChartClaims.files,
        expiresAt: pathChartClaims.expiresAt,
      }).from(pathChartClaims).where(activeClaimCondition(chartId));
      const noteEvents = await db.select({
        payload: pathChartEvents.payload,
        agentLabel: pathChartEvents.agentLabel,
        createdAt: pathChartEvents.createdAt,
      }).from(pathChartEvents)
        .where(and(eq(pathChartEvents.chartId, chartId), eq(pathChartEvents.eventType, 'note')))
        .orderBy(desc(pathChartEvents.createdAt))
        .limit(20);

      const nodeIdToKey = new Map(nodes.map((n) => [n.id, n.key]));

      return json({
        chart: chartRow ? omitNulls({
          id: chartRow.id,
          projectId: chartRow.projectId,
          title: chartRow.title,
          description: chartRow.description,
          appLabel: chartRow.appLabel,
          status: chartRow.status,
          createdByAgent: chartRow.createdByAgent,
          createdAt: chartRow.createdAt,
          updatedAt: chartRow.updatedAt,
        }) : null,
        nodes: nodes.map((n) => omitNulls({
          id: n.id,
          key: n.key,
          parentKey: n.parentNodeId != null ? nodeIdToKey.get(n.parentNodeId) ?? null : null,
          kind: n.kind,
          label: n.label,
          routePath: n.routePath,
          filePath: n.filePath,
          status: n.status,
          meta: n.meta,
          position: n.position,
        })),
        edges: edges.map((e) => omitNulls({
          id: e.id,
          sourceKey: nodeIdToKey.get(e.sourceNodeId) ?? null,
          targetKey: nodeIdToKey.get(e.targetNodeId) ?? null,
          kind: e.kind,
          label: e.label,
          meta: e.meta,
        })),
        activeClaims: claims.map((c) => omitNulls({
          nodeKey: nodeIdToKey.get(c.nodeId) ?? null,
          agentLabel: c.agentLabel,
          intent: c.intent,
          files: c.files,
          expiresAt: c.expiresAt,
        })),
        notes: noteEvents.map((ev) => {
          const payload = (ev.payload ?? {}) as { nodeKey?: string; text?: string };
          return {
            nodeKey: payload.nodeKey ?? null,
            agentLabel: ev.agentLabel,
            text: payload.text ?? '',
            createdAt: ev.createdAt,
          };
        }),
      });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_create_chart',
    {
      title: 'Create a path-visualization chart',
      description: 'Create a new path-visualization ("Dev Paths") chart under a project — the live node-graph an agent declares while building.',
      inputSchema: {
        projectId: z.number(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        appLabel: z.string().max(120).optional(),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ projectId, title, description, appLabel, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeProjectForClient(projectId, clientId))) return json({ error: 'Project not found' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const [row] = await db.insert(pathCharts).values({
        projectId,
        title,
        description: description ?? null,
        appLabel: appLabel ?? null,
        status: 'active',
        createdByAgent: agentLabel,
      }).returning();

      await appendPathChartEvents(row.id, [
        { eventType: 'chart.created', payload: { title, appLabel: appLabel ?? null }, agentLabel },
      ]);
      revalidateForWrite('portal');
      return json({ id: row.id, title: row.title, status: row.status, appLabel: row.appLabel });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_update_chart',
    {
      title: 'Update a path-visualization chart',
      description: 'Update a chart\'s title, description, or status. Set status to "archived" to soft-delete — lifecycle is archive-only, there is no hard delete.',
      inputSchema: {
        chartId: z.number(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        status: CHART_STATUS.optional(),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, title, description, status, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (status !== undefined) patch.status = status;
      if (Object.keys(patch).length === 0) return json({ error: 'No fields to update' });

      const [row] = await db.update(pathCharts).set(patch)
        .where(eq(pathCharts.id, chartId)).returning();
      if (!row) return json({ error: 'Chart not found' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      await appendPathChartEvents(chartId, [
        { eventType: status === 'archived' ? 'chart.archived' : 'chart.updated', payload: patch, agentLabel },
      ]);
      revalidateForWrite('portal');
      return json({ id: row.id, title: row.title, status: row.status, appLabel: row.appLabel });
    }
  );

  // ── NODES / EDGES ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_upsert_nodes',
    {
      title: 'Upsert path-chart nodes (batch)',
      description: 'Batch-declare or update up to 50 nodes on a chart, upserted by (chartId, key). parentKey resolves to the parent node\'s id — the parent must already exist in the chart or appear earlier in this same batch. Fields omitted on an already-existing node are left unchanged (use pathviz_set_status for a cheaper status-only flip).',
      inputSchema: {
        chartId: z.number(),
        nodes: z.array(z.object({
          key: z.string().min(1).max(120),
          kind: NODE_KIND,
          label: z.string().min(1).max(200),
          parentKey: z.string().optional(),
          routePath: z.string().optional(),
          filePath: z.string().optional(),
          status: NODE_STATUS.optional(),
          meta: z.record(z.string(), z.unknown()).optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        })).min(1).max(50),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, nodes, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const keys = nodes.map((n) => n.key);
      if (new Set(keys).size !== keys.length) return json({ error: 'Duplicate keys in batch' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const ordered = orderNodesForUpsert(nodes);
      const keyToId = new Map<string, number>();
      const events: PathChartEventInput[] = [];
      const results: Array<{ key: string; id: number; status: string }> = [];

      for (const n of ordered) {
        let parentNodeId: number | null = null;
        if (n.parentKey) {
          if (keyToId.has(n.parentKey)) {
            parentNodeId = keyToId.get(n.parentKey)!;
          } else {
            const [existing] = await db.select({ id: pathChartNodes.id }).from(pathChartNodes)
              .where(and(eq(pathChartNodes.chartId, chartId), eq(pathChartNodes.key, n.parentKey)))
              .limit(1);
            if (!existing) {
              return json({ error: `Unknown parentKey "${n.parentKey}" for node "${n.key}" — parent must exist in this batch or already in the chart` });
            }
            parentNodeId = existing.id;
          }
        }

        // Built via conditional spreads (rather than mutating a
        // Record<string, unknown>) so it stays assignable to the table's
        // strict $inferInsert shape — .values() requires the exact insert
        // type, unlike .set()'s looser partial-update typing below.
        const insertValues: typeof pathChartNodes.$inferInsert = {
          chartId, key: n.key, kind: n.kind, label: n.label, parentNodeId,
          ...(n.routePath !== undefined ? { routePath: n.routePath } : {}),
          ...(n.filePath !== undefined ? { filePath: n.filePath } : {}),
          ...(n.status !== undefined ? { status: n.status } : {}),
          ...(n.meta !== undefined ? { meta: n.meta } : {}),
          ...(n.position !== undefined ? { position: n.position } : {}),
        };

        // Only touch fields explicitly present on this call — an upsert that
        // only supplies {key, kind, label} must not reset an existing node's
        // status/meta/position back to defaults.
        const updateSet: Record<string, unknown> = { kind: n.kind, label: n.label, parentNodeId, updatedAt: new Date() };
        if (n.routePath !== undefined) updateSet.routePath = n.routePath;
        if (n.filePath !== undefined) updateSet.filePath = n.filePath;
        if (n.status !== undefined) updateSet.status = n.status;
        if (n.meta !== undefined) updateSet.meta = n.meta;
        if (n.position !== undefined) updateSet.position = n.position;

        const [row] = await db.insert(pathChartNodes).values(insertValues)
          .onConflictDoUpdate({
            target: [pathChartNodes.chartId, pathChartNodes.key],
            set: updateSet,
          })
          .returning();

        keyToId.set(n.key, row.id);
        results.push({ key: n.key, id: row.id, status: row.status });
        events.push({
          eventType: 'node.upserted',
          payload: { key: n.key, kind: n.kind, label: n.label, status: row.status, parentKey: n.parentKey ?? null },
          agentLabel,
        });
      }

      await appendPathChartEvents(chartId, events);
      revalidateForWrite('portal');
      return json({ upserted: results });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_upsert_edges',
    {
      title: 'Upsert path-chart edges (batch)',
      description: 'Batch-declare or update up to 50 edges on a chart by (sourceKey, targetKey, kind). "nav" = user navigation between screens; "data" = a node calling a service.',
      inputSchema: {
        chartId: z.number(),
        edges: z.array(z.object({
          sourceKey: z.string().min(1),
          targetKey: z.string().min(1),
          kind: EDGE_KIND,
          label: z.string().max(120).optional(),
          meta: z.record(z.string(), z.unknown()).optional(),
        })).min(1).max(50),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, edges, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const keys = [...new Set(edges.flatMap((e) => [e.sourceKey, e.targetKey]))];
      const nodeRows = await db.select({ id: pathChartNodes.id, key: pathChartNodes.key })
        .from(pathChartNodes)
        .where(and(eq(pathChartNodes.chartId, chartId), inArray(pathChartNodes.key, keys)));
      const keyToId = new Map(nodeRows.map((r) => [r.key, r.id]));
      const unknown = keys.filter((k) => !keyToId.has(k));
      if (unknown.length > 0) return json({ error: `Unknown node key(s): ${unknown.join(', ')}` });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const events: PathChartEventInput[] = [];
      const results: Array<{ id: number; sourceKey: string; targetKey: string; kind: string }> = [];

      for (const e of edges) {
        const sourceNodeId = keyToId.get(e.sourceKey)!;
        const targetNodeId = keyToId.get(e.targetKey)!;
        const [row] = await db.insert(pathChartEdges).values({
          chartId,
          sourceNodeId,
          targetNodeId,
          kind: e.kind,
          label: e.label ?? null,
          meta: e.meta ?? null,
        }).onConflictDoUpdate({
          target: [pathChartEdges.chartId, pathChartEdges.sourceNodeId, pathChartEdges.targetNodeId, pathChartEdges.kind],
          set: { label: e.label ?? null, meta: e.meta ?? null },
        }).returning();

        results.push({ id: row.id, sourceKey: e.sourceKey, targetKey: e.targetKey, kind: e.kind });
        events.push({
          eventType: 'edge.upserted',
          payload: { id: row.id, sourceKey: e.sourceKey, targetKey: e.targetKey, kind: e.kind, label: e.label ?? null },
          agentLabel,
        });
      }

      await appendPathChartEvents(chartId, events);
      revalidateForWrite('portal');
      return json({ upserted: results });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_set_status',
    {
      title: 'Set node status (hot path)',
      description: 'Cheapest possible status flip for one or more nodes by key — the call an agent makes constantly while working (planned → scaffolded → wired → styled → tested → shipped, or blocked/error). Does not touch meta/position; use pathviz_upsert_nodes for that.',
      inputSchema: {
        chartId: z.number(),
        updates: z.array(z.object({
          key: z.string().min(1),
          status: NODE_STATUS,
          note: z.string().max(500).optional(),
        })).min(1).max(50),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, updates, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const events: PathChartEventInput[] = [];
      const results: Array<{ key: string; status: string; ok: boolean }> = [];

      for (const u of updates) {
        const [row] = await db.update(pathChartNodes).set({ status: u.status, updatedAt: new Date() })
          .where(and(eq(pathChartNodes.chartId, chartId), eq(pathChartNodes.key, u.key)))
          .returning({ id: pathChartNodes.id });
        if (!row) {
          results.push({ key: u.key, status: u.status, ok: false });
          continue;
        }
        results.push({ key: u.key, status: u.status, ok: true });
        events.push({ eventType: 'node.status', payload: { key: u.key, status: u.status, note: u.note ?? null }, agentLabel });
      }

      if (events.length > 0) await appendPathChartEvents(chartId, events);
      revalidateForWrite('portal');
      return json({ updated: results });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_remove',
    {
      title: 'Remove path-chart nodes/edges',
      description: 'Delete nodes by key (their edges cascade) and/or edges by id. Provide nodeKeys and/or edgeIds.',
      inputSchema: {
        chartId: z.number(),
        nodeKeys: z.array(z.string()).optional(),
        edgeIds: z.array(z.number()).optional(),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, nodeKeys, edgeIds, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });
      if ((!nodeKeys || nodeKeys.length === 0) && (!edgeIds || edgeIds.length === 0)) {
        return json({ error: 'Provide nodeKeys and/or edgeIds to remove' });
      }

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const events: PathChartEventInput[] = [];
      let removedNodes: string[] = [];
      let removedEdges: number[] = [];

      if (nodeKeys && nodeKeys.length > 0) {
        const rows = await db.delete(pathChartNodes)
          .where(and(eq(pathChartNodes.chartId, chartId), inArray(pathChartNodes.key, nodeKeys)))
          .returning({ key: pathChartNodes.key });
        removedNodes = rows.map((r) => r.key);
        for (const key of removedNodes) events.push({ eventType: 'node.removed', payload: { key }, agentLabel });
      }
      if (edgeIds && edgeIds.length > 0) {
        // Resolve edge identity (node keys + kind) BEFORE deleting: the client
        // reducer keys edges by (sourceKey, targetKey, kind) — a live-created
        // edge never learns its DB id from edge.upserted alone, so a bare
        // { id } removal payload would be unresolvable there.
        const edgeRows = await db.select({
          id: pathChartEdges.id,
          kind: pathChartEdges.kind,
          sourceNodeId: pathChartEdges.sourceNodeId,
          targetNodeId: pathChartEdges.targetNodeId,
        }).from(pathChartEdges)
          .where(and(eq(pathChartEdges.chartId, chartId), inArray(pathChartEdges.id, edgeIds)));
        const edgeNodeIds = [...new Set(edgeRows.flatMap((e) => [e.sourceNodeId, e.targetNodeId]))];
        const edgeNodeRows = edgeNodeIds.length > 0
          ? await db.select({ id: pathChartNodes.id, key: pathChartNodes.key })
              .from(pathChartNodes).where(inArray(pathChartNodes.id, edgeNodeIds))
          : [];
        const idToKey = new Map(edgeNodeRows.map((r) => [r.id, r.key]));

        const rows = await db.delete(pathChartEdges)
          .where(and(eq(pathChartEdges.chartId, chartId), inArray(pathChartEdges.id, edgeIds)))
          .returning({ id: pathChartEdges.id });
        const removedSet = new Set(rows.map((r) => r.id));
        removedEdges = edgeRows.filter((e) => removedSet.has(e.id)).map((e) => e.id);
        for (const e of edgeRows) {
          if (!removedSet.has(e.id)) continue;
          events.push({
            eventType: 'edge.removed',
            payload: {
              id: e.id,
              sourceKey: idToKey.get(e.sourceNodeId) ?? null,
              targetKey: idToKey.get(e.targetNodeId) ?? null,
              kind: e.kind,
            },
            agentLabel,
          });
        }
      }

      if (events.length > 0) await appendPathChartEvents(chartId, events);
      revalidateForWrite('portal');
      return json({ removedNodes, removedEdges });
    }
  );
}
