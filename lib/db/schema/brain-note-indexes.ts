import { index, type AnyPgColumn } from 'drizzle-orm/pg-core';

/** Shared note lookup indexes, including legacy attachment policy checks. */
export function brainNoteIndexes(table: {
  clientId: AnyPgColumn;
  updatedAt: AnyPgColumn;
  companyId: AnyPgColumn;
  dealId: AnyPgColumn;
  pinned: AnyPgColumn;
  status: AnyPgColumn;
  attachmentStoredKey: AnyPgColumn;
  attachmentUrl: AnyPgColumn;
}) {
  return [
    index('brain_notes_client_updated_idx').on(table.clientId, table.updatedAt),
    index('brain_notes_client_company_idx').on(table.clientId, table.companyId),
    index('brain_notes_client_deal_idx').on(table.clientId, table.dealId),
    index('brain_notes_client_pinned_idx').on(table.clientId, table.pinned),
    index('brain_notes_status_idx').on(table.status),
    index('brain_notes_attachment_key_idx').on(table.attachmentStoredKey),
    index('brain_notes_attachment_url_idx').on(table.attachmentUrl),
  ];
}
