// Custom domain mapping for the white-label / SaaS Mode tier.
//
// GET    — current state of the agency's custom-domain mapping
// POST   — start a new verification flow (issues + persists a TXT token)
// DELETE — remove the custom domain (also forces white-label off)
//
// All operations are scoped to the active client and require owner/admin
// on that client. Mutations append a `custom_domain_history` row so we
// have an audit trail independent of the live `clients` row.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, customDomainHistory } from '@/lib/db/schema';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';
import { eq } from 'drizzle-orm';
import { generateVerificationToken, isPlausibleDomain } from '@/lib/agency/dns-verify';
import { clearCustomDomainCache } from '@/lib/agency/custom-domain';

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

function forbidden(error = 'Owner or admin role required') {
  return NextResponse.json({ success: false, error }, { status: 403 });
}

async function requireAdminClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: unauthorized() } as const;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return {
      error: NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 }),
    } as const;
  }
  const role = await getPortalRole(userId, client.id);
  if (role !== 'owner' && role !== 'admin') {
    return { error: forbidden() } as const;
  }
  return { userId, client } as const;
}

export async function GET() {
  const ctx = await requireAdminClient();
  if ('error' in ctx) return ctx.error;

  const [row] = await db
    .select({
      customDomain: clients.customDomain,
      customDomainVerifiedAt: clients.customDomainVerifiedAt,
      customDomainVerificationToken: clients.customDomainVerificationToken,
      whiteLabelEnabled: clients.whiteLabelEnabled,
    })
    .from(clients)
    .where(eq(clients.id, ctx.client.id))
    .limit(1);

  return NextResponse.json({
    success: true,
    data: {
      customDomain: row?.customDomain ?? null,
      verifiedAt: row?.customDomainVerifiedAt ?? null,
      verificationRecord: row?.customDomain && row?.customDomainVerificationToken
        ? {
            host: `_simplerdev.${row.customDomain}`,
            type: 'TXT',
            value: row.customDomainVerificationToken,
          }
        : null,
      whiteLabelEnabled: row?.whiteLabelEnabled ?? false,
    },
  });
}

export async function POST(req: Request) {
  const ctx = await requireAdminClient();
  if ('error' in ctx) return ctx.error;

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = (body.domain ?? '').trim().toLowerCase();
  if (!isPlausibleDomain(domain)) {
    return NextResponse.json(
      { success: false, error: 'Provide a valid public domain (e.g. portal.acme.com)' },
      { status: 400 },
    );
  }

  // Reject if another client already has this domain claimed (verified or
  // not). Surface a clean error rather than a unique-constraint violation.
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.customDomain, domain))
    .limit(1);
  if (existing && existing.id !== ctx.client.id) {
    return NextResponse.json(
      { success: false, error: 'This domain is already claimed by another account' },
      { status: 409 },
    );
  }

  const token = generateVerificationToken();
  await db
    .update(clients)
    .set({
      customDomain: domain,
      customDomainVerificationToken: token,
      customDomainVerifiedAt: null,
      // Force white-label off until re-verification, otherwise an agency
      // could move their domain mid-flight and still have stale chrome.
      whiteLabelEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, ctx.client.id));

  await db.insert(customDomainHistory).values({
    clientId: ctx.client.id,
    domain,
    action: 'added',
    byUserId: ctx.userId,
  });

  clearCustomDomainCache();

  return NextResponse.json({
    success: true,
    data: {
      customDomain: domain,
      verifiedAt: null,
      verificationRecord: {
        host: `_simplerdev.${domain}`,
        type: 'TXT',
        value: token,
      },
      whiteLabelEnabled: false,
    },
  });
}

export async function DELETE() {
  const ctx = await requireAdminClient();
  if ('error' in ctx) return ctx.error;

  const [row] = await db
    .select({ customDomain: clients.customDomain })
    .from(clients)
    .where(eq(clients.id, ctx.client.id))
    .limit(1);

  await db
    .update(clients)
    .set({
      customDomain: null,
      customDomainVerificationToken: null,
      customDomainVerifiedAt: null,
      whiteLabelEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, ctx.client.id));

  if (row?.customDomain) {
    await db.insert(customDomainHistory).values({
      clientId: ctx.client.id,
      domain: row.customDomain,
      action: 'removed',
      byUserId: ctx.userId,
    });
  }

  clearCustomDomainCache();

  return NextResponse.json({ success: true, data: { customDomain: null } });
}
