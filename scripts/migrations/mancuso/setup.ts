import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Mancuso & Son site setup — creates the client website, branding profile,
 * preview-code grant (CHEESE26), and all five pages with rich html-render
 * block content + site-wide custom CSS/JS.
 *
 * Idempotent. Safe to re-run — updates existing rows in place rather than
 * duplicating posts.
 *
 *   bun run scripts/migrations/mancuso/setup.ts
 */

// The SimplerDevelopment master client is resolved at runtime by stable
// identity (see resolveMasterClientId below) rather than a hardcoded id —
// the numeric id differs between production and the local dryrun clones.
const MASTER_CLIENT_EMAIL = 'simplerdevelopment@simplerdevelopment.com';
const MASTER_CLIENT_COMPANY = 'SimplerDevelopment';
const SITE_NAME = 'L. Mancuso & Son';
const SUBDOMAIN = 'mancuso';
const PREVIEW_CODE = 'CHEESE26';
const DESCRIPTION =
  'A South Philly cheese factory and Italian grocery on East Passyunk Avenue, hand-pulling mozzarella since 1939.';
const SITE_DOMAIN = `${SUBDOMAIN}.simplerdevelopment.com`;

async function main() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, siteBranding, clients } = await import('../../../lib/db/schema/sites');
  const { users } = await import('../../../lib/db/schema/auth');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq, and } = await import('drizzle-orm');

  // ── 0. Resolve the SimplerDevelopment master client ───────
  // Prefer the master account email, fall back to the company name. This keeps
  // the script correct across prod (metro) and the dryrun clones, where the
  // numeric client id differs (e.g. 104 = SimplerDevelopment on prod but a
  // different tenant on some clones).
  const byEmail = await db
    .select({ id: clients.id, company: clients.company })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .where(eq(users.email, MASTER_CLIENT_EMAIL))
    .limit(1);
  const byCompany = byEmail.length
    ? byEmail
    : await db
        .select({ id: clients.id, company: clients.company })
        .from(clients)
        .where(eq(clients.company, MASTER_CLIENT_COMPANY))
        .limit(1);
  if (byCompany.length === 0) {
    throw new Error(
      `Could not resolve the SimplerDevelopment master client (email=${MASTER_CLIENT_EMAIL} / company=${MASTER_CLIENT_COMPANY}). Aborting so the site is not attached to the wrong tenant.`,
    );
  }
  const CLIENT_ID = byCompany[0].id;
  console.log(`✓ Resolved SimplerDevelopment master client → #${CLIENT_ID} (${byCompany[0].company ?? '—'})`);

  const { SITE_CSS } = await import('./site-css');
  const { SITE_JS } = await import('./site-js');
  const { HOME_SECTIONS } = await import('./pages/home');
  const { CHEESE_HTML } = await import('./pages/cheese');
  const { SANDWICHES_HTML } = await import('./pages/sandwiches');
  const { STORY_HTML } = await import('./pages/story');
  const { VISIT_HTML } = await import('./pages/visit');

  // ── 1. Upsert clientWebsites row ──────────────────────────
  const existingSite = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, CLIENT_ID), eq(clientWebsites.subdomain, SUBDOMAIN)))
    .limit(1);

  let siteId: number;
  if (existingSite.length > 0) {
    const [updated] = await db
      .update(clientWebsites)
      .set({
        name: SITE_NAME,
        domain: SITE_DOMAIN,
        description: DESCRIPTION,
        active: true,
        publicAccess: false,
        customLayout: true,
        previewCode: PREVIEW_CODE,
        customCss: SITE_CSS,
        customJs: SITE_JS,
        deploymentStatus: 'active',
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, existingSite[0].id))
      .returning();
    siteId = updated.id;
    console.log(`✓ Updated existing site #${siteId} (${SITE_DOMAIN})`);
  } else {
    const [created] = await db
      .insert(clientWebsites)
      .values({
        clientId: CLIENT_ID,
        name: SITE_NAME,
        subdomain: SUBDOMAIN,
        domain: SITE_DOMAIN,
        description: DESCRIPTION,
        active: true,
        publicAccess: false,
        customLayout: true,
        previewCode: PREVIEW_CODE,
        customCss: SITE_CSS,
        customJs: SITE_JS,
        deploymentStatus: 'active',
      })
      .returning();
    siteId = created.id;
    console.log(`✓ Created site #${siteId} (${SITE_DOMAIN})`);
  }

  // ── 2. Upsert siteBranding ────────────────────────────────
  const branding = {
    websiteId: siteId,
    primaryColor: '#b8311a', // mc-tomato
    secondaryColor: '#1c130b', // mc-ink
    accentColor: '#c79a3a', // mc-gold
    backgroundColor: '#f6efe2', // mc-cream
    textColor: '#1c130b',
    navTemplate: 'none', // custom JS handles the nav
    navBackground: '#f6efe2',
    navTextColor: '#1c130b',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    logoText: 'L. Mancuso & Son',
    borderRadius: '14px',
    linkColor: '#8a1f0d',
    linkHoverColor: '#b8311a',
    buttonStyle: {
      primaryBg: '#b8311a',
      primaryText: '#ffffff',
      primaryHoverBg: '#8a1f0d',
      secondaryBg: 'transparent',
      secondaryText: '#1c130b',
      secondaryHoverBg: '#1c130b',
      borderRadius: '999px',
      variant: 'filled' as const,
    },
    updatedAt: new Date(),
  };

  const existingBranding = await db
    .select()
    .from(siteBranding)
    .where(eq(siteBranding.websiteId, siteId))
    .limit(1);

  if (existingBranding.length > 0) {
    await db
      .update(siteBranding)
      .set(branding)
      .where(eq(siteBranding.id, existingBranding[0].id));
    console.log('✓ Updated branding');
  } else {
    await db.insert(siteBranding).values(branding);
    console.log('✓ Created branding');
  }

  // ── 3. Upsert pages ────────────────────────────────────────
  // A page is either a single html-render block or an ordered array of
  // section blocks (the home page is multi-block so authors can edit each
  // section independently in the visual editor).
  type SectionDef = { slug: string; label: string; html: string; fields?: unknown[]; values?: Record<string, unknown> };
  type PageDef = {
    slug: string;
    title: string;
    seoTitle: string;
    seoDescription: string;
    sections?: SectionDef[];
    html?: string;
  };

  const pages: PageDef[] = [
    {
      slug: 'home',
      title: 'L. Mancuso & Son',
      sections: HOME_SECTIONS,
      seoTitle: 'L. Mancuso & Son — South Philly cheese, made by hand since 1939',
      seoDescription:
        'Hand-pulled mozzarella, fresh ricotta, and the best Italian counter in South Philadelphia. 1902 E. Passyunk Ave.',
    },
    {
      slug: 'cheese',
      title: 'The Cheese',
      html: CHEESE_HTML,
      seoTitle: 'The Cheese — Mozzarella, Ricotta, Scamorza & more | L. Mancuso & Son',
      seoDescription:
        'Fresh mozzarella and ricotta made daily, plus imported provolone, pecorino, parmigiano, and caciocavallo. Cut to order.',
    },
    {
      slug: 'sandwiches',
      title: 'Sandwiches',
      html: SANDWICHES_HTML,
      seoTitle: 'The Sandwich Counter | L. Mancuso & Son',
      seoDescription:
        'Nine hoagies built on house mozzarella, on Cacia\'s rolls or Tuscan schiacciata. Try The Partenza — coppa, nduja, hot honey.',
    },
    {
      slug: 'story',
      title: 'Our Story',
      html: STORY_HTML,
      seoTitle: 'Our Story — 1939 to today | L. Mancuso & Son',
      seoDescription:
        'Four generations of South Philly cheese-making. From 1920s Ninth Street to a 2023 renovation, the family recipes still rule the counter.',
    },
    {
      slug: 'visit',
      title: 'Visit',
      html: VISIT_HTML,
      seoTitle: 'Visit the Shop | L. Mancuso & Son',
      seoDescription:
        '1902 E. Passyunk Ave., Philadelphia, PA 19148. Mon–Sat 9–6, Sun 9–3. (215) 389-1817. Cash & card. Street parking.',
    },
  ];

  for (const page of pages) {
    // Stable block ids per (page, section) so repeat runs don't churn them.
    const now = Date.now();
    const blocks = page.sections
      ? page.sections.map((s, i) => ({
          id: `mc-${page.slug}-${s.slug}`,
          type: 'html-render',
          order: i,
          width: 'full',
          label: s.label,
          html: s.html,
          fields: s.fields ?? [],
          values: s.values ?? {},
        }))
      : [{
          id: `mc-${page.slug}-${now}`,
          type: 'html-render',
          order: 0,
          width: 'full',
          label: `Mancuso · ${page.title}`,
          html: page.html ?? '',
          fields: [],
          values: {},
        }];

    const blocksJson = JSON.stringify({ blocks, version: '1.0' });

    const existing = await db
      .select()
      .from(posts)
      .where(and(eq(posts.websiteId, siteId), eq(posts.slug, page.slug)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(posts)
        .set({
          title: page.title,
          content: blocksJson,
          postType: 'page',
          published: true,
          publishedAt: existing[0].publishedAt ?? new Date(),
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, existing[0].id));
      console.log(`  ↻ Updated /${page.slug === 'home' ? '' : page.slug}`);
    } else {
      await db.insert(posts).values({
        websiteId: siteId,
        title: page.title,
        slug: page.slug,
        postType: 'page',
        content: blocksJson,
        published: true,
        publishedAt: new Date(),
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
      });
      console.log(`  + Created /${page.slug === 'home' ? '' : page.slug}`);
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`L. Mancuso & Son site set up.`);
  console.log(`  Site ID:        ${siteId}`);
  console.log(`  Subdomain:      ${SITE_DOMAIN}`);
  console.log(`  Preview code:   ${PREVIEW_CODE}`);
  console.log(`  Public access:  false (gated)`);
  console.log('────────────────────────────────────────');
  console.log(`\nUnlock flow:`);
  console.log(`  1. Visit http://localhost:3000`);
  console.log(`  2. Enter "${PREVIEW_CODE}" in the access-code form`);
  console.log(`  3. You'll be redirected to https://${SITE_DOMAIN}`);
  console.log(`     (in dev, the renderer is reachable via /sites/${SITE_DOMAIN})`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
