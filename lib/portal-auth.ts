import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientMembers, clientServices, services } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { NextResponse } from 'next/server';

export type PortalAction = 'read' | 'write' | 'admin' | 'owner';

type PortalRole = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_LEVELS: Record<PortalRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

const ACTION_REQUIRED_LEVEL: Record<PortalAction, number> = {
  read: 0,    // viewer+
  write: 1,   // member+
  admin: 2,   // admin+
  owner: 3,   // owner only
};

interface AuthorizeResult {
  client: typeof clients.$inferSelect;
  userId: number;
  role: PortalRole;
}

interface AuthorizeError {
  response: NextResponse;
}

/**
 * Centralized portal authorization.
 *
 * @param opts.action - Required permission level (default: 'read')
 * @param opts.requireService - Service category that must be subscribed (or bundle)
 */
export async function authorizePortal(opts?: {
  action?: PortalAction;
  requireService?: string;
}): Promise<AuthorizeResult | AuthorizeError> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return { response: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  }

  // Resolve role
  const role = await resolveRole(userId, client);

  // Check action permission
  const action = opts?.action ?? 'read';
  const requiredLevel = ACTION_REQUIRED_LEVEL[action];
  const userLevel = ROLE_LEVELS[role];

  if (userLevel < requiredLevel) {
    const actionLabels: Record<PortalAction, string> = {
      read: 'view this resource',
      write: 'create or edit content',
      admin: 'manage team or billing settings',
      owner: 'perform this action (owner only)',
    };
    return {
      response: NextResponse.json({
        success: false,
        message: `Permission denied. Your role (${role}) cannot ${actionLabels[action]}.`,
      }, { status: 403 }),
    };
  }

  // Check service subscription
  if (opts?.requireService) {
    const hasAccess = await hasServiceAccess(client.id, opts.requireService);
    if (!hasAccess) {
      return {
        response: NextResponse.json({
          success: false,
          message: `This feature requires an active ${opts.requireService} subscription.`,
          requiresService: opts.requireService,
          upsellUrl: '/portal/services',
        }, { status: 403 }),
      };
    }
  }

  return { client, userId, role };
}

/**
 * Type guard to check if authorizePortal returned an error.
 */
export function isAuthError(result: AuthorizeResult | AuthorizeError): result is AuthorizeError {
  return 'response' in result;
}

/**
 * Resolve the user's role for a given client.
 */
async function resolveRole(userId: number, client: typeof clients.$inferSelect): Promise<PortalRole> {
  // Direct owner check
  if (client.userId === userId) return 'owner';

  // Team membership check
  const [membership] = await db
    .select({ role: clientMembers.role })
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, userId)))
    .limit(1);

  return (membership?.role as PortalRole) ?? 'viewer';
}

/**
 * Check if a client has access to a service category.
 * Returns true if they have a direct subscription OR an all-in-one bundle.
 */
export async function hasServiceAccess(clientId: number, category: string): Promise<boolean> {
  const subscriptions = await db
    .select({ category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.clientId, clientId),
      eq(clientServices.status, 'active'),
    ));

  return subscriptions.some(s => s.category === category || s.category === 'bundle');
}
