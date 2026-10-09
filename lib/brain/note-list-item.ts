// The slim projection listNotes() returns by default — every list surface
// (Knowledge, Brain home, MCP, dataview blocks) reads this shape. Lives in
// its own file (PUX-158) because lib/brain/notes.ts is a pinned god file;
// notes.ts re-exports it, so import from either.

export interface BrainNoteListItem {
  id: number;
  clientId: number;
  title: string;
  meetingId: number | null;
  relationshipOverlayId: number | null;
  companyId: number | null;
  dealId: number | null;
  contactId: number | null;
  tags: string[];
  pinned: boolean;
  source: string;
  sourceUrl: string | null;
  attachmentFilename: string | null;
  /** PUX-158: the review pill on Brain home / Knowledge reads this; it was filterable but not projected. */
  needsReview: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
