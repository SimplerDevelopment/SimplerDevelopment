-- Ticket message attachments: files attached to individual ticket thread messages
ALTER TABLE "ticket_messages" ADD COLUMN IF NOT EXISTS "attachments" json DEFAULT '[]';
