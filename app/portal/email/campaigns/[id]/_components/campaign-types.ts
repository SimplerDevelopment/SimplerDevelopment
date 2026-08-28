// Extracted verbatim from app/portal/email/campaigns/[id]/page.tsx (PUX-175) — the page is pinned at 522 code lines.

import type { Block, BlockEditorData } from '@/types/blocks';

export interface Campaign {
  id: number;
  name: string;
  subject: string;
  previewText: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  listId: number;
  listName: string | null;
  htmlContent: string;
  blockContent: BlockEditorData | null;
  contentBlocks: Block[] | null;
  useBlockEditor: boolean;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
  abEnabled?: boolean;
  abSubjectB?: string | null;
  abWinnerMetric?: 'open' | 'click' | null;
  abTestSizePct?: number | null;
  abWinnerSubject?: string | null;
  abDecidedAt?: string | null;
}
