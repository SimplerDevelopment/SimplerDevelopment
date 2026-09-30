/**
 * PUX-176 (design doc screen 35): a publishing card's channel as a chip, not
 * a "[page]" prefix spliced into its title. Keyed by kanban_card_artifacts
 * .artifact_type (the PUBLISHING_ARTIFACT_TYPES plus the CRM/deal kinds a
 * card can carry). Pure.
 */

export interface ChannelChip { icon: string; label: string }

const CHIPS: Record<string, ChannelChip> = {
  post: { icon: 'article', label: 'Post' },
  website: { icon: 'description', label: 'Page' },
  email_campaign: { icon: 'mail', label: 'Email' },
  linkedin_draft: { icon: 'groups', label: 'LinkedIn' },
  pitch_deck: { icon: 'slideshow', label: 'Deck' },
  survey: { icon: 'poll', label: 'Survey' },
  booking_page: { icon: 'event', label: 'Booking' },
  booking: { icon: 'event', label: 'Booking' },
  proposal: { icon: 'request_quote', label: 'Proposal' },
  project: { icon: 'folder', label: 'Project' },
  brain_note: { icon: 'sticky_note_2', label: 'Note' },
};

export function channelChip(artifactType: string): ChannelChip {
  return CHIPS[artifactType] ?? { icon: 'attachment', label: artifactType.replace(/_/g, ' ') };
}

/**
 * What a card shows for its channel. One artifact → that channel; several →
 * a count chip; none → nothing. Legacy (flag off) keeps splicing the same
 * information into the title, byte for byte — see cardTitle().
 */
export function cardChannel(artifacts: { artifactType: string }[]): ChannelChip | null {
  if (artifacts.length === 1) return channelChip(artifacts[0].artifactType);
  if (artifacts.length > 1) return { icon: 'layers', label: `${artifacts.length} artifacts` };
  return null;
}

/** The pre-redesign title: "{Campaign} [channel] Title". Kept verbatim for flag-off tenants. */
export function cardTitle(title: string, artifacts: { artifactType: string }[], campaignName: string | null): string {
  const channelHint =
    artifacts.length === 1
      ? `[${artifacts[0].artifactType.replace(/_/g, ' ')}] `
      : artifacts.length > 1
        ? `[${artifacts.length} artifacts] `
        : '';
  const campaignHint = campaignName ? `{${campaignName}} ` : '';
  return `${campaignHint}${channelHint}${title}`;
}
