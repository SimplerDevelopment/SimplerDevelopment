/**
 * Shared artifact-resolution machinery for the polymorphic artifact links
 * hanging off projects (`projectArtifacts`) and kanban cards
 * (`kanbanCardArtifacts`).
 *
 * Both registrars let a caller attach an artifact (website, email campaign,
 * pitch deck, proposal, booking, survey, post, brain note, project, path
 * chart, …) by type + id, snapshotting a display title at link time. Most
 * artifact tables carry a direct `clientId` column, so ownership + title are
 * a single table-dict lookup (`resolveArtifactTitle`'s generic branch, keyed
 * off `COMMON_ARTIFACT_TABLES`/`PROJECT_ARTIFACT_TABLES`/`CARD_ARTIFACT_TABLES`
 * below). Two types are indirect and need their own join:
 *
 * - `post` — posts have no clientId; ownership flows through
 *   `websiteId -> clientWebsites.clientId`. Posts with `websiteId = null`
 *   are global/admin and excluded. Only the projects registrar special-cases
 *   this today (`handlePost: true`) — the kanban registrar's type enum
 *   includes `post` but has never wired up this join, so passing
 *   `artifactType: 'post'` to `kanban_card_artifact_link` falls through to
 *   the generic branch and throws (pre-existing behavior, preserved here —
 *   not a design call this module makes).
 * - `path_chart` — path charts (Path Visualizations) likewise have no
 *   clientId column, only `projectId -> projects.clientId` (see
 *   lib/db/schema/pathviz.ts). Both registrars special-case this.
 * - `agent_flow_run` — inverted from the two above: a run DOES carry clientId
 *   directly, so ownership is a plain filter, but it has no title column of
 *   its own (only its parent flow's name), so the join is for the label
 *   rather than for tenancy. Card registrar only — a run already stores
 *   `projectId`, so the project↔run edge exists natively and needs no link
 *   row. Linking a run to the CARD it delivered is the edge that was missing.
 *
 * NOT shared with app/api/portal/cards/[id]/artifacts/route.ts, which
 * reimplements this same resolution (including the path_chart and
 * agent_flow_run branches) independently for the REST path. A change here
 * (e.g. a new artifact type) needs the matching edit there too — a test
 * against one proves nothing about the other.
 */
import { and, eq } from 'drizzle-orm';
import type { AnyPgTable, AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  projects,
  posts,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  surveys,
  bookingPages,
  crmProposals,
  pathCharts,
  agentFlows,
  agentFlowRuns,
} from '@/lib/db/schema';

export type ArtifactTableConfig = { table: AnyPgTable; titleField: string };
export type ArtifactTablesDict = Record<string, ArtifactTableConfig>;
export type ArtifactTitleResult = { found: true; title: string | null } | { found: false };

// Artifact types every direct-clientId caller shares. Each registrar spreads
// this into its own dict (PROJECT_ARTIFACT_TABLES / CARD_ARTIFACT_TABLES) plus
// whatever extra type it alone supports (brain_note / project respectively) —
// kept local to each file so this module only imports schema tables both
// registrars' test mocks already stub.
export const COMMON_ARTIFACT_TABLES: ArtifactTablesDict = {
  website: { table: clientWebsites, titleField: 'name' },
  email_campaign: { table: emailCampaigns, titleField: 'name' },
  pitch_deck: { table: pitchDecks, titleField: 'title' },
  proposal: { table: crmProposals, titleField: 'title' },
  booking: { table: bookingPages, titleField: 'title' },
  survey: { table: surveys, titleField: 'title' },
};

/**
 * Verify an artifact belongs to `clientId` and resolve its display title.
 *
 * `tables` is the caller's direct-clientId lookup dict. Pass
 * `{ handlePost: true }` to also resolve `post` via the indirect
 * clientWebsites join (only the projects registrar does — see file header).
 * `path_chart` is always resolved via its indirect projects join.
 */
export async function resolveArtifactTitle(
  artifactType: string,
  artifactId: number,
  clientId: number,
  tables: ArtifactTablesDict,
  options?: { handlePost?: boolean },
): Promise<ArtifactTitleResult> {
  if (options?.handlePost && artifactType === 'post') {
    // Posts have no clientId; they're scoped via websiteId → clientWebsites.clientId.
    // Posts with websiteId=null are global/admin and excluded here.
    const [row] = await db
      .select({ title: posts.title, postType: posts.postType })
      .from(posts)
      .innerJoin(clientWebsites, eq(clientWebsites.id, posts.websiteId))
      .where(and(eq(posts.id, artifactId), eq(clientWebsites.clientId, clientId)))
      .limit(1);
    if (!row) return { found: false };
    const title = row.postType && row.postType !== 'blog'
      ? `${row.title} (${row.postType})`
      : row.title;
    return { found: true, title };
  }

  if (artifactType === 'path_chart') {
    // Path charts have no clientId column; ownership flows through their
    // parent project (projectId -> projects.clientId), the same indirect
    // pattern posts use (via clientWebsites) above.
    const [row] = await db
      .select({ title: pathCharts.title })
      .from(pathCharts)
      .innerJoin(projects, eq(projects.id, pathCharts.projectId))
      .where(and(eq(pathCharts.id, artifactId), eq(projects.clientId, clientId)))
      .limit(1);
    if (!row) return { found: false };
    return { found: true, title: row.title };
  }

  if (artifactType === 'agent_flow_run') {
    // Ownership is direct (runs carry clientId), so the innerJoin here is for
    // the LABEL, not the tenancy filter — a run has no title of its own. Both
    // predicates still sit on agent_flow_runs so a run belonging to another
    // tenant is not-found rather than found-with-someone-else's-flow-name.
    const [row] = await db
      .select({ flowName: agentFlows.name, runId: agentFlowRuns.id })
      .from(agentFlowRuns)
      .innerJoin(agentFlows, eq(agentFlows.id, agentFlowRuns.flowId))
      .where(and(eq(agentFlowRuns.id, artifactId), eq(agentFlowRuns.clientId, clientId)))
      .limit(1);
    if (!row) return { found: false };
    // Run id is part of the snapshotted title on purpose: a card can link
    // several runs of the same flow (a rework loop, a retry), and "Design
    // review" three times over tells the reader nothing.
    return { found: true, title: `${row.flowName} — run #${row.runId}` };
  }

  const config = tables[artifactType];
  const tbl = config.table as AnyPgTable & Record<string, AnyPgColumn>;
  const [source] = await db.select({ title: tbl[config.titleField] })
    .from(config.table)
    .where(and(eq(tbl.id, artifactId), eq(tbl.clientId, clientId)));
  if (!source) return { found: false };
  return { found: true, title: source.title as string | null };
}
