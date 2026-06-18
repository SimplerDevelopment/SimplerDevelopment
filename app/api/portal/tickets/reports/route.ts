import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { supportTickets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

/**
 * GET /api/portal/tickets/reports
 *
 * Returns read-only help-desk reporting metrics scoped to the authenticated
 * tenant. Requires the 'help-desk' service subscription.
 *
 * Query params:
 *   days  — look-back window for volume trend (default 30, max 90)
 */
export async function GET(req: Request) {
  const authResult = await authorizePortal({ action: 'read', requireService: 'help-desk' });
  if (isAuthError(authResult)) return authResult.response;

  const { client } = authResult;
  const clientId = client.id;

  const { searchParams } = new URL(req.url);
  const rawDays = parseInt(searchParams.get('days') ?? '30', 10);
  const days = Math.min(Math.max(rawDays, 7), 90);

  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // ── 1. Fetch all tickets for this client (no date filter for totals) ──────
  const allTickets = await db
    .select({
      id: supportTickets.id,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
      resolvedAt: supportTickets.resolvedAt,
      firstResponseAt: supportTickets.firstResponseAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.clientId, clientId));

  // ── 2. Status counts (all-time) ───────────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const t of allTickets) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }
  const openCount = allTickets.filter(
    (t) => t.status !== 'resolved' && t.status !== 'closed',
  ).length;
  const closedCount = allTickets.filter(
    (t) => t.status === 'resolved' || t.status === 'closed',
  ).length;

  // ── 3. Response-time & resolution-time metrics ────────────────────────────
  // first_response_at is populated by the SLA module when a staff reply lands.
  // We compute times in minutes, then derive median + avg.

  const firstResponseMinutes: number[] = [];
  const resolutionMinutes: number[] = [];

  for (const t of allTickets) {
    const created = t.createdAt.getTime();
    if (t.firstResponseAt) {
      const mins = Math.round((t.firstResponseAt.getTime() - created) / 60_000);
      if (mins >= 0) firstResponseMinutes.push(mins);
    }
    if (t.resolvedAt) {
      const mins = Math.round((t.resolvedAt.getTime() - created) / 60_000);
      if (mins >= 0) resolutionMinutes.push(mins);
    }
  }

  function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }

  function avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  }

  const firstResponseStats = {
    medianMinutes: median(firstResponseMinutes),
    avgMinutes: avg(firstResponseMinutes),
    sampleSize: firstResponseMinutes.length,
  };
  const resolutionStats = {
    medianMinutes: median(resolutionMinutes),
    avgMinutes: avg(resolutionMinutes),
    sampleSize: resolutionMinutes.length,
  };

  // ── 4. Volume over last N days ─────────────────────────────────────────────
  // Build a dense array of { date, opened, closed } covering windowStart → today.
  const recentTickets = allTickets.filter(
    (t) => t.createdAt.getTime() >= windowStart.getTime(),
  );

  // Bucket by YYYY-MM-DD (UTC).
  const byDay: Record<string, { date: string; opened: number; resolved: number }> = {};

  // Pre-fill every day in the window so the chart has no gaps.
  for (let d = 0; d < days; d++) {
    const dt = new Date(windowStart.getTime() + d * 24 * 60 * 60 * 1000);
    const key = dt.toISOString().slice(0, 10);
    byDay[key] = { date: key, opened: 0, resolved: 0 };
  }

  for (const t of recentTickets) {
    const openedKey = t.createdAt.toISOString().slice(0, 10);
    if (byDay[openedKey]) byDay[openedKey].opened += 1;
  }

  // Also bucket resolved-at within the window.
  for (const t of allTickets) {
    if (!t.resolvedAt) continue;
    const resolvedKey = t.resolvedAt.toISOString().slice(0, 10);
    if (byDay[resolvedKey]) byDay[resolvedKey].resolved += 1;
  }

  // ── 5. Priority breakdown ──────────────────────────────────────────────────
  const priorityCounts: Record<string, number> = {};
  for (const t of allTickets) {
    if (t.status !== 'resolved' && t.status !== 'closed') {
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
    }
  }

  // ── 6. Staff without first-response count (missed SLA signals) ────────────
  // Fetch first-message from staff for tickets that are still open and have
  // no firstResponseAt recorded (the column may be null for older tickets).
  const openIds = allTickets
    .filter((t) => t.status !== 'resolved' && t.status !== 'closed' && !t.firstResponseAt)
    .map((t) => t.id);

  // For the "awaiting first response" signal we only need the count of open
  // tickets with no firstResponseAt.
  const awaitingFirstResponse = openIds.length;

  return NextResponse.json({
    success: true,
    data: {
      // Summary counts
      totalTickets: allTickets.length,
      openCount,
      closedCount,
      awaitingFirstResponse,
      // Per-status breakdown
      byStatus: statusCounts,
      // Priority breakdown (open tickets only)
      byPriority: priorityCounts,
      // Response-time stats (minutes)
      firstResponse: firstResponseStats,
      resolution: resolutionStats,
      // Volume trend
      days,
      volumeTrend: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    },
  });
}
