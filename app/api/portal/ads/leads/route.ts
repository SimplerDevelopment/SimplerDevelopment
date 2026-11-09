/**
 * Ads lead intake — POST /api/portal/ads/leads
 *
 * V1 portal-autenticada (manual/tests). Los webhooks firmados de Meta/Google
 * llegarán aquí detrás de un secreto por proveedor (fase siguiente).
 * Body: { provider: 'mock'|'meta'|'google', campaignRef?, contact: { email, displayName?, name?, phone? }, custom? }
 * Crea/actualiza contacto + emite crm.contact.created + ads.lead.received.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { intakeAdLead, normalizeLeadPayload } from '@/lib/ads/lead-intake';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  provider: z.enum(['mock', 'meta', 'google']),
  campaignRef: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  contact: z.object({
    email: z.string(),
    displayName: z.string().max(200).optional(),
    name: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
  }).optional(),
  email: z.string().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const authed = await authorizePortal({ action: 'write', scope: 'crm:write' });
  if (isAuthError(authed)) return authed.response;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const lead = normalizeLeadPayload(parsed.data.provider, parsed.data);
  if (!lead) {
    return NextResponse.json({ success: false, message: 'Invalid lead: email required' }, { status: 400 });
  }

  try {
    const result = await intakeAdLead({ clientId: authed.client.id, userId: authed.userId, lead });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lead intake failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
