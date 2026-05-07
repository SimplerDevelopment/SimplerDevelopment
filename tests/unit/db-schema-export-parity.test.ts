import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getTableName, isTable } from 'drizzle-orm';
import * as Schema from '@/lib/db/schema';

/**
 * Walk the schema source tree (single file or directory) and collect every
 * top-level `export (const | interface | type) NAME` identifier. Type-only
 * exports do not survive to runtime, so we have to inspect the source.
 */
function collectSchemaExportNames(): string[] {
  const single = resolve(__dirname, '..', '..', 'lib', 'db', 'schema.ts');
  const dir = resolve(__dirname, '..', '..', 'lib', 'db', 'schema');
  const files: string[] = [];

  let dirIsDir = false;
  try {
    dirIsDir = statSync(dir).isDirectory();
  } catch {
    dirIsDir = false;
  }

  if (dirIsDir) {
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith('.ts')) files.push(join(dir, entry));
    }
  } else {
    files.push(single);
  }

  const re = /^export\s+(?:const|interface|type)\s+([A-Za-z0-9_]+)/gm;
  const names = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

/**
 * Parity test for the lib/db/schema refactor.
 *
 * The schema is consumed by HUNDREDS of files via `import * as schema from
 * '@/lib/db/schema'`, by individual named imports like
 * `import { posts } from '@/lib/db/schema'`, and by drizzle-kit which reads
 * the file to generate migrations. Any rename, removal, or table-name change
 * is a load-bearing breakage.
 *
 * This test pins:
 *   1. Every export name (sorted, exact match against a hard-coded snapshot).
 *   2. Every Drizzle pgTable's SQL table name (so a refactor cannot silently
 *      change `.posts` to `.post` etc.).
 *
 * If you intentionally add/remove a schema export, update the snapshot below.
 * If you rename a SQL table, update the table-name map below AND ship a
 * migration.
 */

// Sorted snapshot of every public export from `@/lib/db/schema`.
// Mechanically generated:
//   grep -oE "^export (const|interface|type) [A-Za-z0-9_]+" lib/db/schema.ts \
//     | awk '{print $3}' | sort
const EXPECTED_EXPORTS: readonly string[] = [
  'AutomationAction',
  'AutomationCondition',
  'AutomationTrigger',
  'BookingAvailabilitySlot',
  'BookingPageStyling',
  'BookingQuestion',
  'BrainAiJobStatus',
  'BrainAiJobType',
  'BrainCalendarEventSource',
  'BrainEnabledModules',
  'BrainMeetingStatus',
  'BrainNoteTemplateTrigger',
  'BrainRelationshipPriority',
  'BrainRelationshipStatus',
  'BrainReviewItemCommitmentPayload',
  'BrainReviewItemComplianceWarningPayload',
  'BrainReviewItemCrmCompanyCreatePayload',
  'BrainReviewItemCrmCompanyLinkPayload',
  'BrainReviewItemCrmContactClassifyPayload',
  'BrainReviewItemCrmDealCreatePayload',
  'BrainReviewItemCrmDealLinkPayload',
  'BrainReviewItemDecisionPayload',
  'BrainReviewItemNotePayload',
  'BrainReviewItemPayload',
  'BrainReviewItemRelationshipUpdatePayload',
  'BrainReviewItemStatus',
  'BrainReviewItemTaskPayload',
  'BrainReviewItemType',
  'BrainSavedSearchFilters',
  'BrainTaskStatus',
  'CommentAnchor',
  'ContractClause',
  'DnsInstruction',
  'DocumentComment',
  'EmailTemplateVariable',
  'GoogleWorkspaceClientConnection',
  'GoogleWorkspaceTenantCredentials',
  'GoogleWorkspaceUserConnection',
  'NOTIFICATION_DELIVERIES',
  'NOTIFICATION_TYPES',
  'MicrosoftTeamsUserConnection',
  'NewDocumentComment',
  'NewGoogleWorkspaceClientConnection',
  'NewGoogleWorkspaceTenantCredentials',
  'NewGoogleWorkspaceUserConnection',
  'NewMicrosoftTeamsUserConnection',
  'NotificationDelivery',
  'NotificationType',
  'PitchDeckDecisionCover',
  'PitchDeckDecisionOption',
  'PitchDeckSlide',
  'PitchDeckSlideV2',
  'PitchDeckTheme',
  'ProposalFee',
  'ProposalLineItem',
  'ProposalSection',
  'ShowIfCondition',
  'ShowIfRule',
  'SurveyField',
  'SurveyFieldDef',
  'SurveyPageDef',
  'SurveyRecommendationConfig',
  'SurveyRecommendationHybridRule',
  'SurveyRecommendationOffering',
  'SurveyRecommendationQuestion',
  'SurveyStyling',
  'aiConversations',
  'aiCreditBalances',
  'aiCreditLedger',
  'aiCreditPackages',
  'aiMessages',
  'apiKeys',
  'automationLogs',
  'automationRules',
  'blockTemplateUsages',
  'blockTemplates',
  'bookingAddOns',
  'bookingDateOverrides',
  'bookingPageMembers',
  'bookingPages',
  'bookingQuotes',
  'bookingSelectedAddOns',
  'bookingWaivers',
  'bookings',
  'brainAiJobs',
  'brainAiReviewItems',
  'brainAuditLogs',
  'brainCalendarEvents',
  'brainCustomFieldValues',
  'brainCustomFields',
  'brainEmbeddingJobs',
  'brainKbLinks',
  'brainMeetingParticipants',
  'brainMeetings',
  'brainNoteTemplates',
  'brainNotes',
  'brainProfiles',
  'brainRelationshipOverlays',
  'brainSavedSearches',
  'brainTasks',
  'brandingMessaging',
  'brandingProfiles',
  'bulkPricingRules',
  'cartItems',
  'carts',
  'categories',
  'clientApiKeys',
  'clientMembers',
  'clientServices',
  'clientWebsites',
  'clients',
  'crmActivities',
  'crmCompanies',
  'crmContactTags',
  'crmContacts',
  'crmContractSigners',
  'crmContractTemplates',
  'crmContracts',
  'crmCustomFieldValues',
  'crmCustomFields',
  'crmDealArtifacts',
  'crmDealComments',
  'crmDeals',
  'crmEnrichmentConfig',
  'crmEnrichmentLog',
  'crmNotifications',
  'crmPipelineStages',
  'crmPipelines',
  'crmProposalTemplates',
  'crmProposals',
  'crmSavedViews',
  'crmScoringRules',
  'crmTags',
  'customFields',
  'discountCodes',
  'documentComments',
  'emailCampaignSends',
  'emailCampaigns',
  'emailLists',
  'emailRenders',
  'emailSegments',
  'emailSubscriberTagAssignments',
  'emailSubscriberTags',
  'emailSubscribers',
  'emailTemplates',
  'giftCertificateRedemptions',
  'giftCertificates',
  'githubConnections',
  'googleCalendarTokens',
  'googleWebsiteTokens',
  'googleWorkspaceClientConnections',
  'googleWorkspaceTenantCredentials',
  'googleWorkspaceUserConnections',
  'hostedSites',
  'httpRequestLogs',
  'invoiceItems',
  'invoices',
  'kanbanCardActivities',
  'kanbanCardArtifacts',
  'kanbanCardAssignees',
  'kanbanCardChecklistItems',
  'kanbanCardComments',
  'kanbanCardDependencies',
  'kanbanCardFiles',
  'kanbanCardLabels',
  'kanbanCardTimeLogs',
  'kanbanCardWatchers',
  'kanbanCards',
  'kanbanColumns',
  'kanbanLabels',
  'mcpPendingChanges',
  'media',
  'mediaVersions',
  'microsoftTeamsUserConnections',
  'notificationPreferences',
  'oauthAccessTokens',
  'oauthAuthorizationCodes',
  'oauthClients',
  'orderItems',
  'orderStatusHistory',
  'orders',
  'paymentMethods',
  'pitchDeckVersions',
  'pitchDecks',
  'portalApiKeys',
  'postCategories',
  'postCustomFieldValues',
  'postRevisions',
  'postTags',
  'postTaxonomyTerms',
  'postTypes',
  'posts',
  'productCategories',
  'productImages',
  'productOptionValues',
  'productOptions',
  'productVariants',
  'products',
  'projectWebhookDeliveries',
  'projectWebhooks',
  'projects',
  'serviceRequests',
  'services',
  'shippingRates',
  'shippingZones',
  'siteBranding',
  'siteNavigation',
  'sprints',
  'storeCustomerMessageReplies',
  'storeCustomerMessages',
  'storeCustomerSessions',
  'storeCustomers',
  'storeProductReviews',
  'storeSettings',
  'storeWishlistItems',
  'storeWishlists',
  'suggestedProjectRequests',
  'suggestedProjects',
  'supportTickets',
  'surveyAiSummaries',
  'surveyEmailSequences',
  'surveyPartialResponses',
  'surveyResponses',
  'surveyVariants',
  'surveyWebhookDeliveries',
  'surveyWebhooks',
  'surveys',
  'tags',
  'taxonomies',
  'taxonomyTerms',
  'ticketMessages',
  'triggerLinkClicks',
  'triggerLinks',
  'usageMeterEvents',
  'usageMeters',
  'users',
  'websiteBackups',
  'websiteDomains',
  'websiteEmailTemplates',
  'websiteEnvVars',
  'websiteEnvironments',
  'zoomTokens',
];

// Mapping of export-name → SQL table-name for every pgTable in the schema.
// Mechanically generated:
//   grep -oE "^export const [A-Za-z0-9_]+ = pgTable\('[^']+'" lib/db/schema.ts \
//     | sed -E "s/^export const ([A-Za-z0-9_]+) = pgTable\('([^']+)'/\1\t\2/" | sort
const EXPECTED_TABLE_NAMES: Readonly<Record<string, string>> = {
  aiConversations: 'ai_conversations',
  aiCreditBalances: 'ai_credit_balances',
  aiCreditLedger: 'ai_credit_ledger',
  aiCreditPackages: 'ai_credit_packages',
  aiMessages: 'ai_messages',
  apiKeys: 'api_keys',
  automationLogs: 'automation_logs',
  automationRules: 'automation_rules',
  blockTemplateUsages: 'block_template_usages',
  blockTemplates: 'block_templates',
  bookingAddOns: 'booking_add_ons',
  bookingDateOverrides: 'booking_date_overrides',
  bookingPageMembers: 'booking_page_members',
  bookingPages: 'booking_pages',
  bookingQuotes: 'booking_quotes',
  bookingSelectedAddOns: 'booking_selected_add_ons',
  bookingWaivers: 'booking_waivers',
  bookings: 'bookings',
  brainAiJobs: 'brain_ai_jobs',
  brainAiReviewItems: 'brain_ai_review_items',
  brainAuditLogs: 'brain_audit_logs',
  brainCalendarEvents: 'brain_calendar_events',
  brainCustomFieldValues: 'brain_custom_field_values',
  brainCustomFields: 'brain_custom_fields',
  brainEmbeddingJobs: 'brain_embedding_jobs',
  brainKbLinks: 'brain_kb_links',
  brainMeetingParticipants: 'brain_meeting_participants',
  brainMeetings: 'brain_meetings',
  brainNoteTemplates: 'brain_note_templates',
  brainNotes: 'brain_notes',
  brainProfiles: 'brain_profiles',
  brainRelationshipOverlays: 'brain_relationship_overlays',
  brainSavedSearches: 'brain_saved_searches',
  brainTasks: 'brain_tasks',
  brandingMessaging: 'branding_messaging',
  brandingProfiles: 'branding_profiles',
  bulkPricingRules: 'bulk_pricing_rules',
  cartItems: 'cart_items',
  carts: 'carts',
  categories: 'categories',
  clientApiKeys: 'client_api_keys',
  clientMembers: 'client_members',
  clientServices: 'client_services',
  clientWebsites: 'client_websites',
  clients: 'clients',
  crmActivities: 'crm_activities',
  crmCompanies: 'crm_companies',
  crmContactTags: 'crm_contact_tags',
  crmContacts: 'crm_contacts',
  crmContractSigners: 'crm_contract_signers',
  crmContractTemplates: 'crm_contract_templates',
  crmContracts: 'crm_contracts',
  crmCustomFieldValues: 'crm_custom_field_values',
  crmCustomFields: 'crm_custom_fields',
  crmDealArtifacts: 'crm_deal_artifacts',
  crmDealComments: 'crm_deal_comments',
  crmDeals: 'crm_deals',
  crmEnrichmentConfig: 'crm_enrichment_config',
  crmEnrichmentLog: 'crm_enrichment_log',
  crmNotifications: 'crm_notifications',
  crmPipelineStages: 'crm_pipeline_stages',
  crmPipelines: 'crm_pipelines',
  crmProposalTemplates: 'crm_proposal_templates',
  crmProposals: 'crm_proposals',
  crmSavedViews: 'crm_saved_views',
  crmScoringRules: 'crm_scoring_rules',
  crmTags: 'crm_tags',
  customFields: 'custom_fields',
  discountCodes: 'discount_codes',
  documentComments: 'document_comments',
  emailCampaignSends: 'email_campaign_sends',
  emailCampaigns: 'email_campaigns',
  emailLists: 'email_lists',
  emailRenders: 'email_renders',
  emailSegments: 'email_segments',
  emailSubscriberTagAssignments: 'email_subscriber_tag_assignments',
  emailSubscriberTags: 'email_subscriber_tags',
  emailSubscribers: 'email_subscribers',
  emailTemplates: 'email_templates',
  giftCertificateRedemptions: 'gift_certificate_redemptions',
  giftCertificates: 'gift_certificates',
  githubConnections: 'github_connections',
  googleCalendarTokens: 'google_calendar_tokens',
  googleWebsiteTokens: 'google_website_tokens',
  googleWorkspaceClientConnections: 'google_workspace_client_connections',
  googleWorkspaceTenantCredentials: 'google_workspace_tenant_credentials',
  googleWorkspaceUserConnections: 'google_workspace_user_connections',
  hostedSites: 'hosted_sites',
  httpRequestLogs: 'http_request_logs',
  invoiceItems: 'invoice_items',
  invoices: 'invoices',
  kanbanCardActivities: 'kanban_card_activities',
  kanbanCardArtifacts: 'kanban_card_artifacts',
  kanbanCardAssignees: 'kanban_card_assignees',
  kanbanCardChecklistItems: 'kanban_card_checklist_items',
  kanbanCardComments: 'kanban_card_comments',
  kanbanCardDependencies: 'kanban_card_dependencies',
  kanbanCardFiles: 'kanban_card_files',
  kanbanCardLabels: 'kanban_card_labels',
  kanbanCardTimeLogs: 'kanban_card_time_logs',
  kanbanCardWatchers: 'kanban_card_watchers',
  kanbanCards: 'kanban_cards',
  kanbanColumns: 'kanban_columns',
  kanbanLabels: 'kanban_labels',
  mcpPendingChanges: 'mcp_pending_changes',
  media: 'media',
  mediaVersions: 'media_versions',
  microsoftTeamsUserConnections: 'microsoft_teams_user_connections',
  notificationPreferences: 'notification_preferences',
  oauthAccessTokens: 'oauth_access_tokens',
  oauthAuthorizationCodes: 'oauth_authorization_codes',
  oauthClients: 'oauth_clients',
  orderItems: 'order_items',
  orderStatusHistory: 'order_status_history',
  orders: 'orders',
  paymentMethods: 'payment_methods',
  pitchDeckVersions: 'pitch_deck_versions',
  pitchDecks: 'pitch_decks',
  portalApiKeys: 'portal_api_keys',
  postCategories: 'post_categories',
  postCustomFieldValues: 'post_custom_field_values',
  postRevisions: 'post_revisions',
  postTags: 'post_tags',
  postTaxonomyTerms: 'post_taxonomy_terms',
  postTypes: 'post_types',
  posts: 'posts',
  productCategories: 'product_categories',
  productImages: 'product_images',
  productOptionValues: 'product_option_values',
  productOptions: 'product_options',
  productVariants: 'product_variants',
  products: 'products',
  projectWebhookDeliveries: 'project_webhook_deliveries',
  projectWebhooks: 'project_webhooks',
  projects: 'projects',
  serviceRequests: 'service_requests',
  services: 'services',
  shippingRates: 'shipping_rates',
  shippingZones: 'shipping_zones',
  siteBranding: 'site_branding',
  siteNavigation: 'site_navigation',
  sprints: 'sprints',
  storeCustomerMessageReplies: 'store_customer_message_replies',
  storeCustomerMessages: 'store_customer_messages',
  storeCustomerSessions: 'store_customer_sessions',
  storeCustomers: 'store_customers',
  storeProductReviews: 'store_product_reviews',
  storeSettings: 'store_settings',
  storeWishlistItems: 'store_wishlist_items',
  storeWishlists: 'store_wishlists',
  suggestedProjectRequests: 'suggested_project_requests',
  suggestedProjects: 'suggested_projects',
  supportTickets: 'support_tickets',
  surveyAiSummaries: 'survey_ai_summaries',
  surveyEmailSequences: 'survey_email_sequences',
  surveyPartialResponses: 'survey_partial_responses',
  surveyResponses: 'survey_responses',
  surveyVariants: 'survey_variants',
  surveyWebhookDeliveries: 'survey_webhook_deliveries',
  surveyWebhooks: 'survey_webhooks',
  surveys: 'surveys',
  tags: 'tags',
  taxonomies: 'taxonomies',
  taxonomyTerms: 'taxonomy_terms',
  ticketMessages: 'ticket_messages',
  triggerLinkClicks: 'trigger_link_clicks',
  triggerLinks: 'trigger_links',
  usageMeterEvents: 'usage_meter_events',
  usageMeters: 'usage_meters',
  users: 'users',
  websiteBackups: 'website_backups',
  websiteDomains: 'website_domains',
  websiteEmailTemplates: 'website_email_templates',
  websiteEnvVars: 'website_env_vars',
  websiteEnvironments: 'website_environments',
  zoomTokens: 'zoom_tokens',
};

describe('lib/db/schema export parity', () => {
  it('exports the exact set of names recorded in the snapshot', () => {
    // Source-scan because `interface`/`type` exports are erased at runtime
    // and don't appear on `Object.keys(Schema)`.
    const actual = collectSchemaExportNames();
    expect(actual).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it('exports the recorded number of names', () => {
    expect(collectSchemaExportNames()).toHaveLength(EXPECTED_EXPORTS.length);
  });

  it('every runtime export is also resolvable on the barrel namespace', () => {
    // Sanity: the top-level barrel re-exports every runtime value.
    // Type-only names are filtered out.
    const runtimeKeys = new Set(Object.keys(Schema as Record<string, unknown>));
    const expectedRuntime = Object.keys(EXPECTED_TABLE_NAMES);
    for (const name of expectedRuntime) {
      expect(runtimeKeys.has(name)).toBe(true);
    }
  });

  it('preserves every pgTable SQL name', () => {
    const schemaMap = Schema as unknown as Record<string, unknown>;
    const actualTables: Record<string, string> = {};
    for (const [exportName, value] of Object.entries(schemaMap)) {
      if (value && typeof value === 'object' && isTable(value)) {
        actualTables[exportName] = getTableName(value);
      }
    }

    expect(actualTables).toEqual(EXPECTED_TABLE_NAMES);
  });

  it('reports the recorded number of tables (176)', () => {
    const schemaMap = Schema as unknown as Record<string, unknown>;
    let count = 0;
    for (const value of Object.values(schemaMap)) {
      if (value && typeof value === 'object' && isTable(value)) count += 1;
    }
    expect(count).toBe(Object.keys(EXPECTED_TABLE_NAMES).length);
    expect(count).toBe(176);
  });
});
