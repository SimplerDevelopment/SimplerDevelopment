-- Add block_content column to email_campaigns and email_templates
-- Stores BlockEditorData JSON for visual email editor
-- Nullable: null means campaign/template uses raw HTML (backward compat)

ALTER TABLE email_campaigns ADD COLUMN block_content json;
ALTER TABLE email_templates ADD COLUMN block_content json;
