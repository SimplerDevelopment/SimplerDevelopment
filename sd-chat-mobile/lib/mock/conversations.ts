/**
 * Conversation list — drawn from the canonical sd-chat-mockup.html main screen.
 * Order is: pinned Assistant, then recent by recency.
 */

export type ConversationKind = 'ai' | 'dm' | 'group';

export type Conversation = {
  id: string;
  kind: ConversationKind;
  title: string;
  preview: string;
  time: string;
  unread?: number;
  /** Avatar pravatar ids for participants (excluding current user). */
  participantIds: number[];
  /** Group conversations with AI helper present get a sparkle badge. */
  hasAi?: boolean;
  pinned?: boolean;
  tag?: 'AI';
};

export const conversations: Conversation[] = [
  {
    id: 'assistant-primary',
    kind: 'ai',
    title: 'Assistant',
    preview:
      'Drafted the Q2 nurture email and pulled the open-rate baseline. Ready when you are.',
    time: '2m',
    unread: 0,
    participantIds: [],
    pinned: true,
    tag: 'AI',
  },
  {
    id: 'dm-sarah-kim',
    kind: 'dm',
    title: 'Sarah Kim',
    preview: 'Can you push the Northpoint deck to staging before EOD?',
    time: '18m',
    unread: 2,
    participantIds: [5],
  },
  {
    id: 'group-atlas-launch',
    kind: 'group',
    title: '# Atlas Launch',
    preview:
      'Marcus: Pricing page lands tomorrow — anyone reviewing tonight?',
    time: '1h',
    unread: 5,
    participantIds: [11, 12, 13],
    hasAi: true,
  },
  {
    id: 'assistant-deals-nudge',
    kind: 'ai',
    title: 'Assistant',
    preview: '3 deals stuck in Proposal Sent for 14+ days — want me to nudge?',
    time: '3h',
    participantIds: [],
  },
  {
    id: 'group-acme-onboarding',
    kind: 'group',
    title: '# Acme Onboarding',
    preview: 'Priya: @assistant what did we land on for the SLA?',
    time: '9h',
    participantIds: [20, 21],
    hasAi: true,
  },
  {
    id: 'dm-daniel-park',
    kind: 'dm',
    title: 'Daniel Park',
    preview: 'Brand spec for Atlas is in the shared folder',
    time: 'Tue',
    participantIds: [13],
  },
  {
    id: 'group-q2-planning',
    kind: 'group',
    title: '# Q2 Planning',
    preview: 'You: Bumping rollover work to next sprint',
    time: 'Mon',
    participantIds: [30, 31, 5],
  },
  {
    id: 'assistant-survey',
    kind: 'ai',
    title: 'Assistant',
    preview: '5 new responses on the qualifier survey — 3 are warm',
    time: 'Sun',
    participantIds: [],
  },
];
