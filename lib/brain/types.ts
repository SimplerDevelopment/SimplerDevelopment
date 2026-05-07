/**
 * Shared types for the brain knowledge UI.
 *
 * `BrainNote` is the full client-side shape returned by
 * `GET /api/portal/brain/knowledge/[id]`. The list pane uses a slimmer
 * projection — see `components/brain/NoteListPane.tsx`.
 */

export type ConfidentialityLevel = 'standard' | 'restricted' | 'confidential';

export interface BrainNote {
  id: number;
  title: string;
  body: string;
  tags: string[];
  meetingId: number | null;
  relationshipOverlayId: number | null;
  companyId: number | null;
  dealId: number | null;
  contactId: number | null;
  confidentialityLevel: ConfidentialityLevel;
  pinned: boolean;
  source: string;
  attachmentUrl: string | null;
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
  attachmentFileSize: number | null;
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}
