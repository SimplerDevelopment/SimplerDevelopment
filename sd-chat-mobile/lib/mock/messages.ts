/**
 * Sample messages for a handful of conversation ids — covers AI 1-on-1, group,
 * and assistant welcome flow. Phase 2 A will swap this for live data.
 */

export type MessageKind = 'user' | 'ai' | 'other';

export type Message = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  text: string;
  /** Sender avatar id; null for AI + current user. */
  authorId?: number;
  authorName?: string;
  time: string;
};

export const messagesByConversation: Record<string, Message[]> = {
  'assistant-primary': [
    {
      id: 'm-1',
      conversationId: 'assistant-primary',
      kind: 'ai',
      text: 'Drafted the Q2 nurture email — baseline open rate is 24%. Want me to A/B the subject line?',
      time: '2m',
    },
    {
      id: 'm-2',
      conversationId: 'assistant-primary',
      kind: 'user',
      text: 'Yes, run two variants. Keep it short.',
      time: '1m',
    },
    {
      id: 'm-3',
      conversationId: 'assistant-primary',
      kind: 'ai',
      text: 'On it. I\'ll have both variants in your approval inbox within five minutes.',
      time: 'now',
    },
  ],
  'group-atlas-launch': [
    {
      id: 'g-1',
      conversationId: 'group-atlas-launch',
      kind: 'other',
      authorId: 11,
      authorName: 'Aisha Patel',
      text: 'Hero copy is ready for review — pushed to the staging URL.',
      time: '2h',
    },
    {
      id: 'g-2',
      conversationId: 'group-atlas-launch',
      kind: 'other',
      authorId: 12,
      authorName: 'Marcus Chen',
      text: 'Pricing page lands tomorrow — anyone reviewing tonight?',
      time: '1h',
    },
    {
      id: 'g-3',
      conversationId: 'group-atlas-launch',
      kind: 'user',
      text: 'I can take a pass after the standup.',
      time: '45m',
    },
  ],
  'dm-sarah-kim': [
    {
      id: 's-1',
      conversationId: 'dm-sarah-kim',
      kind: 'other',
      authorId: 5,
      authorName: 'Sarah Kim',
      text: 'Can you push the Northpoint deck to staging before EOD?',
      time: '18m',
    },
  ],
};
