/**
 * Mock approvals data — drives the approvals inbox + detail + bulk + history screens.
 *
 * Phase 3 will swap this for `/api/approvals` via Tanstack Query. The shape
 * mirrors what the portal already returns from `approvals_list`/`approvals_get`,
 * with a few UI-only fields (`tint`, `destructive`, `warn`) added.
 *
 * Scope colors are NOT stored here — see `components/approvals/ScopeChip.tsx`
 * for the canonical mapping (one source of truth, used in inbox + detail + bulk).
 */

import { T } from '@/lib/theme';

/** Scope name format mirrors the portal: `<resource>.<read|write|send>`. */
export type ApprovalScope =
  | 'crm.read'
  | 'crm.write'
  | 'posts.write'
  | 'email.send'
  | 'brain.read'
  | 'brain.write'
  | 'tickets.write'
  | 'kanban.write'
  | 'media.write'
  | 'store.write';

export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'auto';

export type ApprovalArg = { key: string; value: string };

export type ApprovalImpactStep = {
  /** Material Symbols name passed to <MIcon>. */
  icon: string;
  text: string;
};

export type RelatedDeal = {
  id: string;
  name: string;
  value: string;
  stage: string;
  /** Color token reference — resolved at render. */
  stageColor: string;
};

export type Approval = {
  id: string;
  scope: ApprovalScope;
  /** Full tool call name as the assistant would invoke it (e.g. `crm_deals_create`). */
  tool: string;
  /** Single-sentence summary used in inbox rows + detail header. */
  description: string;
  /** Plain description shown on the detail page under the tool name. */
  longDescription?: string;
  /** Where the call originated — "from # atlas thread", "from DM Sarah Kim", etc. */
  meta: string;
  /** Approximate time elapsed, used as the inbox row's right-side label. */
  time: string;
  /** Tinted dot/accent in the inbox row (mirrors mockup column color). */
  tint: string;
  /** True for actions like deletes — surfaces a red badge on the inbox avatar. */
  destructive?: boolean;
  /** True for tools that actually send something externally (emails). */
  warn?: boolean;
  /** Detail-page argument table. Optional — inbox-only items can omit. */
  args?: ApprovalArg[];
  /** Detail-page "When approved" preview list. */
  impact?: ApprovalImpactStep[];
  /** Detail-page "related" rail (e.g. the contact's recent deals). */
  related?: { title: string; items: RelatedDeal[] };
  /** Source thread or DM — short reference shown on detail page. */
  fromChannel?: string;
  fromExcerpt?: string;
};

export const pendingApprovals: Approval[] = [
  {
    id: 'apv_001',
    scope: 'crm.write',
    tool: 'crm_deals_create',
    description: 'Northpoint Studio — $42K · Discovery',
    longDescription: 'Create a new deal in the Agency Services pipeline.',
    meta: 'from # atlas thread',
    time: '2m',
    tint: T.iosBlue,
    args: [
      { key: 'name', value: 'Northpoint Studio — MarTech Audit' },
      { key: 'value', value: '$42,000' },
      { key: 'stage', value: 'Discovery' },
      { key: 'pipeline', value: 'Agency Services' },
      { key: 'contact', value: 'Sarah Kim' },
      { key: 'close_date', value: '2026-07-15' },
      { key: 'source', value: 'Inbound — referral from Atlas' },
    ],
    impact: [
      { icon: 'add_circle', text: 'Create 1 deal in Agency Services pipeline' },
      { icon: 'link', text: 'Link contact: Sarah Kim (Northpoint Studio)' },
      { icon: 'event_note', text: 'Add 1 activity: "Created via chat"' },
      { icon: 'notifications', text: 'Notify 2 watchers: Daniel, Marcus' },
    ],
    related: {
      title: "Sarah Kim's last 3 deals",
      items: [
        { id: 'd1', name: 'Atlas Collective — Brand sprint', value: '$28K', stage: 'Closed Won', stageColor: T.success },
        { id: 'd2', name: 'Bramble Co — Web rebuild', value: '$54K', stage: 'Proposal', stageColor: T.warning },
        { id: 'd3', name: 'Vista Health — Discovery', value: '$18K', stage: 'In progress', stageColor: T.iosBlue },
      ],
    },
    fromChannel: 'atlas-launch',
    fromExcerpt: 'Create a deal for Northpoint Studio…',
  },
  {
    id: 'apv_002',
    scope: 'email.send',
    tool: 'email_campaigns_send',
    description: 'Q2 nurture · 1,247 recipients',
    meta: 'from DM Sarah Kim',
    time: '8m',
    warn: true,
    tint: T.iosRed,
  },
  {
    id: 'apv_003',
    scope: 'posts.write',
    tool: 'posts_update',
    description: 'atlas-series-a-landing — 3 block changes',
    meta: 'from # web sprint',
    time: '14m',
    tint: T.iosOrange,
  },
  {
    id: 'apv_004',
    scope: 'crm.write',
    tool: 'crm_deals_move_stage',
    description: 'Vista Health: Discovery → Proposal Sent',
    meta: 'from DM Marcus Chen',
    time: '22m',
    tint: T.iosBlue,
  },
  {
    id: 'apv_005',
    scope: 'brain.write',
    tool: 'brain_delete_note',
    description: 'Old kickoff draft v1',
    meta: 'from cleanup task',
    time: '45m',
    destructive: true,
    tint: T.iosPurple,
  },
  {
    id: 'apv_006',
    scope: 'kanban.write',
    tool: 'kanban_create_card',
    description: 'Sprint 12 · Refactor billing modal',
    meta: 'from DM Aisha Patel',
    time: '1h',
    tint: T.iosYellow,
  },
  {
    id: 'apv_007',
    scope: 'tickets.write',
    tool: 'tickets_reply',
    description: "RE: Acme onboarding — 'Yes, we can ship Friday'",
    meta: 'from # support',
    time: '1h',
    tint: T.success,
  },
];

export type HistoryItem = {
  id: string;
  status: 'approved' | 'declined' | 'auto';
  tool: string;
  summary: string;
  when: string;
  /** Link text shown under summary, in AI accent color. */
  link?: string;
  /** Italicized reason text, used when status === 'declined'. */
  reason?: string;
  /** Pravatar id when the actor isn't "Daniel" (e.g. a teammate). */
  avatarId?: number;
};

export type HistoryDay = {
  label: string;
  items: HistoryItem[];
};

export const approvalHistory: HistoryDay[] = [
  {
    label: 'Today',
    items: [
      {
        id: 'h1',
        status: 'approved',
        tool: 'crm_deals_create',
        summary: 'Northpoint Studio — $42K',
        when: '2h ago by Daniel',
        link: 'Open deal →',
      },
      {
        id: 'h2',
        status: 'approved',
        tool: 'email_campaigns_send',
        summary: 'May newsletter · 1,247 recipients',
        when: '5h ago by Daniel',
        link: '47% open rate so far',
      },
    ],
  },
  {
    label: 'Yesterday',
    items: [
      {
        id: 'h3',
        status: 'declined',
        tool: 'brain_delete_note',
        summary: 'Atlas kickoff v1',
        when: 'yesterday by Daniel',
        reason: 'Keep for reference',
      },
      {
        id: 'h4',
        status: 'auto',
        tool: 'brain_create_note',
        summary: 'Meeting summary: Acme sync',
        when: 'yesterday',
        link: 'Scope: brain.read+write · auto since May 1',
      },
      {
        id: 'h5',
        status: 'approved',
        tool: 'posts_update',
        summary: 'atlas-landing — 12 block edits',
        when: '2d ago by Sarah Kim',
        avatarId: 47,
        link: 'Published 1h after',
      },
      {
        id: 'h6',
        status: 'approved',
        tool: 'tickets_reply',
        summary: 'Acme follow-up',
        when: '2d ago by Daniel',
      },
    ],
  },
  {
    label: 'May 18',
    items: [
      {
        id: 'h7',
        status: 'declined',
        tool: 'email_subscribers_remove',
        summary: '847 cold contacts',
        when: '3d ago by Daniel',
        reason: 'Too aggressive, do it manually',
      },
    ],
  },
];

/** Bulk-approval grouping: a set of similar pending items the user can fire as a batch. */
export type BulkGroup = {
  id: string;
  title: string;
  toolName: string;
  /** Right-side warning label, e.g. "45+ DAYS STALE". */
  badge?: string;
  /** Body items inside the group; each has its own checkbox. */
  items: {
    id: string;
    name: string;
    fromStage: string;
    toStage: string;
    age: string;
    checked: boolean;
  }[];
};

export const bulkGroup: BulkGroup = {
  id: 'bulk_stuck',
  title: 'Automation · Stuck-deal cleanup',
  toolName: 'crm_deals_move_stage',
  badge: '45+ DAYS STALE',
  items: [
    { id: 'b1', name: 'Atlas Collective', fromStage: 'Proposal Sent', toStage: 'Closed Lost', age: '52d stale', checked: true },
    { id: 'b2', name: 'Vista Health', fromStage: 'Proposal Sent', toStage: 'Closed Lost', age: '48d stale', checked: true },
    { id: 'b3', name: 'Bramble Co.', fromStage: 'Proposal Sent', toStage: 'Closed Lost', age: '47d stale', checked: true },
    { id: 'b4', name: 'Northpoint Studio', fromStage: 'Proposal Sent', toStage: 'Closed Lost', age: '45d stale', checked: true },
  ],
};
