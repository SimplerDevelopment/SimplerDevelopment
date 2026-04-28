import { db } from '@/lib/db';
import { brainAuditLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

interface LogAuditArgs {
  clientId: number;
  actorId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
  tx?: typeof db; // optional transaction
}

export async function logAudit(args: LogAuditArgs): Promise<void> {
  const conn = args.tx ?? db;
  await conn.insert(brainAuditLogs).values({
    clientId: args.clientId,
    actorId: args.actorId ?? null,
    action: args.action,
    entityType: args.entityType ?? null,
    entityId: args.entityId ?? null,
    metadata: args.metadata ?? {},
  });
}

export async function listAuditLogs(clientId: number, limit = 50) {
  return db.select().from(brainAuditLogs)
    .where(eq(brainAuditLogs.clientId, clientId))
    .orderBy(desc(brainAuditLogs.createdAt))
    .limit(limit);
}
