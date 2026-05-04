/**
 * Slim/full column projections for MCP write-echoes.
 *
 * The MCP tool surface returns the row that was just created/updated to the
 * caller. For posts/decks/campaigns the full row carries multi-MB
 * `content` / `slides` / `htmlContent` blobs that blow the LLM's token budget
 * on every round trip. The SLIM_* projections strip those out by default and
 * the matching `*_columns` opt-in restores them when the caller passes
 * `includeContent` / `includeSlides`.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor so cms.ts,
 * pitch-decks.ts, and email.ts can share without drift.
 */
import { posts, pitchDecks, emailCampaigns } from '@/lib/db/schema';

// Slim post projection — omits the multi-MB `content` blob plus per-page
// CSS/JS/SEO long-text. posts_list / posts_create / posts_update default to
// this so MCP callers don't pay the full body cost on every response. Pass
// `includeContent: true` to opt into the full row (adds content, customCss,
// customJs, seoDescription, ogImage, canonicalUrl).
export const SLIM_POST_COLUMNS = {
  id: posts.id,
  title: posts.title,
  slug: posts.slug,
  postType: posts.postType,
  excerpt: posts.excerpt,
  coverImage: posts.coverImage,
  published: posts.published,
  publishedAt: posts.publishedAt,
  websiteId: posts.websiteId,
  seoTitle: posts.seoTitle,
  noIndex: posts.noIndex,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
} as const;

export const FULL_POST_COLUMNS = {
  ...SLIM_POST_COLUMNS,
  content: posts.content,
  customCss: posts.customCss,
  customJs: posts.customJs,
  seoDescription: posts.seoDescription,
  ogImage: posts.ogImage,
  canonicalUrl: posts.canonicalUrl,
} as const;

export function postProjection(includeContent?: boolean) {
  return includeContent ? FULL_POST_COLUMNS : SLIM_POST_COLUMNS;
}

// Slim deck projection — omits the `slides` array (often hundreds of KB to
// several MB after a long replace_slides call). decks_create / decks_update /
// decks_replace_slides / decks_add_slide default to this so callers don't pay
// the slide cost on every echo. Pass `includeSlides: true` to opt into the
// full row (decks_get always includes slides — that's its purpose).
export const SLIM_DECK_COLUMNS = {
  id: pitchDecks.id,
  title: pitchDecks.title,
  slug: pitchDecks.slug,
  description: pitchDecks.description,
  status: pitchDecks.status,
  formatVersion: pitchDecks.formatVersion,
  brandingProfileId: pitchDecks.brandingProfileId,
  theme: pitchDecks.theme,
  sourceUrl: pitchDecks.sourceUrl,
  createdAt: pitchDecks.createdAt,
  updatedAt: pitchDecks.updatedAt,
} as const;

export const FULL_DECK_COLUMNS = {
  ...SLIM_DECK_COLUMNS,
  slides: pitchDecks.slides,
} as const;

export function deckProjection(includeSlides?: boolean) {
  return includeSlides ? FULL_DECK_COLUMNS : SLIM_DECK_COLUMNS;
}

// Slim email campaign projection — omits htmlContent (rendered HTML body) and
// blockContent (block-editor JSON), both of which can be hundreds of KB.
// Pass `includeContent: true` to opt into the full row.
export const SLIM_CAMPAIGN_COLUMNS = {
  id: emailCampaigns.id,
  name: emailCampaigns.name,
  subject: emailCampaigns.subject,
  previewText: emailCampaigns.previewText,
  fromName: emailCampaigns.fromName,
  fromEmail: emailCampaigns.fromEmail,
  replyTo: emailCampaigns.replyTo,
  listId: emailCampaigns.listId,
  clientId: emailCampaigns.clientId,
  status: emailCampaigns.status,
  scheduledAt: emailCampaigns.scheduledAt,
  sentAt: emailCampaigns.sentAt,
  totalRecipients: emailCampaigns.totalRecipients,
  totalSent: emailCampaigns.totalSent,
  totalOpened: emailCampaigns.totalOpened,
  totalClicked: emailCampaigns.totalClicked,
  totalBounced: emailCampaigns.totalBounced,
  totalUnsubscribed: emailCampaigns.totalUnsubscribed,
  createdBy: emailCampaigns.createdBy,
  createdAt: emailCampaigns.createdAt,
  updatedAt: emailCampaigns.updatedAt,
} as const;

export const FULL_CAMPAIGN_COLUMNS = {
  ...SLIM_CAMPAIGN_COLUMNS,
  htmlContent: emailCampaigns.htmlContent,
  blockContent: emailCampaigns.blockContent,
} as const;

export function campaignProjection(includeContent?: boolean) {
  return includeContent ? FULL_CAMPAIGN_COLUMNS : SLIM_CAMPAIGN_COLUMNS;
}
