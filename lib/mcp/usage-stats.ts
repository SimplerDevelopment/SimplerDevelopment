/**
 * Read helpers for the MCP usage admin page. Queries against
 * `mcp_tool_call_daily_rollups` (forever) for trend/leaderboard data, with
 * fallback queries against the raw `mcp_tool_calls` table for "today" since
 * the rollup cron only fires once a day on yesterday's data.
 *
 * Cost estimates use a configurable `$/MTok` coefficient. Default is $3 per
 * million input tokens (Claude Sonnet 4.X tier — what the typical client-
 * facing agent uses). Override via `CLAUDE_INPUT_COST_PER_MTOK_USD`. Output
 * tokens aren't tracked here — MCP responses are *input* to the next LLM
 * turn; their bytes hit the input meter on every turn until the conversation
 * ends.
 */

import { desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  mcpToolCalls,
  mcpToolCallDailyRollups,
  clients,
  users,
} from '@/lib/db/schema';

export const COST_PER_MTOK_USD = (() => {
  const raw = process.env.CLAUDE_INPUT_COST_PER_MTOK_USD;
  if (!raw) return 3.0;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3.0;
})();

export function tokensToUsd(tokens: number): number {
  return (tokens / 1_000_000) * COST_PER_MTOK_USD;
}

function utcMidnightDaysAgo(daysAgo: number): Date {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysAgo,
  ));
}

export interface UsageSummary {
  windowDays: number;
  totalCalls: number;
  totalTokens: number;
  totalErrors: number;
  estimatedCostUsd: number;
  errorRate: number;
}

export async function getSummary(days: number): Promise<UsageSummary> {
  const since = utcMidnightDaysAgo(days - 1);

  const [row] = await db
    .select({
      totalCalls: sql<number>`coalesce(sum(${mcpToolCallDailyRollups.callCount}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${mcpToolCallDailyRollups.totalEstimatedTokens}), 0)::bigint`,
      totalErrors: sql<number>`coalesce(sum(${mcpToolCallDailyRollups.errorCount}), 0)::int`,
    })
    .from(mcpToolCallDailyRollups)
    .where(gte(mcpToolCallDailyRollups.day, since));

  const totalCalls = Number(row?.totalCalls ?? 0);
  const totalTokens = Number(row?.totalTokens ?? 0);
  const totalErrors = Number(row?.totalErrors ?? 0);

  return {
    windowDays: days,
    totalCalls,
    totalTokens,
    totalErrors,
    estimatedCostUsd: tokensToUsd(totalTokens),
    errorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
  };
}

export interface TopClient {
  clientId: number;
  company: string | null;
  clientName: string | null;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
}

export async function getTopClients(days: number, limit = 25): Promise<TopClient[]> {
  const since = utcMidnightDaysAgo(days - 1);

  const rows = await db
    .select({
      clientId: mcpToolCallDailyRollups.clientId,
      company: clients.company,
      clientName: users.name,
      totalCalls: sql<number>`sum(${mcpToolCallDailyRollups.callCount})::int`,
      totalTokens: sql<number>`sum(${mcpToolCallDailyRollups.totalEstimatedTokens})::bigint`,
      errorCount: sql<number>`sum(${mcpToolCallDailyRollups.errorCount})::int`,
    })
    .from(mcpToolCallDailyRollups)
    .innerJoin(clients, eq(mcpToolCallDailyRollups.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(gte(mcpToolCallDailyRollups.day, since))
    .groupBy(mcpToolCallDailyRollups.clientId, clients.company, users.name)
    .orderBy(desc(sql`sum(${mcpToolCallDailyRollups.totalEstimatedTokens})`))
    .limit(limit);

  return rows.map(r => ({
    clientId: r.clientId,
    company: r.company,
    clientName: r.clientName,
    totalCalls: Number(r.totalCalls),
    totalTokens: Number(r.totalTokens),
    estimatedCostUsd: tokensToUsd(Number(r.totalTokens)),
    errorCount: Number(r.errorCount),
  }));
}

export interface TopTool {
  toolName: string;
  totalCalls: number;
  totalTokens: number;
  avgTokensPerCall: number;
  p95Tokens: number;
  maxResponseBytes: number;
  errorCount: number;
  /** True if any call's response exceeded ~25k tokens — Claude Code silently
   * truncates above that, so the tool effectively didn't return data. */
  truncationRisk: boolean;
}

const TRUNCATION_BYTE_THRESHOLD = 25_000 * 3; // ~25k tokens × ~3 chars/tok

export async function getTopTools(days: number, limit = 25): Promise<TopTool[]> {
  const since = utcMidnightDaysAgo(days - 1);

  const rows = await db
    .select({
      toolName: mcpToolCallDailyRollups.toolName,
      totalCalls: sql<number>`sum(${mcpToolCallDailyRollups.callCount})::int`,
      totalTokens: sql<number>`sum(${mcpToolCallDailyRollups.totalEstimatedTokens})::bigint`,
      // p95 of p95s isn't a real p95 but is a reasonable scalar across days;
      // for a true p95 we'd query the raw events table.
      p95Tokens: sql<number>`coalesce(max(${mcpToolCallDailyRollups.p95EstimatedTokens}), 0)::int`,
      maxResponseBytes: sql<number>`coalesce(max(${mcpToolCallDailyRollups.maxResponseBytes}), 0)::int`,
      errorCount: sql<number>`sum(${mcpToolCallDailyRollups.errorCount})::int`,
    })
    .from(mcpToolCallDailyRollups)
    .where(gte(mcpToolCallDailyRollups.day, since))
    .groupBy(mcpToolCallDailyRollups.toolName)
    .orderBy(desc(sql`sum(${mcpToolCallDailyRollups.totalEstimatedTokens})`))
    .limit(limit);

  return rows.map(r => {
    const totalCalls = Number(r.totalCalls);
    const totalTokens = Number(r.totalTokens);
    const maxResponseBytes = Number(r.maxResponseBytes);
    return {
      toolName: r.toolName,
      totalCalls,
      totalTokens,
      avgTokensPerCall: totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0,
      p95Tokens: Number(r.p95Tokens),
      maxResponseBytes,
      errorCount: Number(r.errorCount),
      truncationRisk: maxResponseBytes >= TRUNCATION_BYTE_THRESHOLD,
    };
  });
}

export interface RecentError {
  id: number;
  toolName: string;
  clientId: number;
  company: string | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: Date;
}

export async function getRecentErrors(limit = 25): Promise<RecentError[]> {
  const rows = await db
    .select({
      id: mcpToolCalls.id,
      toolName: mcpToolCalls.toolName,
      clientId: mcpToolCalls.clientId,
      company: clients.company,
      errorMessage: mcpToolCalls.errorMessage,
      durationMs: mcpToolCalls.durationMs,
      createdAt: mcpToolCalls.createdAt,
    })
    .from(mcpToolCalls)
    .innerJoin(clients, eq(mcpToolCalls.clientId, clients.id))
    .where(eq(mcpToolCalls.success, false))
    .orderBy(desc(mcpToolCalls.createdAt))
    .limit(limit);

  return rows;
}

export interface SlowTool {
  toolName: string;
  p95DurationMs: number;
  totalCalls: number;
}

export async function getSlowTools(days: number, limit = 15): Promise<SlowTool[]> {
  const since = utcMidnightDaysAgo(days - 1);

  const rows = await db
    .select({
      toolName: mcpToolCallDailyRollups.toolName,
      p95DurationMs: sql<number>`coalesce(max(${mcpToolCallDailyRollups.p95DurationMs}), 0)::int`,
      totalCalls: sql<number>`sum(${mcpToolCallDailyRollups.callCount})::int`,
    })
    .from(mcpToolCallDailyRollups)
    .where(gte(mcpToolCallDailyRollups.day, since))
    .groupBy(mcpToolCallDailyRollups.toolName)
    .orderBy(desc(sql`max(${mcpToolCallDailyRollups.p95DurationMs})`))
    .limit(limit);

  return rows.map(r => ({
    toolName: r.toolName,
    p95DurationMs: Number(r.p95DurationMs),
    totalCalls: Number(r.totalCalls),
  }));
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD
  calls: number;
  tokens: number;
  errors: number;
  estimatedCostUsd: number;
}

export async function getDailySeries(days: number): Promise<DailyPoint[]> {
  const since = utcMidnightDaysAgo(days - 1);

  const rows = await db
    .select({
      day: mcpToolCallDailyRollups.day,
      calls: sql<number>`sum(${mcpToolCallDailyRollups.callCount})::int`,
      tokens: sql<number>`sum(${mcpToolCallDailyRollups.totalEstimatedTokens})::bigint`,
      errors: sql<number>`sum(${mcpToolCallDailyRollups.errorCount})::int`,
    })
    .from(mcpToolCallDailyRollups)
    .where(gte(mcpToolCallDailyRollups.day, since))
    .groupBy(mcpToolCallDailyRollups.day)
    .orderBy(mcpToolCallDailyRollups.day);

  return rows.map(r => {
    const tokens = Number(r.tokens);
    return {
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      calls: Number(r.calls),
      tokens,
      errors: Number(r.errors),
      estimatedCostUsd: tokensToUsd(tokens),
    };
  });
}

/** Today's partial usage (since UTC midnight) — read from raw events because
 * the rollup cron hasn't run for today yet. Exposed separately so the admin
 * page can show a "today so far" tile alongside the rollup-backed totals. */
export interface TodaySoFar {
  calls: number;
  tokens: number;
  errors: number;
  estimatedCostUsd: number;
}

export async function getTodaySoFar(): Promise<TodaySoFar> {
  const startOfDay = utcMidnightDaysAgo(0);

  const [row] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${mcpToolCalls.estimatedTokens}), 0)::bigint`,
      errors: sql<number>`count(*) FILTER (WHERE ${mcpToolCalls.success} = false)::int`,
    })
    .from(mcpToolCalls)
    .where(gte(mcpToolCalls.createdAt, startOfDay));

  const tokens = Number(row?.tokens ?? 0);
  return {
    calls: Number(row?.calls ?? 0),
    tokens,
    errors: Number(row?.errors ?? 0),
    estimatedCostUsd: tokensToUsd(tokens),
  };
}

