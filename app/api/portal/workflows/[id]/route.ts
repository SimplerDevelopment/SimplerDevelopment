import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';
import type { WorkflowGraph, WorkflowStatus, WorkflowTriggerConfig } from '@/lib/workflows/types';

const VALID_STATUSES = new Set<WorkflowStatus>(['draft', 'active', 'paused']);

async function loadOwned(workflowId: number, clientId: number) {
  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const workflowId = parseInt(id, 10);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const row = await loadOwned(workflowId, client.id);
  if (!row) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const workflowId = parseInt(id, 10);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const existing = await loadOwned(workflowId, client.id);
  if (!existing) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    status?: WorkflowStatus;
    trigger?: WorkflowTriggerConfig;
    graph?: WorkflowGraph;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === 'string') updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.trigger !== undefined) updates.trigger = body.trigger;
  if (body.graph !== undefined) updates.graph = body.graph;

  const [row] = await db
    .update(workflows)
    .set(updates)
    .where(and(eq(workflows.id, workflowId), eq(workflows.clientId, client.id)))
    .returning();

  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'admin' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const workflowId = parseInt(id, 10);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  await db
    .delete(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.clientId, client.id)));

  return NextResponse.json({ success: true });
}
