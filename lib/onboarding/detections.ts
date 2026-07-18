/**
 * Server-side step-completion detections for per-domain onboarding.
 *
 * Each entry answers "has this tenant done the thing?" with ONE cheap
 * tenant-scoped query (SELECT id ... LIMIT 1). Keys are referenced by
 * `detect` in lib/onboarding/module-segments.ts (which stays client-safe —
 * this file is the only place that touches the db).
 *
 * TENANCY: every query MUST filter by clientId (directly or through a
 * clientWebsites subquery). bun test:tenancy guards this surface.
 */

import { db } from '@/lib/db';
import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  clientWebsites,
  siteNavigation,
  posts,
  crmContacts,
  crmPipelines,
  crmDeals,
  emailLists,
  emailCampaigns,
  brainNotes,
  brainPeople,
  aiConversations,
  projects,
  surveys,
  surveyResponses,
  bookingPages,
  bookings,
  products,
  orders,
  crmContracts,
  pitchDecks,
  automationRules,
  linkedinUserConnections,
  linkedinPosts,
} from '@/lib/db/schema';

type Detection = (clientId: number) => Promise<boolean>;

async function existsWhere(query: Promise<Array<{ id: number }>>): Promise<boolean> {
  return (await query).length > 0;
}

/** Subquery of the tenant's website ids, for tables keyed by websiteId. */
function tenantWebsiteIds(clientId: number) {
  return db.select({ id: clientWebsites.id }).from(clientWebsites).where(eq(clientWebsites.clientId, clientId));
}

export const DETECTIONS: Record<string, Detection> = {
  'websites.hasSite': (clientId) =>
    existsWhere(db.select({ id: clientWebsites.id }).from(clientWebsites).where(eq(clientWebsites.clientId, clientId)).limit(1)),
  'websites.hasPublishedPage': (clientId) =>
    existsWhere(
      db
        .select({ id: posts.id })
        .from(posts)
        .where(and(inArray(posts.websiteId, tenantWebsiteIds(clientId)), eq(posts.published, true)))
        .limit(1),
    ),
  'websites.hasNavigation': (clientId) =>
    existsWhere(
      db
        .select({ id: siteNavigation.id })
        .from(siteNavigation)
        .where(inArray(siteNavigation.websiteId, tenantWebsiteIds(clientId)))
        .limit(1),
    ),

  'crm.hasContact': (clientId) =>
    existsWhere(db.select({ id: crmContacts.id }).from(crmContacts).where(eq(crmContacts.clientId, clientId)).limit(1)),
  'crm.hasPipeline': (clientId) =>
    existsWhere(db.select({ id: crmPipelines.id }).from(crmPipelines).where(eq(crmPipelines.clientId, clientId)).limit(1)),
  'crm.hasDeal': (clientId) =>
    existsWhere(db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.clientId, clientId)).limit(1)),

  'email.hasList': (clientId) =>
    existsWhere(db.select({ id: emailLists.id }).from(emailLists).where(eq(emailLists.clientId, clientId)).limit(1)),
  'email.hasCampaign': (clientId) =>
    existsWhere(db.select({ id: emailCampaigns.id }).from(emailCampaigns).where(eq(emailCampaigns.clientId, clientId)).limit(1)),

  'brain.hasKnowledge': (clientId) =>
    existsWhere(db.select({ id: brainNotes.id }).from(brainNotes).where(eq(brainNotes.clientId, clientId)).limit(1)),
  'brain.hasConversation': (clientId) =>
    existsWhere(db.select({ id: aiConversations.id }).from(aiConversations).where(eq(aiConversations.clientId, clientId)).limit(1)),
  'brain.hasPerson': (clientId) =>
    existsWhere(db.select({ id: brainPeople.id }).from(brainPeople).where(eq(brainPeople.clientId, clientId)).limit(1)),

  'projects.hasProject': (clientId) =>
    existsWhere(db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, clientId)).limit(1)),

  'surveys.hasSurvey': (clientId) =>
    existsWhere(db.select({ id: surveys.id }).from(surveys).where(eq(surveys.clientId, clientId)).limit(1)),
  'surveys.hasResponse': (clientId) =>
    existsWhere(
      db
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(
          inArray(surveyResponses.surveyId, db.select({ id: surveys.id }).from(surveys).where(eq(surveys.clientId, clientId))),
        )
        .limit(1),
    ),

  'bookings.hasPage': (clientId) =>
    existsWhere(db.select({ id: bookingPages.id }).from(bookingPages).where(eq(bookingPages.clientId, clientId)).limit(1)),
  'bookings.hasBooking': (clientId) =>
    existsWhere(db.select({ id: bookings.id }).from(bookings).where(eq(bookings.clientId, clientId)).limit(1)),

  'store.hasProduct': (clientId) =>
    existsWhere(
      db.select({ id: products.id }).from(products).where(inArray(products.websiteId, tenantWebsiteIds(clientId))).limit(1),
    ),
  'store.hasOrder': (clientId) =>
    existsWhere(
      db.select({ id: orders.id }).from(orders).where(inArray(orders.websiteId, tenantWebsiteIds(clientId))).limit(1),
    ),

  'esign.hasContract': (clientId) =>
    existsWhere(db.select({ id: crmContracts.id }).from(crmContracts).where(eq(crmContracts.clientId, clientId)).limit(1)),
  'esign.hasSentContract': (clientId) =>
    existsWhere(
      db
        .select({ id: crmContracts.id })
        .from(crmContracts)
        .where(and(eq(crmContracts.clientId, clientId), ne(crmContracts.status, 'draft')))
        .limit(1),
    ),
  'esign.hasSignedContract': (clientId) =>
    existsWhere(
      db
        .select({ id: crmContracts.id })
        .from(crmContracts)
        .where(and(eq(crmContracts.clientId, clientId), eq(crmContracts.status, 'fully_executed')))
        .limit(1),
    ),

  'decks.hasDeck': (clientId) =>
    existsWhere(db.select({ id: pitchDecks.id }).from(pitchDecks).where(eq(pitchDecks.clientId, clientId)).limit(1)),
  'decks.hasPublishedDeck': (clientId) =>
    existsWhere(
      db
        .select({ id: pitchDecks.id })
        .from(pitchDecks)
        .where(and(eq(pitchDecks.clientId, clientId), eq(pitchDecks.status, 'published')))
        .limit(1),
    ),

  'automations.hasRule': (clientId) =>
    existsWhere(db.select({ id: automationRules.id }).from(automationRules).where(eq(automationRules.clientId, clientId)).limit(1)),
  'automations.hasEnabledRule': (clientId) =>
    existsWhere(
      db
        .select({ id: automationRules.id })
        .from(automationRules)
        .where(and(eq(automationRules.clientId, clientId), eq(automationRules.enabled, true)))
        .limit(1),
    ),

  'publishing.hasConnection': (clientId) =>
    existsWhere(
      db
        .select({ id: linkedinUserConnections.id })
        .from(linkedinUserConnections)
        .where(eq(linkedinUserConnections.clientId, clientId))
        .limit(1),
    ),
  'publishing.hasPost': (clientId) =>
    existsWhere(db.select({ id: linkedinPosts.id }).from(linkedinPosts).where(eq(linkedinPosts.clientId, clientId)).limit(1)),
};

export function hasDetection(key: string): boolean {
  return key in DETECTIONS;
}
