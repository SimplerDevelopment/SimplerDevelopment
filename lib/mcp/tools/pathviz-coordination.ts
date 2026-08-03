/**
 * MCP tools — Path Visualizations ("Dev Paths"): presence/claims/notes tools.
 *
 * Sibling of pathviz.ts (chart/graph tools) — split out purely for the
 * file-size budget (scripts/check-file-budget.ts caps NEW files at 800
 * lines); see the top-of-file comment in pathviz.ts for the full 3-file
 * split rationale. Same registrar pattern, same ownership-check and
 * event-append conventions, shared helpers imported from ./pathviz-shared.
 *
 * These five tools are the v2 "Dev Paths" claims/conflict model: cheap
 * presence heartbeats, advisory file/node leases, threaded notes, and the
 * pre-dispatch "who owns these files" lookup — the coordination surface
 * multiple concurrent agents use to avoid stepping on each other within the
 * same project.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  pathCharts,
  pathChartNodes,
  pathChartEvents,
  pathChartClaims,
} from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { json, denied, requireScope, revalidateForWrite } from '../types';
import { appendPathChartEvents, type PathChartEventInput } from '@/lib/pathviz/events';
import {
  AGENT_LABEL_INPUT,
  resolveAgentLabel,
  filesIntersect,
  authorizeProjectForClient,
  authorizeChart,
} from './pathviz-shared';

export function registerPathvizCoordinationTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── PRESENCE / CLAIMS / NOTES (v2 "Dev Paths") ─────────────────────────

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_touch',
    {
      title: 'Presence heartbeat',
      description: 'Ultra-cheap presence heartbeat on a node — call every ~10-30s while actively working it. Refreshes the agent\'s active claim TTLs on this chart by 30 minutes and returns any OTHER agent\'s active claim on this same node as a contested warning.',
      inputSchema: {
        chartId: z.number(),
        nodeKey: z.string().min(1),
        action: z.string().max(120).optional(),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, nodeKey, action, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const refreshedExpiry = new Date(Date.now() + 30 * 60_000);

      await db.update(pathChartClaims).set({ expiresAt: refreshedExpiry })
        .where(and(
          eq(pathChartClaims.chartId, chartId),
          eq(pathChartClaims.agentLabel, agentLabel),
          isNull(pathChartClaims.releasedAt),
          gt(pathChartClaims.expiresAt, new Date()),
        ));

      await appendPathChartEvents(chartId, [
        { eventType: 'agent.touch', payload: { nodeKey, action: action ?? null }, agentLabel },
      ]);
      revalidateForWrite('portal');

      const [node] = await db.select({ id: pathChartNodes.id }).from(pathChartNodes)
        .where(and(eq(pathChartNodes.chartId, chartId), eq(pathChartNodes.key, nodeKey))).limit(1);
      if (!node) return json({ ok: true });

      const contestants = await db.select({
        agentLabel: pathChartClaims.agentLabel,
        intent: pathChartClaims.intent,
        expiresAt: pathChartClaims.expiresAt,
      }).from(pathChartClaims).where(and(
        eq(pathChartClaims.chartId, chartId),
        eq(pathChartClaims.nodeId, node.id),
        isNull(pathChartClaims.releasedAt),
        gt(pathChartClaims.expiresAt, new Date()),
      ));
      const contested = contestants.filter((c) => c.agentLabel !== agentLabel);
      return contested.length > 0 ? json({ ok: true, contested }) : json({ ok: true });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_claim',
    {
      title: 'Claim nodes/files (advisory)',
      description: 'Create a soft/advisory file-and-node lease so other agents coordinating on the same project can see what you\'re working on. NEVER denies — an overlapping claim comes back as a warning (with the other agent\'s intent/files/recent notes) for the calling agent to read and negotiate, e.g. via pathviz_note.',
      inputSchema: {
        chartId: z.number(),
        nodeKeys: z.array(z.string()).min(1),
        intent: z.string().min(1),
        files: z.array(z.string()),
        ttlMinutes: z.number().int().min(1).max(120).optional().describe('Default 30, max 120.'),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, nodeKeys, intent, files, ttlMinutes, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const chart = await authorizeChart(chartId, clientId);
      if (!chart) return json({ error: 'Chart not found' });

      const ttl = Math.min(Math.max(ttlMinutes ?? 30, 1), 120);
      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      const expiresAt = new Date(Date.now() + ttl * 60_000);

      const nodeRows = await db.select({ id: pathChartNodes.id, key: pathChartNodes.key })
        .from(pathChartNodes)
        .where(and(eq(pathChartNodes.chartId, chartId), inArray(pathChartNodes.key, nodeKeys)));
      const keyToId = new Map(nodeRows.map((r) => [r.key, r.id]));
      const unknown = nodeKeys.filter((k) => !keyToId.has(k));
      if (unknown.length > 0) return json({ error: `Unknown node key(s): ${unknown.join(', ')}` });

      const inserted = await db.insert(pathChartClaims).values(
        nodeKeys.map((key) => ({ chartId, nodeId: keyToId.get(key)!, agentLabel, intent, files, expiresAt })),
      ).returning();

      // Conflict detection: other agents' active claims across every chart in
      // this project, matched by exact node id or by file overlap (fetched +
      // intersected in JS — fine at this scale per the spec).
      const projectCharts = await db.select({ id: pathCharts.id })
        .from(pathCharts).where(eq(pathCharts.projectId, chart.projectId));
      const projectChartIds = projectCharts.map((c) => c.id);
      const claimedNodeIds = new Set(inserted.map((c) => c.nodeId));

      const otherActive = projectChartIds.length > 0 ? await db.select({
        agentLabel: pathChartClaims.agentLabel,
        chartId: pathChartClaims.chartId,
        nodeId: pathChartClaims.nodeId,
        intent: pathChartClaims.intent,
        files: pathChartClaims.files,
      }).from(pathChartClaims).where(and(
        inArray(pathChartClaims.chartId, projectChartIds),
        isNull(pathChartClaims.releasedAt),
        gt(pathChartClaims.expiresAt, new Date()),
      )) : [];

      const conflicting = otherActive.filter((c) =>
        c.agentLabel !== agentLabel &&
        (claimedNodeIds.has(c.nodeId) || filesIntersect(c.files ?? [], files)),
      );

      type Warning = {
        agentLabel: string;
        chartId: number;
        nodeKey: string;
        intent: string | null;
        files: string[];
        recentNotes: Array<{ agentLabel: string | null; text: string; createdAt: Date }>;
      };
      let warnings: Warning[] = [];

      if (conflicting.length > 0) {
        const conflictNodeIds = [...new Set(conflicting.map((c) => c.nodeId))];
        const conflictNodeRows = await db.select({ id: pathChartNodes.id, key: pathChartNodes.key })
          .from(pathChartNodes).where(inArray(pathChartNodes.id, conflictNodeIds));
        const nodeIdToKey = new Map(conflictNodeRows.map((r) => [r.id, r.key]));

        const conflictChartIds = [...new Set(conflicting.map((c) => c.chartId))];
        const noteEvents = await db.select({
          chartId: pathChartEvents.chartId,
          payload: pathChartEvents.payload,
          agentLabel: pathChartEvents.agentLabel,
          createdAt: pathChartEvents.createdAt,
        }).from(pathChartEvents)
          .where(and(inArray(pathChartEvents.chartId, conflictChartIds), eq(pathChartEvents.eventType, 'note')))
          .orderBy(desc(pathChartEvents.createdAt))
          .limit(200);

        const notesByKey = new Map<string, Array<{ agentLabel: string | null; text: string; createdAt: Date }>>();
        for (const ev of noteEvents) {
          const payload = (ev.payload ?? {}) as { nodeKey?: string; text?: string };
          if (!payload.nodeKey) continue;
          const bucketKey = `${ev.chartId}:${payload.nodeKey}`;
          const bucket = notesByKey.get(bucketKey) ?? [];
          if (bucket.length < 3) bucket.push({ agentLabel: ev.agentLabel, text: payload.text ?? '', createdAt: ev.createdAt });
          notesByKey.set(bucketKey, bucket);
        }

        warnings = conflicting.map((c) => {
          const nodeKey = nodeIdToKey.get(c.nodeId) ?? '(unknown)';
          return {
            agentLabel: c.agentLabel,
            chartId: c.chartId,
            nodeKey,
            intent: c.intent,
            files: c.files ?? [],
            recentNotes: notesByKey.get(`${c.chartId}:${nodeKey}`) ?? [],
          };
        });
      }

      const events: PathChartEventInput[] = nodeKeys.map((key) => ({
        eventType: 'claim',
        payload: { nodeKey: key, intent, files, ttlMinutes: ttl },
        agentLabel,
      }));
      if (warnings.length > 0) {
        events.push({
          eventType: 'conflict',
          payload: { nodeKeys, agents: [...new Set(warnings.map((w) => w.agentLabel))], files },
          agentLabel,
        });
      }
      await appendPathChartEvents(chartId, events);
      revalidateForWrite('portal');
      return json({ granted: true, warnings });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_release',
    {
      title: 'Release claims',
      description: 'Release the calling agent\'s active claims on a chart — for the given nodeKeys, or every claim the agent holds on this chart if nodeKeys is omitted.',
      inputSchema: {
        chartId: z.number(),
        nodeKeys: z.array(z.string()).optional(),
        note: z.string().max(500).optional(),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, nodeKeys, note, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);

      let nodeIdFilter: number[] | null = null;
      if (nodeKeys && nodeKeys.length > 0) {
        const nodeRows = await db.select({ id: pathChartNodes.id })
          .from(pathChartNodes)
          .where(and(eq(pathChartNodes.chartId, chartId), inArray(pathChartNodes.key, nodeKeys)));
        nodeIdFilter = nodeRows.map((r) => r.id);
      }

      const whereClause = nodeIdFilter
        ? and(
            eq(pathChartClaims.chartId, chartId),
            eq(pathChartClaims.agentLabel, agentLabel),
            isNull(pathChartClaims.releasedAt),
            inArray(pathChartClaims.nodeId, nodeIdFilter),
          )
        : and(
            eq(pathChartClaims.chartId, chartId),
            eq(pathChartClaims.agentLabel, agentLabel),
            isNull(pathChartClaims.releasedAt),
          );

      const released = await db.update(pathChartClaims).set({ releasedAt: new Date() })
        .where(whereClause)
        .returning({ nodeId: pathChartClaims.nodeId });

      if (released.length === 0) return json({ released: [] });

      let releasedKeys: string[] = nodeKeys ?? [];
      if (!nodeKeys || nodeKeys.length === 0) {
        const ids = released.map((r) => r.nodeId);
        const rows = await db.select({ id: pathChartNodes.id, key: pathChartNodes.key })
          .from(pathChartNodes).where(inArray(pathChartNodes.id, ids));
        releasedKeys = rows.map((r) => r.key);
      }

      await appendPathChartEvents(chartId, releasedKeys.map((key) => ({
        eventType: 'release',
        payload: { nodeKey: key, note: note ?? null },
        agentLabel,
      })));
      revalidateForWrite('portal');
      return json({ released: releasedKeys });
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'pathviz_note',
    {
      title: 'Add a node note',
      description: 'Add a threaded note on a node — the negotiation/coordination record (interface contracts, "who waits", handoffs) between agents. Returned by pathviz_get_chart and in pathviz_claim conflict warnings.',
      inputSchema: {
        chartId: z.number(),
        nodeKey: z.string().min(1),
        text: z.string().min(1).max(2000),
        agentLabel: AGENT_LABEL_INPUT,
      },
    },
    async ({ chartId, nodeKey, text, agentLabel: agentLabelInput }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeChart(chartId, clientId))) return json({ error: 'Chart not found' });

      const agentLabel = resolveAgentLabel(ctx, agentLabelInput);
      await appendPathChartEvents(chartId, [{ eventType: 'note', payload: { nodeKey, text }, agentLabel }]);
      revalidateForWrite('portal');
      return json({ ok: true });
    }
  );

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'pathviz_who_owns',
    {
      title: 'Who owns these files right now',
      description: 'Look up active (unreleased, unexpired) claims across a project\'s charts whose declared files intersect the given file list — the pre-dispatch coordination check before an agent starts touching a path. A stored path ending in "*" matches as a prefix.',
      inputSchema: { projectId: z.number(), files: z.array(z.string()).min(1) },
    },
    async ({ projectId, files }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authorizeProjectForClient(projectId, clientId))) return json({ error: 'Project not found' });

      const projectCharts = await db.select({ id: pathCharts.id, title: pathCharts.title })
        .from(pathCharts).where(eq(pathCharts.projectId, projectId));
      if (projectCharts.length === 0) return json([]);
      const chartIds = projectCharts.map((c) => c.id);
      const chartTitleById = new Map(projectCharts.map((c) => [c.id, c.title]));

      const activeClaims = await db.select({
        agentLabel: pathChartClaims.agentLabel,
        chartId: pathChartClaims.chartId,
        nodeId: pathChartClaims.nodeId,
        intent: pathChartClaims.intent,
        files: pathChartClaims.files,
        expiresAt: pathChartClaims.expiresAt,
      }).from(pathChartClaims).where(and(
        inArray(pathChartClaims.chartId, chartIds),
        isNull(pathChartClaims.releasedAt),
        gt(pathChartClaims.expiresAt, new Date()),
      ));

      const matching = activeClaims.filter((c) => filesIntersect(c.files ?? [], files));
      if (matching.length === 0) return json([]);

      const nodeIds = [...new Set(matching.map((c) => c.nodeId))];
      const nodeRows = await db.select({ id: pathChartNodes.id, key: pathChartNodes.key })
        .from(pathChartNodes).where(inArray(pathChartNodes.id, nodeIds));
      const nodeIdToKey = new Map(nodeRows.map((r) => [r.id, r.key]));

      return json(matching.map((c) => ({
        agentLabel: c.agentLabel,
        chartId: c.chartId,
        chartTitle: chartTitleById.get(c.chartId) ?? null,
        nodeKey: nodeIdToKey.get(c.nodeId) ?? null,
        intent: c.intent,
        files: c.files,
        expiresAt: c.expiresAt,
      })));
    }
  );
}
