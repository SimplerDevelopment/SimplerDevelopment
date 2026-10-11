/**
 * Ads lead intake — normalización pura + persistencia al CRM.
 *
 * La parte pura (`normalizeLeadPayload`, `isValidLeadEmail`) es unit-testeable
 * sin DB. La parte con efectos (`intakeAdLead`) hace upsert conservador +
 * emite eventos al automation bus para que las reglas existentes actúen
 * (secuencias, notificaciones, scoring futuro).
 */

import { upsertContactByEmail } from '@/lib/crm/contacts';
import { emitEvent } from '@/lib/automation/event-bus';
import type { AdLeadPayload, AdProviderName } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidLeadEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export function normalizeLeadPayload(provider: AdProviderName, raw: unknown): AdLeadPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const contactRaw = (r.contact ?? r) as Record<string, unknown>;
  const emailRaw = contactRaw.email;
  if (typeof emailRaw !== 'string' || !isValidLeadEmail(emailRaw)) return null;
  const email = emailRaw.trim().toLowerCase();
  const displayName = typeof contactRaw.displayName === 'string' && contactRaw.displayName.trim()
    ? contactRaw.displayName.trim().slice(0, 200)
    : typeof contactRaw.name === 'string' && contactRaw.name.trim()
      ? contactRaw.name.trim().slice(0, 200)
      : undefined;
  const phone = typeof contactRaw.phone === 'string' && contactRaw.phone.trim()
    ? contactRaw.phone.trim().slice(0, 40)
    : undefined;
  const campaignRef = typeof r.campaignRef === 'string' && r.campaignRef
    ? r.campaignRef.slice(0, 200)
    : typeof r.campaign === 'string' && r.campaign
      ? r.campaign.slice(0, 200)
      : 'unknown';
  const custom = r.custom && typeof r.custom === 'object' ? (r.custom as Record<string, unknown>) : undefined;
  return { provider, campaignRef, contact: { email, displayName, phone }, custom };
}

export interface IntakeAdLeadArgs {
  clientId: number;
  userId: number;
  lead: AdLeadPayload;
}

export interface IntakeAdLeadResult {
  contactId: number;
  created: boolean;
}

/**
 * Persiste el lead: upsert por email (write-once attribution) + eventos.
 * Emite 'crm.contact.created' (conocido por el bus) y 'ads.lead.received'
 * (nuevo; las reglas lo pueden suscribir).
 */
export async function intakeAdLead(args: IntakeAdLeadArgs): Promise<IntakeAdLeadResult> {
  const { contactId, created } = await upsertContactByEmail({
    clientId: args.clientId,
    email: args.lead.contact.email,
    displayName: args.lead.contact.displayName,
    source: `ads-${args.lead.provider}`,
    attribution: {
      s: args.lead.provider,
      m: 'ads',
      c: args.lead.campaignRef.slice(0, 128),
    },
  });

  const payload: Record<string, unknown> = {
    contactId,
    created,
    provider: args.lead.provider,
    campaignRef: args.lead.campaignRef,
    ...(args.lead.contact.phone ? { phone: args.lead.contact.phone } : {}),
  };
  await emitEvent('crm.contact.created', args.clientId, args.userId, payload);
  await emitEvent('ads.lead.received', args.clientId, args.userId, payload);

  return { contactId, created };
}
