/**
 * Brain mock data — notes, glossary, decisions, person profile, suggestions.
 * Drawn from sd-chat-brain-mockup.html and the brain section of
 * sd-chat-mockup.html.
 */

import type { MIconProps } from '@/components/atoms/MIcon';

export type BrainNote = {
  id: string;
  title: string;
  excerpt: string;
  updatedAt: string;
  tags: string[];
  /** Icon used in list-row prefix tile (Material Symbols snake_case). */
  icon: MIconProps['name'];
  /** Optional author for note detail header. */
  authorId?: number;
  authorName?: string;
  meta?: string;
};

export type BrainDecision = {
  id: string;
  title: string;
  status: 'accepted' | 'proposed' | 'superseded';
  code?: string;
  context: string;
  decision: string;
  rationale: string;
  decidedAt: string;
  /** Display string for the decision-record header sub-line. */
  decidedBy?: string;
  decidedById?: number;
  reversibility?: string;
};

export type BrainGlossaryTerm = {
  id: string;
  term: string;
  shortDef: string;
  definition: string;
  aliases: string[];
  category: string;
  related?: string[];
  ownerId?: number;
  ownerName?: string;
  ownerRole?: string;
};

export type BrainPerson = {
  id: number;
  name: string;
  role: string;
  org: string;
  email: string;
  avatarId: number;
  notes: string;
  expertise?: string[];
  stats?: { notes: number; decisions: number; deals: number };
};

export type BrainSuggestion = {
  id: string;
  accent: string;
  bg: string;
  /** When true, render the accent strip + icon tile with the AI gradient. */
  gradient?: boolean;
  icon: MIconProps['name'];
  eyebrow: string;
  title: string;
  body: string;
  cta1: string;
  cta2: string;
  /** Carried from the server suggestion payload so the screen can deep-link
   *  the primary CTA to the corresponding entity detail screen. Optional
   *  because the legacy mock array predates the server endpoint. */
  entityType?: 'decision' | 'note' | 'glossary_term';
  entityId?: number;
};

export const brainNotes: BrainNote[] = [
  {
    id: 'n-1',
    title: 'Q1 enrollment strategy review',
    excerpt:
      'Decided to lean into late-stage applicants with a paid airline-credit upgrade. Sarah owns the campaign brief; Jordan handles the funnel test.',
    updatedAt: 'Today',
    tags: ['strategy', 'q1', 'enrollment'],
    icon: 'flag',
    authorId: 47,
    authorName: 'Sarah Kim',
    meta: 'Updated 2d ago · 4 contributors',
  },
  {
    id: 'n-2',
    title: 'Decision: drop the Plus tier',
    excerpt:
      'After 6 weeks of <2% conversion, we are consolidating Plus into Pro at a single mid-tier price. Owner: Maya. Impact memo attached.',
    updatedAt: 'Yesterday',
    tags: ['pricing', 'decision'],
    icon: 'gavel',
    authorId: 23,
    authorName: 'Maya Rivera',
    meta: 'Updated 5d ago · linked to 3 deals',
  },
  {
    id: 'n-3',
    title: 'Acme onboarding playbook v3',
    excerpt:
      'Step 1 brand intake call. Step 2 technical scoping. Step 3 hand off to delivery. Average completion: 4.5 business days.',
    updatedAt: 'Mon',
    tags: ['playbook', 'acme'],
    icon: 'menu_book',
    authorId: 49,
    authorName: 'Aisha Patel',
    meta: 'Updated 1w ago · 12 referenced',
  },
  {
    id: 'n-4',
    title: 'Atlas Collective kickoff — May 12',
    excerpt:
      'They want to launch alongside their Series A press cycle. Hard deadline July 8. Aisha owns content; Marcus owns build.',
    updatedAt: 'Sun',
    tags: ['meeting', 'atlas'],
    icon: 'event_note',
    authorId: 12,
    authorName: 'Marcus Chen',
    meta: 'Updated 2w ago',
  },
];

export const brainDecisions: BrainDecision[] = [
  {
    id: 'd-1',
    code: 'DR-024',
    title: 'Drop the Plus tier',
    status: 'accepted',
    context:
      'After 6 weeks of running the new three-tier pricing, Plus drove fewer than 2% of upgrades and showed the highest support volume per dollar. Customers consistently asked why Plus existed when Pro had nearly the same feature set for $40 more.',
    decision:
      "We're consolidating Plus into Pro at a single mid-tier price of $189/mo. Existing Plus customers grandfathered for 12 months.",
    rationale:
      'Plus drove <2% of upgrades over 6 weeks; highest support ticket volume per dollar; two-tier pricing tested better in customer interviews.',
    decidedAt: 'May 8',
    decidedBy: 'Maya Rivera',
    decidedById: 23,
    reversibility: 'Reversible · medium effort',
  },
  {
    id: 'd-2',
    code: 'DR-019',
    title: 'AI replies require approval on >$5k actions',
    status: 'accepted',
    context: 'Assistant was sending invoice changes without a human checkpoint.',
    decision:
      'Any action with monetary impact >$5k routes to the approval inbox first.',
    rationale:
      'Avoid blast-radius incidents while preserving low-friction defaults.',
    decidedAt: 'Apr 30',
    decidedBy: 'Tom Hadley',
    decidedById: 8,
    reversibility: 'Reversible · low effort',
  },
  {
    id: 'd-3',
    code: 'DR-011',
    title: 'Use Crosscap as the canonical CRM exporter',
    status: 'superseded',
    context:
      'Three competing CSV shapes were floating in the team. Pick one and document it.',
    decision: 'Crosscap is the source of truth; HubSpot + Salesforce are derived.',
    rationale:
      'Crosscap already maps to our internal field schema and the API is stable.',
    decidedAt: 'Apr 14',
    decidedBy: 'Aisha Patel',
    decidedById: 49,
    reversibility: 'Hard to reverse',
  },
];

export const brainGlossary: BrainGlossaryTerm[] = [
  {
    id: 'g-sla',
    term: 'SLA',
    shortDef: 'Service-Level Agreement',
    definition:
      "A formal commitment between us and a client that defines the level of service we'll deliver — typically measured in response time, uptime, and resolution windows. SLAs are enforceable terms inside the master services contract, not aspirational goals.",
    aliases: ['service contract', 'response-time agreement'],
    category: 'Operations',
    related: ['Tier', 'MTTR', 'Escalation path', 'Uptime'],
    ownerId: 8,
    ownerName: 'Tom Hadley',
    ownerRole: 'Head of Ops · Acme Agency',
  },
  {
    id: 'g-mttr',
    term: 'MTTR',
    shortDef: 'Mean time to resolution',
    definition:
      'The average time between an incident being reported and being fully resolved. Used as the operational counterpart to SLA reporting.',
    aliases: ['mean time to recovery'],
    category: 'Operations',
    related: ['SLA', 'Incident', 'Pager'],
    ownerId: 8,
    ownerName: 'Tom Hadley',
    ownerRole: 'Head of Ops · Acme Agency',
  },
  {
    id: 'g-icp',
    term: 'ICP',
    shortDef: 'Ideal customer profile',
    definition:
      'A definition of the type of company most likely to succeed with our product, used to score inbound leads and shape outbound outreach.',
    aliases: ['ideal customer profile'],
    category: 'GTM',
    related: ['Persona', 'Lead score', 'Qualifier'],
    ownerId: 49,
    ownerName: 'Aisha Patel',
    ownerRole: 'Head of Growth',
  },
];

export const brainPeople: BrainPerson[] = [
  {
    id: 47,
    name: 'Sarah Kim',
    role: 'Director of Strategy',
    org: 'Acme Agency',
    email: 'sarah@example.com',
    avatarId: 47,
    notes:
      'Owns brand + nurture for the Northpoint rebuild. Prefers async; Slack > email.',
    expertise: ['enrollment', 'late-stage', 'email-funnels', 'higher-ed'],
    stats: { notes: 47, decisions: 12, deals: 8 },
  },
  {
    id: 8,
    name: 'Tom Hadley',
    role: 'Head of Operations',
    org: 'Acme Agency',
    email: 'tom@example.com',
    avatarId: 8,
    notes: 'Owns the SLA + incident process. Pings in #ops first, escalates fast.',
    expertise: ['sla', 'incidents', 'process', 'tooling'],
    stats: { notes: 31, decisions: 9, deals: 0 },
  },
  {
    id: 49,
    name: 'Aisha Patel',
    role: 'Head of Growth',
    org: 'Acme Agency',
    email: 'aisha@example.com',
    avatarId: 49,
    notes: 'Drives pipeline + nurture experiments. Loves a chart, hates a meeting.',
    expertise: ['growth', 'lifecycle', 'analytics', 'nurture'],
    stats: { notes: 64, decisions: 14, deals: 11 },
  },
];

export const brainSuggestions: BrainSuggestion[] = [
  {
    id: 's-1',
    accent: '#F59E0B',
    bg: '#FEF7E6',
    icon: 'history',
    eyebrow: 'Decision needs review',
    title: "The 'Drop the Plus tier' decision is 6 months old.",
    body: 'Mark as still-accepted or supersede with a fresh decision record?',
    cta1: 'Still accepted',
    cta2: 'Supersede',
  },
  {
    id: 's-2',
    accent: '#5B5BD6',
    bg: '#F5F5FE',
    gradient: true,
    icon: 'group_add',
    eyebrow: 'Owner missing',
    title: '3 notes about Atlas Collective have no owner.',
    body: 'Aisha edited 2 of them — assign her as default owner?',
    cta1: 'Assign Aisha',
    cta2: 'Pick someone else',
  },
  {
    id: 's-3',
    accent: '#0BB8B0',
    bg: '#E6F8F7',
    icon: 'merge_type',
    eyebrow: 'Possible duplicate',
    title: 'Two notes look like the same kickoff doc.',
    body: "'Atlas kickoff May 12' and 'Atlas Collective project intro' share 84% content overlap.",
    cta1: 'Compare',
    cta2: 'Dismiss',
  },
  {
    id: 's-4',
    accent: '#FF9500',
    bg: '#FFF2E0',
    icon: 'unpublished',
    eyebrow: 'Orphan glossary term',
    title: "'MTTR' is defined but never used in any note.",
    body: 'Add a usage example or archive the term?',
    cta1: 'Add usage',
    cta2: 'Archive',
  },
  {
    id: 's-5',
    accent: '#64748B',
    bg: '#EEF2F6',
    icon: 'pending_actions',
    eyebrow: 'Stale follow-up',
    title: "Sarah's Q1 strategy note has 3 open checkboxes from 4 weeks ago.",
    body: 'They were marked "this week" when written.',
    cta1: 'Open note',
    cta2: 'Mark done',
  },
];
