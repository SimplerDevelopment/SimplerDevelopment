// The in-room sell surface's copy (PUX-146, design doc screen 06). Everything
// factual — name, price, the three features — comes from domain-catalog.ts;
// this file only adds the two things the catalog can't know: the one-line
// pitch written in the CLIENT's vocabulary (naming their own site when the
// feature is about it), and the labels on the ghosted preview of the room.
//
// Keyed by the `requiredDomain` values in lib/portal-nav.ts. The unit test
// (tests/unit/locked-room-copy.test.ts) fails if a gated nav item has no
// entry here or no catalog entry to sell from — that is the drift this file
// is exposed to.

export interface LockedRoomCopy {
  /** `site` is the client's primary domain, or null when they have no site yet. */
  pitch: (site: string | null) => string;
  /** two stat labels drawn as "—" tiles in the ghost preview */
  preview: [string, string];
}

export const LOCKED_ROOM_COPY: Record<string, LockedRoomCopy> = {
  seo: {
    pitch: (s) => `See how ${s ?? 'your site'} ranks, and what to fix first.`,
    preview: ['Audit score', 'Issues found'],
  },
  surveys: {
    pitch: () => 'Ask your customers how it went, and see every answer in one place.',
    preview: ['Responses', 'NPS'],
  },
  crm: {
    pitch: () => 'Every lead, deal and follow-up, in one pipeline.',
    preview: ['Open pipeline', 'Won this month'],
  },
  brain: {
    pitch: () => 'Everything your business knows, answerable in one question.',
    preview: ['Notes', 'Decisions'],
  },
  email: {
    pitch: (s) => `Reach the people who already know ${s ?? 'you'}, without a second tool.`,
    preview: ['Subscribers', 'Open rate'],
  },
  projects: {
    pitch: () => 'The work we are doing for you, on a board you can see.',
    preview: ['In progress', 'Shipped'],
  },
  publishing: {
    pitch: () => 'Every post, from idea to published, on one calendar.',
    preview: ['Scheduled', 'Published'],
  },
  'pitch-decks': {
    pitch: () => 'Proposals and decks that look like you, sent in minutes.',
    preview: ['Sent', 'Viewed'],
  },
  websites: {
    pitch: (s) => `${s ?? 'Your site'}, editable by you, hosted by us.`,
    preview: ['Visits / 7d', 'Pages'],
  },
};
