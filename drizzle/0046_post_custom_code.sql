-- Per-post custom CSS and JavaScript for the block editor.
-- Injected by the public site renderer and by the iframe editor preview.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "custom_css" text;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "custom_js" text;
