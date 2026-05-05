-- Site + content-type custom code + content-type template wrapper.
--
-- client_websites.custom_css/custom_js: site-wide CSS/JS injected on every
-- page of the site. Cascades before post-type and per-post custom code.
--
-- post_types.custom_css/custom_js: applied to every post of this content
-- type on this website. Cascades after the site's own customCss/customJs
-- and before per-post.
--
-- post_types.template: optional wrapper template for the type — same shape
-- as posts.content (`{ blocks: Block[], version: '1.0' }`). At render time
-- the post's own blocks replace any `{ type: 'post-content' }` placeholder
-- block found in the template. Null = render the post's blocks as-is.

ALTER TABLE "client_websites" ADD COLUMN IF NOT EXISTS "custom_css" text;--> statement-breakpoint
ALTER TABLE "client_websites" ADD COLUMN IF NOT EXISTS "custom_js" text;--> statement-breakpoint
ALTER TABLE "post_types" ADD COLUMN IF NOT EXISTS "custom_css" text;--> statement-breakpoint
ALTER TABLE "post_types" ADD COLUMN IF NOT EXISTS "custom_js" text;--> statement-breakpoint
ALTER TABLE "post_types" ADD COLUMN IF NOT EXISTS "template" text;
