// Unified admin approvals inbox — aggregates pending items across the four
// approval queues (MCP CMS changes, Brain AI review items, service requests,
// suggested-project requests) into a single staff feed.
//
// Read-only: all approve / reject logic lives in
// `app/api/admin/approvals/[source]/[id]/{approve,reject}/route.ts`, which
// delegates to the existing business logic (no duplication).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  mcpPendingChanges,
  brainAiReviewItems,
  serviceRequests,
  suggestedProjectRequests,
  services,
  suggestedProjects,
  clients,
  users,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const runtime = 'nodejs';

export type ApprovalSource = 'mcp' | 'brain' | 'service' | 'project';

export interface UnifiedApprovalRow {
  source: ApprovalSource;
  id: number;
  clientId: number;
  clientCompany: string | null;
  clientUserName: string | null;
  clientUserEmail: string | null;
  createdAt: string;
  summary: string;
  /** Extra source-specific label for the row (e.g. "post:update"). */
  detail?: string | null;
  /** Underlying status string (each source has its own statuses). */
  status: string;
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  // Run all four pending queries in parallel — no N+1.
  const [mcpRows, brainRows, serviceRows, projectRows] = await Promise.all([
    db
      .select({
        id: mcpPendingChanges.id,
        clientId: mcpPendingChanges.clientId,
        entityType: mcpPendingChanges.entityType,
        operation: mcpPendingChanges.operation,
        summary: mcpPendingChanges.summary,
        status: mcpPendingChanges.status,
        createdAt: mcpPendingChanges.createdAt,
        clientCompany: clients.company,
        clientUserName: users.name,
        clientUserEmail: users.email,
      })
      .from(mcpPendingChanges)
      .innerJoin(clients, eq(clients.id, mcpPendingChanges.clientId))
      .innerJoin(users, eq(users.id, clients.userId))
      .where(eq(mcpPendingChanges.status, 'pending')),

    db
      .select({
        id: brainAiReviewItems.id,
        clientId: brainAiReviewItems.clientId,
        sourceType: brainAiReviewItems.sourceType,
        proposedType: brainAiReviewItems.proposedType,
        proposedPayload: brainAiReviewItems.proposedPayload,
        status: brainAiReviewItems.status,
        createdAt: brainAiReviewItems.createdAt,
        clientCompany: clients.company,
        clientUserName: users.name,
        clientUserEmail: users.email,
      })
      .from(brainAiReviewItems)
      .innerJoin(clients, eq(clients.id, brainAiReviewItems.clientId))
      .innerJoin(users, eq(users.id, clients.userId))
      .where(eq(brainAiReviewItems.status, 'pending')),

    db
      .select({
        id: serviceRequests.id,
        clientId: serviceRequests.clientId,
        status: serviceRequests.status,
        message: serviceRequests.message,
        createdAt: serviceRequests.createdAt,
        serviceName: services.name,
        serviceCategory: services.category,
        clientCompany: clients.company,
        clientUserName: users.name,
        clientUserEmail: users.email,
      })
      .from(serviceRequests)
      .innerJoin(services, eq(services.id, serviceRequests.serviceId))
      .innerJoin(clients, eq(clients.id, serviceRequests.clientId))
      .innerJoin(users, eq(users.id, clients.userId))
      .where(inArray(serviceRequests.status, ['pending', 'reviewed'])),

    db
      .select({
        id: suggestedProjectRequests.id,
        clientId: suggestedProjectRequests.clientId,
        status: suggestedProjectRequests.status,
        message: suggestedProjectRequests.message,
        createdAt: suggestedProjectRequests.createdAt,
        projectTitle: suggestedProjects.title,
        projectCategory: suggestedProjects.category,
        clientCompany: clients.company,
        clientUserName: users.name,
        clientUserEmail: users.email,
      })
      .from(suggestedProjectRequests)
      .innerJoin(suggestedProjects, eq(suggestedProjects.id, suggestedProjectRequests.suggestedProjectId))
      .innerJoin(clients, eq(clients.id, suggestedProjectRequests.clientId))
      .innerJoin(users, eq(users.id, clients.userId))
      .where(inArray(suggestedProjectRequests.status, ['pending', 'reviewed'])),
  ]);

  const rows: UnifiedApprovalRow[] = [
    ...mcpRows.map<UnifiedApprovalRow>((r) => ({
      source: 'mcp',
      id: r.id,
      clientId: r.clientId,
      clientCompany: r.clientCompany,
      clientUserName: r.clientUserName,
      clientUserEmail: r.clientUserEmail,
      createdAt: r.createdAt.toISOString(),
      summary: r.summary ?? `${r.entityType} ${r.operation}`,
      detail: `${r.entityType}:${r.operation}`,
      status: r.status,
    })),
    ...brainRows.map<UnifiedApprovalRow>((r) => {
      const payload = (r.proposedPayload ?? {}) as Record<string, unknown>;
      const summary =
        (typeof payload.title === 'string' && payload.title) ||
        (typeof payload.summary === 'string' && payload.summary) ||
        (typeof payload.name === 'string' && payload.name) ||
        (typeof payload.description === 'string' && payload.description) ||
        `${r.proposedType} from ${r.sourceType}`;
      return {
        source: 'brain',
        id: r.id,
        clientId: r.clientId,
        clientCompany: r.clientCompany,
        clientUserName: r.clientUserName,
        clientUserEmail: r.clientUserEmail,
        createdAt: r.createdAt.toISOString(),
        summary: String(summary),
        detail: `${r.proposedType} (${r.sourceType})`,
        status: r.status,
      };
    }),
    ...serviceRows.map<UnifiedApprovalRow>((r) => ({
      source: 'service',
      id: r.id,
      clientId: r.clientId,
      clientCompany: r.clientCompany,
      clientUserName: r.clientUserName,
      clientUserEmail: r.clientUserEmail,
      createdAt: r.createdAt.toISOString(),
      summary: r.serviceName,
      detail: r.serviceCategory,
      status: r.status,
    })),
    ...projectRows.map<UnifiedApprovalRow>((r) => ({
      source: 'project',
      id: r.id,
      clientId: r.clientId,
      clientCompany: r.clientCompany,
      clientUserName: r.clientUserName,
      clientUserEmail: r.clientUserEmail,
      createdAt: r.createdAt.toISOString(),
      summary: r.projectTitle,
      detail: r.projectCategory,
      status: r.status,
    })),
  ];

  // Oldest pending first — encourages SLA-style triage.
  rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ success: true, data: rows });
}
