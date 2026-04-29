/**
 * Tweak the css selector to also wrap the FIRST services detail panel
 * (`services-active-panel`) in the green rounded container, matching the
 * other two panels.
 */
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  let css = post.customCss ?? '';
  // Remove any stale block first
  css = css.replace(/\/\* svc-detail-panel[\s\S]*?\/\* \/svc-detail-panel \*\//g, '');
  css += `

/* svc-detail-panel — green rounded container around all 3 service detail panels */
.block-content [data-block-id="services-active-panel"],
.block-content [data-block-id="svc-projects-panel"],
.block-content [data-block-id="svc-support-panel"] {
  border: 2px solid #CCE1D0 !important;
  background: #F4FAF5 !important;
  border-radius: 16px !important;
  padding: 36px 40px !important;
  margin: 0 0 24px !important;
}
.block-content [data-block-id="services-active-panel"] section,
.block-content [data-block-id="services-active-panel"] section > div {
  padding: 0 !important;
  background: transparent !important;
}
.block-content [data-block-id="services-active-panel"] {
  padding: 36px 40px !important;
}
/* /svc-detail-panel */`;

  await db.update(posts).set({ customCss: css, updatedAt: new Date() }).where(eq(posts.id, 302));
  console.log('css updated.');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
