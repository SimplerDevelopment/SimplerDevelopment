/**
 * PUX-200: friendly names for every mcp_pending_changes.entityType
 * (lib/mcp/pending-changes.ts). The list page labels five; this covers all.
 */
export const ENTITY_LABEL: Record<string, string> = {
  post: 'Post', pitch_deck: 'Pitch deck', pitch_deck_slides: 'Deck slides', pitch_deck_slide_draft: 'Slide draft',
  proposal: 'Proposal', email_campaign: 'Email campaign', site: 'Site', site_nav: 'Site navigation',
  block_template: 'Block template', taxonomy: 'Taxonomy', post_taxonomy: 'Post taxonomy', crm_deal: 'Deal', ai_tool_call: 'AI tool call',
};
export function entityLabel(type: string): string {
  return ENTITY_LABEL[type] ?? type.replace(/_/g, ' ');
}
